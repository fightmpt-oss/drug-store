const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
const { parseExcelBuffer } = require('../services/excelParser');
const { parsePdfBuffer } = require('../services/pdfReceiptParser');
const { matchExcelItems } = require('../services/matcherService');
const { commitStockReceipt, checkDuplicateReceiveno } = require('../services/jhcisSyncService');
const { requireAuth } = require('../middleware/auth');
const { getConfig, memoryStore, saveMappings } = require('../config/db');

// โฟลเดอร์เก็บไฟล์เอกสารใบรับยาต้นฉบับจาก รพ.แม่ข่าย (แยก PDF และ Excel ชัดเจนในโฟลเดอร์ระบบ)
const RECEIVED_DOCS_DIR = path.resolve(__dirname, '../../../received_documents');
const PDF_DOCS_DIR = path.join(RECEIVED_DOCS_DIR, 'pdf');
const EXCEL_DOCS_DIR = path.join(RECEIVED_DOCS_DIR, 'excel');

function ensureReceiptFolders() {
  try {
    fs.mkdirSync(PDF_DOCS_DIR, { recursive: true });
    fs.mkdirSync(EXCEL_DOCS_DIR, { recursive: true });
  } catch (e) {}
}
ensureReceiptFolders();

// แก้ปัญหาชื่อไฟล์ภาษาไทยจาก 브라우저เมื่อผ่าน multer
function decodeOriginalFilename(rawName) {
  if (!rawName) return `receipt_${Date.now()}`;
  try {
    // ถ้ามีอักขระในช่วง latin1 ที่เกิดจาก UTF-8 bytes ให้แปลงกลับเป็น UTF-8
    if (/[\u0080-\u00ff]/.test(rawName) && !/[\u0e00-\u0e7f]/.test(rawName)) {
      const decoded = Buffer.from(rawName, 'latin1').toString('utf8');
      if (/[\u0e00-\u0e7f]/.test(decoded)) return decoded;
    }
  } catch (e) {}
  return rawName;
}

function sanitizeFilename(name) {
  return String(name || 'document')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .trim();
}

// ทุก route ต้อง login
router.use(requireAuth);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB limit (รองรับไฟล์ PDF และ Excel)
});

// Upload and preview Excel or PDF file
router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์ใบรับยา (.pdf, .xlsx, .xls, .csv)' });
    }

    ensureReceiptFolders();
    const originalName = decodeOriginalFilename(req.file.originalname);
    const ext = path.extname(originalName).toLowerCase();
    const isPdf = ext === '.pdf' || req.file.mimetype === 'application/pdf';
    const isExcel = ['.xlsx', '.xls', '.csv'].includes(ext);

    if (!isPdf && !isExcel) {
      return res.status(400).json({
        success: false,
        message: 'รองรับเฉพาะไฟล์ PDF (.pdf) หรือไฟล์ Excel (.xlsx, .xls, .csv) เท่านั้น'
      });
    }

    // 1. บันทึกไฟล์ต้นฉบับเก็บไว้ในโฟลเดอร์ received_documents/pdf หรือ received_documents/excel
    const subFolder = isPdf ? 'pdf' : 'excel';
    const targetDir = isPdf ? PDF_DOCS_DIR : EXCEL_DOCS_DIR;
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const savedFileName = `${datePrefix}_${sanitizeFilename(originalName)}`;
    const savedFilePath = path.join(targetDir, savedFileName);
    try {
      fs.writeFileSync(savedFilePath, req.file.buffer);
    } catch (saveErr) {
      console.warn('Could not save receipt file to disk:', saveErr.message);
    }

    // 2. Parse PDF or Excel buffer
    let parsed;
    if (isPdf) {
      parsed = await parsePdfBuffer(req.file.buffer);
    } else {
      parsed = parseExcelBuffer(req.file.buffer);
    }

    // 3. Perform 3-tier matching against JHCIS cdrug and TMT 24 digits
    const matchedItems = await matchExcelItems(parsed.items || []);

    // 4. Stats
    const total = matchedItems.length;
    const fullyMatched = matchedItems.filter(i => i.matchStatus === 'MATCHED').length;
    const suggested = matchedItems.filter(i => i.matchStatus === 'SUGGESTED').length;
    const unmatched = matchedItems.filter(i => i.matchStatus === 'UNMATCHED').length;

    res.json({
      success: true,
      data: {
        fileName: originalName,
        fileType: isPdf ? 'pdf' : 'excel',
        savedFileName,
        savedSubFolder: subFolder,
        savedFolderPath: targetDir,
        sheetName: parsed.sheetName || (isPdf ? 'PDF Document' : 'Sheet1'),
        numPages: parsed.numPages || 1,
        metadata: parsed.metadata || null,
        rawText: isPdf ? (parsed.rawText || '') : undefined,
        totalItems: total,
        stats: {
          fullyMatched,
          suggested,
          unmatched
        },
        items: matchedItems
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `เกิดข้อผิดพลาดในการประมวลผลไฟล์: ${err.message}` });
  }
});

