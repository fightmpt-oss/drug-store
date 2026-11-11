const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { getPool, isLive, getPcuCode, memoryStore } = require('../config/db');

const CATALOGUE_DIR = path.resolve(__dirname, '../../../drugcatalogue');

// Helper to clean strings
function cleanStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

// Helper to format 24-digit NDC
function cleanNdc(val) {
  if (!val) return '';
  let str = String(val).trim().replace(/\.0$/, '');
  return str;
}

// Helper to clean TMT ID
function cleanTmt(val) {
  if (!val) return '';
  let str = String(val).trim();
  if (str.includes('.')) str = str.split('.')[0];
  return str.replace(/\D/g, '');
}

/**
 * Parse Excel Buffer with preserved strings (24-digit codes)
 */
function parseCatalogueBuffer(buffer) {
  const workbook = xlsx.read(buffer, { raw: false, cellText: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
}

/**
 * Save and process an uploaded catalogue file (.xls / .xlsx)
 */
async function saveAndProcessUploadedCatalogue(file, category = 'auto') {
  if (!fs.existsSync(CATALOGUE_DIR)) {
    fs.mkdirSync(CATALOGUE_DIR, { recursive: true });
  }

  const originalName = file.originalname || `upload_${Date.now()}.xls`;
  const ext = path.extname(originalName).toLowerCase();
  
  if (!['.xls', '.xlsx', '.csv', '.json'].includes(ext)) {
    throw new Error('รองรับเฉพาะไฟล์ Excel (.xls, .xlsx) หรือ JSON เท่านั้น');
  }

  // 1. Save original uploaded file to disk
  const targetPath = path.join(CATALOGUE_DIR, originalName);
  fs.writeFileSync(targetPath, file.buffer);

  // 2. Parse content into rows
  let rows = [];
  if (ext === '.json') {
    rows = JSON.parse(file.buffer.toString('utf8'));
  } else {
    rows = parseCatalogueBuffer(file.buffer);
  }

  if (!rows || rows.length === 0) {
    throw new Error('ไม่พบข้อมูลรายการยาในไฟล์ Excel หรือตารางว่างเปล่า');
  }

  // 3. Determine category / type
  const pcuMatch = originalName.match(/(?:APPROVED_)?(\d{5})/i);
  const detectedPcu = pcuMatch ? pcuMatch[1] : null;

  let assignedType = 'pcu_approved';
  if (category === 'hospital_herbs' || category === 'saraphi_herbs' || category === 'hospital_shared') {
    assignedType = 'saraphi_herbs';
  } else if (category === 'pcu_approved') {
    assignedType = 'pcu_approved';
  } else {
    // Auto detection
    if (originalName.includes('สมุนไพร') || (detectedPcu && detectedPcu === '11135')) {
      assignedType = 'saraphi_herbs';
    } else {
      assignedType = 'pcu_approved';
    }
  }

  // 4. Save companion .json file for high-speed subsequent audits
  const jsonFilename = originalName.replace(/\.[^/.]+$/, '') + '.json';
  const jsonPath = path.join(CATALOGUE_DIR, jsonFilename);
  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), 'utf8');

  // 5. Auto-backup the catalogue file to backup/ directory
  try {
    const backupService = require('./backupService');
    backupService.backupCatalogue(file.buffer, originalName, `นำเข้า Drug Catalogue (${assignedType})`, 'admin');
  } catch (e) {}

  return {
    filename: originalName,
    jsonFilename,
    type: assignedType,
    totalRows: rows.length,
    pcuCode: detectedPcu,
    savedAt: new Date().toISOString()
  };
}

/**
 * Get available files in the drugcatalogue directory
 */
