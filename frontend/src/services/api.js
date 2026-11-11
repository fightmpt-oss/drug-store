// Frontend API Client for JHCIS Drug Stock System
// ทุก request แนบ session token (Authorization: Bearer) — ถ้า 401 จะยิง event ให้ App บังคับ login ใหม่
const BASE_URL = '/api';

function getToken() {
  try {
    return localStorage.getItem('jhcis_token') || '';
  } catch (e) {
    return '';
  }
}

function setToken(token) {
  try {
    if (token) localStorage.setItem('jhcis_token', token);
    else localStorage.removeItem('jhcis_token');
  } catch (e) {}
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  // Session หมดอายุ/ไม่ถูกต้อง → แจ้ง App ให้บังคับ login ใหม่ (ยกเว้นตอนกำลัง login)
  if (res.status === 401) {
    let data = {};
    try { data = await res.json(); } catch (e) {}

    // ถ้ากำลังอยู่ที่ endpoint login หรือ verify → ให้ส่ง error จริงจาก backend (เช่น รหัสผ่านผิด / OTP ไม่ถูก)
    if (path.startsWith('/auth/login') || path.startsWith('/auth/verify') || path.startsWith('/auth/users')) {
      return {
        success: false,
        code: data.code || 'AUTH_ERROR',
        message: data.message || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง'
      };
    }

    setToken(null);
    try { localStorage.removeItem('jhcis_user'); } catch (e) {}
    window.dispatchEvent(new CustomEvent('jhcis:auth-expired'));
    return { success: false, code: 'UNAUTHENTICATED', message: data.message || 'หมดเวลาเข้าใช้งาน กรุณาเข้าสู่ระบบใหม่' };
  }

  let data = {};
  try { data = await res.json(); } catch (e) { data = { success: false, message: `การตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง (HTTP ${res.status})` }; }
  if (!res.ok && data.success === undefined) {
    data.success = false;
    data.message = data.message || `เกิดข้อผิดพลาด (HTTP ${res.status})`;
  }
  return data;
}

