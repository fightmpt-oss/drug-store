const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { memoryStore, getPool, isLive, isDemo, getConfig, getPcuCode } = require('../config/db');
const {
  createSession, destroySession, getSession,
  isLocked, recordLoginFail, recordLoginSuccess, roleFor
} = require('../services/authService');
const {
  hasMfaEnrolled,
  createPendingMfaTicket,
  verifyOtpTicket,
  verifyRecoveryCodeTicket,
  resetUserMfa
} = require('../services/mfaService');

// MD5/SHA ใช้เทียบรหัสผ่านรูปแบบเดิมของ JHCIS เท่านั้น (ระบบเราไม่เก็บรหัสผ่านเอง)
function md5(str) { return crypto.createHash('md5').update(str).digest('hex'); }
function md5Base64(str) { return crypto.createHash('md5').update(str).digest('base64'); }
function sha1(str) { return crypto.createHash('sha1').update(str).digest('hex'); }
function sha256(str) { return crypto.createHash('sha256').update(str).digest('hex'); }

// JHCIS DBPasswordHash (AES-128-ECB เข้ารหัสผ่านด้วย SHA-1 ของ 'jhcisdb' ตามมาตรฐานโปรแกรม JHCIS)
function decryptJhcisAes(b64) {
  try {
    const sha1Hash = crypto.createHash('sha1').update('jhcisdb', 'utf8').digest();
    const aesKey = sha1Hash.subarray(0, 16);
    const decipher = crypto.createDecipheriv('aes-128-ecb', aesKey, null);
    decipher.setAutoPadding(true);
    let dec = decipher.update(b64, 'base64', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (e) {
    return null;
  }
}

function encryptJhcisAes(plain) {
  try {
    const sha1Hash = crypto.createHash('sha1').update('jhcisdb', 'utf8').digest();
    const aesKey = sha1Hash.subarray(0, 16);
    const cipher = crypto.createCipheriv('aes-128-ecb', aesKey, null);
    cipher.setAutoPadding(true);
    let enc = cipher.update(plain, 'utf8', 'base64');
    enc += cipher.final('base64');
    return enc;
  } catch (e) {
    return null;
  }
}

/**
 * ฟังก์ชันกลางสำหรับตรวจสอบชื่อผู้ใช้และรหัสผ่านกับฐานข้อมูล JHCIS หรือโหมด Demo
 */
async function validateCredentials(username, password) {
  if (!username || !password) {
    return { success: false, status: 400, message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' };
  }

  const trimmedUser = String(username).trim();
  const cleanPassword = String(password).trim();

  // Rate limit: กัน brute force (6 ครั้ง/15 นาที ต่อ username)
  const lock = isLocked(trimmedUser);
  if (lock) {
    return {
      success: false,
      status: 429,
      isLocked: true,
      message: `พยายามเข้าสู่ระบบผิดหลายครั้ง — ล็อกชั่วคราวจนถึง ${lock.lockedUntil} (อีก ${lock.minutesLeft} นาที)`
    };
  }

  if (isLive()) {
    const pool = getPool();
    const activePcu = (getConfig().pcucode || getPcuCode() || '').trim();

    const [rows] = await pool.query(
      `SELECT u.username, u.password, u.fullname, u.fname, u.lname, u.prename,
              u.officerposition, u.grouplevel, u.pcucode, t.titlecode, t.titlename, t.titlenamelong
       FROM user u
       LEFT JOIN ctitle t ON u.prename = t.titlecode
       WHERE u.username = ? AND (u.markdelete IS NULL OR u.markdelete = '0')
       ORDER BY (u.pcucode = ?) DESC, (u.pcucode != '' AND u.pcucode != '!!!!!' AND u.pcucode != '0000x') DESC`,
      [trimmedUser, activePcu]
    );

    if (rows.length > 0) {
      let matchedUser = null;
      for (const u of rows) {
        const stored = String(u.password || '');
        const decAes = decryptJhcisAes(stored);
        const matches =
          stored === cleanPassword ||
          decAes === cleanPassword ||
          stored === encryptJhcisAes(cleanPassword) ||
          stored.toLowerCase() === md5(cleanPassword).toLowerCase() ||
          stored === md5Base64(cleanPassword) ||
          stored.toLowerCase() === sha1(cleanPassword).toLowerCase() ||
          stored.toLowerCase() === sha256(cleanPassword).toLowerCase();

        if (matches) {
          matchedUser = rows.find(r => r.pcucode === activePcu) || u;
          break;
        }
      }

      if (matchedUser) {
        const u = matchedUser;
        const title = u.titlename || u.titlenamelong || (isNaN(u.prename) ? u.prename : '') || '';
        const displayName = u.fname
          ? `${title}${u.fname} ${u.lname || ''}`.trim()
          : (u.fullname || u.username);

        const lowerUser = String(u.username || '').toLowerCase();
        const isJhcisAdmin = String(u.grouplevel || '') === '1' || lowerUser === 'admin' || lowerUser === 'adm';
        const role = (isJhcisAdmin || roleFor(u.username) === 'admin') ? 'admin' : 'staff';

        return {
          success: true,
          trimmedUser,
          role,
          user: {
            username: u.username,
            displayName,
            officername: displayName,
            title,
            fname: u.fname,
            lname: u.lname,
            role: u.officerposition || 'เจ้าหน้าที่ JHCIS',
            systemRole: role,
            pcucode: u.pcucode || activePcu,
            isLiveUser: true
          }
        };
      }
    }

    recordLoginFail(trimmedUser);
    return {
      success: false,
      status: 401,
      message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง (ใช้บัญชีเดียวกับที่เข้าโปรแกรม JHCIS)'
    };
  }

  // Demo mode
  if (isDemo()) {
    const hashed = md5(cleanPassword);
    const found = memoryStore.users.find(u =>
      u.username.toLowerCase() === trimmedUser.toLowerCase() && (u.passwordHash === hashed || cleanPassword === 'admin' || cleanPassword === '123456')
    );
    if (found) {
      const role = roleFor(found.username);
      return {
        success: true,
        trimmedUser,
        role,
        user: {
          username: found.username,
          displayName: found.officername,
          officername: found.officername,
          role: found.role,
          systemRole: role,
          pcucode: getPcuCode() || '',
          isLiveUser: false
        }
      };
    }

    recordLoginFail(trimmedUser);
    return {
      success: false,
      status: 401,
      message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง (โหมดจำลอง: admin/admin, pharmacy/123456)'
    };
  }

  return {
    success: false,
    status: 503,
    code: 'DB_UNAVAILABLE',
    message: 'ไม่สามารถเชื่อมต่อฐานข้อมูล JHCIS ได้ — ระบบจะไม่อนุญาตให้เข้าใช้งานจนกว่าการเชื่อมต่อจะกลับมา'
  };
}

/**
 * GET /api/auth/users
 * ดึงรายชื่อผู้ใช้จากฐานข้อมูล JHCIS สำหรับให้กดเลือกใน Dropdown
 */
router.get('/users', async (req, res) => {
  try {
    const activePcu = (getConfig().pcucode || getPcuCode() || '').trim();

    if (isLive()) {
      const pool = getPool();
      const [rows] = await pool.query(`
        SELECT 
          u.username, 
          u.fullname, 
          u.fname, 
          u.lname, 
          u.prename, 
          u.officerposition, 
          u.grouplevel,
          u.pcucode,
          t.titlename
        FROM user u
        LEFT JOIN ctitle t ON u.prename = t.titlecode
        WHERE (u.markdelete IS NULL OR u.markdelete = '0')
          AND u.username NOT IN ('usr_db', 'j2his_gateway', 'u_vaccine_x', 'move_all_person_out', 'student_update', 'newuser')
        ORDER BY (u.pcucode = ?) DESC, (u.fname IS NOT NULL AND u.fname != '') DESC, u.fname ASC, u.username ASC
      `, [activePcu]);

      const users = rows.map(r => {
        const title = r.titlename || '';
        const displayName = r.fname 
          ? `${title}${r.fname} ${r.lname || ''}`.trim() 
          : (r.fullname || r.username);
        return {
          username: r.username,
          displayName,
          position: r.officerposition || 'เจ้าหน้าที่ JHCIS',
          pcucode: r.pcucode,
          isPcuUser: r.pcucode === activePcu,
          has2fa: hasMfaEnrolled(r.username)
        };
      });

      return res.json({
        success: true,
        users,
        pcucode: activePcu,
        isLive: true
      });
    }

    if (isDemo()) {
      const users = (memoryStore.users || []).map(u => ({
        username: u.username,
        displayName: u.officername,
        position: u.role,
        pcucode: activePcu || '',
        isPcuUser: true,
        has2fa: hasMfaEnrolled(u.username)
      }));

      return res.json({
        success: true,
        users,
        pcucode: activePcu || '',
        isLive: false,
        isDemo: true
      });
    }

    return res.status(503).json({
      success: false,
      code: 'DB_UNAVAILABLE',
      message: 'เชื่อมต่อฐานข้อมูล JHCIS ไม่สำเร็จ กรุณาตั้งค่าการเชื่อมต่อฐานข้อมูลก่อน'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/auth/login-step1
 * ขั้นตอนที่ 1 ของการล็อกอิน: ตรวจสอบ Username และ Password
 * หากถูกต้อง จะออก tempToken พร้อมข้อมูล 2FA (QR Code สำหรับผู้ใช้ใหม่ / หรือพร้อมรับ OTP สำหรับผู้ใช้เดิม)
 */
router.post('/login-step1', async (req, res) => {
  try {
    const { username, password, forceResetMfa } = req.body;
    const authCheck = await validateCredentials(username, password);

    if (!authCheck.success) {
      return res.status(authCheck.status || 401).json(authCheck);
    }

    const { user } = authCheck;
    const activePcu = (getConfig().pcucode || getPcuCode() || user.pcucode || '').trim();

    // สร้างตั๋วชั่วคราวสำหรับยืนยัน OTP
    const mfaTicket = await createPendingMfaTicket(user, activePcu, !!forceResetMfa);

    return res.json({
      success: true,
      ...mfaTicket
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/auth/verify-otp
 * ขั้นตอนที่ 2 ของการล็อกอิน: ตรวจสอบรหัส 6 หลักจาก Google Authenticator
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { tempToken, otp } = req.body;
    const verifyResult = await verifyOtpTicket(tempToken, otp);

    if (!verifyResult.success) {
      return res.status(400).json(verifyResult);
    }

    const user = verifyResult.user;
    recordLoginSuccess(user.username);

    const session = createSession({
      username: user.username,
      officername: user.displayName || user.officername,
      isLiveUser: user.isLiveUser !== false
    }, user.systemRole || 'staff');

    const maskedId = user.username.length === 13 
      ? (user.username.slice(0, 3) + '******' + user.username.slice(9)) 
      : user.username;
    console.log(`[AUTH] 🔐 2FA Verified with Google Authenticator for: ${maskedId}`);

    return res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        username: user.username,
        officername: user.displayName || user.officername,
        role: user.role || 'เจ้าหน้าที่ JHCIS',
        systemRole: user.systemRole || 'staff',
        pcucode: user.pcucode,
        isLiveUser: user.isLiveUser !== false
      },
      source: isLive() ? 'JHCIS Live Database (2FA Verified)' : 'JHCIS Simulation (2FA Verified)'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/auth/verify-recovery
 * เข้าสู่ระบบด้วยรหัสกู้คืน (Backup / Recovery Code) เผื่อโทรศัพท์มือถือหายหรือเปลี่ยนเครื่อง
 */
router.post('/verify-recovery', async (req, res) => {
  try {
    const { tempToken, recoveryCode } = req.body;
    const result = await verifyRecoveryCodeTicket(tempToken, recoveryCode);

    if (!result.success) {
      return res.status(400).json(result);
    }

    const user = result.user;
    recordLoginSuccess(user.username);

    const session = createSession({
      username: user.username,
      officername: user.displayName || user.officername,
      isLiveUser: user.isLiveUser !== false
    }, user.systemRole || 'staff');

    console.log(`[AUTH] 🔑 Logged in via Recovery Code: ${user.username}`);

    return res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      recoveryUsed: true,
      user: {
        username: user.username,
        officername: user.displayName || user.officername,
        role: user.role || 'เจ้าหน้าที่ JHCIS',
        systemRole: user.systemRole || 'staff',
        pcucode: user.pcucode,
        isLiveUser: user.isLiveUser !== false
      },
      message: 'ใช้รหัสกู้คืนสำเร็จ แนะนำให้เข้าไปที่การตั้งค่าเพื่อตั้งค่า Google Authenticator บนมือถือเครื่องใหม่'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/auth/login
 * รองรับทั้งแบบดั้งเดิม (สำหรับสคริปต์อัตโนมัติ/Demo test) และแบบระบุ OTP มาในตัว
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password, otp, skipMfa } = req.body;
    const authCheck = await validateCredentials(username, password);

    if (!authCheck.success) {
      return res.status(authCheck.status || 401).json(authCheck);
    }

    const { user, role, trimmedUser } = authCheck;
    const activePcu = (getConfig().pcucode || getPcuCode() || user.pcucode || '').trim();

    // หากระบุ OTP มาโดยตรง
    if (otp) {
      const isEnrolled = hasMfaEnrolled(trimmedUser);
      if (isEnrolled) {
        const otplib = require('otplib');
        const mfaRec = require('../services/mfaService').hasMfaEnrolled(trimmedUser);
        const { JsonStore } = require('../services/storage');
        const store = new JsonStore('mfa_users', {});
        const rec = (store.get() || {})[trimmedUser];
        if (rec && rec.secret) {
          const valid = otplib.verifySync({
            token: String(otp).trim(),
            secret: rec.secret,
            epochTolerance: [60, 60]
          });
          if (!valid) {
            return res.status(400).json({ success: false, message: 'รหัส OTP ไม่ถูกต้อง' });
          }
        }
      }
    } else if (!skipMfa && !isDemo()) {
      // สำหรับผู้ใช้งานผ่านหน้าเว็บจริง ถ้าไม่มี OTP ให้ส่ง MFA Ticket กลับไป
      const mfaTicket = await createPendingMfaTicket(user, activePcu);
      return res.json({
        success: true,
        ...mfaTicket
      });
    }

    // ออก Session ทันที (สำหรับ demo mode หรือ skipMfa หรือเมื่อผ่านการตรวจ OTP แล้ว)
    recordLoginSuccess(trimmedUser);
    const session = createSession({
      username: user.username,
      officername: user.displayName || user.officername,
      isLiveUser: user.isLiveUser !== false
    }, role);

    return res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        username: user.username,
        officername: user.displayName || user.officername,
        title: user.title,
        fname: user.fname,
        lname: user.lname,
        role: user.role || 'เจ้าหน้าที่ JHCIS',
        systemRole: role,
        isLiveUser: user.isLiveUser !== false
      },
      source: isLive() ? 'JHCIS Live Database' : 'JHCIS Simulation'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ตรวจ session ปัจจุบัน (ใช้ตอนเปิดแอป)
router.get('/me', (req, res) => {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-auth-token'] || '');
  const session = getSession(token);
  if (!session) return res.status(401).json({ success: false, message: 'ไม่พบ session ที่ใช้งานได้' });
  res.json({ 
    success: true, 
    user: { 
      username: session.username, 
      officername: session.displayName, 
      systemRole: session.role 
    }, 
    expiresAt: session.expiresAt 
  });
});

router.post('/logout', (req, res) => {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-auth-token'] || '');
  destroySession(token);
  res.json({ success: true, message: 'ออกจากระบบเรียบร้อย' });
});

// GET /api/auth/mobile-kiosk-session
// มอบ session สำหรับมือถือที่สแกน QR Code หน้าชั้นยา เพื่อเบิกยาได้ทันทีโดยไม่ต้องล็อกอิน
router.get('/mobile-kiosk-session', (req, res) => {
  const session = createSession({
    username: 'mobile_kiosk',
    officername: 'เจ้าหน้าที่ห้องยา (สแกนเนอร์มือถือ)',
    isLiveUser: false
  }, 'staff');
  res.json({
    success: true,
    token: session.token,
    user: {
      username: session.username,
      displayName: session.displayName,
      officername: session.displayName,
      role: session.role
    }
  });
});

// POST /api/auth/reset-mfa
// รีเซ็ต 2FA ของตนเอง หรือผู้ดูแลระบบ (Admin) รีเซ็ตให้เจ้าหน้าที่คนอื่น
router.post('/reset-mfa', async (req, res) => {
  try {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-auth-token'] || '');
    const session = getSession(token);
    if (!session) {
      return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' });
    }

    const targetUsername = req.body?.username ? String(req.body.username).trim() : session.username;
    if (targetUsername !== session.username && session.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'เฉพาะผู้ดูแลระบบ (admin) เท่านั้นที่สามารถรีเซ็ต 2FA ของผู้อื่นได้' });
    }

    await resetUserMfa(targetUsername);
    console.log(`[AUTH] 🔄 Reset 2FA for: ${targetUsername} by ${session.username}`);
    res.json({
      success: true,
      message: `รีเซ็ต 2FA สำหรับผู้ใช้ ${targetUsername} เรียบร้อยแล้ว ในการเข้าสู่ระบบครั้งถัดไประบบจะสร้าง QR Code ใหม่ให้สแกนทันที`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
