// test_system.js — สคริปต์ทดสอบระบบอัตโนมัติ (รัน: node scripts/test_system.js)
// ทดสอบบนพอร์ตแยก + โฟลเดอร์ข้อมูลแยก (data_test) เพื่อไม่แตะข้อมูลจริง
// เคสหลัก: auth, persistence ใบรับยา (รีสตาร์ทแล้วต้องไม่หาย), dedupe, ยอดยกมาตามงวด,
//          ปรับปรุงยอด, PDPA mask/reveal, สิทธิ์ admin/staff, ปีงบประมาณอัตโนมัติ

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 5099;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(__dirname, '../backend/src/data/localdb_test_run');
const SERVER = path.join(__dirname, '../backend/src/server.js');
// ไฟล์ config แยกสำหรับทดสอบ — ห้ามให้การทดสอบเขียน config จริงของหน่วยงานเด็ดขาด
const CONFIG_TEST = path.join(DATA_DIR, 'config.json');
function prepareTestConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const realCfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../backend/config.json'), 'utf8'));
  fs.writeFileSync(CONFIG_TEST, JSON.stringify({ ...realCfg, mode: 'demo', admins: ['admin'] }, null, 2), 'utf8');
}

const results = [];
let serverProc = null;
let TOKEN = null;
let STAFF_TOKEN = null;

function log(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(method, urlPath, body, token) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        PORT: String(PORT),
        JHCIS_MODE: 'demo',
        JHCIS_DATA_DIR: DATA_DIR,
        JHCIS_CONFIG_FILE: CONFIG_TEST
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    serverProc.stdout.on('data', d => { out += d.toString(); });
    serverProc.stderr.on('data', d => { out += d.toString(); });
    const started = Date.now();
    const poll = async () => {
      while (Date.now() - started < 15000) {
        try {
          const r = await fetch(`${BASE}/api/health`);
          if (r.ok) return resolve();
        } catch (e) {}
        await new Promise(r2 => setTimeout(r2, 300));
      }
      console.error('SERVER OUTPUT:\n', out);
      reject(new Error('server did not start in 15s'));
    };
    poll();
  });
}

function stopServer() {
  return new Promise(resolve => {
    if (!serverProc) return resolve();
    serverProc.on('exit', resolve);
    serverProc.kill();
    setTimeout(resolve, 3000);
  });
}

