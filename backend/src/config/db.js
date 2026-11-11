const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const mockData = require('../data/mockData');

// ไฟล์ config: ระบุ JHCIS_CONFIG_FILE เพื่อให้การทดสอบ/สคริปต์อัตโนมัติแยกไฟล์ออกจากของจริง
// (กันการทดสอบเขียนทับ config ของหน่วยงาน)
const CONFIG_FILE = process.env.JHCIS_CONFIG_FILE
  ? path.resolve(process.env.JHCIS_CONFIG_FILE)
  : (fs.existsSync(path.join(__dirname, '../../config.json'))
      ? path.join(__dirname, '../../config.json')
      : path.join(__dirname, '../../../config.json'));

const defaultConfig = {
  host: 'localhost',
  port: 3333,
  user: 'root',
  password: '',
  database: 'jhcisdb',
  charset: 'tis620',
  mode: 'live',
  // ปิด auto-fallback: ต่อ jhcisdb ไม่ได้ = ระบบต้องบล็อกการใช้งาน ไม่ใช่สลับไปโชว์ข้อมูลจำลองเงียบ ๆ
  autoFallbackToDemo: false,
  admins: ['admin', 'adm'],
  pcucode: '',          // รหัสหน่วยบริการ — เว้นว่างให้ detect จาก JHCIS, หรือกรอกเองตอน deploy หน่วยอื่น
  pcuname: '',          // ชื่อสถานบริการ (แสดงบนรายงาน)
  pcuAddress: '',       // ที่อยู่ (ตำบล/อำเภอ/จังหวัด)
  motherHospital: '',   // ชื่อ รพ.แม่ข่าย (default ผู้ส่งมอบยา)
  allowedOrigins: ['http://localhost:5000', 'http://localhost:3000', 'http://127.0.0.1:5000', 'http://127.0.0.1:3000']
};

let currentConfig = { ...defaultConfig };

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    currentConfig = { ...defaultConfig, ...JSON.parse(raw) };
  } catch (err) {
    console.error('Error reading config.json, using defaults:', err.message);
  }
}
// Override โหมดผ่าน environment variable (ใช้ในการทดสอบ/สคริปต์อัตโนมัติ)
if (process.env.JHCIS_MODE) {
  currentConfig.mode = process.env.JHCIS_MODE;
}

let pool = null;
let isConnected = false;
let detectedPcuCode = ''; // ห้ามตั้งค่าปลอม — หน่วยอื่นจะแสดงรหัสผิด
let schemaStatus = { checked: false, requiredMissing: [], optionalMissing: [], checkedAt: null };

// ตารางที่ระบบต้องใช้ (ขาดตัวใด ฟีเจอร์ที่พึ่งตัวนั้นจะถูกปิด + แจ้งเตือนชัดเจน)
const REQUIRED_TABLES = {
  cdrug: 'ทะเบียนยา (โมดูลทั้งหมด)',
  visitdrug: 'ประวัติการจ่ายยา (Stock Card ฝั่งจ่ายออก)',
  user: 'ยืนยันตัวตนผู้ใช้งาน JHCIS',
  visit: 'เชื่อม visit เพื่อดูประวัติจ่ายยา',
  person: 'ข้อมูลผู้ป่วย (ประวัติการจ่ายยา)'
};
const OPTIONAL_TABLES = {
  drugstorereceive: 'ประวัติรับยาจาก รพ.แม่ข่ายใน JHCIS (ถ้าไม่มี ระบบจะใช้ใบรับยาในเครื่องแทน)',
  drugstorereceivedetail: 'รายละเอียดใบรับยา (lot/วันหมดอายุ)',
  cdisease: 'รายชื่อโรค (แสดงชื่อโรคในประวัติจ่ายยา)',
  ctitle: 'คำนำหน้าชื่อ',
  cdrugunitsell: 'หน่วยนับยา',
  cchargeopd: 'หมวดเบิกจ่าย'
};

