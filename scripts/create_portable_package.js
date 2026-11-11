const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(ROOT_DIR, 'build-package');
const TARGET_DIR = path.join(STAGING_DIR, 'JHCIS-DrugStore');
const OUTPUT_ZIP = path.join(ROOT_DIR, 'JHCIS-DrugStore.zip');

console.log('========================================================================');
console.log(' 📦 Creating Portable Package for Other Health Centers (รพ.สต.)');
console.log(' Target Folder on Drive C: C:\\JHCIS-DrugStore');
console.log(' Output Zip: ' + OUTPUT_ZIP);
console.log('========================================================================');

// 1. Clean staging directory
if (fs.existsSync(STAGING_DIR)) {
  console.log('[1/7] Cleaning previous staging directory...');
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TARGET_DIR, { recursive: true });

// Helper to copy recursively
function copyDir(src, dest, filterFn = null) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (filterFn && !filterFn(srcPath, entry.name)) continue;

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, filterFn);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 2. Copy Portable node.exe
console.log('[2/7] Bundling standalone portable Node.js executable...');
const binDir = path.join(TARGET_DIR, 'bin');
fs.mkdirSync(binDir, { recursive: true });
const nodeSource = process.execPath;
fs.copyFileSync(nodeSource, path.join(binDir, 'node.exe'));
console.log('      Copied: ' + nodeSource + ' -> bin/node.exe');

// 3. Copy Backend
console.log('[3/7] Copying backend source code & DTAM registry...');
const backendDest = path.join(TARGET_DIR, 'backend', 'src');
copyDir(path.join(ROOT_DIR, 'backend', 'src'), backendDest, (srcPath, name) => {
  // Exclude scratch or inspection scripts
  if (name.startsWith('inspect_') || name.startsWith('test_') || name.startsWith('check_')) return false;
  return true;
});
copyDir(path.join(ROOT_DIR, 'backend', 'data'), path.join(TARGET_DIR, 'backend', 'data'));

// 4. Copy Frontend Build (dist)
console.log('[4/7] Building & copying production frontend (dist)...');
const frontendDistSrc = path.join(ROOT_DIR, 'frontend', 'dist');
const frontendDistDest = path.join(TARGET_DIR, 'frontend', 'dist');
execSync('npm run build', { cwd: path.join(ROOT_DIR, 'frontend'), stdio: 'inherit' });
copyDir(frontendDistSrc, frontendDistDest);

// 5. Copy production node_modules
console.log('[5/7] Copying production node_modules (mysql2, express, cors, etc.)...');
const nodeModulesSrc = path.join(ROOT_DIR, 'node_modules');
const nodeModulesDest = path.join(TARGET_DIR, 'node_modules');
copyDir(nodeModulesSrc, nodeModulesDest, (srcPath, name) => {
  // Skip dev tool folders if any
  if (name === '.bin' || name === '.cache') return false;
  return true;
});

// Copy package.json
fs.copyFileSync(path.join(ROOT_DIR, 'package.json'), path.join(TARGET_DIR, 'package.json'));

// Create clean drugcatalogue & received_documents folders for other health centers (ไม่ติดไฟล์ 06020 รพ.สต.ท่ากว้าง)
console.log('      Creating clean drugcatalogue/ and received_documents/ folders...');
fs.mkdirSync(path.join(TARGET_DIR, 'drugcatalogue'), { recursive: true });
fs.mkdirSync(path.join(TARGET_DIR, 'received_documents', 'pdf'), { recursive: true });
fs.mkdirSync(path.join(TARGET_DIR, 'received_documents', 'excel'), { recursive: true });

// 6. Create clean config.json for new installations
console.log('[6/7] Creating template config.json & launcher scripts...');
const configTemplate = {
  host: "localhost",
  port: 3333,
  user: "root",
  password: "",
  database: "jhcisdb",
  charset: "tis620",
  mode: "live",
  autoFallbackToDemo: false,
  admins: ["admin", "adm"],
  pcucode: "",
  pcuname: "",
  pcuAddress: "",
  motherHospital: "",
  allowedOrigins: [
    "http://localhost:5000",
    "http://localhost:3000",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:3000"
  ],
  receiptSource: "local"
};
fs.mkdirSync(path.join(TARGET_DIR, 'backend'), { recursive: true });
fs.writeFileSync(path.join(TARGET_DIR, 'backend', 'config.json'), JSON.stringify(configTemplate, null, 2), 'utf8');
fs.writeFileSync(path.join(TARGET_DIR, 'config.json'), JSON.stringify(configTemplate, null, 2), 'utf8');

