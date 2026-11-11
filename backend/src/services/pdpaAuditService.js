const fs = require('fs');
const path = require('path');
const { appendAudit } = require('./storage');

// PDPA Security & Privacy Policy Configuration
// พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 + แนวทาง สธ.
// ข้อมูลผู้ป่วยถูก mask "ฝั่ง server" เป็นค่าเริ่มต้น — ข้อมูลเต็มส่งออกเฉพาะเมื่อ
// ผู้ใช้ผ่านการยืนยันตัวตน (session) ระบุเหตุผล และถูกบันทึก audit trail ทุกครั้ง

const LOG_DIR = path.join(__dirname, '../../../logs');
const AUDIT_LOG_FILE = path.join(LOG_DIR, 'pdpa_access_audit.log');

try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (e) {}

const PDPA_POLICY = {
  act: 'พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. ๒๕๖๒ (PDPA B.E. 2562)',
  healthStandard: 'แนวทางความมั่นคงปลอดภัยสารสนเทศสุขภาพ กระทรวงสาธารณสุข (MOPH)',
  dataController: 'โรงพยาบาลส่งเสริมสุขภาพตำบล (รพ.สต.) / ศูนย์บริการสาธารณสุข',
  processingScope: 'การบริหารจัดการคลังเวชภัณฑ์และการจ่ายยาตามคำสั่งแพทย์ (ม. 26(5)(ข))',
  storageLocation: 'ระบบภายในเครื่อง On-Premise / Local Intranet 100%',
  cloudExportAllowed: false,
  aiModelTrainingAllowed: false,
  networkSecurity: 'Local Network Only (ไม่มีการส่งข้อมูลออกสู่อินเทอร์เน็ตภายนอก)',
  maskingPolicy: 'พรางชื่อ/เลขบัตร/PID ฝั่งเซิร์ฟเวอร์เสมอ — การเปิดข้อมูลเต็มต้องยืนยันตัวตน + ระบุเหตุผล และถูกบันทึกใน audit trail (ม.39)'
};

// Mask National Citizen ID (CID 13 digits): 1-5099-XXXXX-94-7
function maskCid(cidStr) {
  if (!cidStr) return null;
  const clean = String(cidStr).replace(/\D/g, '');
  if (clean.length !== 13) return 'X-XXXX-XXXXX-XX-X';
  return `${clean[0]}-${clean.slice(1, 5)}-XXXXX-${clean.slice(10, 12)}-${clean[12]}`;
}

// Mask ชื่อ: ปกปิดทั้งชื่อต้นและนามสกุล → "ส. ใจ**"
function maskPatientName(fullName) {
  if (!fullName) return '-';
  const clean = String(fullName).trim();
  const noTitle = clean.replace(/^(นาย|นาง|นางสาว|ด.ต.|ด.ญ.|ว่าที่ ร.ต.|ผู้ช่วยศาสตราจารย์|รองศาสตราจารย์)/u, '');
  const parts = noTitle.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return clean;
  if (parts.length === 1) {
    const w = parts[0];
    return `${w.charAt(0)}${'*'.repeat(Math.max(0, w.length - 1))}`;
  }
  const fname = parts[0];
  const lname = parts[parts.length - 1];
  return `${fname.charAt(0)}${'*'.repeat(Math.max(0, fname.length - 1))} ${lname.charAt(0)}${'*'.repeat(Math.max(0, lname.length - 1))}`;
}

// Mask PID: แสดง 4 หลักท้าย → "••••21"
function maskPid(pid) {
  if (pid === undefined || pid === null || pid === '') return '-';
  const s = String(pid);
  return s.length <= 4 ? '••••' : `••••${s.slice(-4)}`;
}

// Audit trail (ม.39) — ใช้ username จาก session ฝั่ง server เท่านั้น (ห้ามเชื่อ client)
function logPatientDataAccess(options = {}) {
  const {
    username = 'unknown_session',
    action = 'VIEW_PATIENT_DISPENSING',
    drugcode = '-',
    recordCount = 0,
    ip = '127.0.0.1',
    reason = 'not_specified',
    revealed = false
  } = options;

  const logEntry = {
    timestamp: new Date().toISOString(),
    act: 'PDPA_SEC_39_ROPA',
    action,
    username,
    drugcode,
    recordCount,
    ip,
    reason,
    revealed,
    policyCompliance: 'LOCAL_ON_PREMISE_ONLY'
  };

  try {
    const line = JSON.stringify(logEntry) + '\n';
    // rotation แบบง่าย: เกิน 5MB เลื่อนไปไฟล์วันที่
    if (fs.existsSync(AUDIT_LOG_FILE) && fs.statSync(AUDIT_LOG_FILE).size > 5 * 1024 * 1024) {
      const rotated = AUDIT_LOG_FILE + '.' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
      try { fs.renameSync(AUDIT_LOG_FILE, rotated); } catch (e) {}
    }
    fs.appendFileSync(AUDIT_LOG_FILE, line, 'utf8');
    // เก็บซ้ำใน localdb เพื่อให้ดูย้อนหลังจาก UI ได้
    appendAudit('pdpa_audit', logEntry);
  } catch (err) {
    console.error('[PDPA LOG ERROR] Failed to write audit trail:', err.message);
  }
}

module.exports = {
  PDPA_POLICY,
  maskCid,
  maskPatientName,
  maskPid,
  logPatientDataAccess
};