export const api = {
  setToken,

  // Authentication & 2FA
  async getAuthUsers() {
    return request(`/auth/users`);
  },

  async loginStep1(username, password, forceResetMfa = false) {
    return request(`/auth/login-step1`, {
      method: 'POST',
      body: JSON.stringify({ username, password, forceResetMfa })
    });
  },

  async verifyOtp(tempToken, otp) {
    const res = await request(`/auth/verify-otp`, {
      method: 'POST',
      body: JSON.stringify({ tempToken, otp })
    });
    if (res.success && res.token) setToken(res.token);
    return res;
  },

  async verifyRecoveryCode(tempToken, recoveryCode) {
    const res = await request(`/auth/verify-recovery`, {
      method: 'POST',
      body: JSON.stringify({ tempToken, recoveryCode })
    });
    if (res.success && res.token) setToken(res.token);
    return res;
  },

  async login(username, password) {
    const res = await request(`/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (res.success && res.token) setToken(res.token);
    return res;
  },

  async logout() {
    const res = await request(`/auth/logout`, { method: 'POST' });
    setToken(null);
    return res;
  },

  async getMe() {
    return request(`/auth/me`);
  },

  // First-run / Localhost DB Setup (ก่อน login)
  async getSetupStatus() {
    return request(`/setup/status`);
  },

  async testSetupConnection(settings) {
    return request(`/setup/test`, {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  },

  async completeSetup(settings) {
    return request(`/setup/complete`, {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  },

  // Drug Stock Overview & List
  async getStockOverview(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/stock/overview?${query}`);
  },

  // Single Drug Stock Card
  async getStockCard(drugcode, params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/stock/card/${encodeURIComponent(drugcode)}?${query}`);
  },

  // Patient Dispensing History (PDPA: reveal=1 ต้องแนบ reason)
  async getDrugDispensingHistory(drugcode, params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/stock/dispensing/${encodeURIComponent(drugcode)}?${query}`);
  },

  // List all drugs
  async getAllDrugs() {
    return request(`/stock/drugs`);
  },

  // JHCIS rdrug_used (รายงานการจ่ายยาและเวชภัณฑ์ ฯ)
  async getDrugUsageReport(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/stock/report-used?${query}`);
  },

  // รายงานความคลาดเคลื่อน (ยอดนับ vs ยอดคุม)
  async getVarianceReport(asOfDate) {
    const q = asOfDate ? `?asOfDate=${encodeURIComponent(asOfDate)}` : '';
    return request(`/stock/variance${q}`);
  },

  // รายการปรับปรุงสต็อก
  async getAdjustmentCategories() {
    return request(`/stock/adjustments/categories`);
  },

  async getAdjustments(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/stock/adjustments?${query}`);
  },

  async saveAdjustment(payload) {
    return request(`/stock/adjustments`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // ระบบสแกน QR เบิกยาจากคลังยาในไปจุดจ่ายยาเคาน์เตอร์ (Hybrid Sub-Stock)
  async getSubstockDrug(code, params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/stock/substock/drug/${encodeURIComponent(code)}${query ? `?${query}` : ''}`);
  },

  async saveSubstockTransfer(payload) {
    return request(`/stock/substock/transfer`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async getSubstockTransfers(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/stock/substock/transfers${query ? `?${query}` : ''}`);
  },

  async deleteSubstockTransfer(id) {
    return request(`/stock/substock/transfer/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  async getSubstockQrCodes(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/stock/substock/qrcodes${query ? `?${query}` : ''}`);
  },

  // Excel Preview
  async previewExcel(file) {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/excel/preview`, {
      method: 'POST',
      body: formData
    });
  },

  // เช็คใบรับซ้ำก่อนบันทึก
  async checkReceiveno(receiveno) {
    return request(`/excel/check-receiveno?receiveno=${encodeURIComponent(receiveno || '')}`);
  },

  // Excel Import Batch Commit
  async importExcel(payload) {
    return request(`/excel/import`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // ประวัติใบรับยาที่บันทึกแล้ว
  async getReceipts(limit = 100) {
    return request(`/excel/receipts?limit=${limit}`);
  },

  // รายชื่อไฟล์เอกสารใบรับยา (PDF / Excel) ในโฟลเดอร์ received_documents
  async getSavedReceiptFiles() {
    return request(`/excel/files`);
  },

  // เปิดดูไฟล์ PDF ในแท็บใหม่ หรือดาวน์โหลดไฟล์ Excel จากโฟลเดอร์ received_documents
  async openReceiptFile(type, filename) {
    const token = getToken();
    const url = `${BASE_URL}/excel/files/${encodeURIComponent(type)}/${encodeURIComponent(filename)}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (res.status === 401) {
      setToken(null);
      window.dispatchEvent(new CustomEvent('jhcis:auth-expired'));
      throw new Error('หมดเวลาเข้าใช้งาน กรุณาเข้าสู่ระบบใหม่');
    }
    if (!res.ok) throw new Error(`ไม่สามารถเปิดไฟล์ได้ (HTTP ${res.status})`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    if (type === 'pdf') {
      window.open(blobUrl, '_blank');
    } else {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'receipt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    }
  },

  // Download Sample Excel
  getSampleExcelUrl() {
    return `${BASE_URL}/excel/sample`;
  },

  // ดาวน์โหลดไฟล์ที่ต้องยืนยันตัวตน (fetch แนบ token แล้วสร้าง blob ให้กดบันทึก)
  async downloadFile(url, filename) {
    const token = getToken();
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (res.status === 401) {
      setToken(null);
      window.dispatchEvent(new CustomEvent('jhcis:auth-expired'));
      throw new Error('หมดเวลาเข้าใช้งาน กรุณาเข้าสู่ระบบใหม่');
    }
    if (!res.ok) throw new Error(`ดาวน์โหลดไม่สำเร็จ (HTTP ${res.status})`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  },

  // Mappings
  async getMappings() {
    return request(`/mappings`);
  },

  async saveMapping(mapping) {
    return request(`/mappings`, {
      method: 'POST',
      body: JSON.stringify(mapping)
    });
  },

  async saveBatchMappings(mappings) {
    return request(`/mappings/batch`, {
      method: 'POST',
      body: JSON.stringify({ mappings })
    });
  },

  async deleteMapping(hoscode) {
    return request(`/mappings/${encodeURIComponent(hoscode)}`, {
      method: 'DELETE'
    });
  },

  // Settings & DB Connection
  async getSettings() {
    return request(`/settings`);
  },

  async saveSettings(settings) {
    return request(`/settings/save`, {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  },

  async testConnection(settings) {
    return request(`/settings/test`, {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  },

  // Drug Catalogue Auditor & Sync
  async getCatalogueFiles() {
    return request(`/catalogue/files`);
  },

  async auditPcuCatalogue(file) {
    const q = file ? `?file=${encodeURIComponent(file)}` : '';
    return request(`/catalogue/audit/pcu${q}`);
  },

  async auditSaraphiHerbs(file) {
    const q = file ? `?file=${encodeURIComponent(file)}` : '';
    return request(`/catalogue/audit/herbs${q}`);
  },

  async uploadCatalogueFile(formData) {
    return request(`/catalogue/upload`, {
      method: 'POST',
      body: formData
    });
  },

  async generateCatalogueSql(options) {
    return request(`/catalogue/generate-sql`, {
      method: 'POST',
      body: JSON.stringify(options || {})
    });
  },

  // DTAM Herbal Medicine Registry (รหัสยาแผนไทยและสมุนไพร 24 หลัก)
  async getDtamStatus(checkOnline = false) {
    const q = checkOnline ? `?checkOnline=true` : '';
    return request(`/catalogue/dtam/status${q}`);
  },

  async syncDtamOnline() {
    return request(`/catalogue/dtam/sync`, {
      method: 'POST'
    });
  },

  async getDtamHerbsAudit(onlyActive = true) {
    const q = onlyActive ? '?onlyActive=true' : '?onlyActive=false';
    return request(`/catalogue/dtam/audit${q}`);
  },

  async searchDtamRegistry(q, limit = 20) {
    return request(`/catalogue/dtam/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  },

  async generateDtamSql(items) {
    return request(`/catalogue/dtam/generate-sql`, {
      method: 'POST',
      body: JSON.stringify({ items })
    });
  },

  async applyDtamUpdates(updates) {
    return request(`/catalogue/dtam/apply-updates`, {
      method: 'POST',
      body: JSON.stringify({ updates })
    });
  },

  // Physical Stock Take / Initial Stock Counts
  async getInitialStockCounts() {
    return request(`/stock/initial-count`);
  },

  async saveInitialStockCount(data) {
    return request(`/stock/initial-count`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async saveBatchInitialStockCounts(items) {
    return request(`/stock/initial-count/batch`, {
      method: 'POST',
      body: JSON.stringify({ items })
    });
  },

  async deleteInitialStockCount(drugcode) {
    return request(`/stock/initial-count/${encodeURIComponent(drugcode)}`, {
      method: 'DELETE'
    });
  },

  async resetAllInitialStockCounts() {
    return request(`/stock/initial-count/reset-all`, {
      method: 'POST'
    });
  },

  async getCountAudit() {
    return request(`/stock/initial-count/audit`);
  },

  getInitialStockTemplateUrl() {
    return `${BASE_URL}/stock/initial-count/template-excel`;
  },

  async uploadInitialStockExcel(file) {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/stock/initial-count/upload-excel`, {
      method: 'POST',
      body: formData
    });
  },

  async getInitialStockExcelPreview() {
    return request(`/stock/initial-count/excel-preview`);
  },

  async uploadInitialStockPreview(file) {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/stock/initial-count/upload-preview`, {
      method: 'POST',
      body: formData
    });
  },

  async commitInitialStockMatches(data) {
    return request(`/stock/initial-count/commit-matches`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Clinical Safety / Triple Whammy Alert Radar
  async getLiveSafetyAlerts(date) {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return request(`/safety/live${q}`);
  },

  async getHistoricalSafetyAlerts(startDate, endDate, filterType = 'all') {
    return request(`/safety/history?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&filterType=${encodeURIComponent(filterType)}`);
  },

  async getSafetyDrugClassifications() {
    return request(`/safety/drugs`);
  },

  async getSafetySettings() {
    return request(`/safety/settings`);
  },

  async updateSafetySettings(settings) {
    return request(`/safety/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },

  // 2-Drug Conflict Registry (คู่ยาที่ไม่ควรจ่ายร่วมกัน)
  async getSafetyConflictRegistry() {
    return request(`/safety/conflicts`);
  },

  async addSafetyConflictPair(pair) {
    return request(`/safety/conflicts`, {
      method: 'POST',
      body: JSON.stringify(pair)
    });
  },

  async deleteSafetyConflictPair(pair) {
    return request(`/safety/conflicts`, {
      method: 'DELETE',
      body: JSON.stringify(pair)
    });
  },

  getSafetyExportUrl(startDate, endDate) {
    return `${BASE_URL}/safety/export?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
  },

  // Mobile Wi-Fi LAN Bridge (สแกนเชื่อมต่อมือถือผ่าน Wi-Fi รพ.สต.)
  async getMobileBridge(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return request(`/stock/substock/mobile-bridge${query ? `?${query}` : ''}`);
  },

  // Auto-Backup & Data Management (ระบบสำรองข้อมูลอัตโนมัติ)
  async getBackups() {
    return request('/settings/backups');
  },

  async createBackupSnapshot(reason = 'ผู้ใช้กดสำรองข้อมูลด่วน') {
    return request('/settings/backups/create', {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  getBackupDownloadUrl(filename) {
    const token = getToken();
    return `${BASE_URL}/settings/backups/download/${encodeURIComponent(filename)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },

  async restoreBackup(filename) {
    return request('/settings/backups/restore', {
      method: 'POST',
      body: JSON.stringify({ filename })
    });
  }
};