function getAvailableFiles() {
  if (!fs.existsSync(CATALOGUE_DIR)) {
    fs.mkdirSync(CATALOGUE_DIR, { recursive: true });
    return [];
  }

  const entries = fs.readdirSync(CATALOGUE_DIR);
  const validFiles = entries.filter(f => f.endsWith('.xls') || f.endsWith('.xlsx') || f.endsWith('.json'));

  // Prioritize showing primary Excel files or standalone JSON files
  const fileMap = new Map();

  validFiles.forEach(f => {
    const base = f.replace(/\.[^/.]+$/, '');
    const ext = path.extname(f).toLowerCase();
    const fullPath = path.join(CATALOGUE_DIR, f);
    const stat = fs.statSync(fullPath);

    let type = 'other';
    const pcuMatch = f.match(/(?:APPROVED_)?(\d{5})/i);
    const pcuCode = pcuMatch ? pcuMatch[1] : null;

    if (f.includes('11135') || f.includes('สมุนไพร')) {
      type = 'saraphi_herbs';
    } else if (f.toLowerCase().includes('approved') || pcuCode) {
      type = 'pcu_approved';
    }

    // Try reading item count from json if available
    let itemCount = null;
    const jsonPath = path.join(CATALOGUE_DIR, base + '.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (Array.isArray(data)) itemCount = data.length;
      } catch (e) {}
    }

    if (!fileMap.has(base)) {
      fileMap.set(base, {
        filename: f,
        baseName: base,
        primaryExt: ext,
        size: stat.size,
        updatedAt: stat.mtime,
        type,
        pcuCode,
        itemCount
      });
    } else {
      // Prefer keeping .xls/.xlsx as main display filename
      const existing = fileMap.get(base);
      if (ext === '.xls' || ext === '.xlsx') {
        existing.filename = f;
        existing.primaryExt = ext;
        existing.size = stat.size;
      }
      if (itemCount !== null) existing.itemCount = itemCount;
    }
  });

  return Array.from(fileMap.values());
}

/**
 * Load catalogue data from JSON or directly from Excel (.xls, .xlsx)
 */
function loadCatalogueData(filename) {
  if (!filename) return [];

  // 1. If exact path exists
  const directPath = path.join(CATALOGUE_DIR, filename);
  if (fs.existsSync(directPath)) {
    if (filename.endsWith('.json')) {
      try {
        return JSON.parse(fs.readFileSync(directPath, 'utf8'));
      } catch (e) {
        console.error('Error reading JSON catalogue:', e.message);
      }
    } else if (filename.endsWith('.xls') || filename.endsWith('.xlsx')) {
      try {
        const rows = parseCatalogueBuffer(fs.readFileSync(directPath));
        // Cache as companion JSON
        const jsonPath = path.join(CATALOGUE_DIR, filename.replace(/\.[^/.]+$/, '') + '.json');
        try { fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), 'utf8'); } catch (e) {}
        return rows;
      } catch (e) {
        console.error('Error parsing Excel catalogue:', e.message);
      }
    }
  }

  // 2. Try companion .json if filename passed was .xls/.xlsx
  const jsonPath = path.join(CATALOGUE_DIR, filename.replace(/\.[^/.]+$/, '') + '.json');
  if (fs.existsSync(jsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (e) {
      console.error('Error reading companion JSON catalogue:', e.message);
    }
  }

  // 3. Try matching by base name
  const baseName = filename.replace(/\.[^/.]+$/, '');
  for (const ext of ['.json', '.xls', '.xlsx']) {
    const candidate = path.join(CATALOGUE_DIR, baseName + ext);
    if (fs.existsSync(candidate)) {
      return loadCatalogueData(baseName + ext);
    }
  }

  return [];
}

/**
 * Audit PCU Drug Catalogue against JHCIS cdrug
 */
