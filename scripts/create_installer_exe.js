/**
 * create_installer_exe.js
 * Builds a standalone Self-Extracting (.exe) Installer using WinRAR SFX
 * 
 * Features:
 * - Target directory default: C:\Drug Store
 * - Modern Green Pharmacy / Drug Warehouse Icon (drug-store.ico) on Installer, Desktop & Start Menu
 * - 100% Windowless Silent Launch (wscript.exe + START_SILENT.vbs -> NO black CMD window)
 * - Thai UI encoding: 100% clean UTF-16LE Unicode (no alien characters / ไม่เป็นภาษาต่างดาว)
 * - Bundled portable node.exe (no Node.js required on client PC)
 * - Built-in production React frontend (dist)
 * - Pre-installed production node_modules
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(PROJECT_ROOT, 'build-package', 'installer_staging');
const OUTPUT_EXE = path.join(PROJECT_ROOT, 'Setup_JHCIS_DrugStore.exe');
const OUTPUT_EXE_THAI = path.join(PROJECT_ROOT, 'ติดตั้งระบบคลังยา_JHCIS.exe');
const WINRAR_EXE = 'C:\\Program Files\\WinRAR\\rar.exe';
const ICON_FILE = path.join(PROJECT_ROOT, 'drug-store.ico');

console.log('========================================================================');
console.log(' 🚀 Building Standalone JHCIS Drug Store SFX Installer (.exe)');
console.log(' Target Folder: C:\\Drug Store');
console.log(' Icon: ' + ICON_FILE);
console.log(' Output: ' + OUTPUT_EXE);
console.log('========================================================================');

// 1. Verify WinRAR & Icon
if (!fs.existsSync(WINRAR_EXE)) {
  console.error('❌ Error: WinRAR rar.exe not found at: ' + WINRAR_EXE);
  process.exit(1);
}
if (!fs.existsSync(ICON_FILE)) {
  console.log('Generating modern green drug store icon first...');
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(__dirname, 'generate_icon.ps1')}"`, { stdio: 'inherit' });
}

// 2. Clean & recreate staging directory
console.log('\n[1/6] Preparing staging directory...');
if (fs.existsSync(STAGING_DIR)) {
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Helper to copy recursively (skips ignored dir or file names)
function copyDir(src, dest, ignoreNames = []) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoreNames.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, ignoreNames);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 3. Copy files to staging root
console.log('[2/6] Copying project files & runtime...');

// 3a. Node portable binary
const binDir = path.join(STAGING_DIR, 'bin');
fs.mkdirSync(binDir, { recursive: true });
const systemNode = process.execPath;
fs.copyFileSync(systemNode, path.join(binDir, 'node.exe'));
console.log('      Bundled: bin/node.exe');

// 3b. Backend (Clean Template: skip uploads & inspect_cdrug.js; keep both DTAM files)
copyDir(path.join(PROJECT_ROOT, 'backend'), path.join(STAGING_DIR, 'backend'), ['uploads', 'inspect_cdrug.js']);
fs.mkdirSync(path.join(STAGING_DIR, 'backend', 'uploads'), { recursive: true });

// Ensure clean backend localdb, config & mappings in staging (no previous health center data/sessions/logs)
const stagingDataDir = path.join(STAGING_DIR, 'backend', 'src', 'data');
const stagingLocalDb = path.join(stagingDataDir, 'localdb');
for (const f of [
  path.join(STAGING_DIR, 'backend', 'config.json'),
  path.join(STAGING_DIR, 'config.json'),
  path.join(stagingDataDir, 'mappings.json'),
  path.join(stagingDataDir, 'initial_stock.json')
]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
if (fs.existsSync(stagingLocalDb)) {
  fs.rmSync(stagingLocalDb, { recursive: true, force: true });
}
fs.mkdirSync(stagingLocalDb, { recursive: true });

// Clean config template written ONLY to config.example.json so Safe Upgrade never overwrites live config.json
const cleanConfig = {
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
fs.writeFileSync(path.join(STAGING_DIR, 'backend', 'config.example.json'), JSON.stringify(cleanConfig, null, 2), 'utf8');
console.log('      Copied: backend/ (Clean Template — DTAM included, no PCU data, Safe Upgrade config.example.json)');

// 3c. Frontend production build (always build fresh to include latest UI updates)
const frontendDist = path.join(PROJECT_ROOT, 'frontend', 'dist');
console.log('      Building latest frontend dist...');
execSync('npm run build', { cwd: path.join(PROJECT_ROOT, 'frontend'), stdio: 'inherit' });
copyDir(frontendDist, path.join(STAGING_DIR, 'frontend', 'dist'));
console.log('      Copied: frontend/dist/');

// 3d. Production node_modules
copyDir(path.join(PROJECT_ROOT, 'node_modules'), path.join(STAGING_DIR, 'node_modules'), ['.bin', 'concurrently']);
console.log('      Copied: production node_modules/');

// 3e. Clean drugcatalogue, backup & received_documents folders for other service units (ไม่นำไฟล์เฉพาะของ รพ.สต. อื่นติดไป)
const stagingBackup = path.join(STAGING_DIR, 'backup');
const stagingCatalogue = path.join(STAGING_DIR, 'drugcatalogue');
const stagingPdf = path.join(STAGING_DIR, 'received_documents', 'pdf');
const stagingExcel = path.join(STAGING_DIR, 'received_documents', 'excel');

fs.mkdirSync(stagingBackup, { recursive: true });
fs.mkdirSync(stagingCatalogue, { recursive: true });
fs.mkdirSync(stagingPdf, { recursive: true });
fs.mkdirSync(stagingExcel, { recursive: true });

fs.writeFileSync(path.join(stagingBackup, 'README.txt'), [
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
].join('\r\n'), 'utf8');

fs.writeFileSync(path.join(stagingCatalogue, 'README.txt'), [
  '========================================================================',
  ' โฟลเดอร์เก็บไฟล์ Drug Catalogue (รพ.สต. และ รพ.แม่ข่าย)',
  '========================================================================',
  'สามารถนำไฟล์ Excel (.xlsx, .xls) เช่น รายการยา Approved ของ รพ.สต.',
  'หรือไฟล์รายการยาสมุนไพรของ รพ.แม่ข่าย มาวางไว้ที่นี่ได้',
  'ระบบจะตรวจพบและนำไปเปรียบเทียบกับตาราง cdrug ใน JHCIS อัตโนมัติ'
].join('\r\n'), 'utf8');

console.log('      Created clean folders: backup/, drugcatalogue/, received_documents/pdf/, received_documents/excel/');

// 3f. Copy modern green pharmacy icon
fs.copyFileSync(ICON_FILE, path.join(STAGING_DIR, 'drug-store.ico'));
console.log('      Copied: drug-store.ico');

// 4. Create windowless launcher scripts in staging
console.log('[3/6] Generating windowless launcher scripts & finish handler...');

fs.copyFileSync(path.join(PROJECT_ROOT, 'START_SILENT.vbs'), path.join(STAGING_DIR, 'START_SILENT.vbs'));
fs.copyFileSync(path.join(PROJECT_ROOT, 'CREATE_SHORTCUTS.vbs'), path.join(STAGING_DIR, 'CREATE_SHORTCUTS.vbs'));
fs.copyFileSync(path.join(PROJECT_ROOT, '1-START.bat'), path.join(STAGING_DIR, '1-START.bat'));
fs.copyFileSync(path.join(PROJECT_ROOT, '2-STOP.bat'), path.join(STAGING_DIR, '2-STOP.bat'));
fs.copyFileSync(path.join(PROJECT_ROOT, '3-CREATE-DESKTOP-SHORTCUT.bat'), path.join(STAGING_DIR, '3-CREATE-DESKTOP-SHORTCUT.bat'));
if (fs.existsSync(path.join(PROJECT_ROOT, 'README.md'))) {
  fs.copyFileSync(path.join(PROJECT_ROOT, 'README.md'), path.join(STAGING_DIR, 'README.md'));
}
if (fs.existsSync(path.join(PROJECT_ROOT, 'package.json'))) {
  fs.copyFileSync(path.join(PROJECT_ROOT, 'package.json'), path.join(STAGING_DIR, 'package.json'));
}

// install_finish.vbs (UTF-16LE with BOM — runs via wscript.exe with ZERO black CMD window!)
const installFinishVbsLines = [
  '\' ========================================================================',
  '\' Post-Install Setup: Safe Upgrade config/mappings initialization,',
  '\' creates Desktop & Start Menu Shortcuts with Green Icon,',
  '\' and optionally launches the app immediately without any CMD window',
  '\' ========================================================================',
  'Option Explicit',
  'Dim WshShell, fso, appDir, icoPath, wscriptExe, vbsPath, desktopDir, startProgramsDir, startMenuFolder, scDesktop, scStart, ans',
  'Dim cfgPath, legacyCfgPath, exampleCfgPath, mapPath, localDbDir, mapFile, silentMode, arg',
  'Set WshShell = CreateObject("WScript.Shell")',
  'Set fso = CreateObject("Scripting.FileSystemObject")',
  '',
  'silentMode = False',
  'For Each arg In WScript.Arguments',
  '    If LCase(arg) = "--silent" Then silentMode = True',
  'Next',
  '',
  'appDir = fso.GetParentFolderName(WScript.ScriptFullName)',
  'icoPath = appDir & "\\drug-store.ico,0"',
  'wscriptExe = WshShell.ExpandEnvironmentStrings("%SystemRoot%\\System32\\wscript.exe")',
  'vbsPath = appDir & "\\START_SILENT.vbs"',
  '',
  '\' 0. Safe Upgrade: Initialize backend\\config.json & mappings.json ONLY if missing',
  'localDbDir = appDir & "\\backend\\src\\data\\localdb"',
  'If Not fso.FolderExists(localDbDir) Then',
  '    fso.CreateFolder localDbDir',
  'End If',
  '',
  'cfgPath = appDir & "\\backend\\config.json"',
  'legacyCfgPath = appDir & "\\config.json"',
  'exampleCfgPath = appDir & "\\backend\\config.example.json"',
  'If Not fso.FileExists(cfgPath) Then',
  '    If fso.FileExists(legacyCfgPath) Then',
  '        fso.CopyFile legacyCfgPath, cfgPath, False',
  '    ElseIf fso.FileExists(exampleCfgPath) Then',
  '        fso.CopyFile exampleCfgPath, cfgPath, False',
  '    End If',
  'End If',
  '',
  'mapPath = appDir & "\\backend\\src\\data\\mappings.json"',
  'If Not fso.FileExists(mapPath) Then',
  '    Set mapFile = fso.CreateTextFile(mapPath, False, False)',
  '    mapFile.Write "[]"',
  '    mapFile.Close',
  'End If',
  '',
  '\' 1. Create Desktop Shortcut with Modern Green Drug Store Icon',
  'desktopDir = WshShell.SpecialFolders("Desktop")',
  'Set scDesktop = WshShell.CreateShortcut(desktopDir & "\\JHCIS Drug Stock.lnk")',
  'scDesktop.TargetPath = wscriptExe',
  'scDesktop.Arguments = "//nologo """ & vbsPath & """"',
  'scDesktop.WorkingDirectory = appDir',
  'scDesktop.IconLocation = icoPath',
  'scDesktop.WindowStyle = 1',
  'scDesktop.Description = "คลังยา รพ.สต. (JHCIS Drug Stock & Stock Card)"',
  'scDesktop.Save',
  '',
  '\' 2. Create Start Menu Shortcut with Modern Green Drug Store Icon',
  'On Error Resume Next',
  'startProgramsDir = WshShell.SpecialFolders("Programs")',
  'startMenuFolder = startProgramsDir & "\\JHCIS Drug Stock"',
  'If Not fso.FolderExists(startMenuFolder) Then',
  '    fso.CreateFolder startMenuFolder',
  'End If',
  'Set scStart = WshShell.CreateShortcut(startMenuFolder & "\\JHCIS Drug Stock.lnk")',
  'scStart.TargetPath = wscriptExe',
  'scStart.Arguments = "//nologo """ & vbsPath & """"',
  'scStart.WorkingDirectory = appDir',
  'scStart.IconLocation = icoPath',
  'scStart.WindowStyle = 1',
  'scStart.Description = "คลังยา รพ.สต. (JHCIS Drug Stock & Stock Card)"',
  'scStart.Save',
  'On Error GoTo 0',
  '',
  '\' 3. Prompt user to launch immediately (skipped only if --silent)',
  'If Not silentMode Then',
  '    ans = MsgBox("ติดตั้งระบบบริหารคลังยา รพ.สต. (JHCIS Drug Stock) สำเร็จเรียบร้อยแล้ว!" & vbCrLf & vbCrLf & _',
  '                 "• โฟลเดอร์ติดตั้ง: " & appDir & vbCrLf & _',
  '                 "• กรณีอัปเกรดทับของเดิม: รักษา config.json, mappings.json และข้อมูลสต็อกเดิมไว้ครบถ้วน" & vbCrLf & _',
  '                 "• สร้างไอคอน [JHCIS Drug Stock] รูปคลังยาสีเขียวไว้ที่หน้าจอ Desktop และเมนู Start เรียบร้อยแล้ว" & vbCrLf & _',
  '                 "• เปิดทำงานผ่านไอคอนได้ทันทีโดยไม่มีหน้าต่างจอดำ (CMD)" & vbCrLf & vbCrLf & _',
  '                 "ต้องการเปิดเข้าใช้งานโปรแกรมคลังยา รพ.สต. ตอนนี้เลยหรือไม่?", _',
  '                 vbYesNo + vbInformation, "ติดตั้งสำเร็จ (JHCIS Drug Stock)")',
  '',
  '    If ans = vbYes Then',
  '        WshShell.Run """" & wscriptExe & """ //nologo """ & vbsPath & """", 0, False',
  '    End If',
  'End If'
];

fs.writeFileSync(
  path.join(STAGING_DIR, 'install_finish.vbs'),
  '\ufeff' + installFinishVbsLines.join('\r\n') + '\r\n',
  'utf16le'
);

// 5. Generate SFX Script (Comment) with proper UTF-16LE BOM
console.log('[4/6] Creating WinRAR SFX Script with UTF-16LE Thai encoding...');

const sfxCommentLines = [
  ';The comment below contains SFX script commands',
  '',
  'Path=C:\\Drug Store',
  'SavePath',
  'Title=ติดตั้งระบบคลังยา รพ.สต. (JHCIS Drug Stock Setup)',
  'Text',
  '{',
  'ยินดีต้อนรับสู่ระบบบริหารคลังยาและ Stock Card รพ.สต. (JHCIS Drug Stock)',
  '',
  'โปรแกรมจะทำการติดตั้งลงในโฟลเดอร์ปลายทาง (Destination folder):',
  '   C:\\Drug Store',
  '',
  'คุณสมบัติการติดตั้ง:',
  '• รองรับทั้งติดตั้งใหม่และการอัปเกรดทับเครื่องเดิม (หยุดเซิร์ฟเวอร์เดิมอัตโนมัติ ไม่ทับค่าตั้งค่า/ข้อมูลเดิม)',
  '• สร้างไอคอนรูปคลังยาสีเขียว "JHCIS Drug Stock" บนหน้าจอ Desktop และเมนู Start อัตโนมัติ',
  '• เปิดใช้งานผ่านไอคอนได้ทันทีแบบไร้หน้าต่างจอดำ (No CMD Window)',
  '• อ่านฐานข้อมูล JHCIS แบบ Read-Only 100% พร้อมระบบสำรองข้อมูลและนำเข้า Excel/PDF อัตโนมัติ',
  '}',
  'Presetup=powershell.exe -NoProfile -WindowStyle Hidden -Command "Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"',
  'Setup=wscript.exe //nologo install_finish.vbs',
  'Overwrite=1'
];

const sfxCommentFile = path.join(PROJECT_ROOT, 'build-package', 'sfx_comment.txt');
fs.writeFileSync(sfxCommentFile, '\ufeff' + sfxCommentLines.join('\r\n') + '\r\n', 'utf16le');
console.log('      Generated UTF-16LE SFX script: ' + sfxCommentFile);

// 6. Build the SFX with rar.exe (embedding custom green icon via -iicon)
console.log('[5/6] Compressing files into standalone SFX Executable via WinRAR...');

if (fs.existsSync(OUTPUT_EXE)) fs.unlinkSync(OUTPUT_EXE);
if (fs.existsSync(OUTPUT_EXE_THAI)) fs.unlinkSync(OUTPUT_EXE_THAI);

const rarCmd = `"${WINRAR_EXE}" a -sfx -m5 -r -scuc -iicon"${ICON_FILE}" -z"${sfxCommentFile}" "${OUTPUT_EXE}" *`;
console.log('      Executing: ' + rarCmd);
execSync(rarCmd, { cwd: STAGING_DIR, stdio: 'inherit' });

// Also make Thai named copy
if (fs.existsSync(OUTPUT_EXE)) {
  fs.copyFileSync(OUTPUT_EXE, OUTPUT_EXE_THAI);
  const sizeMb = (fs.statSync(OUTPUT_EXE).size / (1024 * 1024)).toFixed(2);
  console.log('\n========================================================================');
  console.log(' ✅ SFX Installer Created Successfully!');
  console.log(` 📁 File (EN): ${OUTPUT_EXE} (${sizeMb} MB)`);
  console.log(` 📁 File (TH): ${OUTPUT_EXE_THAI} (${sizeMb} MB)`);
  console.log(' 🎯 Default Path: C:\\Drug Store');
  console.log(' 🟢 Custom Icon: Modern Green Drug Store (applied to EXE, Desktop & Start Menu)');
  console.log(' 🖥️  Launch Mode: 100% Windowless (wscript.exe + START_SILENT.vbs — No CMD window)');
  console.log('========================================================================\n');
} else {
  console.error('❌ Failed to produce OUTPUT_EXE');
  process.exit(1);
}

// 7. Cleanup staging directory
if (fs.existsSync(STAGING_DIR)) {
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  console.log(' 🧹 Cleaned temporary staging directory to save disk space.');
}