async function initPool(config = currentConfig) {
  if (pool) {
    try {
      await pool.end();
    } catch (e) {}
    pool = null;
  }

  if (config.mode === 'demo') {
    isConnected = false;
    schemaStatus = { checked: true, requiredMissing: [], optionalMissing: [], checkedAt: new Date().toISOString(), mode: 'demo' };
    console.log('[JHCIS DB] Mode explicitly set to DEMO (ข้อมูลจำลอง — ไม่เกี่ยวกับฐานข้อมูลจริง)');
    return null;
  }

  try {
    pool = mysql.createPool({
      host: config.host,
      port: Number(config.port) || 3333,
      user: config.user,
      password: config.password,
      database: config.database,
      charset: config.charset || 'tis620',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 5000
    });

    const conn = await pool.getConnection();

    // Detect pcucode และข้อมูลสถานพยาบาลจาก JHCIS อย่างแม่นยำ
    let pcu = '';
    let pcuName = '';
    let pcuAddr = '';

    // 1. ตรวจจากตาราง office (ฟิลด์ offid คือรหัส รพ.สต. 5 หลักมาตรฐานใน JHCIS)
    try {
      const [offRows] = await conn.query("SELECT offid FROM office WHERE offid IS NOT NULL AND offid != '' AND offid != '0000x' LIMIT 1");
      if (offRows.length > 0 && offRows[0].offid) {
        pcu = String(offRows[0].offid).trim();
      }
    } catch (e) {}

    // 2. ถ้าไม่พบใน office ให้หาจากตาราง user โดยนับกลุ่มรหัสที่ใช้งานจริงสูงสุด (ข้ามค่า default/ขยะของ JHCIS เช่น !!!!!, 0000x)
    if (!pcu) {
      try {
        const [userRows] = await conn.query(
          "SELECT pcucode, COUNT(username) as cnt FROM user WHERE pcucode IS NOT NULL AND pcucode != '' AND pcucode NOT IN ('!!!!!', '0000x') GROUP BY pcucode ORDER BY cnt DESC LIMIT 1"
        );
        if (userRows.length > 0 && userRows[0].pcucode) {
          pcu = String(userRows[0].pcucode).trim();
        }
      } catch (e) {}
    }

    if (pcu) {
      detectedPcuCode = pcu;
      // 3. ดึงชื่อหน่วยบริการและที่อยู่จากตาราง chospital
      try {
        const [hospRows] = await conn.query("SELECT hosname, address, mu FROM chospital WHERE hoscode = ? LIMIT 1", [pcu]);
        if (hospRows.length > 0) {
          pcuName = hospRows[0].hosname ? String(hospRows[0].hosname).trim() : '';
          const h = hospRows[0];
          pcuAddr = [h.address ? `เลขที่ ${h.address}` : '', h.mu ? `หมู่ที่ ${h.mu}` : ''].filter(Boolean).join(' ');
        }
      } catch (e) {}

      // ถ้า currentConfig ยังไม่มี pcucode หรือ pcucode เดิมไม่ตรงกับฐานข้อมูลใหม่ที่ต่ออยู่ ให้ปรับตามฐานจริงอัตโนมัติ
      if (!currentConfig.pcucode || currentConfig.pcucode !== pcu) {
        currentConfig.pcucode = pcu;
        if (pcuName) currentConfig.pcuname = pcuName;
        if (pcuAddr) currentConfig.pcuAddress = pcuAddr;
        try {
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf8');
        } catch (e) {}
      }
    }

    // Schema self-test: ตรวจว่าตารางที่จำเป็นครบหรือไม่
    await checkSchema(conn);

    conn.release();
    isConnected = true;
    currentConfig.mode = 'live';
    const missing = schemaStatus.requiredMissing;
    console.log(`[JHCIS DB] ✅ Connected to ${config.database}@${config.host}:${config.port} (PCU: ${detectedPcuCode || 'ไม่พบรหัสหน่วย'}${pcuName ? ' ' + pcuName : ''})`);
    if (missing.length > 0) {
      console.warn(`[JHCIS DB] ⚠️ ตารางที่จำเป็นขาด: ${missing.join(', ')} — ฟีเจอร์ที่เกี่ยวข้องจะถูกปิดพร้อมแจ้งเตือน`);
    }
    if (schemaStatus.optionalMissing.length > 0) {
      console.warn(`[JHCIS DB] ℹ️ ตารางเสริมที่ไม่พบ: ${schemaStatus.optionalMissing.join(', ')}`);
    }
    return pool;
  } catch (err) {
    isConnected = false;
    pool = null;
    console.warn(`[JHCIS DB] ⚠️ Connection to live JHCIS failed: ${err.message}.`);
    if (config.autoFallbackToDemo) {
      // เปิดได้เฉพาะเจตนาผู้ดูแล (config) — ค่า default คือ false
      console.log('[JHCIS DB] autoFallbackToDemo=true: ระบบจะทำงานโหมดจำลอง (แจ้งเตือนผู้ใช้ชัดเจนทุกหน้าจอ)');
    } else {
      console.log('[JHCIS DB] Live mode but DB unavailable — ระบบจะตอบ 503 และบล็อกการบันทึก (ไม่ fallback เอง)');
    }
    return null;
  }
}