async function run() {
  // เริ่มจากข้อมูลทดสอบสะอาด
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  prepareTestConfig();
  await startServer();

  const today = new Date().toISOString().slice(0, 10);

  // ---------- 1. Health ----------
  const health = await api('GET', '/api/health');
  log('health endpoint ตอบ ok', health.status === 200 && health.data.status === 'ok');
  log('health รายงานโหมด demo', health.data.mode === 'demo', `mode=${health.data.mode}`);

  // ---------- 2. ปีงบประมาณคำนวณจากวันจริง ----------
  const now = new Date();
  const y = now.getFullYear();
  const expectedFY = (now.getMonth() + 1) >= 10 ? `${y}-10-01` : `${y - 1}-10-01`;
  const { currentFiscalYear } = require('../backend/src/services/stockCardService');
  log('ปีงบประมาณคำนวณอัตโนมัติ', currentFiscalYear().startDate === expectedFY, `expect ${expectedFY}, got ${currentFiscalYear().startDate}`);

  // ---------- 3. Auth ----------
  const noAuth = await api('GET', '/api/stock/overview');
  log('API ไม่แนบ token → 401', noAuth.status === 401, `status=${noAuth.status}`);

  const badLogin = await api('POST', '/api/auth/login', { username: 'admin', password: 'wrong' });
  log('login รหัสผ่านผิด → 401', badLogin.status === 401);

  const adminLogin = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin' });
  TOKEN = adminLogin.data.token;
  log('login admin (demo) ได้ token', adminLogin.status === 200 && !!TOKEN);
  log('admin มี role = admin', adminLogin.data.user?.systemRole === 'admin');

  const staffLogin = await api('POST', '/api/auth/login', { username: 'pharmacy', password: '123456' });
  STAFF_TOKEN = staffLogin.data.token;
  log('login staff (pharmacy) ได้ token', staffLogin.status === 200 && !!STAFF_TOKEN, `role=${staffLogin.data.user?.systemRole}`);

  const me = await api('GET', '/api/auth/me', null, TOKEN);
  log('/auth/me ตรวจ session ได้', me.status === 200 && me.data.user?.username === 'admin');

  // ---------- 3c. 2FA MFA: Google Authenticator & Dropdown Users ----------
  const usersListRes = await api('GET', '/api/auth/users');
  log('2FA: ดึงรายชื่อผู้ใช้สำหรับ Dropdown → 200', usersListRes.status === 200 && Array.isArray(usersListRes.data.users));

  const step1Res = await api('POST', '/api/auth/login-step1', { username: 'admin', password: 'admin' });
  log('2FA: ขั้นตอนที่ 1 (ตรวจรหัสผ่าน + ออก QR Code) → 200', step1Res.status === 200 && step1Res.data.mfaRequired === true && !!step1Res.data.qrCode);

  const otplib = require('otplib');
  const validOtp = otplib.generateSync({ secret: step1Res.data.secret });
  const verifyOtpRes = await api('POST', '/api/auth/verify-otp', { tempToken: step1Res.data.tempToken, otp: validOtp });
  log('2FA: ขั้นตอนที่ 2 (ยืนยัน OTP 6 หลัก Google Authenticator) → token', verifyOtpRes.status === 200 && !!verifyOtpRes.data.token);

  // ทดสอบล็อกอินครั้งที่ 2 (ลงทะเบียนแล้ว) + รหัสกู้คืนฉุกเฉิน
  const step1Enrolled = await api('POST', '/api/auth/login-step1', { username: 'admin', password: 'admin' });
  log('2FA: ตรวจจับสถานะว่าลงทะเบียนแล้ว (isFirstTime=false)', step1Enrolled.data.isFirstTime === false);

  const recoveryCodeToTest = step1Res.data.recoveryCodes[0];
  const recRes = await api('POST', '/api/auth/verify-recovery', { tempToken: step1Enrolled.data.tempToken, recoveryCode: recoveryCodeToTest });
  log('2FA: กู้คืนบัญชีด้วย Recovery Code สำเร็จ', recRes.status === 200 && recRes.data.recoveryUsed === true);

  // รหัสกู้คืนเดิมต้องใช้ซ้ำไม่ได้ (Burn code)
  const step1Enrolled2 = await api('POST', '/api/auth/login-step1', { username: 'admin', password: 'admin' });
  const recRes2 = await api('POST', '/api/auth/verify-recovery', { tempToken: step1Enrolled2.data.tempToken, recoveryCode: recoveryCodeToTest });
  log('2FA: ป้องกันการใช้ Recovery Code ซ้ำ → 400', recRes2.status === 400);


  // ---------- 4. Overview ----------
  const overview = await api('GET', '/api/stock/overview', null, TOKEN);
  log('stock overview ทำงาน (demo)', overview.status === 200 && overview.data.success, `items=${overview.data.data?.items?.length}`);

  // ---------- 5. บันทึกใบรับยา + dedupe ----------
  const import1 = await api('POST', '/api/excel/import', {
    receiveno: 'TEST-REC-001',
    receivedate: today,
    supplier: 'โรงพยาบาลทดสอบ',
    items: [
      { drugcode: '0001', drugname: 'Paracetamol 500 mg tablet', lotno: 'L2601', dateexpire: '2028-06-30', amount: 1000, costprice: 0.35 },
      { drugcode: '0001', drugname: 'Paracetamol 500 mg tablet', lotno: 'L2602', dateexpire: '2027-12-31', amount: 500, costprice: 0.35 },
      { drugcode: '0002', drugname: 'Amoxicillin 500 mg capsule', lotno: 'L2603', dateexpire: '', amount: 200, costprice: 1.2 }
    ]
  }, TOKEN);
  log('บันทึกใบรับยา 3 รายการ', import1.status === 200 && import1.data.success, `receiveno=${import1.data.receiveno}`);
  log('ไม่สมมุติวันหมดอายุ — แจ้ง missingExpiryItems', import1.data.missingExpiryItems === 1);

  const dup = await api('POST', '/api/excel/import', {
    receiveno: 'TEST-REC-001',
    receivedate: today,
    items: [{ drugcode: '0001', amount: 999, lotno: 'X', dateexpire: '2030-01-01' }]
  }, TOKEN);
  log('import ซ้ำ (receiveno เดิม) → 409 บล็อก', dup.status === 409, `status=${dup.status}`);

  // ---------- 6. ตรวจนับสต็อก (BF) ----------
  const saveCount = await api('POST', '/api/stock/initial-count', {
    drugcode: '0001',
    drugname: 'Paracetamol 500 mg tablet',
    lots: [
      { lotno: 'L9001', dateexpire: '2027-06-30', amount: 400, costprice: 0.35 },
      { lotno: 'L9002', dateexpire: '2028-01-31', amount: 600, costprice: 0.35 }
    ],
    countDate: today,
    countedBy: 'tester'
  }, STAFF_TOKEN);
  log('บันทึกยอดนับ 2 lot (staff)', saveCount.status === 200 && saveCount.data.data?.totalAmount === 1000, `total=${saveCount.data.data?.totalAmount}`);

  // ---------- 7. Stock Card: BF + รับเข้า + FEFO ----------
  const card = await api('GET', `/api/stock/card/0001?startDate=${today}&endDate=${today}`, null, TOKEN);
  const cardData = card.data.data;
  const bfRow = cardData?.transactions?.find(t => t.type === 'BROUGHT_FORWARD');
  const recRows = cardData?.transactions?.filter(t => t.type === 'RECEIVE') || [];
  log('Stock Card มีแถวยอดยกมา (นับจริง 2 lot)', bfRow && cardData.transactions.filter(t => t.type === 'BROUGHT_FORWARD').length === 2);
  log('Stock Card มีรายการรับเข้าจากใบรับของระบบ', recRows.length >= 2, `receive rows=${recRows.length}`);
  const lots = cardData?.lotsSummary || [];

  // ---------- 7b. FEFO กับการจ่ายจริงในช่วง (demo: ยา 0002 จ่ายรวม 1100 หน่วย มิ.ย.-ก.ย. 2026) ----------
  // นับ 0002 ณ 2026-05-01: lot LC (หมดอายุ 2027-06-30) 1400, lot LD (หมดอายุ 2028-06-30) 1600
  const saveFefo = await api('POST', '/api/stock/initial-count', {
    drugcode: '0002', drugname: 'Amoxicillin 500 mg capsule',
    lots: [
      { lotno: 'LC-FEFO', dateexpire: '2027-06-30', amount: 1400, costprice: 1.2 },
      { lotno: 'LD-KEEP', dateexpire: '2028-06-30', amount: 1600, costprice: 1.2 }
    ],
    countDate: '2026-05-01', countedBy: 'tester'
  }, STAFF_TOKEN);
  if (!saveFefo.data.success) console.log('DEBUG saveFefo:', saveFefo.status, JSON.stringify(saveFefo.data));
  const cardFefo = await api('GET', '/api/stock/card/0002?startDate=2026-05-01&endDate=2026-12-31', null, TOKEN);
  const fefoLots = cardFefo.data.data?.lotsSummary || [];
  const lc = fefoLots.find(l => l.lotno === 'LC-FEFO');
  const ld = fefoLots.find(l => l.lotno === 'LD-KEEP');
  log('FEFO: lot หมดอายุก่อน (LC) ถูกตัดก่อน (1400 − 1100 = 300)', lc && lc.remaining === 300, `LC remain=${lc?.remaining}`);
  log('FEFO: lot หมดอายุหลัง (LD) ยังไม่ถูกตัด (1600)', ld && ld.remaining === 1600, `LD remain=${ld?.remaining}`);
  log('FEFO: ยอดคงเหลือรวมถูกต้อง (3000 + 200 รับเข้า − 1100 = 2100)', cardFefo.data.data?.currentBalance === 2100, `balance=${cardFefo.data.data?.currentBalance}`);
  log('lot ไม่ระบุวันหมดอายุถูก mark (L2603 ของยา 0002)', (cardFefo.data.data?.lotsSummary || []).some(l => l.lotno === 'L2603' && l.dateexpire === 'ไม่ระบุ'));

  // ---------- 8. ปรับปรุงยอด (ตัดจำหน่าย) ----------
  const adj = await api('POST', '/api/stock/adjustments', {
    drugcode: '0001',
    category: 'DESTROY_EXPIRED',
    quantity: 50,
    lotno: 'L9001',
    reason: 'ทดสอบตัดยาหมดอายุ'
  }, STAFF_TOKEN);
  log('บันทึกตัดจำหน่ายยาหมดอายุ 50 หน่วย', adj.status === 200 && adj.data.success);

  const card2 = await api('GET', `/api/stock/card/0001?startDate=${today}&endDate=${today}`, null, TOKEN);
  const adjRows = card2.data.data?.transactions?.filter(t => t.type === 'ADJUSTMENT') || [];
  log('Stock Card แสดงรายการปรับปรุง', adjRows.length === 1 && adjRows[0].out === 50);
  const lot9001 = (card2.data.data?.lotsSummary || []).find(l => l.lotno === 'L9001');
  log('ปรับปรุงระบุ lot ตัดถูก lot (L9001)', lot9001 && lot9001.remaining === 350, `remain=${lot9001?.remaining}`);

  // ---------- 9. PDPA ----------
  const disp = await api('GET', `/api/stock/dispensing/0001?startDate=2026-06-01&endDate=2026-12-31`, null, TOKEN);
  const item0 = disp.data.data?.items?.[0];
  log('ประวัติจ่ายยา (demo) พร้อมข้อมูล', disp.status === 200 && (disp.data.data?.items?.length || 0) > 0);
  log('PDPA: ชื่อถูก mask ฝั่ง server', item0 && item0.patientName.includes('*'), `name=${item0?.patientName}`);
  log('PDPA: PID ถูก mask (••••)', item0 && String(item0.pid).includes('••••'), `pid=${item0?.pid}`);

  const reveal = await api('GET', `/api/stock/dispensing/0001?startDate=2026-06-01&endDate=2026-12-31&reveal=1&reason=ทดสอบระบบ`, null, TOKEN);
  log('PDPA: reveal=1 + reason → ชื่อเต็ม', reveal.status === 200 && !(reveal.data.data?.items?.[0]?.patientName || '').includes('*'));

  const revealNoReason = await api('GET', `/api/stock/dispensing/0001?startDate=2026-06-01&endDate=2026-12-31&reveal=1`, null, TOKEN);
  log('PDPA: reveal ไม่ระบุ reason → 400', revealNoReason.status === 400);

  // ---------- 10. ความถูกต้องงวด (period-aware BF) ----------
  const pastCard = await api('GET', '/api/stock/card/0001?startDate=2026-06-01&endDate=2026-06-30', null, TOKEN);
  const pastWarnings = pastCard.data.data?.warnings || [];
  log('Stock Card งวดก่อนวันนับ มี warning คำนวณย้อนกลับ',
    pastWarnings.some(w => w.code === 'BALANCE_DERIVED_FROM_FUTURE_COUNT' || w.code === 'OPENING_BALANCE_DERIVED'),
    `warnings=${pastWarnings.map(w => w.code).join(',')}`);

  // ---------- 11. รายงานความคลาดเคลื่อน ----------
  // 0001: นับ 1000 + รับเข้า 1500 (ใบรับของระบบ) − ตัดจำหน่าย 50 = 2450
  const variance = await api('GET', '/api/stock/variance', null, TOKEN);
  const vItem = (variance.data.data?.items || []).find(i => i.drugcode === '0001');
  log('รายงาน variance ตรงกับเครื่องยนต์ Stock Card',
    variance.status === 200 && vItem && vItem.counted === 1000 && vItem.computedBalance === 2450,
    `counted=${vItem?.counted}, computed=${vItem?.computedBalance} (1000 + 1500 − 50 = 2450)`);

  // ---------- 12. สิทธิ์ (role) ----------
  const staffReset = await api('POST', '/api/stock/initial-count/reset-all', {}, STAFF_TOKEN);
  log('staff เรียก reset-all → 403', staffReset.status === 403);

  const adminReset = await api('POST', '/api/stock/initial-count/reset-all', {}, TOKEN);
  log('admin เรียก reset-all → 200', adminReset.status === 200);

  // กู้คืนข้อมูลทดสอบที่โดนรีเซ็ต (บันทึกใหม่เพื่อทดสอบ persistence)
  const resave = await api('POST', '/api/stock/initial-count', {
    drugcode: '0001', drugname: 'Paracetamol 500 mg tablet',
    lots: [{ lotno: 'L9001', dateexpire: '2027-06-30', amount: 400, costprice: 0.35 }],
    countDate: today, countedBy: 'tester'
  }, STAFF_TOKEN);
  if (!resave.data.success) console.log('DEBUG resave:', resave.status, JSON.stringify(resave.data));

  const staffSettings = await api('POST', '/api/settings/save', { host: '10.9.9.9' }, STAFF_TOKEN);
  log('staff แก้ DB connection → 403', staffSettings.status === 403);

  const staffUnitInfo = await api('POST', '/api/settings/save', { motherHospital: 'รพ.แม่ข่าย (staff)', pcuname: 'ทดสอบ' }, STAFF_TOKEN);
  log('staff บันทึกข้อมูลหน่วยบริการ → 200', staffUnitInfo.status === 200, `status=${staffUnitInfo.status}`);

  // ---------- 12b. Drug Safety: ระบบเตือนภัย Triple Whammy (AKI) ----------
  const safetyLive = await api('GET', '/api/safety/live', null, TOKEN);
  log('เฝ้าระวังยา: GET /api/safety/live ตอบ 200 พร้อมผลตรวจจับ',
    safetyLive.status === 200 && safetyLive.data.success === true && Array.isArray(safetyLive.data.data?.alerts),
    `tripleCount=${safetyLive.data.data?.tripleCount}, doubleCount=${safetyLive.data.data?.doubleCount}`);

  // ตรวจสอบการบังคับใช้ PDPA masking
  const liveSample = safetyLive.data.data?.alerts?.[0];
  log('เฝ้าระวังยา: ข้อมูลคนไข้ผ่านการ Mask ตาม PDPA',
    !liveSample || (liveSample.cidMasked && liveSample.cidMasked.includes('X') && !liveSample.idcard),
    `cidMasked=${liveSample?.cidMasked}, pidMasked=${liveSample?.pidMasked}`);

  const safetyHistory = await api('GET', `/api/safety/history?startDate=2026-01-01&endDate=${today}`, null, TOKEN);
  log('เฝ้าระวังยา: GET /api/safety/history ตอบ 200',
    safetyHistory.status === 200 && safetyHistory.data.success === true && safetyHistory.data.data?.totalVisitsScanned >= 0,
    `totalAlerts=${safetyHistory.data.data?.totalAlerts}`);

  const safetyDrugs = await api('GET', '/api/safety/drugs', null, TOKEN);
  log('เฝ้าระวังยา: GET /api/safety/drugs ทะเบียนยาเสี่ยง ตอบ 200',
    safetyDrugs.status === 200 && safetyDrugs.data.success === true && Array.isArray(safetyDrugs.data.data),
    `totalClassified=${safetyDrugs.data.data?.length}`);

  const safetySettingsStaff = await api('POST', '/api/safety/settings', { overrides: { 'TEST': { category: 'nsaid' } } }, STAFF_TOKEN);
  log('เฝ้าระวังยา: staff ปรับแต่ง override ทะเบียนยา → 403 (admin only)', safetySettingsStaff.status === 403);

  const safetySettingsAdmin = await api('POST', '/api/safety/settings', { overrides: { '9999': { category: 'nsaid', note: 'test' } } }, TOKEN);
  log('เฝ้าระวังยา: admin ปรับแต่ง override ทะเบียนยา → 200', safetySettingsAdmin.status === 200 && safetySettingsAdmin.data.success === true);

  const safetyConflicts = await api('GET', '/api/safety/conflicts', null, TOKEN);
  log('เฝ้าระวังยา: GET /api/safety/conflicts รายการคู่ยาที่ไม่ควรจ่ายร่วมกัน (JHCIS + เกณฑ์มาตรฐาน) → 200',
    safetyConflicts.status === 200 && safetyConflicts.data.success === true && Array.isArray(safetyConflicts.data.data?.jhcisPairs),
    `totalPairs=${safetyConflicts.data.data?.totalPairs}, clinicalRules=${safetyConflicts.data.data?.clinicalRules?.length}`);

  const addConflictStaff = await api('POST', '/api/safety/conflicts', { drugcode_a: '0001', drugcode_b: '0023' }, STAFF_TOKEN);
  log('เฝ้าระวังยา: staff เพิ่มคู่ยาห้ามจ่ายร่วม → 403 (admin only)', addConflictStaff.status === 403);

  const addConflictAdmin = await api('POST', '/api/safety/conflicts', { drugcode_a: '0001', drugcode_b: '0023', reason: 'ทดสอบ' }, TOKEN);
  log('เฝ้าระวังยา: admin เพิ่มคู่ยาห้ามจ่ายร่วม → 200', addConflictAdmin.status === 200 && addConflictAdmin.data.success === true);

  const delConflictAdmin = await api('DELETE', '/api/safety/conflicts', { drugcode_a: '0001', drugcode_b: '0023' }, TOKEN);
  log('เฝ้าระวังยา: admin ลบคู่ยาห้ามจ่ายร่วม → 200', delConflictAdmin.status === 200 && delConflictAdmin.data.success === true);

  // ---------- 12.5 DTAM HERBAL REGISTRY & AUDIT ----------
  const dtamStatus = await api('GET', '/api/catalogue/dtam/status', null, TOKEN);
  log('DTAM: GET /api/catalogue/dtam/status ตอบ 200 พร้อมข้อมูลทะเบียน',
    dtamStatus.status === 200 && dtamStatus.data.success === true && dtamStatus.data.data?.hasLocalRegistry === true,
    `version=${dtamStatus.data.data?.currentVersion}, totalActive=${dtamStatus.data.data?.stats?.totalActive}`);

  const dtamAudit = await api('GET', '/api/catalogue/dtam/audit', null, TOKEN);
  log('DTAM: GET /api/catalogue/dtam/audit ตรวจสอบยาสมุนไพรใน JHCIS → 200',
    dtamAudit.status === 200 && dtamAudit.data.success === true && Array.isArray(dtamAudit.data.data?.items),
    `totalHerbs=${dtamAudit.data.data?.summary?.total}, matched=${dtamAudit.data.data?.summary?.matched}`);

  const dtamSearch = await api('GET', '/api/catalogue/dtam/search?q=' + encodeURIComponent('ฟ้าทะลายโจร'), null, TOKEN);
  log('DTAM: GET /api/catalogue/dtam/search ค้นหารหัส 24 หลัก/TMT → 200',
    dtamSearch.status === 200 && dtamSearch.data.success === true && dtamSearch.data.items?.length > 0,
    `found=${dtamSearch.data.items?.length}, sampleCode24=${dtamSearch.data.items?.[0]?.code24}`);

  const dtamSqlStaff = await api('POST', '/api/catalogue/dtam/generate-sql', { items: [] }, STAFF_TOKEN);
  log('DTAM: staff เรียก generate-sql → 403 (admin only)', dtamSqlStaff.status === 403);

  const dtamSql = await api('POST', '/api/catalogue/dtam/generate-sql', {
    items: [
      { drugcode: '410000000047000002011376', drugname: 'ฟ้าทะลายโจร', currentCode24: '410000000047000002011376', suggestedCode24: '410000000479150020182750', currentTmt: '', suggestedTmt: '9094251' }
    ]
  }, TOKEN);
  log('DTAM: admin สร้างสคริปต์ SQL ปรับปรุงรหัสสมุนไพร → 200',
    dtamSql.status === 200 && dtamSql.data.success === true && dtamSql.data.data?.sql?.includes('UPDATE cdrug'),
    `totalUpdates=${dtamSql.data.data?.totalUpdates}, backup=${dtamSql.data.data?.backupTable}`);

  const dtamApplyStaff = await api('POST', '/api/catalogue/dtam/apply-updates', { updates: [] }, STAFF_TOKEN);
  log('DTAM: staff เรียก apply-updates → 403 (admin only)', dtamApplyStaff.status === 403);

  const dtamApply = await api('POST', '/api/catalogue/dtam/apply-updates', {
    updates: [
      { drugcode: '410000000047000002011376', code24: '410000000479150020182750', tmt: '9094251' }
    ]
  }, TOKEN);
  log('DTAM: admin ปรับปรุงรหัสสมุนไพรลงฐาน (apply-updates) → 200',
    dtamApply.status === 200 && dtamApply.data.success === true,
    `updatedCount=${dtamApply.data.data?.updatedCount}`);

  // ---------- 13. PERSISTENCE: รีสตาร์ทแล้วข้อมูลต้องอยู่ ----------
  await stopServer();
  await startServer();

  const relogin = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin' });
  TOKEN = relogin.data.token;

  const receiptsAfter = await api('GET', '/api/excel/receipts?limit=50', null, TOKEN);
  const found = (receiptsAfter.data.data || []).find(r => r.receiveno === 'TEST-REC-001');
  log('PERSISTENCE: ใบรับยาอยู่ครบหลังรีสตาร์ท (เดิมหาย!)', !!found && found.items.length === 3,
    `receipts=${receiptsAfter.data.data?.length}, items=${found?.items?.length}`);

  const countAfter = await api('GET', '/api/stock/initial-count', null, TOKEN);
  if (!countAfter.data.data?.countsMap?.['0001']) console.log('DEBUG countAfter:', countAfter.status, JSON.stringify(countAfter.data).slice(0, 300));
  const c0001 = countAfter.data.data?.countsMap?.['0001'];
  log('PERSISTENCE: ยอดนับอยู่ครบหลังรีสตาร์ท', !!c0001 && c0001.totalAmount === 400, `total=${c0001?.totalAmount}`);

  const adjAfter = await api('GET', '/api/stock/adjustments?drugcode=0001', null, TOKEN);
  log('PERSISTENCE: รายการปรับปรุงอยู่ครบหลังรีสตาร์ท', (adjAfter.data.data || []).length === 1);


  // ---------- 3b. ช่องโหว่ที่เคยถูกแทรกและถูกลบออก (regression guard) ----------
  const unlockAttempt = await api('POST', '/api/auth/unlock', { username: 'admin' });
  log('endpoint unlock (กัน brute-force bypass) ถูกลบแล้ว → 404', unlockAttempt.status === 404, `status=${unlockAttempt.status}`);

  const setupStatus = await api('GET', '/api/setup/status');
  log('setup/status (public) ตอบได้', setupStatus.status === 200 && setupStatus.data.success === true);
  log('setup: demo mode = ต้องตั้งค่าได้ (setupNeeded)', setupStatus.data.setupNeeded === true, `mode=${setupStatus.data.mode}`);

  // complete ด้วย host ที่เชื่อมไม่ได้ (config แยกของเทส) → 502 บันทึกแต่เชื่อมไม่ได้
  const setupTry = await api('POST', '/api/setup/complete', { host: '10.255.255.1', port: 3333, user: 'root', password: 'x', database: 'jhcisdb' }, null);
  log('setup/complete เชื่อมไม่สำเร็จ → 502 (บันทึกไว้แก้ซ้ำได้)', setupTry.status === 502, `status=${setupTry.status}`);

  const setupStatus2 = await api('GET', '/api/setup/status');
  log('setup: หลังบันทึก host ใหม่ = live_unavailable แต่ยังแก้ต่อได้', setupStatus2.data.mode === 'live_unavailable' && setupStatus2.data.setupNeeded === true, `mode=${setupStatus2.data.mode}`);

  // สรุป
  await stopServer();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });

  const failed = results.filter(r => !r.pass);
  console.log('\n=======================================================');
  console.log(`  ผลทดสอบ: ${results.length - failed.length}/${results.length} ผ่าน`);
  if (failed.length > 0) {
    failed.forEach(f => console.log(`  ❌ ${f.name} ${f.detail}`));
    process.exit(1);
  } else {
    console.log('  ทุกเคสผ่าน ✅');
  }
}

run().catch(err => {
  console.error('TEST RUNNER ERROR:', err.message);
  stopServer().then(() => process.exit(1));
});
