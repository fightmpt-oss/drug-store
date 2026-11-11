// middleware/security.js — Security headers + rate limiting เบื้องต้น (ไม่พึ่ง dependency ภายนอก)
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  // อนุญาตให้เปิดกล้องสแกน QR Code จากหน้าเว็บตัวเอง (camera=(self))
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  // CSP: อนุญาต self + inline + blob/mediastream สำหรับกล้องสแกน QR Code และ Google Fonts
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; media-src 'self' blob: mediastream:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'");
  next();
}

// Simple sliding-window rate limiter ต่อ IP
const hits = new Map();
function rateLimit({ windowMs = 60000, max = 300 } = {}) {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of hits) {
      rec.timestamps = rec.timestamps.filter(t => now - t < windowMs);
      if (rec.timestamps.length === 0) hits.delete(ip);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const rec = hits.get(key) || { timestamps: [] };
    rec.timestamps = rec.timestamps.filter(t => now - t < windowMs);
    rec.timestamps.push(now);
    hits.set(key, rec);
    if (rec.timestamps.length > max) {
      return res.status(429).json({ success: false, code: 'RATE_LIMITED', message: 'มีการร้องขอถี่เกินไป กรุณารอสักครู่' });
    }
    next();
  };
}

// CORS จำกัด origin — อนุญาต localhost และ LAN IP ในวง รพ.สต.
function corsRestrict(getConfig) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return next(); // same-origin / curl
    let allowed = [];
    try {
      const cfg = getConfig();
      allowed = Array.isArray(cfg.allowedOrigins) ? cfg.allowedOrigins : [];
    } catch (e) { allowed = []; }

    let isSameHostOrTrusted = allowed.includes(origin);
    if (!isSameHostOrTrusted) {
      try {
        const parsed = new URL(origin);
        const reqHost = String(req.headers.host || '').toLowerCase();
        if (
          parsed.host.toLowerCase() === reqHost ||
          parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          /^192\.168\.\d+\.\d+$/.test(parsed.hostname) ||
          /^10\.\d+\.\d+\.\d+$/.test(parsed.hostname) ||
          /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(parsed.hostname)
        ) {
          isSameHostOrTrusted = true;
        }
      } catch (e) {}
    }

    if (isSameHostOrTrusted) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}

module.exports = { securityHeaders, rateLimit, corsRestrict };