async function checkSchema(conn) {
  const status = { checked: true, requiredMissing: [], optionalMissing: [], checkedAt: new Date().toISOString() };
  for (const table of Object.keys(REQUIRED_TABLES)) {
    try {
      const [r] = await conn.query('SHOW TABLES LIKE ?', [table]);
      if (r.length === 0) status.requiredMissing.push(table);
    } catch (e) {
      status.requiredMissing.push(table);
    }
  }
  for (const table of Object.keys(OPTIONAL_TABLES)) {
    try {
      const [r] = await conn.query('SHOW TABLES LIKE ?', [table]);
      if (r.length === 0) status.optionalMissing.push(table);
    } catch (e) {
      status.optionalMissing.push(table);
    }
  }
  schemaStatus = status;
  return status;
}

function getSchemaStatus() {
  return { ...schemaStatus, requiredTables: REQUIRED_TABLES, optionalTables: OPTIONAL_TABLES };
}

// In-memory state เฉพาะ "โหมดจำลอง" เท่านั้น (demo) — โหมด live ห้ามใช้เป็นแหล่งข้อมูล
const memoryStore = {
  drugs: JSON.parse(JSON.stringify(mockData.mockDrugs)),
  receipts: JSON.parse(JSON.stringify(mockData.mockReceipts)),
  dispensing: JSON.parse(JSON.stringify(mockData.mockDispensing)),
  broughtForward: JSON.parse(JSON.stringify(mockData.mockBroughtForward)),
  users: JSON.parse(JSON.stringify(mockData.mockUsers)),
  drugMappings: []
};

// Load saved mapping table
const MAPPING_FILE = process.env.JHCIS_DATA_DIR
  ? require('path').join(process.env.JHCIS_DATA_DIR, 'mappings.json')
  : path.join(__dirname, '../data/mappings.json');
if (fs.existsSync(MAPPING_FILE)) {
  try {
    memoryStore.drugMappings = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
  } catch (e) {}
}

function saveMappings(reason = 'บันทึกการจับคู่ยา', actor = 'system') {
  const dir = path.dirname(MAPPING_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(memoryStore.drugMappings, null, 2), 'utf8');
  try {
    const backupService = require('../services/backupService');
    backupService.backupMappings(reason, actor);
  } catch (e) {}
}

