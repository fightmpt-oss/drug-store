// authService.js — Session token + สิทธิ์ผู้ใช้ (จัดเก็บฝั่ง server เท่านั้น)
const crypto = require('crypto');
const { JsonStore } = require('./storage');

const SESSION_TTL_HOURS = 12;
const sessionsStore = new JsonStore('sessions', {});
// login rate limit: ล้มเหลว 6 ครั้ง/15 นาที ต่อ username → ล็อกชั่วคราว
const loginAttempts = new Map();
const MAX_FAILS = 6;
const LOCK_MS = 15 * 60 * 1000;

function isLocked(username) {
  const rec = loginAttempts.get(String(username).toLowerCase());
  if (!rec) return null;
  if (rec.lockUntil && rec.lockUntil > Date.now()) {
    return { lockedUntil: new Date(rec.lockUntil).toISOString(), minutesLeft: Math.ceil((rec.lockUntil - Date.now()) / 60000) };
  }
  return null;
}

function recordLoginFail(username) {
  const key = String(username).toLowerCase();
  const rec = loginAttempts.get(key) || { fails: 0, lockUntil: null };
  rec.fails++;
  if (rec.fails >= MAX_FAILS) {
    rec.lockUntil = Date.now() + LOCK_MS;
    rec.fails = 0;
  }
  loginAttempts.set(key, rec);
}

function recordLoginSuccess(username) {
  loginAttempts.delete(String(username).toLowerCase());
}

function clearLoginAttempts(username) {
  if (username) {
    loginAttempts.delete(String(username).toLowerCase());
  } else {
    loginAttempts.clear();
  }
}

function createSession(user, role) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session = {
    token,
    username: user.username,
    displayName: user.officername || user.username,
    role: role || 'staff',
    source: user.isLiveUser ? 'jhcis' : 'local',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_HOURS * 3600 * 1000).toISOString()
  };
  sessionsStore.update(all => {
    // เก็บ session ไม่เกิน 500 อัน / เช็ดอันหมดอายุ
    Object.keys(all).forEach(k => {
      if (!all[k] || new Date(all[k].expiresAt).getTime() < now) delete all[k];
    });
    all[token] = session;
    const keys = Object.keys(all);
    if (keys.length > 500) keys.slice(0, keys.length - 500).forEach(k => delete all[k]);
    return all;
  });
  return session;
}

function getSession(token) {
  if (!token) return null;
  const all = sessionsStore.get();
  const s = all[token];
  if (!s) return null;
  if (new Date(s.expiresAt).getTime() < Date.now()) {
    sessionsStore.update(x => { delete x[token]; return x; });
    return null;
  }
  return s;
}

function destroySession(token) {
  if (!token) return;
  sessionsStore.update(all => { delete all[token]; return all; });
}

function requireAdminUsernames() {
  // รายชื่อ admin อ่านจาก config.json (admins: []) ผ่าน db.js — ฟังก์ชันนี้ให้ routes เรียกเทียบ
  const { getConfig } = require('../config/db');
  const cfg = getConfig();
  const admins = Array.isArray(cfg.admins) ? cfg.admins.map(a => String(a).toLowerCase()) : [];
  return admins;
}

function roleFor(username) {
  const u = String(username || '').toLowerCase();
  if (u === 'admin' || u === 'adm') return 'admin';
  return requireAdminUsernames().includes(u) ? 'admin' : 'staff';
}

module.exports = {
  createSession, getSession, destroySession,
  isLocked, recordLoginFail, recordLoginSuccess,
  clearLoginAttempts,
  roleFor
};
