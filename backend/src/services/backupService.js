// backupService.js — ระบบสร้างและจัดการสำรองข้อมูล (Backup) อัตโนมัติสำหรับระบบคลังยา JHCIS
// ออกแบบให้ทำงานอัตโนมัติเมื่อนำไปติดตั้ง ณ หน่วยบริการ (รพ.สต. / คลินิก) แห่งใดก็ตาม:
//   1. ตรวจสอบและสร้างโฟลเดอร์ drugcatalogue, backup, received_documents อัตโนมัติเมื่อเปิดระบบ
//   2. สำรองข้อมูลอัตโนมัติทุกครั้งที่มีการ:
//      - แก้ไขการตั้งค่าระบบหรือการเชื่อมต่อฐานข้อมูล (config.json)
//      - บันทึกการจับคู่ยา (mappings.json)
//      - ตั้งค่ายาแบ่งบรรจุ / ยาหัตถการห้องทำแผล (drug_settings.json)
//      - นำเข้ายอดยกมา หรือตรวจนับสต็อก (stock_counts.json)
//      - นำเข้าใบรับยา (receipts.json)
//      - อัปโหลดไฟล์ Drug Catalogue
//   3. เก็บประวัติสำรองข้อมูลใน backup/backup_index.json และจำกัดจำนวนไฟล์เพื่อประหยัดพื้นที่ดิสก์

const fs = require('fs');
const path = require('path');

// ระบุ Root ของโปรเจกต์ (ทำงานได้ทั้งโฟลเดอร์พัฒนา และ C:\Drug Store หลังติดตั้ง)
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'backup');
const CATALOGUE_DIR = path.join(PROJECT_ROOT, 'drugcatalogue');
const RECEIVED_PDF_DIR = path.join(PROJECT_ROOT, 'received_documents', 'pdf');
const RECEIVED_EXCEL_DIR = path.join(PROJECT_ROOT, 'received_documents', 'excel');
const LOCALDB_DIR = path.resolve(__dirname, '../data/localdb');
const DATA_DIR = path.resolve(__dirname, '../data');

