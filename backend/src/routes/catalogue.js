const express = require('express');
const router = express.Router();
const multer = require('multer');
const drugCatalogueService = require('../services/drugCatalogueService');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ทุก route ต้อง login
router.use(requireAuth);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max
});

// Upload new catalogue Excel file (.xls / .xlsx) — admin เท่านั้น (เปลี่ยนทะเบียนยา = กระทบทั้งระบบ)
router.post('/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์ Excel (.xls, .xlsx) หรือ JSON' });
    }
    const category = req.body.category || 'auto'; // 'pcu_approved' | 'hospital_herbs' | 'auto'
    const result = await drugCatalogueService.saveAndProcessUploadedCatalogue(req.file, category);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get list of catalogue files
router.get('/files', async (req, res) => {
  try {
    const files = drugCatalogueService.getAvailableFiles();
    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Audit PCU Drug Catalogue
router.get('/audit/pcu', async (req, res) => {
  try {
    const filename = req.query.file || null;
    const result = await drugCatalogueService.auditPcuCatalogue(filename);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Audit Hospital / Herbal Catalogue
router.get('/audit/herbs', async (req, res) => {
  try {
    const filename = req.query.file || null;
    const result = await drugCatalogueService.auditSaraphiHerbs(filename);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate Safe SQL Update Script — admin เท่านั้น (สคริปต์นี้เอาไปรันที่ DB จริง)
router.post('/generate-sql', requireAdmin, async (req, res) => {
  try {
    const options = req.body || {};
    const result = await drugCatalogueService.generateUpdateSql(options);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// DTAM (กรมการแพทย์แผนไทยและการแพทย์ทางเลือก) Master Registry Endpoints
// =========================================================================
const dtamService = require('../services/dtamService');

// Get DTAM registry status & online version check
router.get('/dtam/status', async (req, res) => {
  try {
    const checkOnline = req.query.checkOnline === 'true' || req.query.checkOnline === '1';
    const status = await dtamService.getDtamStatus(checkOnline);
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trigger auto-sync from DTAM online portal
router.post('/dtam/sync', requireAdmin, async (req, res) => {
  try {
    const result = await dtamService.syncFromDtam();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Audit JHCIS cdrug herbal medicines against DTAM registry
router.get('/dtam/audit', async (req, res) => {
  try {
    const onlyActive = req.query.onlyActive !== 'false' && req.query.onlyActive !== '0';
    const audit = await dtamService.auditJhcisHerbs({ onlyActive });
    res.json({ success: true, data: audit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Search DTAM registry by name, 24-digit code, or TMT
router.get('/dtam/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = parseInt(req.query.limit, 10) || 20;
    const items = dtamService.searchRegistry(query, limit);
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate SQL for herbal discrepancies
router.post('/dtam/generate-sql', requireAdmin, async (req, res) => {
  try {
    const items = req.body.items || [];
    const result = dtamService.generateHerbsUpdateSql(items);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Apply updates directly to JHCIS
router.post('/dtam/apply-updates', requireAdmin, async (req, res) => {
  try {
    const updates = req.body.updates || [];
    const result = await dtamService.applyDirectUpdates(updates);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