async function auditPcuCatalogue(filename = null) {
  let targetFile = filename;
  if (!targetFile) {
    const files = getAvailableFiles();
    const activePcu = getPcuCode();
    // เลือกไฟล์ที่ตรงกับรหัสหน่วยบริการที่เชื่อมต่ออยู่ก่อน ถ้าไม่มีค่อยใช้ไฟล์ pcu_approved ล่าสุด
    const exactPcuFile = activePcu ? files.find(f => f.type === 'pcu_approved' && f.pcuCode === activePcu) : null;
    const pcuFile = exactPcuFile || files.find(f => f.type === 'pcu_approved');
    targetFile = pcuFile ? pcuFile.filename : null;
  }

  const catItems = targetFile ? loadCatalogueData(targetFile) : [];
  if (!catItems || catItems.length === 0) {
    return {
      emptyCatalogue: true,
      summary: {
        total: 0,
        matched: 0,
        completeMatch: 0,
        missingInDb: 0,
        tmtDiscrepancies: 0,
        priceDiscrepancies: 0,
        ndcDiscrepancies: 0,
        isedDiscrepancies: 0
      },
      items: []
    };
  }

  let dbDrugs = [];
  const pool = getPool();
  if (pool && isLive()) {
    const [rows] = await pool.query(`
      SELECT drugcode, drugname, druggenericname, drugnamethai, 
             cost, sell, unitsell, unitusage, nationaccount, 
             drugcode24, tmtcode, drugtype, drugtypesub
      FROM cdrug
    `);
    dbDrugs = rows;
  } else {
    dbDrugs = memoryStore.drugs.map(d => ({
      drugcode: d.drugcode,
      drugname: d.drugname,
      druggenericname: d.druggenericname || d.genericname,
      cost: d.cost || 0,
      sell: d.sell || d.price || 0,
      unitsell: d.unitsell || d.unit,
      nationaccount: d.nationaccount || '1',
      drugcode24: d.drugcode24 || d.ndc24 || '',
      tmtcode: d.tmtcode || d.tmt || ''
    }));
  }

  const dbByCode = new Map();
  dbDrugs.forEach(d => {
    const code = cleanStr(d.drugcode);
    if (code) dbByCode.set(code, d);
  });

  let matchedCount = 0;
  let missingInDbCount = 0;
  let tmtDiffCount = 0;
  let priceDiffCount = 0;
  let ndcDiffCount = 0;
  let isedDiffCount = 0;
  let completeMatchCount = 0;

  const comparisonItems = [];

  catItems.forEach((c, idx) => {
    const hospCode = cleanStr(c.HOSPDRUGCODE);
    const dbItem = dbByCode.get(hospCode);

    const cTmt = cleanTmt(c.TMTID);
    const cPrice = Number(c.UNITPRICE || 0);
    const cNdc = cleanNdc(c.NDC24);
    const cIsed = cleanStr(c.ISED);
    const genericName = cleanStr(c.GENERICNAME);
    const tradeName = cleanStr(c.TRADENAME);
    const dosageForm = cleanStr(c.DOSAGEFORM);
    const strength = cleanStr(c.STRENGTH);

    if (!dbItem) {
      missingInDbCount++;
      comparisonItems.push({
        no: idx + 1,
        drugcode: hospCode,
        status: 'missing_in_db',
        statusLabel: 'ไม่พบในฐานข้อมูล JHCIS',
        badgeColor: 'rose',
        excelData: {
          tradeName,
          genericName,
          tmt: cTmt,
          price: cPrice,
          ndc24: cNdc,
          ised: cIsed,
          dosageForm,
          strength
        },
        dbData: null,
        discrepancies: ['ไม่มีรหัสยานี้ในตาราง cdrug']
      });
      return;
    }

    matchedCount++;
    const dbTmt = cleanTmt(dbItem.tmtcode);
    const dbPrice = Number(dbItem.sell || dbItem.cost || 0);
    const dbNdc = cleanNdc(dbItem.drugcode24);
    const dbIsed = cleanStr(dbItem.nationaccount);

    const diffs = [];

    // Check TMT
    let tmtMatch = true;
    if (cTmt && dbTmt && cTmt !== dbTmt) {
      tmtMatch = false;
      tmtDiffCount++;
      diffs.push(`รหัส TMT ไม่ตรงกัน (ใน JHCIS: ${dbTmt || 'ไม่มี'} vs Drug Catalogue: ${cTmt})`);
    } else if (cTmt && !dbTmt) {
      tmtMatch = false;
      tmtDiffCount++;
      diffs.push(`ในฐานข้อมูลยังไม่มีรหัส TMT (Drug Catalogue: ${cTmt})`);
    }

    // Check Price
    let priceMatch = true;
    if (Math.abs(cPrice - dbPrice) > 0.01) {
      priceMatch = false;
      priceDiffCount++;
      diffs.push(`ราคาต่อหน่วยไม่ตรงกัน (ใน JHCIS: ${dbPrice} บาท vs Drug Catalogue: ${cPrice} บาท)`);
    }

    // Check NDC24
    let ndcMatch = true;
    if (cNdc && dbNdc && cNdc !== dbNdc) {
      ndcMatch = false;
      ndcDiffCount++;
      diffs.push(`รหัส 24 หลัก (NDC24) ไม่ตรงกัน`);
    } else if (cNdc && !dbNdc) {
      ndcMatch = false;
      ndcDiffCount++;
      diffs.push(`ในฐานข้อมูลยังไม่มีรหัส 24 หลัก (NDC24)`);
    }

    // Check ISED (บัญชียาหลัก)
    let isedMatch = true;
    // Note: JHCIS usually stores '1' for National list (ED), excel has 'E'
    const isDbEd = dbIsed === '1' || dbIsed.toUpperCase() === 'E';
    const isCatEd = cIsed.toUpperCase() === 'E' || cIsed === '1';
    if (isCatEd !== isDbEd) {
      isedMatch = false;
      isedDiffCount++;
      diffs.push(`สถานะบัญชียาหลักไม่ตรงกัน (ใน JHCIS: ${dbIsed} vs Drug Catalogue: ${cIsed})`);
    }

    const hasDiff = diffs.length > 0;
    if (!hasDiff) completeMatchCount++;

    comparisonItems.push({
      no: idx + 1,
      drugcode: hospCode,
      status: hasDiff ? 'discrepancy' : 'matched',
      statusLabel: hasDiff ? 'ข้อมูลบางฟิลด์ไม่ตรงกัน' : 'ข้อมูลตรงกันสมบูรณ์',
      badgeColor: hasDiff ? 'amber' : 'emerald',
      excelData: {
        tradeName,
        genericName,
        tmt: cTmt,
        price: cPrice,
        ndc24: cNdc,
        ised: cIsed,
        dosageForm,
        strength
      },
      dbData: {
        drugname: dbItem.drugname,
        genericName: dbItem.druggenericname,
        tmt: dbTmt,
        price: dbPrice,
        ndc24: dbNdc,
        ised: dbIsed,
        unit: dbItem.unitsell || dbItem.unitusage
      },
      flags: {
        tmtMatch,
        priceMatch,
        ndcMatch,
        isedMatch
      },
      discrepancies: diffs
    });
  });

  return {
    summary: {
      total: catItems.length,
      matched: matchedCount,
      completeMatch: completeMatchCount,
      missingInDb: missingInDbCount,
      tmtDiscrepancies: tmtDiffCount,
      priceDiscrepancies: priceDiffCount,
      ndcDiscrepancies: ndcDiffCount,
      isedDiscrepancies: isedDiffCount
    },
    items: comparisonItems
  };
}

