const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getConfig, saveConfig, testConnection, getSchemaStatus, getMode } = require('../config/db');

router.use(requireAuth);

// GET /api/settings — คืน config (mask รหัสผ่าน) + สถานะ schema/โหมด
router.get('/', (req, res) => {
  const cfg = getConfig();
  const sanitized = {
    ...cfg,
    password: cfg.password ? '••••••••' : ''
  };
  res.json({
    success: true,
    data: sanitized,
    mode: getMode(),
    schema: getSchemaStatus()
  });
});

// POST /api/settings/save
// สิทธิ์แบบแยกส่วน: "ข้อมูลหน่วยบริการ" (ชื่อ/ที่อยู่/รพ.แม่ข่าย/PCU/แหล่งรับเข้า) — เจ้าหน้าที่ทุกคนบันทึกได้
// การเชื่อมต่อฐานข้อมูล/โหมดระบบ/รายชื่อ admin — admin เท่านั้น
const SENSITIVE_KEYS = ['host', 'port', 'user', 'password', 'database', 'charset', 'mode', 'autoFallbackToDemo', 'admins', 'allowedOrigins'];

router.post('/save', async (req, res) => {
  try {
    const current = getConfig();
    const body = req.body || {};

    // ตรวจว่ามีการแก้ "ฟิลด์ที่อ่อนไหว" จริงหรือไม่ (เทียบกับค่าปัจจุบัน — รหัสผ่าน mask ถือว่าไม่แก้)
    const connectionChanged = SENSITIVE_KEYS.some(k => {
      if (!(k in body)) return false;
      if (k === 'password') {
        return body.password !== undefined && body.password !== '••••••••' && body.password !== current.password;
      }
      return JSON.stringify(body[k] ?? null) !== JSON.stringify(current[k] ?? null);
    });

    if (connectionChanged && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: `การเปลี่ยนการเชื่อมต่อฐานข้อมูล/โหมดระบบต้องใช้บัญชีผู้ดูแลระบบ (admin) — บัญชี "${req.user.username}" แก้ "ข้อมูลหน่วยบริการ" ได้เท่านั้น (ผู้ดูแลระบบ: แก้รายชื่อ admins ใน backend/config.json)`
      });
    }

    const {
      host, port, user, password, database, charset, mode,
      autoFallbackToDemo, admins, pcucode, pcuname, pcuAddress,
      motherHospital, allowedOrigins, receiptSource
    } = body;

    const updated = await saveConfig({
      host: host || current.host,
      port: Number(port) || current.port,
      user: user !== undefined ? user : current.user,
      password: password !== undefined && password !== '••••••••' ? password : current.password,
      database: database || current.database,
      charset: charset || current.charset,
      mode: mode || current.mode,
      autoFallbackToDemo: autoFallbackToDemo !== undefined ? Boolean(autoFallbackToDemo) : current.autoFallbackToDemo,
      admins: Array.isArray(admins) ? admins : current.admins,
      pcucode: pcucode !== undefined ? String(pcucode).trim() : current.pcucode,
      pcuname: pcuname !== undefined ? String(pcuname).trim() : current.pcuname,
      pcuAddress: pcuAddress !== undefined ? String(pcuAddress).trim() : current.pcuAddress,
      motherHospital: motherHospital !== undefined ? String(motherHospital).trim() : current.motherHospital,
      allowedOrigins: Array.isArray(allowedOrigins) ? allowedOrigins : current.allowedOrigins,
      receiptSource: ['local', 'jhcis', 'both'].includes(receiptSource) ? receiptSource : (current.receiptSource || 'local')
    });

    const sanitized = { ...updated, password: updated.password ? '••••••••' : '' };
    res.json({
      success: true,
      connectionChanged,
      message: updated.isConnected
        ? 'บันทึกการตั้งค่าและเชื่อมต่อ JHCIS สำเร็จแล้ว!'
        : (updated.mode === 'demo' ? 'บันทึกการตั้งค่าเรียบร้อย (โหมดจำลอง — ข้อมูลจากชุดตัวอย่าง ไม่ใช่ข้อมูลจริง)' : 'บันทึกแล้ว แต่ยังเชื่อมต่อ JHCIS ไม่สำเร็จ (ระบบจะบล็อกการใช้งานจนกว่าจะเชื่อมต่อได้)'),
      data: sanitized,
      schema: getSchemaStatus()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/test', async (req, res) => {
  try {
    const { host, port, user, password, database, charset } = req.body;
    const current = getConfig();

    const testParams = {
      host: host || current.host,
      port: Number(port) || current.port,
      user: user !== undefined ? user : current.user,
      password: password !== undefined && password !== '••••••••' ? password : current.password,
      database: database || current.database,
      charset: charset || current.charset
    };

    const result = await testConnection(testParams);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------------------
// ระบบสำรองและจัดการข้อมูลอัตโนมัติ (Auto-Backup & Data Management)
// -------------------------------------------------------------------------
const backupService = require('../services/backupService');
const fs = require('fs');
const path = require('path');

// GET /api/settings/backups — ดูรายการไฟล์สำรองข้อมูลทั้งหมด
router.get('/backups', (req, res) => {
  try {
    const list = backupService.listBackups();
    res.json({ success: true, ...list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/settings/backups/create — สร้างภาพรวมสำรองข้อมูลทันที (Full Snapshot)
router.post('/backups/create', (req, res) => {
  try {
    const reason = req.body?.reason || 'สำรองข้อมูลด่วนโดยผู้ใช้';
    const actor = req.user?.username || 'user';
    const result = backupService.createFullSnapshot(reason, actor);
    res.json({ success: true, message: 'สร้างไฟล์สำรองข้อมูลครบวงจรสำเร็จ', data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/settings/backups/download/:filename — ดาวน์โหลดไฟล์สำรองข้อมูล
router.get('/backups/download/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(backupService.BACKUP_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'ไม่พบไฟล์สำรองข้อมูลที่ระบุ' });
    }
    res.download(filePath, filename);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/settings/backups/restore — กู้คืนข้อมูลจากไฟล์สำรอง (Admin only)
router.post('/backups/restore', requireAdmin, (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อไฟล์สำรองที่ต้องการกู้คืน' });
    const result = backupService.restoreFromBackup(filename, req.user?.username);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

module.exports = router;
