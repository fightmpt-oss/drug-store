// storage.js — Local JSON storage engine (ระบบฐานข้อมูลของโปรแกรมเอง)
// หลักการ:
//  - เก็บข้อมูลเป็นไฟล์ JSON ในโฟลเดอร์ data/localdb (ตามกฎ: ห้ามเขียน jhcisdb โดยเด็ดขาด)
//  - Atomic write: เขียนไฟล์ tmp แล้ว rename ทับ (กันไฟล์เสียเมื่อไฟดับ/ปิดโปรแกรมกลางคัน)
//  - Backup .bak อัตโนมัติก่อนทุกการเขียน + กู้คืนจาก .bak ถ้าไฟล์หลักเสียหาย
//  - Mutex ต่อไฟล์: คำสั่ง update ทำงานเรียงคิว กัน 2 request ทับกันเอง
//  - รองรับ JHCIS_DATA_DIR env เพื่อแยกพื้นที่ทดสอบออกจากข้อมูลจริง

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.JHCIS_DATA_DIR
  ? path.resolve(process.env.JHCIS_DATA_DIR)
  : path.join(__dirname, '../data/localdb');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeParse(raw, fallback) {
  try {
    if (typeof raw !== 'string') return fallback !== undefined ? fallback : null;
    const clean = raw.trim().replace(/^\uFEFF/, '');
    return JSON.parse(clean);
  } catch (e) {
    return fallback !== undefined ? fallback : null;
  }
}

// Mutex ต่อไฟล์: ห่องานทั้งหมดใน promise chain เดียวต่อชื่อ store
const locks = new Map();
function acquireLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.catch(() => {}));
  return next;
}

class JsonStore {
  constructor(name, defaultValue) {
    this.name = name;
    this.file = path.join(DATA_DIR, `${name}.json`);
    this.bakFile = path.join(DATA_DIR, `${name}.bak.json`);
    this.defaultValue = defaultValue !== undefined ? defaultValue : {};
    this._cache = null;
  }

  _loadRaw() {
    ensureDir(DATA_DIR);
    let data = null;
    if (fs.existsSync(this.file)) {
      const raw = fs.readFileSync(this.file, 'utf8');
      data = safeParse(raw, null);
      if (data === null && fs.existsSync(this.bakFile)) {
        // ไฟล์หลักเสียหาย → กู้จาก .bak
        console.warn(`[STORAGE] ⚠️ ${this.name}.json corrupted, restoring from .bak`);
        data = safeParse(fs.readFileSync(this.bakFile, 'utf8'), null);
        if (data !== null) fs.writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf8');
      }
    }
    if (data === null) data = this.defaultValue;
    return data;
  }

  get() {
    if (this._cache === null) this._cache = this._loadRaw();
    return this._cache;
  }

  set(data) {
    this._cache = data;
    ensureDir(DATA_DIR);
    if (fs.existsSync(this.file)) {
      try { fs.copyFileSync(this.file, this.bakFile); } catch (e) {}
    }
    const tmpFile = this.file + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    try {
      fs.renameSync(tmpFile, this.file);
    } catch (renameErr) {
      if (renameErr.code === 'EPERM' || renameErr.code === 'EBUSY') {
        // Windows filesystem fallback when rename is locked by Windows Defender/system handle
        try {
          fs.copyFileSync(tmpFile, this.file);
          fs.unlinkSync(tmpFile);
        } catch (copyErr) {
          fs.writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf8');
        }
      } else {
        throw renameErr;
      }
    }
    return data;
  }

  // update(fn) — โหลดล่าสุด, แก้ด้วย fn, บันทึกแบบ atomic ภายใต้ lock
  update(fn) {
    return acquireLock(this.name, () => {
      const data = this._loadRaw();
      const result = fn(data);
      this.set(data);
      return result;
    });
  }
}

// Audit log แบบมี rotation (เก็บต่อไฟล์ไม่เกิน ~5MB)
function appendAudit(name, entry) {
  ensureDir(DATA_DIR);
  const file = path.join(DATA_DIR, `${name}.log`);
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > 5 * 1024 * 1024) {
      const rotated = `${file}.${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
      try { fs.renameSync(file, rotated); } catch (e) {}
    }
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    console.error(`[STORAGE] audit write failed (${name}):`, err.message);
  }
}

module.exports = { JsonStore, DATA_DIR, appendAudit, acquireLock };