async function testConnection(testCfg) {
  try {
    const conn = await mysql.createConnection({
      host: testCfg.host,
      port: Number(testCfg.port) || 3333,
      user: testCfg.user,
      password: testCfg.password,
      database: testCfg.database,
      charset: testCfg.charset || 'tis620',
      connectTimeout: 5000
    });

    const [rows] = await conn.query("SHOW TABLES LIKE 'cdrug'");
    const hasCdrug = rows.length > 0;

    let pcu = '';
    let pcuName = '';
    let drugCount = 0;
    let userCount = 0;

    if (hasCdrug) {
      try {
        const [dc] = await conn.query("SELECT COUNT(*) as cnt FROM cdrug WHERE drugname IS NOT NULL AND drugname != ''");
        drugCount = dc[0]?.cnt || 0;
      } catch (e) {}
    }

    try {
      const [uc] = await conn.query("SELECT COUNT(*) as cnt FROM user WHERE (markdelete IS NULL OR markdelete = '0')");
      userCount = uc[0]?.cnt || 0;
    } catch (e) {}

    try {
      const [off] = await conn.query("SELECT offid FROM office WHERE offid IS NOT NULL AND offid != '' AND offid != '0000x' LIMIT 1");
      if (off.length > 0 && off[0].offid) pcu = String(off[0].offid).trim();
    } catch (e) {}
    if (!pcu) {
      try {
        const [u] = await conn.query(
          "SELECT pcucode, COUNT(username) as cnt FROM user WHERE pcucode IS NOT NULL AND pcucode != '' AND pcucode NOT IN ('!!!!!', '0000x') GROUP BY pcucode ORDER BY cnt DESC LIMIT 1"
        );
        if (u.length > 0 && u[0].pcucode) pcu = String(u[0].pcucode).trim();
      } catch (e) {}
    }
    if (pcu) {
      try {
        const [h] = await conn.query("SELECT hosname FROM chospital WHERE hoscode = ? LIMIT 1", [pcu]);
        if (h.length > 0 && h[0].hosname) pcuName = String(h[0].hosname).trim();
      } catch (e) {}
    }

    await conn.end();

    const pcuLabel = pcu ? `หน่วยบริการ: ${pcu}${pcuName ? ' (' + pcuName + ')' : ''}` : 'ไม่พบรหัสหน่วยบริการ';
    const detailParts = [];
    if (drugCount > 0) detailParts.push(`พบยา ${drugCount.toLocaleString()} รายการ`);
    if (userCount > 0) detailParts.push(`ผู้ใช้งาน JHCIS ${userCount.toLocaleString()} คน`);
    const details = detailParts.length > 0 ? ` • ${detailParts.join(' • ')}` : '';

    return {
      success: true,
      pcucode: pcu,
      pcuname: pcuName,
      drugCount,
      userCount,
      message: `เชื่อมต่อกับฐานข้อมูล ${testCfg.database} สำเร็จ! (${pcuLabel}${details})`
    };
  } catch (err) {
    return {
      success: false,
      message: `ไม่สามารถเชื่อมต่อได้: ${err.message}`
    };
  }
}

async function saveConfig(newConfig, actor = 'admin') {
  currentConfig = { ...currentConfig, ...newConfig };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf8');
  try {
    const backupService = require('../services/backupService');
    backupService.backupConfig('บันทึกการตั้งค่าระบบและฐานข้อมูล JHCIS', actor);
  } catch (e) {}
  await initPool(currentConfig);
  return getConfig();
}

function getConfig() {
  return {
    ...currentConfig,
    pcucode: currentConfig.pcucode || detectedPcuCode,
    detectedPcucode: detectedPcuCode,
    isConnected: isConnected && currentConfig.mode === 'live'
  };
}

// โหมดที่ระบบกำลังทำงานจริง: 'live' (ต่อ DB สำเร็จ) | 'demo' (ผู้ใช้เลือกเอง)
function getMode() {
  if (currentConfig.mode === 'demo') return 'demo';
  return (isConnected ? 'live' : 'live_unavailable');
}

function isLive() {
  return currentConfig.mode === 'live' && isConnected;
}

function isDemo() {
  return currentConfig.mode === 'demo';
}

// ใช้ใน service: ถ้า live แต่ DB หลุด → โยน error 503 (ห้าม fallback เงียบ ๆ)
function assertDataAvailable(featureName = 'ฟีเจอร์นี้') {
  if (isLive()) return;
  if (isDemo()) return; // demo ใช้ memoryStore ได้
  const err = new Error(`ไม่สามารถเชื่อมต่อฐานข้อมูล JHCIS ได้ — ${featureName}ใช้งานไม่ได้ชั่วคราว (ระบบไม่สลับไปข้อมูลจำลองอัตโนมัติ กรุณาตรวจสอบการเชื่อมต่อหรือแจ้งผู้ดูแลระบบ)`);
  err.status = 503;
  err.code = 'DB_UNAVAILABLE';
  throw err;
}

module.exports = {
  initPool,
  testConnection,
  saveConfig,
  getConfig,
  getSchemaStatus,
  memoryStore,
  saveMappings,
  getPool: () => pool,
  getPcuCode: () => currentConfig.pcucode || detectedPcuCode,
  isLive,
  isDemo,
  getMode,
  assertDataAvailable
};
