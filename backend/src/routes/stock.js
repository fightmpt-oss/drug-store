const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  getStockCareSummary,
  getStockCardDetail,
  getDrugSubstockInfo,
  getDrugDispensingHistory,
  getDrugUsageReport,
  getVarianceReport
} = require('../services/stockCardService');
const { getAllJhcisDrugs } = require('../services/matcherService');
const { logPatientDataAccess, PDPA_POLICY } = require('../services/pdpaAuditService');
const {
  saveAdjustment, listAdjustments, ADJUST_CATEGORIES,
  getCountAudit,
  getDrugSettings, setDrugSettings,
  saveSubstockTransfer, listSubstockTransfers, deleteSubstockTransfer
} = require('../services/localStore');
const {
  saveSingleCount, saveBatchCounts, deleteInitialCount, resetAllInitialCounts,
  getInitialCountSummary, generateCountingTemplateExcel, importFromExcel,
  previewExcelInitialStock, commitExcelInitialStock
} = require('../services/initialStockService');
const {
  getMobileBridgeInfo
} = require('../services/mobileTunnelService');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ==========================================
// ทุก route ในไฟล์นี้ต้อง login (session token)
// ==========================================
router.use(requireAuth);

// Get overall drug stock overview with badges and filters
router.get('/overview', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      statusFilter,
      drugTypeFilter,
      drugFlagFilter,
      drugtype,
      drugflag,
      search,
      page,
      pageSize,
      sortBy,
      sortOrder,
      col_drugcode,
      col_drugname,
      col_drugtype,
      col_tmtcode,
      col_drugcode24,
      col_status,
      col_balance,
      col_dispensed,
      col_counted
    } = req.query;

    const summary = await getStockCareSummary({
      startDate,
      endDate,
      statusFilter,
      drugTypeFilter: drugTypeFilter || drugtype || 'all',
      drugFlagFilter: drugFlagFilter || drugflag || '1',
      search,
      page,
      pageSize,
      sortBy: sortBy || 'default',
      sortOrder: sortOrder || 'asc',
      colFilters: {
        drugcode: col_drugcode,
        drugname: col_drugname,
        drugtype: col_drugtype,
        tmtcode: col_tmtcode,
        drugcode24: col_drugcode24,
        status: col_status,
        balance: col_balance,
        dispensed: col_dispensed,
        counted: col_counted
      }
    });
    res.json({ success: true, data: summary });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, code: err.code, message: err.message });
  }
});

// Get individual drug's Stock Card (supports ?mode=main_store or ?mode=total_pcu)
router.get('/card/:drugcode', async (req, res) => {
  try {
    const { drugcode } = req.params;
    const { startDate, endDate, mode } = req.query;
    const stockCard = await getStockCardDetail(drugcode, startDate, endDate, mode || 'main_store');
    res.json({ success: true, data: stockCard });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, code: err.code, message: err.message });
  }
});

// Get detailed patient dispensing history
// PDPA: mask ฝั่ง server เป็นค่าเริ่มต้น — เปิดชื่อเต็มต้อง reveal=1 + reason และบันทึก audit ด้วย session จริง
router.get('/dispensing/:drugcode', async (req, res) => {
  try {
    const { drugcode } = req.params;
    const { startDate, endDate, search, limit, reveal, reason } = req.query;
    const wantReveal = reveal === '1' || reveal === 'true';

    if (wantReveal && (!reason || String(reason).trim().length < 3)) {
      return res.status(400).json({ success: false, message: 'การเปิดชื่อผู้ป่วยเต็มต้องระบุเหตุผล (reason) อย่างน้อย 3 ตัวอักษร เพื่อบันทึกตาม พ.ร.บ. PDPA ม.39' });
    }

    const history = await getDrugDispensingHistory(drugcode, {
      startDate,
      endDate,
      search,
      limit,
      reveal: wantReveal
    });

    logPatientDataAccess({
      username: req.user.username,        // จาก session ฝั่ง server — ห้ามเชื่อ client
      action: 'VIEW_PATIENT_DISPENSING',
      drugcode,
      recordCount: history.totalRecords || 0,
      ip: req.ip || req.socket?.remoteAddress || '127.0.0.1',
      reason: wantReveal ? String(reason).trim() : 'masked_view',
      revealed: wantReveal
    });

    res.json({ success: true, data: history, pdpa: PDPA_POLICY });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, code: err.code, message: err.message });
  }
});