// Ensure localdb directory is clean and created
const targetLocalDb = path.join(TARGET_DIR, 'backend', 'src', 'data', 'localdb');
if (fs.existsSync(targetLocalDb)) {
  fs.rmSync(targetLocalDb, { recursive: true, force: true });
}
fs.mkdirSync(targetLocalDb, { recursive: true });
const targetInitialStock = path.join(TARGET_DIR, 'backend', 'src', 'data', 'initial_stock.json');
if (fs.existsSync(targetInitialStock)) {
  fs.unlinkSync(targetInitialStock);
}

// Copy tested launcher batch files & icon from root
fs.copyFileSync(path.join(ROOT_DIR, 'drug-store.ico'), path.join(TARGET_DIR, 'drug-store.ico'));
fs.copyFileSync(path.join(ROOT_DIR, 'START_SILENT.vbs'), path.join(TARGET_DIR, 'START_SILENT.vbs'));
fs.copyFileSync(path.join(ROOT_DIR, 'CREATE_SHORTCUTS.vbs'), path.join(TARGET_DIR, 'CREATE_SHORTCUTS.vbs'));
fs.copyFileSync(path.join(ROOT_DIR, '1-START.bat'), path.join(TARGET_DIR, '1-START.bat'));
fs.copyFileSync(path.join(ROOT_DIR, '2-STOP.bat'), path.join(TARGET_DIR, '2-STOP.bat'));
fs.copyFileSync(path.join(ROOT_DIR, '3-CREATE-DESKTOP-SHORTCUT.bat'), path.join(TARGET_DIR, '3-CREATE-DESKTOP-SHORTCUT.bat'));
if (fs.existsSync(path.join(ROOT_DIR, 'README.md'))) {
  fs.copyFileSync(path.join(ROOT_DIR, 'README.md'), path.join(TARGET_DIR, 'README.md'));
}

