// mfaService.js — ระบบยืนยันตัวตน 2 ขั้นตอน (2FA / MFA: Multi-Factor Authentication)
// รองรับ Google Authenticator (TOTP: RFC 6238) และรหัสกู้คืน (Backup / Recovery Codes)
// เก็บ secret ใน local JSON store ไม่แตะต้องฐานข้อมูล JHCIS

const crypto = require('crypto');
const otplib = require('otplib');
const qrcode = require('qrcode');
const { JsonStore } = require('./storage');

// ที่เก็บข้อมูล 2FA ของผู้ใช้แต่ละคน (data/localdb/mfa_users.json)
const mfaStore = new JsonStore('mfa_users', {});

// เก็บ Session ชั่วคราวระหว่างกรอกรหัสผ่านผ่านแล้วแต่รอตรวจ OTP (Ticket) ใน memory (หมดอายุ 10 นาที)
const pendingTickets = new Map();

// ล้าง ticket ที่หมดอายุทุก 2 นาที
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of pendingTickets.entries()) {
    if (data.expiresAt < now) {
      pendingTickets.delete(token);
    }
  }
}, 120000);

function sha256(str) {
  return crypto.createHash('sha256').update(String(str).trim()).digest('hex');
}

/**
 * สร้างรหัสกู้คืนฉุกเฉิน 5 ชุด (เช่น "A3B9-9F21")
 */