/**
 * Audit Hospital / Saraphi Herbs against JHCIS cdrug
 */
async function auditSaraphiHerbs(filename = null) {
  let targetFile = filename;
  if (!targetFile) {
    const files = getAvailableFiles();
    const herbFile = files.find(f => f.type === 'saraphi_herbs');
    targetFile = herbFile ? herbFile.filename : null;
  }

  const catItems = targetFile ? loadCatalogueData(targetFile) : [];
  if (!catItems || catItems.length === 0) {
    return {
      emptyCatalogue: true,
      summary: {
        total: 0,
        tmtMatched: 0,
        nameMatchedNeedsTmt: 0,
        newToImport: 0
      },
      items: []
    };
  }

  let dbDrugs = [];
  const pool = getPool();
  if (pool && isLive()) {
    const [rows] = await pool.query(`
      SELECT drugcode, drugname, druggenericname, drugnamethai, 
             cost, sell, unitsell, unitusage, nationaccount, 
             drugcode24, tmtcode, drugtype, drugtypesub
      FROM cdrug
    `);
    dbDrugs = rows;
  } else {
    dbDrugs = memoryStore.drugs;
  }

  const dbByCode = new Map();
  const dbByTmt = new Map();

  dbDrugs.forEach(d => {
    const code = cleanStr(d.drugcode);
    if (code) dbByCode.set(code, d);

    const tmt = cleanTmt(d.tmtcode);
    if (tmt && tmt !== '0') dbByTmt.set(tmt, d);
  });

  const herbResults = catItems.map((h, idx) => {
    const saraphiCode = cleanStr(h.HOSPDRUGCODE);
    const tmt = cleanTmt(h.TMTID);
    const gname = cleanStr(h.GENERICNAME);
    const tname = cleanStr(h.TRADENAME);
    const price = Number(h.UNITPRICE || 0);
    const ndc = cleanNdc(h.NDC24);
    const dosageForm = cleanStr(h.DOSAGEFORM);
    const strength = cleanStr(h.STRENGTH);

    // Matching chain:
    // 1. Exact code
    const matchByCode = dbByCode.get(saraphiCode);
    // 2. Exact TMT
    const matchByTmt = tmt ? dbByTmt.get(tmt) : null;
    // 3. Name-based search
    let matchByName = null;
    if (!matchByCode && !matchByTmt) {
      for (const d of dbDrugs) {
        const dName = (d.drugname || '').toLowerCase();
        const dGen = (d.druggenericname || '').toLowerCase();
        if (gname && (dName.includes(gname.toLowerCase()) || dGen.includes(gname.toLowerCase()))) {
          matchByName = d;
          break;
        }
      }
    }

    let mappingStatus = 'new_to_import';
    let mappingLabel = 'ยาใหม่ที่ยังไม่มีใน รพ.สต. (แนะนำให้นำเข้า)';
    let badgeColor = 'rose';
    let matchedDbDrug = null;

    if (matchByCode) {
      mappingStatus = 'code_matched';
      mappingLabel = 'รหัสตรงกันเป๊ะใน รพ.สต.';
      badgeColor = 'emerald';
      matchedDbDrug = matchByCode;
    } else if (matchByTmt) {
      mappingStatus = 'tmt_matched';
      mappingLabel = 'TMT ตรงกัน (ใช้รหัสท้องถิ่นต่างกัน)';
      badgeColor = 'blue';
      matchedDbDrug = matchByTmt;
    } else if (matchByName) {
      mappingStatus = 'name_matched_needs_tmt';
      mappingLabel = 'ชื่อตรงกัน แต่ TMT ใน JHCIS ยังไม่ตรง';
      badgeColor = 'amber';
      matchedDbDrug = matchByName;
    }

    return {
      no: idx + 1,
      saraphiCode,
      tradeName: tname,
      genericName: gname,
      tmt,
      price,
      ndc24: ndc,
      dosageForm,
      strength,
      mappingStatus,
      mappingLabel,
      badgeColor,
      matchedDbDrug: matchedDbDrug ? {
        drugcode: matchedDbDrug.drugcode,
        drugname: matchedDbDrug.drugname,
        price: Number(matchedDbDrug.sell || matchedDbDrug.cost || 0),
        tmtcode: matchedDbDrug.tmtcode,
        drugcode24: matchedDbDrug.drugcode24
      } : null
    };
  });

  const countTmtMatched = herbResults.filter(r => r.mappingStatus === 'tmt_matched' || r.mappingStatus === 'code_matched').length;
  const countNameMatched = herbResults.filter(r => r.mappingStatus === 'name_matched_needs_tmt').length;
  const countNew = herbResults.filter(r => r.mappingStatus === 'new_to_import').length;

  return {
    summary: {
      total: herbResults.length,
      tmtMatched: countTmtMatched,
      nameMatchedNeedsTmt: countNameMatched,
      newToImport: countNew
    },
    items: herbResults
  };
}