// PDPA Policy and Compliance Declaration Endpoint
router.get('/pdpa-policy', (req, res) => {
  res.json({ success: true, policy: PDPA_POLICY });
});

// JHCIS rdrug_used (รายงานการจ่ายยาและเวชภัณฑ์ ฯ)
router.get('/report-used', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const report = await getDrugUsageReport(startDate, endDate);
    res.json({ success: true, data: report });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, code: err.code, message: err.message });
  }
});

// รายงานความคลาดเคลื่อน (ยอดนับ vs ยอดคุม) — ใช้ตรวจสอบก่อนปรับปรุงยอด
router.get('/variance', async (req, res) => {
  try {
    const { asOfDate } = req.query;
    const report = await getVarianceReport(asOfDate);
    res.json({ success: true, data: report });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, code: err.code, message: err.message });
  }
});

// List all drugs in catalogue
router.get('/drugs', async (req, res) => {
  try {
    const drugs = await getAllJhcisDrugs();
    res.json({ success: true, data: drugs });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, code: err.code, message: err.message });
  }
});

// ==========================================
// รายการปรับปรุงสต็อก (ปรับปรุง/ตัดจำหน่าย/โอนย้าย/คืนยา)
// ==========================================

router.get('/adjustments/categories', (req, res) => {
  res.json({ success: true, data: ADJUST_CATEGORIES });
});

