const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  getDrugClassifications,
  getLiveSafetyAlerts,
  getHistoricalSafetyAlerts,
  getConflictRegistry,
  addCustomConflictPair,
  deleteCustomConflictPair,
  generateSafetyExcelReport,
  getSafetyOverrides,
  updateSafetyOverrides
} = require('../services/safetyService');
const { logPatientDataAccess, PDPA_POLICY } = require('../services/pdpaAuditService');

// ทุก route ในไฟล์นี้ต้องผ่านการยืนยันตัวตน (Session Auth)
router.use(requireAuth);

/**
 * GET /api/safety/live
 * ดึงข้อมูลการแจ้งเตือนสดประจำวัน (Live Real-time Alert for Today)
 */
router.get('/live', async (req, res) => {
  try {
    const { date } = req.query;
    const data = await getLiveSafetyAlerts(date);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/safety/history
 * ดึงรายงานประวัติความเสี่ยงย้อนหลังตามช่วงวันที่
 */
router.get('/history', async (req, res) => {
  try {
    const { startDate, endDate, filterType = 'all' } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุ startDate และ endDate' });
    }

    const data = await getHistoricalSafetyAlerts(startDate, endDate, filterType);

    // บันทึก PDPA audit log
    logPatientDataAccess({
      username: req.user.username,
      action: 'VIEW_SAFETY_HISTORY',
      recordCount: data.totalAlerts || 0,
      ip: req.ip || req.socket?.remoteAddress || '127.0.0.1',
      reason: 'search_triple_whammy_history',
      revealed: false
    });

    res.json({ success: true, data, pdpa: PDPA_POLICY });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/safety/drugs
 * ดึงรายการยาในระบบทั้งหมด พร้อมผลการจัดกลุ่ม NSAIDs, Diuretics, ACEi/ARBs
 */
router.get('/drugs', async (req, res) => {
  try {
    const drugs = await getDrugClassifications();
    res.json({ success: true, data: drugs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/safety/conflicts
 * ดึงรายการคู่ยาที่ไม่ควรจ่ายร่วมกัน (ทั้งจาก JHCIS cdrugconflictdrug และเกณฑ์มาตรฐานทางคลินิก)
 */
router.get('/conflicts', async (req, res) => {
  try {
    const data = await getConflictRegistry();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/safety/conflicts
 * เพิ่มคู่ยาที่ไม่ควรจ่ายร่วมกัน (บันทึกลง JHCIS cdrugconflictdrug + localdb)
 */
router.post('/conflicts', requireAdmin, async (req, res) => {
  try {
    const { drugcode_a, drugcode_b, reason } = req.body || {};
    const data = await addCustomConflictPair(drugcode_a, drugcode_b, reason);
    res.json({ success: true, data, message: 'เพิ่มคู่ยาที่ไม่ควรจ่ายร่วมกันเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/safety/conflicts
 * ลบคู่ยาที่ไม่ควรจ่ายร่วมกัน
 */
router.delete('/conflicts', requireAdmin, async (req, res) => {
  try {
    const { drugcode_a, drugcode_b } = req.body || {};
    const data = await deleteCustomConflictPair(drugcode_a, drugcode_b);
    res.json({ success: true, data, message: 'ลบคู่ยาที่ไม่ควรจ่ายร่วมกันเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/safety/settings
 * ดึงการตั้งค่า Custom Overrides ของหน่วยบริการ
 */
router.get('/settings', (req, res) => {
  try {
    const settings = getSafetyOverrides();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/safety/settings & POST /api/safety/settings
 * บันทึกการตั้งค่า Custom Overrides ของหน่วยบริการ (เฉพาะผู้ดูแลระบบ Admin)
 */
const handleSaveSafetySettings = (req, res) => {
  try {
    const updated = updateSafetyOverrides(req.body);
    res.json({ success: true, data: updated, message: 'บันทึกการตั้งค่าการจัดกลุ่มยาเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

router.put('/settings', requireAdmin, handleSaveSafetySettings);
router.post('/settings', requireAdmin, handleSaveSafetySettings);

/**
 * GET /api/safety/export
 * ส่งออกรายงาน Excel
 */
router.get('/export', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุ startDate และ endDate' });
    }

    const buffer = await generateSafetyExcelReport(startDate, endDate);

    logPatientDataAccess({
      username: req.user.username,
      action: 'EXPORT_SAFETY_REPORT',
      recordCount: 1,
      ip: req.ip || req.socket?.remoteAddress || '127.0.0.1',
      reason: 'export_triple_whammy_excel',
      revealed: false
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Triple_Whammy_Report_${startDate}_${endDate}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
