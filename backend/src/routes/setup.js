// setup.js — ตัวช่วยตั้งค่าการเชื่อมต่อ JHCIS ครั้งแรก (First-run Setup)
// เงื่อนไขความปลอดภัย (ป้องกันการถูกใช้ช่องโหว่ก่อนยืนยันตัวตน):
//   1. เปิดใช้ได้เฉพาะเมื่อ "โหมด live แต่เชื่อมต่อ DB ไม่ได้" (first run / IP เปลี่ยน)
//      เมื่อเชื่อมต่อได้แล้ว การแก้การเชื่อมต่อต้อง login เป็น admin ที่หน้าตั้งค่าเท่านั้น
//   2. ใช้ได้จากเครื่องเซิร์ฟเวอร์เอง (localhost) เท่านั้น — คนนั่งหน้าเครื่องนี้เข้าถึง
//      ไฟล์ config.json ได้อยู่แล้ว จึงไม่เพิ่มอำนาจใหม่ให้ผู้ไม่หวังดีบน LAN
const express = require('express');
const router = express.Router();
const { getConfig, saveConfig, testConnection, getMode, isLive } = require('../config/db');

function isLocalRequest(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '');
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

function guard(req, res) {
  // กฎความปลอดภัย: อนุญาตให้ตั้งค่าและทดสอบการเชื่อมต่อเฉพาะจากเครื่องเซิร์ฟเวอร์ (localhost) เท่านั้น
  if (!isLocalRequest(req)) {
    res.status(403).json({
      success: false,
      code: 'LOCAL_ONLY',
      message: 'การตั้งค่าเชื่อมต่อฐานข้อมูลทำได้เฉพาะจากเครื่องเซิร์ฟเวอร์ที่ติดตั้งระบบเท่านั้น (เปิด http://localhost:5000 บนเครื่องเซิร์ฟเวอร์)'
    });
    return false;
  }
  return true;
}

// สถานะการเชื่อมต่อฐานข้อมูล
router.get('/status', (req, res) => {
  const mode = getMode();
  const current = getConfig();
  const local = isLocalRequest(req);
  const connected = isLive();
  res.json({
    success: true,
    mode,
    isLive: connected,
    isConnected: connected,
    setupNeeded: !connected,
    isLocal: local,
    pcucode: current.pcucode || '',
    pcuname: current.pcuname || '',
    config: {
      host: current.host || 'localhost',
      port: current.port || 3333,
      user: current.user || 'root',
      database: current.database || 'jhcisdb',
      charset: current.charset || 'tis620'
    }
  });
});

// ทดสอบการเชื่อมต่อ (ใช้ค่าจากฟอร์ม ไม่แตะ config จริง)
router.post('/test', async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { host, port, user, password, database, charset } = req.body || {};
    const current = getConfig();
    const result = await testConnection({
      host: host || current.host,
      port: Number(port) || current.port,
      user: user !== undefined ? user : current.user,
      password: password !== undefined && password !== '••••••••' ? password : current.password,
      database: database || current.database,
      charset: charset || current.charset
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// บันทึก + เชื่อมต่อ (บันทึกเฉพาะฟิลด์การเชื่อมต่อ DB — แตะอย่างอื่นไม่ได้)
router.post('/complete', async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { host, port, user, password, database, charset } = req.body || {};
    const current = getConfig();
    if (!host && !database && password === undefined) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลการเชื่อมต่ออย่างน้อย 1 รายการ' });
    }

    const isNewServer = (host && host !== current.host) || (port && Number(port) !== Number(current.port)) || (database && database !== current.database);
    const updated = await saveConfig({
      host: host || current.host,
      port: Number(port) || current.port,
      user: user !== undefined ? user : current.user,
      password: password !== undefined ? password : current.password,
      database: database || current.database,
      charset: charset || current.charset,
      ...(isNewServer ? { pcucode: '', pcuname: '', pcuAddress: '' } : {}),
      mode: 'live'
    });

    if (!updated.isConnected) {
      return res.status(502).json({
        success: false,
        message: `บันทึกแล้ว แต่ยังเชื่อมต่อไม่สำเร็จ: ตรวจสอบว่า JHCIS เปิดใช้งาน/อนุญาตการเชื่อมต่อจากเครื่องนี้ (ผู้ใช้ MySQL ต้องมีสิทธิ์เข้าถึง) — สามารถแก้ค่าแล้วกดบันทึกใหม่ได้`
      });
    }

    res.json({
      success: true,
      message: `เชื่อมต่อ JHCIS สำเร็จ (หน่วยบริการ: ${updated.pcucode || 'ไม่พบรหัส'}) — กรุณาเข้าสู่ระบบด้วยบัญชีผู้ใช้ JHCIS ของท่าน`,
      data: { isConnected: true, pcucode: updated.pcucode, pcuname: updated.pcuname }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