router.get('/adjustments', (req, res) => {
  try {
    const { drugcode, startDate, endDate } = req.query;
    res.json({ success: true, data: listAdjustments({ drugcode, startDate, endDate }) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.post('/adjustments', async (req, res) => {
  try {
    const entry = await saveAdjustment(req.body || {}, req.user.displayName);
    entry.createdBy = req.user.displayName;
    res.json({ success: true, data: entry, message: `บันทึกรายการ${entry.categoryLabel} เรียบร้อย` });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// ==========================================
// PHYSICAL STOCK COUNT / INITIAL STOCK API
// ==========================================

router.get('/initial-count', async (req, res) => {
  try {
    const summary = await getInitialCountSummary();
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// บันทึกยอดนับ — countedBy บังคับจาก session (ไม่เชื่อ client)
router.post('/initial-count', async (req, res) => {
  try {
    const saved = await saveSingleCount(req.body, req.user.displayName);
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.post('/initial-count/batch', async (req, res) => {
  try {
    const { items } = req.body;
    const result = await saveBatchCounts(items, req.user.displayName);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.delete('/initial-count/:drugcode', async (req, res) => {
  try {
    const success = await deleteInitialCount(req.params.drugcode, req.user.displayName);
    res.json({ success, message: success ? 'ลบยอดนับเรียบร้อย (บันทึก audit แล้ว)' : 'ไม่พบข้อมูล' });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// Reset ทั้งหมด — admin เท่านั้น (เดิมใครก็เรียกได้ = อันตรายมาก)
router.post('/initial-count/reset-all', requireAdmin, async (req, res) => {
  try {
    await resetAllInitialCounts(req.user.displayName);
    res.json({ success: true, message: `รีเซ็ตยอดยกมาทั้งหมดเป็น 0 เรียบร้อย (โดย ${req.user.displayName} — บันทึก audit แล้ว)` });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// Audit trail การแก้ยอดนับ
router.get('/initial-count/audit', (req, res) => {
  try {
    res.json({ success: true, data: getCountAudit(200) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.get('/initial-count/template-excel', async (req, res) => {
  try {
    const buffer = await generateCountingTemplateExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Stock_Count_Template.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.post('/initial-count/upload-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์ Excel (.xlsx)' });
    }
    const result = await importFromExcel(req.file.buffer, req.user.displayName);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// ==========================================
// PREVIEW & MATCH INITIAL STOCK FROM EXCEL
// ==========================================

// ดึงข้อมูลตัวอย่างการจับคู่ยาจากไฟล์ ใบเบิกยา รพสต69.xlsx ในโฟลเดอร์ระบบ
router.get('/initial-count/excel-preview', async (req, res) => {
  try {
    const preview = await previewExcelInitialStock();
    res.json({ success: true, data: preview });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// อัปโหลดไฟล์ Excel เพื่อดูตัวอย่างและตรวจสอบการจับคู่ยาก่อนบันทึก (ยังไม่บันทึกลงฐานข้อมูล)
router.post('/initial-count/upload-preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์ Excel (.xlsx)' });
    }
    const preview = await previewExcelInitialStock(req.file.buffer);
    res.json({ success: true, data: preview });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// ยืนยันบันทึกยอดยกมาตามที่ผู้ใช้งานตรวจสอบและจับคู่แล้ว
router.post('/initial-count/commit-matches', async (req, res) => {
  try {
    const { items, resetBeforeCommit, saveMappings, countDate } = req.body;
    const actor = req.user?.displayName || req.user?.officername || 'เจ้าหน้าที่คลังยา';
    const result = await commitExcelInitialStock(items, { resetBeforeCommit, saveMappings, countDate }, actor);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// ==========================================
// ค่าตั้งต่อยา (เกณฑ์ต่ำสุด/สูงสุด, conversion factor, ตำแหน่งจัดเก็บ)
// ==========================================

router.get('/drug-settings/:drugcode', (req, res) => {
  res.json({ success: true, data: getDrugSettings(req.params.drugcode) });
});

router.post('/drug-settings/:drugcode', (req, res) => {
  try {
    const allowed = {};
    ['minstock', 'maxstock', 'location', 'conversionFactor', 'note'].forEach(k => {
      if (req.body[k] !== undefined) allowed[k] = req.body[k];
    });
    const saved = setDrugSettings(req.params.drugcode, allowed, req.user.displayName);
    res.json({ success: true, data: saved, message: 'บันทึกค่าตั้งต่อยาเรียบร้อย' });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// ==========================================
// ระบบสแกน QR Code เบิกยาจากคลังยาในไปจุดจ่ายยาหน้าเคาน์เตอร์ (Hybrid 2-Tier Sub-Stock)
// ==========================================

// 1. สแกน QR Code หรือค้นหารหัสยาเพื่อดูจำนวนคงเหลือในคลังยาใน แยกตาม Lot/Exp
router.get('/substock/drug/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { startDate, endDate } = req.query;
    const info = await getDrugSubstockInfo(decodeURIComponent(code), startDate, endDate);
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// 2. บันทึกการเบิกยาจากคลังยาในออกวางที่จุดจ่ายยาหน้าเคาน์เตอร์ (ตัดคลังในตาม Lot ที่เลือก)
router.post('/substock/transfer', async (req, res) => {
  try {
    const { drugcode, drugname, hosdrugcode, hospitalDrugName, lotno, dateexpire, amount, date, note } = req.body;
    const settings = getDrugSettings(drugcode) || {};
    const factor = Number(settings.conversionFactor) > 1 ? Number(settings.conversionFactor) : 1;
    const numAmount = Number(amount) || 0;
    const counterYield = numAmount * factor;
    const mainStoreUnit = settings.mainStoreUnit || (factor > 1 ? 'กระปุก' : 'หน่วย');
    const counterUnit = settings.counterUnit || 'หน่วย';

    const saved = await saveSubstockTransfer({
      drugcode,
      drugname,
      hosdrugcode,
      hospitalDrugName,
      lotno,
      dateexpire,
      amount: numAmount,
      conversionFactor: factor,
      counterYield,
      mainStoreUnit,
      counterUnit,
      date,
      note
    }, req.user?.displayName || req.user?.username || 'เจ้าหน้าที่ห้องยา');

    const updatedInfo = await getDrugSubstockInfo(drugcode);
    const msg = factor > 1
      ? `เบิกยาออกจากคลังในสำเร็จ (${numAmount} ${mainStoreUnit} → ได้รับ ${counterYield} ${counterUnit} วางหน้าเคาน์เตอร์)`
      : `เบิกยาออกวางเคาน์เตอร์สำเร็จ (${numAmount.toLocaleString()} ${mainStoreUnit} จาก Lot: ${lotno || 'N/A'})`;

    res.json({
      success: true,
      message: msg,
      transfer: saved,
      data: updatedInfo
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// 3. ดูประวัติการเบิกยาคลังในไปเคาน์เตอร์ทั้งหมด
router.get('/substock/transfers', (req, res) => {
  try {
    const { drugcode, startDate, endDate, limit } = req.query;
    const list = listSubstockTransfers({
      drugcode,
      startDate,
      endDate,
      limit: Number(limit) || 200
    });
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// 4. ยกเลิก/ลบรายการเบิกย่อย (กรณีคีย์ผิด เพื่อคืนยอดกลับเข้าคลังยาใน)
router.delete('/substock/transfer/:id', async (req, res) => {
  try {
    const ok = await deleteSubstockTransfer(req.params.id, req.user?.displayName || req.user?.username);
    if (!ok) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการเบิกที่ต้องการยกเลิก' });
    }
    res.json({ success: true, message: 'ยกเลิกรายการเบิกสำเร็จ (คืนยอดกลับเข้าคลังยาในเรียบร้อย)' });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// 5. สร้างป้าย QR Code ประจำตัวยาใน JHCIS สำหรับพิมพ์ติดหน้าชั้นวางยาคลังใน
router.get('/substock/qrcodes', async (req, res) => {
  try {
    const port = Number(process.env.PORT) || 5000;
    const bridge = await getMobileBridgeInfo({ port });
    const { search = '', limit = 100, qrFormat = 'lan_url' } = req.query;
    const QRCode = require('qrcode');
    const summary = await getStockCareSummary({
      pageSize: 'all',
      drugFlagFilter: '1'
    });
    let items = summary.items || [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(d =>
        d.drugcode.toLowerCase().includes(q) ||
        (d.drugname && d.drugname.toLowerCase().includes(q)) ||
        (d.drugnamethai && d.drugnamethai.toLowerCase().includes(q)) ||
        (d.hosdrugcode && d.hosdrugcode.toLowerCase().includes(q)) ||
        (d.hospitalDrugName && d.hospitalDrugName.toLowerCase().includes(q))
      );
    }

    const capped = items.slice(0, Math.min(500, Math.max(1, Number(limit) || 100)));
    const results = await Promise.all(capped.map(async d => {
      let qrPayload = `JHCIS-DRUG:${d.drugcode}`;
      if (qrFormat === 'lan_url') {
        const base = bridge.primaryLanUrl || 'http://localhost:5000';
        qrPayload = `${base}/m/${encodeURIComponent(d.drugcode)}`;
      }

      let qrDataUrl = '';
      try {
        qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 180, margin: 1 });
      } catch (e) {}
      return {
        drugcode: d.drugcode,
        drugname: d.drugname,
        drugnamethai: d.drugnamethai || '',
        drugunit: d.drugunit || 'หน่วย',
        hosdrugcode: d.hosdrugcode || '',
        hospitalDrugName: d.hospitalDrugName || '',
        mainStoreBalance: d.mainStoreBalance,
        counterBalance: d.counterBalance,
        currentBalance: d.currentBalance,
        activeLotsCount: (d.mainStoreLots || []).filter(l => l.remaining > 0).length,
        qrPayload,
        qrDataUrl
      };
    }));

    res.json({ success: true, total: items.length, data: results, bridge });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// 6. ดึงข้อมูลเชื่อมต่อมือถือผ่าน Wi-Fi วงแลน รพ.สต. (ถาวร 100%)
router.get('/substock/mobile-bridge', async (req, res) => {
  try {
    const port = Number(process.env.PORT) || 5000;
    const info = await getMobileBridgeInfo({
      port,
      mobileToken: req.user?.token || null,
      drugcode: req.query.drugcode || null
    });
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