// เช็คใบรับซ้ำก่อน commit (กัน import เบิ้ลสต็อก)
router.get('/check-receiveno', (req, res) => {
  try {
    res.json({ success: true, data: checkDuplicateReceiveno(req.query.receiveno) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Import matched items — บันทึกลงฐานข้อมูลของระบบ (data/localdb/receipts.json), ห้ามเขียน jhcisdb
router.post('/import', async (req, res) => {
  try {
    const { receiveno, receivedate, supplier, items, note, sourceFile, sourceType } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'ไม่มีรายการยาที่จะนำเข้า' });
    }

    const result = await commitStockReceipt({
      receiveno,
      receivedate,
      supplier: supplier || getConfig().motherHospital || '',
      receiver: req.user.displayName, // ผู้บันทึกจาก session จริง
      note,
      sourceFile: sourceFile || '',
      sourceType: sourceType || 'excel',
      items
    });

function normalizeDrugKey(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]/g, '')
    .trim();
}

    // บันทึกความจำการจับคู่ยา (Hospital Alias Memory) เพื่อให้งวดถัดไปจับคู่อัตโนมัติ 1 คลิก
    if (items && Array.isArray(items)) {
      let updated = false;
      for (const it of items) {
        const drugCode = String(it.drugcode || it.matchedDrugCode || '').trim();
        const rawName = (it.drugname || it.hospitalDrugName || '').trim();
        const hosCode = (it.hosdrugcode || '').trim();
        const normName = normalizeDrugKey(rawName);
        const normHosCode = hosCode.toLowerCase();

        if (drugCode && (normName || normHosCode)) {
          let existing = memoryStore.drugMappings.find(m => {
            if (normHosCode && m.hosdrugcode && m.hosdrugcode.toLowerCase() === normHosCode) return true;
            const mNorm = normalizeDrugKey(m.hospitalDrugName || m.drugname);
            if (normName && mNorm && mNorm === normName) return true;
            return false;
          });

          if (existing) {
            if (existing.jhcisdrugcode !== drugCode || !existing.matchedDrugName) {
              existing.jhcisdrugcode = drugCode;
              existing.matchedDrugCode = drugCode;
              if (it.matchedDrugName) existing.matchedDrugName = it.matchedDrugName;
              existing.updatedAt = new Date().toISOString();
              updated = true;
            }
          } else {
            memoryStore.drugMappings.push({
              id: `map_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              hospitalDrugName: rawName,
              drugname: rawName,
              hosdrugcode: hosCode,
              jhcisdrugcode: drugCode,
              matchedDrugCode: drugCode,
              matchedDrugName: it.matchedDrugName || it.drugname || '',
              tmtid: it.tmtid || '',
              createdAt: new Date().toISOString()
            });
            updated = true;
          }
        }
      }
      if (updated) {
        try { saveMappings(); } catch (e) { console.warn('Could not save mappings:', e.message); }
      }
    }

    res.json(result);
  } catch (err) {
    const status = err.status || (err.code === 'DUPLICATE_RECEIVE_NO' ? 409 : 500);
    res.status(status).json({ success: false, code: err.code, message: err.message });
  }
});

// บันทึก/อัปเดตการจับคู่ชื่อยา รพ.แม่ข่าย โดยตรง (Hospital Alias Memory)
router.post('/save-mapping', (req, res) => {
  try {
    const { hospitalDrugName, drugname, hosdrugcode, jhcisdrugcode, matchedDrugName, tmtid } = req.body;
    const cleanName = (hospitalDrugName || drugname || '').trim();
    const cleanCode = (hosdrugcode || '').trim();
    const cleanJhcis = String(jhcisdrugcode || '').trim();

    if (!cleanJhcis || (!cleanName && !cleanCode)) {
      return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน: ต้องระบุรหัสยา JHCIS และชื่อยาหรือรหัสยา รพ.' });
    }

    const normName = normalizeDrugKey(cleanName);
    const normHosCode = cleanCode.toLowerCase();

    let existing = memoryStore.drugMappings.find(m => {
      if (normHosCode && m.hosdrugcode && m.hosdrugcode.toLowerCase() === normHosCode) return true;
      const mNorm = normalizeDrugKey(m.hospitalDrugName || m.drugname);
      if (normName && mNorm && mNorm === normName) return true;
      return false;
    });

    if (existing) {
      existing.jhcisdrugcode = cleanJhcis;
      existing.matchedDrugCode = cleanJhcis;
      if (cleanName) {
        existing.hospitalDrugName = cleanName;
        existing.drugname = cleanName;
      }
      if (matchedDrugName) existing.matchedDrugName = matchedDrugName;
      if (tmtid) existing.tmtid = tmtid;
      existing.updatedAt = new Date().toISOString();
    } else {
      memoryStore.drugMappings.push({
        id: `map_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        hospitalDrugName: cleanName,
        drugname: cleanName,
        hosdrugcode: cleanCode,
        jhcisdrugcode: cleanJhcis,
        matchedDrugCode: cleanJhcis,
        matchedDrugName: matchedDrugName || '',
        tmtid: tmtid || '',
        createdAt: new Date().toISOString()
      });
    }
    saveMappings();
    res.json({ success: true, message: 'บันทึกการจับคู่ชื่อยาสำเร็จ (ระบบจะจดจำสำหรับการนำเข้าครั้งถัดไป)' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ประวัติใบรับยาที่บันทึกไว้ในระบบ
router.get('/receipts', (req, res) => {
  try {
    const { listReceipts } = require('../services/localStore');
    res.json({
      success: true,
      folderPath: RECEIVED_DOCS_DIR,
      data: listReceipts(req.query.limit || 100)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// รายชื่อไฟล์เอกสารใบรับยา (PDF / Excel) ที่เก็บไว้ในโฟลเดอร์ received_documents
router.get('/files', (req, res) => {
  try {
    ensureReceiptFolders();
    const listFolder = (dir, type) => {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter(f => !f.startsWith('.'))
        .map(f => {
          const stat = fs.statSync(path.join(dir, f));
          return {
            filename: f,
            type,
            size: stat.size,
            updatedAt: stat.mtime
          };
        });
    };

    const files = [
      ...listFolder(PDF_DOCS_DIR, 'pdf'),
      ...listFolder(EXCEL_DOCS_DIR, 'excel')
    ].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    res.json({
      success: true,
      folderPath: RECEIVED_DOCS_DIR,
      pdfFolderPath: PDF_DOCS_DIR,
      excelFolderPath: EXCEL_DOCS_DIR,
      files
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// เปิดดูหรือดาวน์โหลดไฟล์เอกสารใบรับยาที่เก็บไว้ใน received_documents
router.get('/files/:type/:filename', (req, res) => {
  try {
    const type = req.params.type === 'pdf' ? 'pdf' : 'excel';
    const baseDir = type === 'pdf' ? PDF_DOCS_DIR : EXCEL_DOCS_DIR;
    const safeName = path.basename(req.params.filename);
    const fullPath = path.join(baseDir, safeName);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'ไม่พบไฟล์เอกสารที่ระบุ' });
    }

    if (type === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(safeName)}"`);
    } else {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}"`);
    }
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Generate and download a sample Excel file with exact columns specified by user
router.get('/sample', (req, res) => {
  try {
    const sampleData = [
      {
        hosdrugcode: '1000142',
        tmtid: '201010000000000001001421',
        drugname: 'Paracetamol 500 mg tablet',
        drugtype: 'ยาเม็ด',
        lot: 'LOT-PARA-2601',
        'exp.date': '2028-09-30',
        amount: 2000,
        cost: 0.35
      },
      {
        hosdrugcode: '1000215',
        tmtid: '201010000000000002001432',
        drugname: 'Amoxicillin 500 mg capsule',
        drugtype: 'แคปซูล',
        lot: 'LOT-AMOX-2603',
        'exp.date': '2028-06-15',
        amount: 1500,
        cost: 1.20
      },
      {
        hosdrugcode: '1000450',
        tmtid: '201010000000000003001443',
        drugname: 'Amlodipine 5 mg tablet',
        drugtype: 'ยาเม็ด',
        lot: 'LOT-AMLO-2608',
        'exp.date': '2028-12-31',
        amount: 3000,
        cost: 0.50
      },
      {
        hosdrugcode: '1000980',
        tmtid: '201010000000000005001465',
        drugname: 'Omeprazole 20 mg capsule',
        drugtype: 'แคปซูล',
        lot: 'LOT-OMEP-2604',
        'exp.date': '2027-11-20',
        amount: 1000,
        cost: 0.85
      },
      {
        hosdrugcode: '1001200',
        tmtid: '201010000000000009001509',
        drugname: 'Salbutamol Inhaler (Ventolin) 200 doses',
        drugtype: 'ยาพ่น',
        lot: 'LOT-VENT-2602',
        'exp.date': '2028-05-10',
        amount: 30,
        cost: 120.00
      }
    ];

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(sampleData);
    xlsx.utils.book_append_sheet(wb, ws, 'รายการยาเบิกจากรพ');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="Sample_Drug_Receive_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
