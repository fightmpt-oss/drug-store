const fs = require('fs');
const path = require('path');
const https = require('https');
const xlsx = require('xlsx');
const { getPool, isLive, memoryStore } = require('../config/db');

const DTAM_DIR = path.resolve(__dirname, '../../data/dtam');
const REGISTRY_FILE = path.join(DTAM_DIR, 'dtam_registry.json');
const MASTER_XLSX_FILE = path.join(DTAM_DIR, 'dtam_master.xlsx');
const DTAM_PORTAL_URL = 'https://www.dtam.moph.go.th/thai-med-code/';

// In-memory cache for fast lookups (loads once into RAM)
let cachedRegistry = null;
let lastLoadedTime = 0;

/**
 * Clean & normalize strings
 */
function cleanStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function cleanCode24(val) {
  if (!val) return '';
  return String(val).trim().replace(/\.0$/, '').replace(/\s+/g, '');
}

function cleanTmt(val) {
  if (!val) return '';
  let str = String(val).trim();
  if (str.includes('.')) str = str.split('.')[0];
  return str.replace(/\D/g, '');
}

/**
 * Load or get the in-memory DTAM registry
 */
function getRegistry() {
  if (cachedRegistry && fs.existsSync(REGISTRY_FILE)) {
    const stats = fs.statSync(REGISTRY_FILE);
    if (stats.mtimeMs <= lastLoadedTime) {
      return cachedRegistry;
    }
  }

  if (!fs.existsSync(REGISTRY_FILE)) {
    // If registry json is missing but xlsx exists, build it
    if (fs.existsSync(MASTER_XLSX_FILE)) {
      rebuildRegistryFromXlsx(MASTER_XLSX_FILE);
    } else {
      return {
        version: 'None',
        builtAt: null,
        stats: { singleCount: 0, formulaCount: 0, revokedCount: 0, totalActive: 0 },
        byCode24: {},
        byTmt: {},
        revokedCodes: {}
      };
    }
  }

  try {
    const raw = fs.readFileSync(REGISTRY_FILE, 'utf8');
    cachedRegistry = JSON.parse(raw);
    lastLoadedTime = fs.statSync(REGISTRY_FILE).mtimeMs;
    return cachedRegistry;
  } catch (err) {
    console.error('[DTAM Service] Error loading registry cache:', err);
    return {
      version: 'Error',
      stats: { singleCount: 0, formulaCount: 0, revokedCount: 0, totalActive: 0 },
      byCode24: {},
      byTmt: {},
      revokedCodes: {}
    };
  }
}

/**
 * Rebuild JSON registry from an Excel file
 */
function rebuildRegistryFromXlsx(xlsxPath, detectedVersion = 'No_01-165') {
  if (!fs.existsSync(DTAM_DIR)) fs.mkdirSync(DTAM_DIR, { recursive: true });

  const wb = xlsx.readFile(xlsxPath);
  const registry = {
    version: detectedVersion,
    builtAt: new Date().toISOString(),
    stats: {
      singleCount: 0,
      formulaCount: 0,
      revokedCount: 0,
      totalActive: 0
    },
    byCode24: {},
    byTmt: {},
    revokedCodes: {}
  };

  function processSheet(sName, type) {
    const sheet = wb.Sheets[sName];
    if (!sheet) return;
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    const headerRow = rows[2] || [];
    const code24Idx = headerRow.findIndex(h => String(h).includes('24 หลัก'));
    const tmtIdx = headerRow.findIndex(h => String(h).includes('TTMTID'));
    const nameIdx = headerRow.findIndex(h => String(h).trim() === 'ชื่อยา');
    const tradeIdx = headerRow.findIndex(h => String(h).includes('ชื่อการค้า'));
    const strengthIdx = headerRow.findIndex(h => String(h).includes('ขนาดความแรง'));
    const formIdx = headerRow.findIndex(h => String(h).includes('รูปแบบยา'));
    const mfgIdx = headerRow.findIndex(h => String(h).includes('ผู้ผลิต') && !String(h).includes('รหัส'));
    const regIdx = headerRow.findIndex(h => String(h).includes('เลขทะเบียนยา'));
    const indIdx = headerRow.findIndex(h => String(h).includes('สรรพคุณยา-ข้อบ่งใช้'));
    const noteIdx = headerRow.findIndex(h => String(h).includes('หมายเหตุ'));

    for (let i = 3; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const code24 = cleanCode24(r[code24Idx]);
      if (!code24) continue;

      const tmtid = cleanTmt(r[tmtIdx]);
      const name = cleanStr(r[nameIdx]);
      const tradeName = cleanStr(r[tradeIdx]);
      const strength = cleanStr(r[strengthIdx]);
      const form = cleanStr(r[formIdx]);
      const manufacturer = cleanStr(r[mfgIdx]);
      const regNo = cleanStr(r[regIdx]);
      const indication = cleanStr(r[indIdx]);
      const note = cleanStr(r[noteIdx]);

      const item = {
        code24,
        tmtid,
        name,
        tradeName,
        strength,
        form,
        manufacturer,
        regNo,
        indication,
        type,
        isRevoked: type === 'ยกเลิก',
        note
      };

      if (type === 'ยกเลิก') {
        registry.revokedCodes[code24] = item;
        registry.stats.revokedCount++;
      } else {
        registry.byCode24[code24] = item;
        if (tmtid) {
          if (!registry.byTmt[tmtid]) registry.byTmt[tmtid] = [];
          registry.byTmt[tmtid].push(code24);
        }
        if (type === 'เดี่ยว') registry.stats.singleCount++;
        if (type === 'ตำรับ') registry.stats.formulaCount++;
      }
    }
  }

  for (const sName of wb.SheetNames) {
    if (sName.includes('เดี่ยว')) processSheet(sName, 'เดี่ยว');
    else if (sName.includes('ตำรับ')) processSheet(sName, 'ตำรับ');
    else if (sName.includes('ยกเลิก')) processSheet(sName, 'ยกเลิก');
  }

  registry.stats.totalActive = registry.stats.singleCount + registry.stats.formulaCount;
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry), 'utf8');
  cachedRegistry = registry;
  lastLoadedTime = Date.now();
  return registry;
}

