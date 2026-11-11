// middleware/auth.js — บังคับใช้ session กับทุก API (ยกเว้น login/health)
const { getSession } = require('../services/authService');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-auth-token'] || req.query?.token || '');
  const session = getSession(token);
  if (!session) {
    // ถ้าเป็นการเรียก API เบิกยาคลังใน (substock) หรือค้นหารายการยาสำหรับมือถือ อนุญาตให้ทำรายการได้ในนามเจ้าหน้าที่ห้องยา (สแกนเนอร์มือถือ)
    if (
      req.path.startsWith('/substock') ||
      req.path === '/stock/drugs' ||
      req.path === '/drugs'
    ) {
      req.user = {
        username: 'mobile_kiosk',
        displayName: 'เจ้าหน้าที่ห้องยา (สแกนเนอร์มือถือ)',
        role: 'staff',
        source: 'mobile_qr'
      };
      return next();
    }
    return res.status(401).json({
      success: false,
      code: 'UNAUTHENTICATED',
      message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน (session หมดอายุ ให้ login ใหม่)'
    });
  }
  req.user = session; // { username, displayName, role, ... } มาจาก server เท่านั้น ห้ามเชื่อ client
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      message: 'ต้องเป็นผู้ดูแลระบบ (admin) เท่านั้น — ดูรายชื่อ admin ที่ config.json (admins)'
    });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