function generateRecoveryCodes(count = 5) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${hex.slice(0, 4)}-${hex.slice(4)}`);
  }
  return codes;
}

/**
 * ตรวจสอบว่าผู้ใช้งานลงทะเบียน Google Authenticator แล้วหรือไม่
 */
function hasMfaEnrolled(username) {
  const data = mfaStore.get() || {};
  const record = data[String(username).trim()];
  return !!(record && record.enabled && record.secret);
}

/**
 * ดึงข้อมูลการลงทะเบียน 2FA ของผู้ใช้
 */
function getUserMfaRecord(username) {
  const data = mfaStore.get() || {};
  return data[String(username).trim()] || null;
}

/**
 * สร้างตั๋วชั่วคราว (Pending MFA Ticket) หลังผู้ใช้ใส่รหัสผ่านถูกต้อง
 * @param {object} userObj ข้อมูลผู้ใช้จาก JHCIS
 * @param {string} pcucode รหัสหน่วยบริการ
 * @param {boolean} forceReset บังคับสร้าง QR Code ใหม่
 */
async function createPendingMfaTicket(userObj, pcucode = '', forceReset = false) {
  const username = String(userObj.username).trim();
  const displayName = userObj.displayName || userObj.officername || username;
  const isEnrolled = hasMfaEnrolled(username) && !forceReset;

  const tempToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (10 * 60 * 1000); // 10 นาที

  let qrCode = null;
  let secret = null;
  let recoveryCodes = null;

  if (!isEnrolled) {
    // ผู้ใช้ยังไม่เคยลงทะเบียน หรือต้องการรีเซ็ตใหม่ → สร้าง Secret ใหม่พร้อม QR Code
    secret = otplib.generateSecret();
    recoveryCodes = generateRecoveryCodes(5);

    const issuer = 'JHCIS Drug Store';
    const label = `${displayName} (${pcucode || 'JHCIS'})`;
    const uri = otplib.generateURI({
      issuer,
      label,
      secret
    });

    qrCode = await qrcode.toDataURL(uri, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 6
    });

    pendingTickets.set(tempToken, {
      username,
      userObj,
      secret,
      recoveryCodes,
      isFirstTime: true,
      expiresAt
    });

    return {
      tempToken,
      mfaRequired: true,
      isFirstTime: true,
      user: {
        username,
        displayName,
        pcucode
      },
      qrCode,
      secret,
      recoveryCodes,
      expiresIn: 600
    };
  } else {
    // ผู้ใช้เคยลงทะเบียนแล้ว → รอรับรหัส 6 หลักจากแอปเดิม
    const record = getUserMfaRecord(username);
    pendingTickets.set(tempToken, {
      username,
      userObj,
      secret: record.secret,
      isFirstTime: false,
      expiresAt
    });

    return {
      tempToken,
      mfaRequired: true,
      isFirstTime: false,
      user: {
        username,
        displayName,
        pcucode
      },
      expiresIn: 600
    };
  }
}

/**
 * ตรวจสอบรหัส OTP 6 หลัก
 */
async function verifyOtpTicket(tempToken, rawOtp) {
  if (!tempToken) {
    return { success: false, message: 'ไม่พบตั๋วยืนยันตัวตน กรุณาเข้าสู่ระบบใหม่' };
  }

  const ticket = pendingTickets.get(tempToken);
  if (!ticket || ticket.expiresAt < Date.now()) {
    pendingTickets.delete(tempToken);
    return { success: false, message: 'ตั๋วยืนยันตัวตนหมดอายุ (10 นาที) กรุณาเข้าสู่ระบบใหม่' };
  }

  const cleanOtp = String(rawOtp || '').replace(/[\s-]/g, '').trim();
  if (!/^\d{6}$/.test(cleanOtp)) {
    return { success: false, message: 'รหัส OTP ต้องเป็นตัวเลข 6 หลัก' };
  }

  // ตรวจสอบ TOTP กับ Secret (epochTolerance: [60, 60] รองรับเวลาเหลื่อม 60 วินาที ทั้งก่อนหน้าและถัดไป)
  const verifyResult = otplib.verifySync({
    token: cleanOtp,
    secret: ticket.secret,
    epochTolerance: [60, 60]
  });

  if (!verifyResult || !verifyResult.valid) {
    return {
      success: false,
      message: 'รหัส OTP ไม่ถูกต้อง กรุณาดูรหัส 6 หลักล่าสุดจากแอป Google Authenticator'
    };
  }

  // ถ้าเป็นการลงทะเบียนครั้งแรก → บันทึก Secret และ hashed recovery codes ลงใน Store
  if (ticket.isFirstTime) {
    const hashedCodes = (ticket.recoveryCodes || []).map(code => ({
      codeHash: sha256(code.replace(/-/g, '').toUpperCase()),
      displayHint: `${code.slice(0, 2)}**-****`,
      used: false,
      usedAt: null
    }));

    await mfaStore.update(data => {
      data[ticket.username] = {
        secret: ticket.secret,
        enabled: true,
        enrolledAt: new Date().toISOString(),
        recoveryCodes: hashedCodes
      };
      return data;
    });
  }

  // ใช้สำเร็จ → ลบตั๋วทิ้ง
  pendingTickets.delete(tempToken);

  return {
    success: true,
    user: ticket.userObj
  };
}

/**
 * ยืนยันด้วยรหัสกู้คืนฉุกเฉิน (กรณีมือถือหายหรือเปลี่ยนเครื่อง)
 */
async function verifyRecoveryCodeTicket(tempToken, rawRecoveryCode) {
  if (!tempToken) {
    return { success: false, message: 'ไม่พบตั๋วยืนยันตัวตน กรุณาเข้าสู่ระบบใหม่' };
  }

  const ticket = pendingTickets.get(tempToken);
  if (!ticket || ticket.expiresAt < Date.now()) {
    pendingTickets.delete(tempToken);
    return { success: false, message: 'ตั๋วยืนยันตัวตนหมดอายุ กรุณาเข้าสู่ระบบใหม่' };
  }

  const cleanCode = String(rawRecoveryCode || '').replace(/[\s-]/g, '').toUpperCase().trim();
  if (cleanCode.length < 6) {
    return { success: false, message: 'รูปแบบรหัสกู้คืนไม่ถูกต้อง' };
  }

  const codeHash = sha256(cleanCode);
  const data = mfaStore.get() || {};
  const userMfa = data[ticket.username];

  if (!userMfa || !Array.isArray(userMfa.recoveryCodes)) {
    return { success: false, message: 'ไม่พบข้อมูลรหัสกู้คืนของบัญชีนี้' };
  }

  const target = userMfa.recoveryCodes.find(r => r.codeHash === codeHash && !r.used);
  if (!target) {
    return { success: false, message: 'รหัสกู้คืนไม่ถูกต้อง หรือถูกใช้งานไปแล้ว' };
  }

  // ทำเครื่องหมายว่ารหัสกู้คืนชุดนี้ถูกใช้แล้ว (Burn code)
  await mfaStore.update(storeData => {
    const rec = storeData[ticket.username];
    if (rec && Array.isArray(rec.recoveryCodes)) {
      const match = rec.recoveryCodes.find(r => r.codeHash === codeHash);
      if (match) {
        match.used = true;
        match.usedAt = new Date().toISOString();
      }
    }
    return storeData;
  });

  pendingTickets.delete(tempToken);

  return {
    success: true,
    user: ticket.userObj,
    recoveryUsed: true
  };
}

/**
 * รีเซ็ต 2FA ของผู้ใช้ (เช่น สั่งโดย Admin หรือเมื่อผู้ใช้ขอลงทะเบียนใหม่)
 */
async function resetUserMfa(username) {
  const trimmed = String(username).trim();
  await mfaStore.update(data => {
    delete data[trimmed];
    return data;
  });
  return true;
}

module.exports = {
  hasMfaEnrolled,
  createPendingMfaTicket,
  verifyOtpTicket,
  verifyRecoveryCodeTicket,
  resetUserMfa
};