// Create README_INSTALL.txt / Instructions
const readmeContent = `========================================================================
  คู่มือการติดตั้งและใช้งานระบบคลังยา รพ.สต. (JHCIS Drug Stock)
========================================================================

【 1. วิธีติดตั้งเมื่อนำไฟล์ไปที่เครื่อง รพ.สต. อื่น 】
------------------------------------------------------------------------
1. คัดลอกไฟล์ JHCIS-DrugStore.zip ไปวางที่ Drive C: (C:\\)
2. คลิกขวาที่ไฟล์ JHCIS-DrugStore.zip เลือก "Extract All..." (แตกไฟล์ทั้งหมด)
3. ปลายทางให้เลือกแตกไฟล์ลงที่ C:\\
   -> จะได้โฟลเดอร์ C:\\JHCIS-DrugStore โดยอัตโนมัติ

* หมายเหตุ: ระบบนี้มาพร้อม Portable Node.js ในตัวเรียบร้อยแล้ว
  ไม่จำเป็นต้องติดตั้งโปรแกรม Node.js หรือโปรแกรมเสริมใดๆ ทั้งสิ้น!


【 2. วิธีตั้งค่าเชื่อมต่อฐานข้อมูล JHCIS ของ รพ.สต. 】
------------------------------------------------------------------------
ทำได้ 2 วิธี (เลือกวิธีใดวิธีหนึ่ง):

[วิธีที่ 1 : ง่ายที่สุดผ่านหน้าเว็บ (แนะนำ)]
1. ดับเบิ้ลคลิกไฟล์ "1-START.bat"
2. เมื่อหน้าเว็บเบราว์เซอร์เปิดขึ้นมา ให้คลิกเมนู "ตั้งค่า JHCIS" ที่แถบด้านบน
3. กรอก IP เครื่อง Server JHCIS ของ รพ.สต. ของท่าน (เช่น 192.168.1.10)
4. พอร์ต: 3333, ผู้ใช้: root, ฐานข้อมูล: jhcisdb
5. กดปุ่ม "ทดสอบการเชื่อมต่อ" -> เมื่อขึ้นสำเร็จให้กด "บันทึกและเชื่อมต่อ"

[วิธีที่ 2 : แก้ไขไฟล์ config.json]
1. เปิดไฟล์ config.json ด้วย Notepad
2. เปลี่ยนค่า "host": "192.168.1.253" เป็น IP เครื่องแม่ข่าย JHCIS ของ รพ.สต. ท่าน
3. บันทึกไฟล์ (Save) แล้วเปิดระบบใช้งานได้ทันที


【 3. วิธีเปิดใช้งาน 】
------------------------------------------------------------------------
- วิธีที่ 1: ดับเบิ้ลคลิกไฟล์ "1-START.bat"
- วิธีที่ 2: ดับเบิ้ลคลิกไฟล์ "3-CREATE-DESKTOP-SHORTCUT.bat" เพียงครั้งเดียว
  จะมีไอคอน "ระบบคลังยา JHCIS Drug Stock" ปรากฏบน Desktop สะดวกต่อการใช้งานทุกวัน
- วิธีที่ 3: ดับเบิ้ลคลิกไฟล์ "START_SILENT.vbs"
  (ระบบจะทำงานเงียบๆ เบื้องหลังและเปิดหน้าเว็บทันที โดยไม่มีหน้าต่างจอดำกวนใจ)


【 4. วิธีปิดระบบ 】
------------------------------------------------------------------------
- ดับเบิ้ลคลิกไฟล์ "2-STOP.bat" เพื่อปิดการทำงานของเซิร์ฟเวอร์


【 5. มาตรการคุ้มครองข้อมูลส่วนบุคคล (PDPA) และความปลอดภัยสารสนเทศ 】
------------------------------------------------------------------------
ระบบนี้ปฏิบัติตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. ๒๕๖๒ (PDPA) อย่างเคร่งครัด:
1. Local On-Premise 100%: ทำงานภายในเครือข่าย Local LAN ของ รพ.สต. เท่านั้น
2. ZERO Cloud Export: ไม่มีการส่งข้อมูลผู้ป่วยหรือคลังยาออกสู่อินเทอร์เน็ตหรือคลาวด์ภายนอก
3. ZERO AI Training: ไม่มีการนำข้อมูลการรักษาหรือข้อมูลส่วนบุคคลไปเทรนโมเดล AI ใดๆ ทั้งสิ้น
4. PII/PHI Data Masking: มีระบบเซ็นเซอร์ซ่อนชื่อผู้ป่วยและเลขบัตรประชาชน 13 หลัก
5. Audit Trail (มาตรา ๓๙): มีระบบบันทึกประวัติการเรียกดูประวัติการจ่ายยาอัตโนมัติใน logs/pdpa_access_audit.log
========================================================================
`;
fs.writeFileSync(path.join(TARGET_DIR, 'README_INSTALL.txt'), readmeContent, 'utf8');

// 7. Compress into ZIP
console.log('[7/7] Compressing into standalone ZIP archive using Windows tar...');
if (fs.existsSync(OUTPUT_ZIP)) {
  fs.unlinkSync(OUTPUT_ZIP);
}

// Run tar -a -cf from STAGING_DIR so the root directory inside the zip is "JHCIS-DrugStore"
const tarCommand = `tar -a -cf "${OUTPUT_ZIP}" "JHCIS-DrugStore"`;
console.log('      Executing: ' + tarCommand);
execSync(tarCommand, { cwd: STAGING_DIR, stdio: 'inherit' });

const zipStat = fs.statSync(OUTPUT_ZIP);
console.log('========================================================================');
console.log(' ✅ Portable Package Created Successfully!');
console.log(' 📁 Output File: ' + OUTPUT_ZIP);
console.log(' 📦 File Size: ' + (zipStat.size / 1024 / 1024).toFixed(2) + ' MB');
console.log(' 🎯 Extract Target: C:\\ -> C:\\JHCIS-DrugStore');
console.log('========================================================================');

// 8. Cleanup staging directory
if (fs.existsSync(TARGET_DIR)) {
  fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  console.log(' 🧹 Cleaned temporary staging directory.');
}