/**
 * Check DTAM online portal for the latest release info
 */
async function fetchOnlineMasterInfo() {
  return new Promise((resolve, reject) => {
    const req = https.get(DTAM_PORTAL_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th,en-US;q=0.9,en;q=0.8'
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Find No_01-xxx.xlsx link
        const dlMatch = data.match(/href=["'](https?:\/\/www\.dtam\.moph\.go\.th\/dtam-dl\/\d+\/[^"']*)["'][^>]*>\s*No_01-(\d+)\.xlsx/i)
          || data.match(/href=["'](https?:\/\/www\.dtam\.moph\.go\.th\/dtam-dl\/\d+\/[^"']*)["']/i);
        
        const noMatch = data.match(/No_01-(\d+)\.xlsx/i);
        const versionNum = noMatch ? noMatch[1] : null;
        const versionStr = versionNum ? `No_01-${versionNum}` : 'Unknown';
        const downloadUrl = dlMatch ? dlMatch[1] : null;

        // Try extracting stats
        const singleMatch = data.match(/เดี่ยว\s*\|\s*([\d,]+)/);
        const formulaMatch = data.match(/ตำรับ\s*\|\s*([\d,]+)/);
        const revokedMatch = data.match(/รวม\s*\|\s*([\d,]+)/g);

        resolve({
          onlineAvailable: true,
          version: versionStr,
          versionNumber: versionNum ? parseInt(versionNum, 10) : 0,
          filename: `No_01-${versionNum || 'latest'}.xlsx`,
          downloadUrl,
          statsPreview: {
            single: singleMatch ? singleMatch[1] : '',
            formula: formulaMatch ? formulaMatch[1] : ''
          }
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        onlineAvailable: false,
        error: err.message,
        version: null,
        downloadUrl: null
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        onlineAvailable: false,
        error: 'Connection timeout to DTAM server',
        version: null,
        downloadUrl: null
      });
    });
  });
}

/**
 * Download latest master Excel and rebuild registry
 */