/**
 * Generate safe SQL update script
 */
// Escape ค่า string สำหรับ SQL — ข้อมูลมาจากไฟล์ Excel ภายนอก ห้ามต่อ string ตรง ๆ (กัน SQL injection / สคริปต์พัง)
function sqlEscapeStr(val) {
  const s = String(val === undefined || val === null ? '' : val);
  if (!/^[0-9A-Za-z_\-]*$/.test(s)) {
    // ค่าที่ไม่ใช่ alphanumeric ล้วน → บังคับ escape quote + ลบอักขระควบคุม
    return `'${s.replace(/[\x00-\x1f\x7f]/g, '').replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  }
  return `'${s}'`;
}

function sqlEscapeNum(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

async function generateUpdateSql(options = {}) {
  const { 
    updateTmt = true, 
    updatePrice = true, 
    updateNdc = true, 
    updateIsed = true,
    pcuFilename = null,
    herbsFilename = null
  } = options;

  const pcuAudit = await auditPcuCatalogue(pcuFilename);
  const herbAudit = herbsFilename ? await auditSaraphiHerbs(herbsFilename) : null;

  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const backupTable = `cdrug_backup_${timestamp}`;

  const lines = [
    `-- ========================================================================`,
    `-- SQL UPDATE SCRIPT: SYNCHRONIZE JHCIS cdrug WITH DRUG CATALOGUE`,
    `-- Generated on: ${new Date().toLocaleString('th-TH')}`,
    `-- Target Database: jhcisdb.cdrug`,
    `-- ========================================================================`,
    ``,
    `-- [STEP 0] SAFE BACKUP: สำรองตาราง cdrug ไว้ก่อนทำการอัปเดต`,
    `CREATE TABLE IF NOT EXISTS ${backupTable} AS SELECT * FROM cdrug;`,
    ``,
    `-- [STEP 1] อัปเดตรายการยาของ รพ.สต. (จากไฟล์ Drug Catalogue)`
  ];

  let updateCount = 0;

  pcuAudit.items.forEach(item => {
    if (item.status === 'discrepancy' && item.dbData) {
      const sets = [];
      if (updateTmt && item.excelData.tmt && item.excelData.tmt !== item.dbData.tmt) {
        sets.push(`tmtcode = ${sqlEscapeStr(item.excelData.tmt)}, tmtcodedateupdate = NOW()`);
      }
      if (updatePrice && Math.abs(item.excelData.price - item.dbData.price) > 0.01) {
        sets.push(`sell = ${sqlEscapeNum(item.excelData.price)}, cost = ${sqlEscapeNum(item.excelData.price)}`);
      }
      if (updateNdc && item.excelData.ndc24 && item.excelData.ndc24 !== item.dbData.ndc24) {
        sets.push(`drugcode24 = ${sqlEscapeStr(item.excelData.ndc24)}`);
      }
      if (updateIsed && item.excelData.ised) {
        const isedVal = item.excelData.ised === 'E' ? '1' : '0';
        if (isedVal !== item.dbData.ised) {
          sets.push(`nationaccount = ${sqlEscapeStr(isedVal)}`);
        }
      }

      if (sets.length > 0) {
        updateCount++;
        lines.push(`-- [${updateCount}] ${item.dbData.drugname} (${item.drugcode})`);
        lines.push(`UPDATE cdrug SET ${sets.join(', ')} WHERE drugcode = ${sqlEscapeStr(item.drugcode)};`);
      }
    }
  });

  let herbUpdateCount = 0;
  if (herbAudit && herbAudit.items) {
    lines.push(``);
    lines.push(`-- [STEP 2] อัปเดตรหัส TMT/NDC ยาสมุนไพร รพ.แม่ข่าย (สำหรับรายการที่ชื่อตรงกัน)`);
    herbAudit.items.forEach(h => {
      if (h.mappingStatus === 'name_matched_needs_tmt' && h.matchedDbDrug) {
        herbUpdateCount++;
        const sets = [];
        if (updateTmt && h.tmt) sets.push(`tmtcode = ${sqlEscapeStr(h.tmt)}, tmtcodedateupdate = NOW()`);
        if (updateNdc && h.ndc24) sets.push(`drugcode24 = ${sqlEscapeStr(h.ndc24)}`);
        if (updatePrice && h.price) sets.push(`sell = ${sqlEscapeNum(h.price)}`);
        if (sets.length > 0) {
          lines.push(`-- [Herb-${herbUpdateCount}] ${h.matchedDbDrug.drugname} (รหัสเดิม: ${h.matchedDbDrug.drugcode})`);
          lines.push(`UPDATE cdrug SET ${sets.join(', ')} WHERE drugcode = ${sqlEscapeStr(h.matchedDbDrug.drugcode)};`);
        }
      }
    });

    lines.push(``);
    lines.push(`-- [STEP 3] เพิ่มยาสมุนไพรใหม่ที่ยังไม่มีใน รพ.สต. (ตัวอย่างคำสั่ง INSERT)`);
    herbAudit.items.forEach(h => {
      if (h.mappingStatus === 'new_to_import') {
        lines.push(`-- เพิ่มยาใหม่: ${h.tradeName} (TMT: ${h.tmt})`);
        lines.push(`-- INSERT INTO cdrug (drugcode, drugname, druggenericname, sell, cost, tmtcode, drugcode24, nationaccount, drugtype)`);
        lines.push(`-- VALUES ('${h.saraphiCode}', '${h.tradeName}', '${h.genericName}', ${h.price}, ${h.price}, '${h.tmt}', '${h.ndc24}', '1', '06');`);
      }
    });
  }

  lines.push(``);
  lines.push(`-- ========================================================================`);
  lines.push(`-- สิ้นสุดคำสั่ง SQL (รวมอัปเดต ${updateCount + herbUpdateCount} รายการ)`);
  lines.push(`-- ========================================================================`);

  return {
    backupTable,
    totalUpdates: updateCount + herbUpdateCount,
    sql: lines.join('\n')
  };
}

module.exports = {
  getAvailableFiles,
  saveAndProcessUploadedCatalogue,
  loadCatalogueData,
  auditPcuCatalogue,
  auditSaraphiHerbs,
  generateUpdateSql
};