const CONFIG_FILES = [
  path.join(PROJECT_ROOT, 'config.json'),
  path.join(__dirname, '../../config.json'),
  path.join(__dirname, '../config.json')
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 1. ตรวจสอบและสร้างโฟลเดอร์ที่จำเป็นทั้งหมดพร้อมคำอธิบาย README.txt
 * เรียกใช้อัตโนมัติเมื่อเซิร์ฟเวอร์เริ่มทำงาน
 */
function initAllFolders() {
  const folders = [
    {
      dir: BACKUP_DIR,
      readme: [
        '========================================================================',
        ' โฟลเดอร์สำรองข้อมูลระบบคลังยา JHCIS (Auto-Backup Directory)',
        '========================================================================',
        'โฟลเดอร์นี้ใช้เก็บไฟล์สำรองข้อมูลอัตโนมัติของระบบเมื่อมีการแก้ไขหรือนำเข้าข้อมูล:',
        '  - config_*.json        : การตั้งค่าระบบและการเชื่อมต่อฐานข้อมูล',
        '  - mappings_*.json      : ข้อมูลการจับคู่ยา (Excel <-> JHCIS cdrug)',
        '  - drug_settings_*.json : การตั้งค่ายาแบ่งบรรจุ (Dual-Unit) และยาหัตถการ (Floor Stock)',
        '  - stock_counts_*.json  : ยอดยกมาและผลการตรวจนับสต็อก',
        '  - receipts_*.json      : ประวัติใบรับยาจาก รพ.แม่ข่าย',
        '  - full_snapshot_*.json : ภาพรวมข้อมูลทั้งหมดในจุดเวลาเดียว (Full Snapshot)',
        '  - catalogue_*.xlsx     : ไฟล์ Drug Catalogue ที่นำเข้า',
        '',
        'หมายเหตุ: ระบบจะหมุนเวียนสำรองข้อมูลอัตโนมัติ ไม่ต้องคอยกดสำรองเอง'
      ].join('\r\n')
    },
    {
      dir: CATALOGUE_DIR,
      readme: [
        '========================================================================',
        ' โฟลเดอร์เก็บไฟล์ Drug Catalogue (รพ.สต. และ รพ.แม่ข่าย)',
        '========================================================================',
        'สามารถนำไฟล์ Excel (.xlsx, .xls) เช่น รายการยา Approved ของ รพ.สต.',
        'หรือไฟล์รายการยาสมุนไพรของ รพ.แม่ข่าย มาวางไว้ที่นี่ได้',
        'ระบบจะตรวจพบและนำไปเปรียบเทียบกับตาราง cdrug ใน JHCIS อัตโนมัติ'
      ].join('\r\n')
    },
    {
      dir: RECEIVED_PDF_DIR,
      readme: [
        '========================================================================',
        ' โฟลเดอร์เก็บเอกสารใบรับยา PDF (Received PDF Documents)',
        '========================================================================',
        'เก็บไฟล์ PDF ใบรับยาที่อัปโหลดเข้าสู่ระบบ'
      ].join('\r\n')
    },
    {
      dir: RECEIVED_EXCEL_DIR,
      readme: [
        '========================================================================',
        ' โฟลเดอร์เก็บเอกสารใบรับยา Excel (Received Excel Documents)',
        '========================================================================',
        'เก็บไฟล์ Excel ใบส่งมอบยาที่นำเข้าสู่ระบบ'
      ].join('\r\n')
    },
    {
      dir: LOCALDB_DIR,
      readme: [
        '========================================================================',
        ' ฐานข้อมูลของระบบคลังยา (Local Database)',
        '========================================================================',
        'เก็บข้อมูลทั้งหมดของระบบคลังยา (อ่านจาก JHCIS อย่างเดียว ไม่เขียนทับ JHCIS)'
      ].join('\r\n')
    }
  ];

  folders.forEach(({ dir, readme }) => {
    ensureDir(dir);
    const readmeFile = path.join(dir, 'README.txt');
    if (!fs.existsSync(readmeFile)) {
      try {
        fs.writeFileSync(readmeFile, readme, 'utf8');
      } catch (e) {}
    }
  });

  return {
    backupDir: BACKUP_DIR,
    catalogueDir: CATALOGUE_DIR,
    receivedPdfDir: RECEIVED_PDF_DIR,
    receivedExcelDir: RECEIVED_EXCEL_DIR,
    localDbDir: LOCALDB_DIR
  };
}

function getTimestampStr(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
}

// -------------------------------------------------------------------------
// ดัชนีบันทึกประวัติการสำรองข้อมูล (backup/backup_index.json)
// -------------------------------------------------------------------------
const INDEX_FILE = path.join(BACKUP_DIR, 'backup_index.json');

function getBackupIndex() {
  ensureDir(BACKUP_DIR);
  if (!fs.existsSync(INDEX_FILE)) return [];
  try {
    const raw = fs.readFileSync(INDEX_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function recordBackupEntry(entry) {
  try {
    ensureDir(BACKUP_DIR);
    const history = getBackupIndex();
    history.unshift({
      id: `bk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...entry
    });
    // เก็บประวัติสูงสุด 300 รายการ
    if (history.length > 300) history.splice(300);
    fs.writeFileSync(INDEX_FILE, JSON.stringify(history, null, 2), 'utf8');
    pruneOldBackups(entry.type, 25);
  } catch (e) {
    console.warn('[BACKUP] Could not write backup index:', e.message);
  }
}

function pruneOldBackups(type, maxKeep = 25) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith(`${type}_`) && f.endsWith('.json') && !f.includes('_latest'))
      .map(f => ({
        name: f,
        fullPath: path.join(BACKUP_DIR, f),
        mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > maxKeep) {
      files.slice(maxKeep).forEach(item => {
        try { fs.unlinkSync(item.fullPath); } catch (e) {}
      });
    }
  } catch (e) {}
}

// -------------------------------------------------------------------------
// ฟังก์ชันสำรองไฟล์ตามประเภท
// -------------------------------------------------------------------------

/**
 * 2a. สำรอง config.json (การตั้งค่าเชื่อมต่อฐานข้อมูล JHCIS / ข้อมูลหน่วยบริการ)
 */
function backupConfig(reason = 'อัปเดตการตั้งค่าระบบ', actor = 'system') {
  ensureDir(BACKUP_DIR);
  let configPath = CONFIG_FILES.find(p => fs.existsSync(p));
  if (!configPath) return null;

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    const safeData = {
      ...parsed,
      _backupMeta: {
        reason,
        actor,
        backupTime: new Date().toISOString()
      }
    };

    const ts = getTimestampStr();
    const backupName = `config_${ts}.json`;
    const targetPath = path.join(BACKUP_DIR, backupName);
    const latestPath = path.join(BACKUP_DIR, 'config_latest.json');

    const jsonStr = JSON.stringify(safeData, null, 2);
    fs.writeFileSync(targetPath, jsonStr, 'utf8');
    fs.writeFileSync(latestPath, jsonStr, 'utf8');

    recordBackupEntry({
      type: 'config',
      filename: backupName,
      label: 'การตั้งค่าระบบและการเชื่อมต่อฐานข้อมูล',
      reason,
      actor,
      sizeBytes: Buffer.byteLength(jsonStr, 'utf8')
    });

    console.log(`[BACKUP] ✅ สำรองการตั้งค่าระบบเรียบร้อย: backup/${backupName}`);
    return backupName;
  } catch (err) {
    console.error('[BACKUP] Config backup failed:', err.message);
    return null;
  }
}

/**
 * 2b. สำรอง mappings.json (การจับคู่ยาประจำหน่วยบริการ)
 */
function backupMappings(reason = 'บันทึกการจับคู่ยา', actor = 'system') {
  ensureDir(BACKUP_DIR);
  const mappingsPath = path.join(DATA_DIR, 'mappings.json');
  if (!fs.existsSync(mappingsPath)) return null;

  try {
    const raw = fs.readFileSync(mappingsPath, 'utf8');
    const ts = getTimestampStr();
    const backupName = `mappings_${ts}.json`;
    const targetPath = path.join(BACKUP_DIR, backupName);
    const latestPath = path.join(BACKUP_DIR, 'mappings_latest.json');

    fs.writeFileSync(targetPath, raw, 'utf8');
    fs.writeFileSync(latestPath, raw, 'utf8');

    let count = 0;
    try { count = JSON.parse(raw).length; } catch (e) {}

    recordBackupEntry({
      type: 'mappings',
      filename: backupName,
      label: `การจับคู่ยาประจำหน่วยบริการ (${count} รายการ)`,
      reason,
      actor,
      sizeBytes: Buffer.byteLength(raw, 'utf8')
    });

    console.log(`[BACKUP] ✅ สำรองการจับคู่ยาเรียบร้อย: backup/${backupName} (${count} รายการ)`);
    return backupName;
  } catch (err) {
    console.error('[BACKUP] Mappings backup failed:', err.message);
    return null;
  }
}

/**
 * 2c. สำรอง drug_settings.json (ยาแบ่งบรรจุ 500g->10g, ยาหัตถการ Lidocaine)
 */
function backupDrugSettings(reason = 'ตั้งค่ายาแบ่งบรรจุ/ยาหัตถการ', actor = 'system') {
  ensureDir(BACKUP_DIR);
  const settingsPath = path.join(LOCALDB_DIR, 'drug_settings.json');
  if (!fs.existsSync(settingsPath)) return null;

  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const ts = getTimestampStr();
    const backupName = `drug_settings_${ts}.json`;
    const targetPath = path.join(BACKUP_DIR, backupName);
    const latestPath = path.join(BACKUP_DIR, 'drug_settings_latest.json');

    fs.writeFileSync(targetPath, raw, 'utf8');
    fs.writeFileSync(latestPath, raw, 'utf8');

    let count = 0;
    try { count = Object.keys(JSON.parse(raw)).length; } catch (e) {}

    recordBackupEntry({
      type: 'drug_settings',
      filename: backupName,
      label: `การตั้งค่ายาเฉพาะ (${count} รายการ)`,
      reason,
      actor,
      sizeBytes: Buffer.byteLength(raw, 'utf8')
    });

    return backupName;
  } catch (err) {
    console.error('[BACKUP] Drug settings backup failed:', err.message);
    return null;
  }
}

/**
 * 2d. สำรอง stock_counts.json (ยอดยกมาและการตรวจนับสต็อก)
 */
function backupStockCounts(reason = 'นำเข้า/ปรับปรุงยอดยกมา', actor = 'system') {
  ensureDir(BACKUP_DIR);
  const countsPath = path.join(LOCALDB_DIR, 'stock_counts.json');
  if (!fs.existsSync(countsPath)) return null;

  try {
    const raw = fs.readFileSync(countsPath, 'utf8');
    const ts = getTimestampStr();
    const backupName = `stock_counts_${ts}.json`;
    const targetPath = path.join(BACKUP_DIR, backupName);
    const latestPath = path.join(BACKUP_DIR, 'stock_counts_latest.json');

    fs.writeFileSync(targetPath, raw, 'utf8');
    fs.writeFileSync(latestPath, raw, 'utf8');

    let count = 0;
    try { count = Object.keys(JSON.parse(raw)).length; } catch (e) {}

    recordBackupEntry({
      type: 'stock_counts',
      filename: backupName,
      label: `ยอดยกมา/ตรวจนับสต็อก (${count} รายการ)`,
      reason,
      actor,
      sizeBytes: Buffer.byteLength(raw, 'utf8')
    });

    console.log(`[BACKUP] ✅ สำรองยอดยกมาเรียบร้อย: backup/${backupName} (${count} รายการ)`);
    return backupName;
  } catch (err) {
    console.error('[BACKUP] Stock counts backup failed:', err.message);
    return null;
  }
}

/**
 * 2e. สำรอง receipts.json (ประวัติใบรับยา)
 */
function backupReceipts(reason = 'นำเข้าใบรับยา', actor = 'system') {
  ensureDir(BACKUP_DIR);
  const receiptsPath = path.join(LOCALDB_DIR, 'receipts.json');
  if (!fs.existsSync(receiptsPath)) return null;

  try {
    const raw = fs.readFileSync(receiptsPath, 'utf8');
    const ts = getTimestampStr();
    const backupName = `receipts_${ts}.json`;
    const targetPath = path.join(BACKUP_DIR, backupName);
    const latestPath = path.join(BACKUP_DIR, 'receipts_latest.json');

    fs.writeFileSync(targetPath, raw, 'utf8');
    fs.writeFileSync(latestPath, raw, 'utf8');

    let count = 0;
    try { count = JSON.parse(raw).length; } catch (e) {}

    recordBackupEntry({
      type: 'receipts',
      filename: backupName,
      label: `ประวัติใบรับยา (${count} ใบ)`,
      reason,
      actor,
      sizeBytes: Buffer.byteLength(raw, 'utf8')
    });

    return backupName;
  } catch (err) {
    console.error('[BACKUP] Receipts backup failed:', err.message);
    return null;
  }
}

/**
 * 2f. สำรองไฟล์ Drug Catalogue ที่ผู้ใช้อัปโหลด
 */
function backupCatalogue(sourcePathOrBuffer, filename, reason = 'อัปโหลด Drug Catalogue', actor = 'system') {
  ensureDir(BACKUP_DIR);
  try {
    const ts = getTimestampStr();
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9_\u0E00-\u0E7F.-]/g, '_');
    const backupName = `catalogue_${ts}_${safeName}`;
    const targetPath = path.join(BACKUP_DIR, backupName);

    if (Buffer.isBuffer(sourcePathOrBuffer)) {
      fs.writeFileSync(targetPath, sourcePathOrBuffer);
    } else if (typeof sourcePathOrBuffer === 'string' && fs.existsSync(sourcePathOrBuffer)) {
      fs.copyFileSync(sourcePathOrBuffer, targetPath);
    }

    recordBackupEntry({
      type: 'catalogue',
      filename: backupName,
      label: `ไฟล์แคตตาล็อกยา: ${filename}`,
      reason,
      actor,
      sizeBytes: fs.existsSync(targetPath) ? fs.statSync(targetPath).size : 0
    });

    console.log(`[BACKUP] ✅ สำรองไฟล์ Drug Catalogue เรียบร้อย: backup/${backupName}`);
    return backupName;
  } catch (err) {
    console.error('[BACKUP] Catalogue backup failed:', err.message);
    return null;
  }
}

/**
 * 2g. สร้างภาพรวมสำรองข้อมูลทั้งหมดในจุดเวลาเดียว (Full System Snapshot)
 * รวม config + mappings + drug_settings + stock_counts + สรุปประวัติ ไว้ในไฟล์เดียว
 */
function createFullSnapshot(reason = 'สำรองข้อมูลทั้งหมด', actor = 'system') {
  ensureDir(BACKUP_DIR);
  try {
    const snapshot = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      reason,
      actor,
      system: {
        nodeVersion: process.version,
        platform: process.platform
      },
      config: null,
      mappings: [],
      drugSettings: {},
      stockCountsSummary: {
        totalItems: 0,
        keys: []
      }
    };

    // 1. Config
    const configPath = CONFIG_FILES.find(p => fs.existsSync(p));
    if (configPath) {
      try { snapshot.config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
    }

    // 2. Mappings
    const mappingsPath = path.join(DATA_DIR, 'mappings.json');
    if (fs.existsSync(mappingsPath)) {
      try { snapshot.mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8')); } catch (e) {}
    }

    // 3. Drug Settings
    const settingsPath = path.join(LOCALDB_DIR, 'drug_settings.json');
    if (fs.existsSync(settingsPath)) {
      try { snapshot.drugSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
    }

    // 4. Stock Counts
    const countsPath = path.join(LOCALDB_DIR, 'stock_counts.json');
    if (fs.existsSync(countsPath)) {
      try {
        const counts = JSON.parse(fs.readFileSync(countsPath, 'utf8'));
        snapshot.stockCounts = counts;
        snapshot.stockCountsSummary = {
          totalItems: Object.keys(counts).length,
          keys: Object.keys(counts).slice(0, 100)
        };
      } catch (e) {}
    }

    const ts = getTimestampStr();
    const backupName = `full_snapshot_${ts}.json`;
    const targetPath = path.join(BACKUP_DIR, backupName);
    const latestPath = path.join(BACKUP_DIR, 'full_snapshot_latest.json');

    const jsonStr = JSON.stringify(snapshot, null, 2);
    fs.writeFileSync(targetPath, jsonStr, 'utf8');
    fs.writeFileSync(latestPath, jsonStr, 'utf8');

    recordBackupEntry({
      type: 'full_snapshot',
      filename: backupName,
      label: `ภาพรวมข้อมูลระบบครบวงจร (Full Snapshot)`,
      reason,
      actor,
      sizeBytes: Buffer.byteLength(jsonStr, 'utf8')
    });

    console.log(`[BACKUP] 🌟 สร้าง Full System Snapshot เรียบร้อย: backup/${backupName}`);
    return {
      success: true,
      filename: backupName,
      path: targetPath,
      createdAt: snapshot.createdAt
    };
  } catch (err) {
    console.error('[BACKUP] Full snapshot failed:', err.message);
    throw err;
  }
}

/**
 * 3. รายการไฟล์สำรองข้อมูลทั้งหมด
 */
function listBackups() {
  ensureDir(BACKUP_DIR);
  const index = getBackupIndex();
  const indexMap = new Map(index.map(i => [i.filename, i]));

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => (f.endsWith('.json') || f.endsWith('.xlsx') || f.endsWith('.xls')) && f !== 'backup_index.json')
    .map(filename => {
      const fullPath = path.join(BACKUP_DIR, filename);
      const stat = fs.statSync(fullPath);
      const meta = indexMap.get(filename) || {};
      const isLatest = filename.includes('_latest');

      let type = meta.type || 'unknown';
      if (filename.startsWith('config_')) type = 'config';
      else if (filename.startsWith('mappings_')) type = 'mappings';
      else if (filename.startsWith('drug_settings_')) type = 'drug_settings';
      else if (filename.startsWith('stock_counts_')) type = 'stock_counts';
      else if (filename.startsWith('receipts_')) type = 'receipts';
      else if (filename.startsWith('catalogue_')) type = 'catalogue';
      else if (filename.startsWith('full_snapshot_')) type = 'full_snapshot';

      return {
        filename,
        fullPath,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        isLatest,
        type,
        label: meta.label || filename,
        reason: meta.reason || (isLatest ? 'ไฟล์สำรองล่าสุด' : 'สำรองอัตโนมัติ'),
        actor: meta.actor || 'system'
      };
    })
    .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

  return {
    backupDir: BACKUP_DIR,
    totalFiles: files.length,
    files
  };
}

/**
 * 4. กู้คืนไฟล์จากสำรอง
 */
function restoreFromBackup(filename, actor = 'admin') {
  const safeFilename = path.basename(filename);
  const sourcePath = path.join(BACKUP_DIR, safeFilename);

  if (!fs.existsSync(sourcePath)) {
    const err = new Error(`ไม่พบไฟล์สำรอง "${safeFilename}" ในโฟลเดอร์ backup`);
    err.status = 404;
    throw err;
  }

  if (safeFilename.startsWith('config_')) {
    const raw = fs.readFileSync(sourcePath, 'utf8');
    const parsed = JSON.parse(raw);
    const configPath = CONFIG_FILES.find(p => fs.existsSync(p)) || CONFIG_FILES[0];
    fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), 'utf8');
    return { success: true, type: 'config', message: 'กู้คืนการตั้งค่าระบบเรียบร้อย (กรุณารีสตาร์ตเซิร์ฟเวอร์เพื่อให้มีผลสมบูรณ์)' };
  }

  if (safeFilename.startsWith('mappings_')) {
    const raw = fs.readFileSync(sourcePath, 'utf8');
    const mappingsPath = path.join(DATA_DIR, 'mappings.json');
    fs.writeFileSync(mappingsPath, raw, 'utf8');
    return { success: true, type: 'mappings', message: 'กู้คืนข้อมูลการจับคู่ยาเรียบร้อยแล้ว' };
  }

  if (safeFilename.startsWith('stock_counts_')) {
    const raw = fs.readFileSync(sourcePath, 'utf8');
    const countsPath = path.join(LOCALDB_DIR, 'stock_counts.json');
    fs.writeFileSync(countsPath, raw, 'utf8');
    return { success: true, type: 'stock_counts', message: 'กู้คืนยอดยกมาและการตรวจนับสต็อกเรียบร้อยแล้ว' };
  }

  throw new Error(`ไม่รองรับการกู้คืนอัตโนมัติสำหรับไฟล์ประเภทนี้ (${safeFilename})`);
}

module.exports = {
  PROJECT_ROOT,
  BACKUP_DIR,
  CATALOGUE_DIR,
  initAllFolders,
  backupConfig,
  backupMappings,
  backupDrugSettings,
  backupStockCounts,
  backupReceipts,
  backupCatalogue,
  createFullSnapshot,
  listBackups,
  restoreFromBackup
};
