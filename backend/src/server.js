const express = require('express');
const path = require('path');
const { initPool, getConfig, getSchemaStatus, getMode } = require('./config/db');
const { securityHeaders, rateLimit, corsRestrict } = require('./middleware/security');
const { getLanAddresses } = require('./services/mobileTunnelService');
const { initAllFolders, BACKUP_DIR, CATALOGUE_DIR } = require('./services/backupService');

const authRouter = require('./routes/auth');
const stockRouter = require('./routes/stock');
const excelRouter = require('./routes/excel');
const mappingRouter = require('./routes/mapping');
const settingsRouter = require('./routes/settings');
const catalogueRouter = require('./routes/catalogue');
const setupRouter = require('./routes/setup');
const safetyRouter = require('./routes/safety');

const app = express();
const PORT = process.env.PORT || 5000;

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(corsRestrict(getConfig));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(rateLimit({ windowMs: 60000, max: 600 })); // 600 req/นาที/IP พอสำหรับใช้งานจริง แต่กัน abuse

// API Routes (แต่ละ router บังคับ requireAuth ภายใน — ยกเว้น /api/auth และ /api/setup ซึ่งมีเงื่อนไขของตัวเอง)
app.use('/api/auth', authRouter);
app.use('/api/setup', setupRouter);
app.use('/api/stock', stockRouter);
app.use('/api/safety', safetyRouter);
app.use('/api/excel', excelRouter);
app.use('/api/mappings', mappingRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/catalogue', catalogueRouter);

// Serve frontend build if exists
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

app.get('/api/health', (req, res) => {
  const cfg = getConfig();
  const schema = getSchemaStatus();
  res.json({
    status: 'ok',
    system: 'JHCIS Drug Stock & Stock Card Engine',
    mode: getMode(), // 'live' | 'live_unavailable' | 'demo'
    configuredMode: cfg.mode,
    isConnected: cfg.isConnected,
    pcucode: cfg.pcucode || null,
    schemaRequiredMissing: schema.requiredMissing || [],
    schemaOptionalMissing: schema.optionalMissing || [],
    authRequired: true,
    timestamp: new Date().toISOString()
  });
});

// API 404 → JSON (ไม่ตกไปหน้า React)
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: `ไม่พบ endpoint: ${req.method} ${req.originalUrl}` });
});

// API error handler — ตอบ JSON เสมอ (กัน HTML error ปนกับ client)
app.use('/api', (err, req, res, next) => {
  console.error('[API ERROR]', err.message);
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  res.status(status).json({ success: false, message: err.message || 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
});

// Fallback to React index.html for client-side routing
app.use((req, res) => {
  const indexHtml = path.join(frontendDist, 'index.html');
  if (require('fs').existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.json({
      message: 'JHCIS Drug Stock Backend API is running on port ' + PORT,
      frontendUrl: 'http://localhost:3000'
    });
  }
});

// Start server
async function start() {
  // สร้างโฟลเดอร์สำหรับเก็บไฟล์ข้อมูลและ backup อัตโนมัติ (รองรับการติดตั้งที่หน่วยบริการอื่น)
  const folderPaths = initAllFolders();

  await initPool();
  app.listen(PORT, () => {
    const cfg = getConfig();
    const lanAddrs = getLanAddresses(PORT);
    console.log(`=======================================================`);
    console.log(` 🏥 JHCIS Drug Stock & Stock Card Server`);
    console.log(` 🌐 Local PC: http://localhost:${PORT}`);
    if (lanAddrs.length > 0) {
      lanAddrs.forEach(a => {
        console.log(` 📱 LAN Wi-Fi (${a.interfaceName}): ${a.url}`);
      });
    }
    console.log(` 🔒 ทุก API ต้องเข้าสู่ระบบ (session) — jhcisdb อ่านอย่างเดียว`);
    console.log(` 🗄️  ฐานข้อมูลของระบบ: backend/src/data/localdb/ (ใบรับยา/นับสต็อก/ปรับปรุงยอด)`);
    console.log(` 💾 โฟลเดอร์สำรองข้อมูล (Backup): ${folderPaths.backupDir}`);
    console.log(` 📁 โฟลเดอร์ Drug Catalogue: ${folderPaths.catalogueDir}`);
    console.log(` 📡 โหมด: ${getMode()} | หน่วยบริการ: ${cfg.pcucode || 'ยังไม่ระบุ'} ${cfg.pcuname || ''}`);
    console.log(`=======================================================`);
  });
}

start();