async function syncFromDtam() {
  const onlineInfo = await fetchOnlineMasterInfo();
  if (!onlineInfo.onlineAvailable || !onlineInfo.downloadUrl) {
    throw new Error(onlineInfo.error || 'ไม่พบลิงก์ดาวน์โหลดไฟล์ยาสมุนไพรล่าสุดจากหน้าเว็บ DTAM');
  }

  const tempFile = path.join(DTAM_DIR, `dtam_download_${Date.now()}.xlsx`);
  
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tempFile);
    const req = https.get(onlineInfo.downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': DTAM_PORTAL_URL
      },
      timeout: 30000
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`DTAM download returned HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ดาวน์โหลดไฟล์จาก DTAM เกินเวลาที่กำหนด (Timeout 30s)'));
    });
  });

  // Overwrite master xlsx
  fs.copyFileSync(tempFile, MASTER_XLSX_FILE);
  try { fs.unlinkSync(tempFile); } catch (e) {}

  // Rebuild
  const registry = rebuildRegistryFromXlsx(MASTER_XLSX_FILE, onlineInfo.version);
  return {
    success: true,
    version: registry.version,
    syncedAt: registry.builtAt,
    stats: registry.stats
  };
}

/**
 * Get current system DTAM status (and auto-sync if a newer release is found online)
 */
async function getDtamStatus(checkOnline = false) {
  let reg = getRegistry();
  const res = {
    hasLocalRegistry: !!reg.builtAt,
    currentVersion: reg.version || 'No_01-165',
    builtAt: reg.builtAt,
    stats: reg.stats || {},
    autoSyncEnabled: true,
    autoSynced: false,
    previousVersion: null,
    online: null
  };

  if (checkOnline) {
    try {
      const online = await fetchOnlineMasterInfo();
      res.online = online;
      if (online.onlineAvailable && online.version) {
        // Compare versions (e.g. No_01-165 vs No_01-166)
        const curNum = parseInt((res.currentVersion.match(/\d+$/) || ['0'])[0], 10);
        if (online.versionNumber > curNum && online.downloadUrl) {
          // พบไฟล์ Excel งวดใหม่บนเว็บ DTAM -> ดาวน์โหลดและซิงค์เข้าฐานระบบให้อัตโนมัติทันที
          try {
            console.log(`[DTAM Auto-Sync] ตรวจพบงวดใหม่ ${online.version} (เดิม ${res.currentVersion}) กำลังซิงค์อัตโนมัติ...`);
            const prevVer = res.currentVersion;
            const synced = await syncFromDtam();
            reg = getRegistry();
            res.previousVersion = prevVer;
            res.currentVersion = synced.version;
            res.builtAt = synced.syncedAt;
            res.stats = synced.stats || reg.stats || {};
            res.autoSynced = true;
            res.hasUpdate = false;
            console.log(`[DTAM Auto-Sync] ✅ อัปเดตเป็นงวด ${synced.version} สำเร็จ (${res.stats.totalActive} รายการ)`);
          } catch (syncErr) {
            console.warn(`[DTAM Auto-Sync] ⚠️ ซิงค์อัตโนมัติไม่สำเร็จ: ${syncErr.message}`);
            res.hasUpdate = true;
          }
        } else {
          res.hasUpdate = false;
        }
      }
    } catch (e) {
      res.online = { onlineAvailable: false, error: e.message };
    }
  }

  return res;
}

// ตรวจสอบและซิงค์อัตโนมัติเบื้องหลังเมื่อเปิดเซิร์ฟเวอร์ และทุกๆ 12 ชั่วโมง (ถ้าต่ออินเทอร์เน็ตอยู่)
setTimeout(() => {
  getDtamStatus(true).catch(() => {});
}, 15000);
setInterval(() => {
  getDtamStatus(true).catch(() => {});
}, 12 * 60 * 60 * 1000);

/**
 * Search the 44,541 items in DTAM registry
 */
function searchRegistry(query, limit = 25) {
  const reg = getRegistry();
  if (!query) return [];

  const q = String(query).trim().toLowerCase();
  const qClean = q.replace(/[^ก-๙a-zA-Z0-9]/g, '');
  const isNumeric = /^\d+$/.test(q);

  const results = [];
  const allCodes = Object.keys(reg.byCode24);

  // If numeric and length == 24, exact lookup
  if (isNumeric && q.length === 24 && reg.byCode24[q]) {
    return [reg.byCode24[q]];
  }

  // If numeric and TMT match
  if (isNumeric && reg.byTmt[q]) {
    for (const c24 of reg.byTmt[q]) {
      if (reg.byCode24[c24]) results.push(reg.byCode24[c24]);
    }
    if (results.length >= limit) return results.slice(0, limit);
  }

  for (const c24 of allCodes) {
    const item = reg.byCode24[c24];
    const nameMatch = item.name.toLowerCase().includes(q) || item.tradeName.toLowerCase().includes(q);
    const codeMatch = c24.includes(q);
    const tmtMatch = item.tmtid && item.tmtid.includes(q);

    if (nameMatch || codeMatch || tmtMatch) {
      results.push(item);
      if (results.length >= limit) break;
    }
  }

  return results;
}

/**
 * Audit JHCIS cdrug against DTAM registry
 * @param {Object} options - { onlyActive: boolean } default: true (ดึงเฉพาะยาที่ตั้งค่าว่า "มีใช้" ใน JHCIS)
 */
async function auditJhcisHerbs(options = { onlyActive: true }) {
  const onlyActive = options?.onlyActive !== false;
  const reg = getRegistry();
  let dbHerbs = [];

  if (isLive()) {
    const pool = getPool();
    const activeCondition = onlyActive ? "c.drugflag = '1' AND " : "";
    const [rows] = await pool.query(`
      SELECT 
        c.drugcode, 
        c.drugname, 
        c.druggenericname, 
        c.drugtype, 
        c.tmtcode, 
        c.drugcode24, 
        c.cost, 
        c.sell, 
        c.unitsell, 
        c.drugflag
      FROM cdrug c
      WHERE ${activeCondition}
        (
          c.drugtype = '10'
          OR (c.drugcode24 LIKE '4%' OR (c.drugcode LIKE '4%' AND LENGTH(c.drugcode) >= 10))
          OR (
            c.drugname LIKE '%ฟ้าทะลาย%' 
            OR c.drugname LIKE '%ขมิ้น%' 
            OR c.drugname LIKE '%ไพล%' 
            OR c.drugname LIKE '%ประสะ%' 
            OR c.drugname LIKE '%มะขามป้อม%' 
            OR c.drugname LIKE '%ยาหอม%' 
            OR c.drugname LIKE '%ยาธาตุ%' 
            OR c.drugname LIKE '%เถาวัลย์%' 
            OR c.drugname LIKE '%รางจืด%'
            OR c.drugname LIKE '%ขิง%'
            OR c.drugname LIKE '%บัวบก%'
            OR c.drugname LIKE '%มะระขี้นก%'
            OR c.drugname LIKE '%ชุมเห็ด%'
            OR c.drugname LIKE '%เพชรสังฆาต%'
            OR c.drugname LIKE '%ตรีผลา%'
            OR c.drugname LIKE '%สหัสธารา%'
            OR c.drugname LIKE '%หญ้าหนวดแมว%'
            OR c.drugname LIKE '%หญ้าดอกขาว%'
            OR c.drugname LIKE '%ลูกประคบ%'
            OR c.drugname LIKE '%ดอกคำฝอย%'
            OR c.drugname LIKE '%มะแว้ง%'
          )
        )
        AND c.drugname NOT LIKE 'การ%'
      ORDER BY c.drugname ASC
    `);
    dbHerbs = rows;
  } else {
    // Demo mode: synthesize realistic JHCIS mock herbs
    const allMockHerbs = [
      { drugcode: '410000000047000002011376', drugname: 'ฟ้าทะลายโจรแคปซูล 500 mg [7วัน]', tmtcode: '9094251', drugcode24: '410000000479150020182750', drugflag: '1' },
      { drugcode: '410000000100000020110665', drugname: 'ขมิ้นชันแคปซูล 500 มก. ตราอภัยภูเบศร', tmtcode: '9000883', drugcode24: '410000000100000020110665', drugflag: '1' },
      { drugcode: '410000000109150020182748', drugname: 'ขมิ้นชันแคปซูล 500 mg. [14วัน]*', tmtcode: '9096659', drugcode24: '410000000109150020182742', drugflag: '1' },
      { drugcode: '420000011779404094782758', drugname: 'ยาน้ำแก้ไอผสมมะขามป้อม 120ml [7วัน]*', tmtcode: '9383925', drugcode24: '420000011779404094782758', drugflag: '1' },
      { drugcode: '420000001559402594781053', drugname: 'ยาน้ำแก้ไอมะขามป้อม (ขวด) ตราเคเอ็มพี', tmtcode: '9367496', drugcode24: '420000001559402594781053', drugflag: '1' },
      { drugcode: '4100400000000000000', drugname: 'ยาหอมเทพจิตร (ไม่ได้ใช้)', tmtcode: null, drugcode24: null, drugflag: '2' },
      { drugcode: '4100500000000000000', drugname: 'ยาหอมนวโกฐ (ไม่ได้ใช้)', tmtcode: null, drugcode24: null, drugflag: '2' },
      { drugcode: '4100700000000000000', drugname: 'ยาประสะไพล (ไม่ได้ใช้)', tmtcode: null, drugcode24: null, drugflag: '2' }
    ];

    dbHerbs = onlyActive ? allMockHerbs.filter(d => d.drugflag === '1') : allMockHerbs;
  }

  const items = [];
  let matched = 0;
  let tmtMismatch = 0;
  let code24Mismatch = 0;
  let revoked = 0;
  let unregistered = 0;

  for (const r of dbHerbs) {
    const code24 = cleanCode24(r.drugcode24);
    const tmt = cleanTmt(r.tmtcode);
    const drugcode = cleanStr(r.drugcode);
    const drugname = cleanStr(r.drugname);

    // 1. Check REVOKED
    if (code24 && reg.revokedCodes[code24]) {
      revoked++;
      const dtam = reg.revokedCodes[code24];
      items.push({
        drugcode,
        drugname,
        drugflag: r.drugflag || '1',
        currentCode24: code24,
        currentTmt: tmt,
        status: 'revoked',
        severity: 'danger',
        statusLabel: 'รหัสถูกยกเลิก',
        message: 'รหัสยา 24 หลักนี้ ถูกกรมการแพทย์แผนไทยฯ สั่งยกเลิกแล้ว (ห้ามใช้เบิกชดเชย)',
        dtamRef: dtam,
        suggestedCode24: '',
        suggestedTmt: ''
      });
      continue;
    }

    // 2. Check 24-digit MATCH
    if (code24 && reg.byCode24[code24]) {
      const dtam = reg.byCode24[code24];
      const dtamTmt = cleanTmt(dtam.tmtid);
      const isTmtMatch = !tmt || !dtamTmt || tmt === dtamTmt;

      if (isTmtMatch) {
        matched++;
        items.push({
          drugcode,
          drugname,
          drugflag: r.drugflag || '1',
          currentCode24: code24,
          currentTmt: tmt || dtamTmt,
          status: 'matched',
          severity: 'success',
          statusLabel: 'ตรงกันสมบูรณ์',
          message: 'รหัส 24 หลักและรหัส TMT ถูกต้องตรงตามบัญชี DTAM',
          dtamRef: dtam,
          suggestedCode24: code24,
          suggestedTmt: dtamTmt
        });
      } else {
        tmtMismatch++;
        items.push({
          drugcode,
          drugname,
          drugflag: r.drugflag || '1',
          currentCode24: code24,
          currentTmt: tmt,
          status: 'tmt_mismatch',
          severity: 'warning',
          statusLabel: 'TMT ไม่ตรง',
          message: `รหัส 24 หลักตรง แต่ TMT ใน JHCIS (${tmt}) ไม่ตรงกับ DTAM (${dtamTmt})`,
          dtamRef: dtam,
          suggestedCode24: code24,
          suggestedTmt: dtamTmt
        });
      }
      continue;
    }

    // 3. Check TMT MATCH (when code24 is wrong or missing)
    if (tmt && reg.byTmt[tmt] && reg.byTmt[tmt].length > 0) {
      code24Mismatch++;
      const suggestedCode = reg.byTmt[tmt][0];
      const dtam = reg.byCode24[suggestedCode];
      items.push({
        drugcode,
        drugname,
        drugflag: r.drugflag || '1',
        currentCode24: code24,
        currentTmt: tmt,
        status: 'code24_mismatch',
        severity: 'warning',
        statusLabel: 'รหัส 24 หลักไม่ตรง',
        message: `พบ TMT (${tmt}) ตรงกับ DTAM แต่รหัส 24 หลักใน JHCIS ไม่ตรง`,
        dtamRef: dtam,
        suggestedCode24: suggestedCode,
        suggestedTmt: tmt
      });
      continue;
    }

    // 4. Missing or Unregistered: Perform smart name search for suggested options
    unregistered++;
    const suggestions = searchRegistry(drugname, 3);
    items.push({
      drugcode,
      drugname,
      drugflag: r.drugflag || '1',
      currentCode24: code24,
      currentTmt: tmt,
      status: 'unregistered',
      severity: 'neutral',
      statusLabel: 'ยังไม่มีรหัสมาตรฐาน',
      message: 'ไม่พบรหัส 24 หลักหรือ TMT นี้ในบัญชี DTAM (แนะนำให้เลือกรหัสมาตรฐานที่ตรงกับตัวยา)',
      dtamRef: null,
      suggestedCandidates: suggestions,
      suggestedCode24: suggestions[0] ? suggestions[0].code24 : '',
      suggestedTmt: suggestions[0] ? suggestions[0].tmtid : ''
    });
  }

  return {
    version: reg.version,
    builtAt: reg.builtAt,
    onlyActive,
    summary: {
      total: items.length,
      matched,
      tmtMismatch,
      code24Mismatch,
      revoked,
      unregistered
    },
    items
  };
}

/**
 * Generate SQL update script for herbs
 */
function generateHerbsUpdateSql(items = []) {
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const backupTable = `cdrug_dtam_bk_${timestamp}`;

  const lines = [
    `-- ========================================================================`,
    `-- สคริปต์ปรับปรุงรหัสยาสมุนไพร DTAM (รหัส 24 หลัก & TMT ID) ใน JHCIS`,
    `-- สร้างเมื่อ: ${new Date().toLocaleString('th-TH')}`,
    `-- สำรองข้อมูลเดิมไว้ที่ตาราง: ${backupTable}`,
    `-- ========================================================================`,
    ``,
    `-- 1. สำรองข้อมูลตาราง cdrug ปัจจุบันก่อนแก้ไข`,
    `CREATE TABLE IF NOT EXISTS ${backupTable} AS SELECT * FROM cdrug;`,
    ``,
    `-- 2. ดำเนินการอัปเดตรหัสยาที่ตรวจสอบพบความคลาดเคลื่อน`
  ];

  let updateCount = 0;

  for (const item of items) {
    const code24 = cleanCode24(item.suggestedCode24 || item.currentCode24);
    const tmt = cleanTmt(item.suggestedTmt || item.currentTmt);
    const drugcode = cleanStr(item.drugcode);

    if (!drugcode) continue;

    const sets = [];
    if (code24 && code24 !== cleanCode24(item.currentCode24)) {
      sets.push(`drugcode24 = '${code24}'`);
    }
    if (tmt && tmt !== cleanTmt(item.currentTmt)) {
      sets.push(`tmtcode = '${tmt}', tmtcodedateupdate = NOW()`);
    }

    if (sets.length > 0) {
      updateCount++;
      lines.push(`-- [${updateCount}] ${item.drugname} (${drugcode})`);
      lines.push(`UPDATE cdrug SET ${sets.join(', ')} WHERE drugcode = '${drugcode}';`);
    }
  }

  lines.push(``);
  lines.push(`-- ========================================================================`);
  lines.push(`-- สิ้นสุดคำสั่ง SQL (รวมอัปเดต ${updateCount} รายการ)`);
  lines.push(`-- ========================================================================`);

  return {
    backupTable,
    totalUpdates: updateCount,
    sql: lines.join('\n')
  };
}

/**
 * Apply updates directly to JHCIS cdrug table
 */
async function applyDirectUpdates(updates = []) {
  if (!isLive()) {
    return {
      success: true,
      mode: 'demo',
      updatedCount: updates.length,
      message: `โหมดจำลอง (Demo): จำลองการอัปเดตสำเร็จ ${updates.length} รายการ`
    };
  }

  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    let updatedCount = 0;
    for (const u of updates) {
      const drugcode = cleanStr(u.drugcode);
      const code24 = cleanCode24(u.code24);
      const tmt = cleanTmt(u.tmt);

      if (!drugcode) continue;

      const sets = [];
      const params = [];

      if (code24) {
        sets.push('drugcode24 = ?');
        params.push(code24);
      }
      if (tmt) {
        sets.push('tmtcode = ?', 'tmtcodedateupdate = NOW()');
        params.push(tmt);
      }

      if (sets.length > 0) {
        params.push(drugcode);
        const [res] = await conn.query(`UPDATE cdrug SET ${sets.join(', ')} WHERE drugcode = ?`, params);
        if (res.affectedRows > 0) updatedCount++;
      }
    }

    await conn.commit();
    return {
      success: true,
      updatedCount,
      message: `อัปเดตข้อมูลลงฐาน JHCIS สำเร็จเรียบร้อย (${updatedCount} รายการ)`
    };
  } catch (err) {
    await conn.rollback();
    throw new Error(`เกิดข้อผิดพลาดในการบันทึกฐานข้อมูล: ${err.message}`);
  } finally {
    conn.release();
  }
}

module.exports = {
  getRegistry,
  rebuildRegistryFromXlsx,
  fetchOnlineMasterInfo,
  syncFromDtam,
  getDtamStatus,
  searchRegistry,
  auditJhcisHerbs,
  generateHerbsUpdateSql,
  applyDirectUpdates
};
