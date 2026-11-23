const xlsx = require('xlsx');

// Normalize string for fuzzy header matching
function cleanKey(str) {
  if (!str) return '';
  return String(str).toLowerCase().replace(/[\s\-_.\/\(\)]/g, '');
}

const THAI_MONTHS_MAP = {
  'มค': 1, 'มกราคม': 1,
  'กพ': 2, 'กุมภาพันธ์': 2,
  'มีค': 3, 'มีนาคม': 3,
  'เมย': 4, 'เมษายน': 4,
  'พค': 5, 'พฤษภาคม': 5,
  'มิย': 6, 'มิถุนายน': 6,
  'กค': 7, 'กรกฎาคม': 7,
  'สค': 8, 'สิงหาคม': 8,
  'กย': 9, 'กันยายน': 9,
  'ตค': 10, 'ตุลาคม': 10,
  'พย': 11, 'พฤศจิกายน': 11,
  'ธค': 12, 'ธันวาคม': 12
};

// สกัดวันที่รับและชื่อ รพ.แม่ข่าย จากชื่อไฟล์และหัวตาราง (เช่น "ใบเบิกยาท่ากว้าง 2 พย 2569.xls")
function extractExcelMetadata(fileName = '', headerCells = []) {
  let receivedate = null;
  let supplier = '';
  let receiveno = '';

  const cleanFile = String(fileName || '').replace(/\./g, '');
  const thaiDateMatch = cleanFile.match(/(\d{1,2})\s*([ก-ฮ]{2,15})\s*(\d{2,4})/);
  if (thaiDateMatch) {
    const day = parseInt(thaiDateMatch[1], 10);
    const monKey = thaiDateMatch[2].replace(/\s+/g, '');
    const month = THAI_MONTHS_MAP[monKey];
    let year = parseInt(thaiDateMatch[3], 10);
    if (year < 100) year += 2500;
    if (year > 2400) year -= 543;
    if (month && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
      receivedate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  for (const h of headerCells) {
    const s = String(h || '').trim();
    const hospMatch = s.match(/รพ\.?\s*([ก-๙a-zA-Z0-9]+)/);
    if (hospMatch) {
      supplier = `รพ.${hospMatch[1]}`;
      break;
    }
  }

  if (receivedate) {
    const compactDate = receivedate.replace(/-/g, '');
    receiveno = supplier.includes('สารภี') ? `SARAPHI-${compactDate}` : `REC-${compactDate}`;
  }

  if (!receivedate && !supplier && !receiveno) return null;
  return { receivedate, supplier, receiveno };
}

// Robust Expiry Date parser handling Thai BE, AD, Excel serials (both AD & BE serials), and multiple string formats
function parseExpiryDate(val) {
  if (!val) return null;

  // 1. If it's a JavaScript Date instance
  if (val instanceof Date && !isNaN(val.getTime())) {
    let year = val.getFullYear();
    if (year > 2400) year -= 543;
    const yyyy = String(year).padStart(4, '0');
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // 2. If it's an Excel numeric serial date (e.g. 47242 or Thai BE serial 245601)
  if (typeof val === 'number') {
    try {
      const parsedDate = xlsx.SSF.parse_date_code(val);
      if (parsedDate && parsedDate.y && parsedDate.m && parsedDate.d) {
        let year = parsedDate.y;
        if (year > 2400) year -= 543; // Thai BE serial to CE
        const yyyy = String(year).padStart(4, '0');
        const mm = String(parsedDate.m).padStart(2, '0');
        const dd = String(parsedDate.d).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    } catch (e) {}
  }

  const str = String(val).trim();
  if (str === '0' || str === '-') return null;

  // 3. Format: DD/MM/YYYY or D/M/YYYY (e.g. 9/8/2570 or 09/08/2570)
  const dmyMatch = str.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
  if (dmyMatch) {
    let year = parseInt(dmyMatch[3], 10);
    if (year > 2400) year -= 543; // Thai BE to AD
    const month = String(parseInt(dmyMatch[2], 10)).padStart(2, '0');
    const day = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 4. Format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (isoMatch) {
    let year = parseInt(isoMatch[1], 10);
    if (year > 2400) year -= 543; // Thai BE to AD
    const month = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
    const day = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 5. Format: MM/YYYY (month/year only -> default to end of month)
  const myMatch = str.match(/^(\d{1,2})[-\/.](\d{4})/);
  if (myMatch) {
    let year = parseInt(myMatch[2], 10);
    if (year > 2400) year -= 543;
    const month = parseInt(myMatch[1], 10);
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  // Fallback try standard Date.parse
  const timestamp = Date.parse(str);
  if (!isNaN(timestamp)) {
    const d = new Date(timestamp);
    let year = d.getFullYear();
    if (year > 2400) year -= 543;
    return `${year}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  return null;
}

function isHeaderCandidateRow(row) {
  if (!Array.isArray(row)) return false;
  const rowClean = row.map(c => cleanKey(c));
  const hasDrugName = rowClean.some(c =>
    c === 'ชื่อยา' || c.includes('ชื่อยา') || c.includes('drugname') ||
    c.includes('รายการยา') || c === 'รายการ' || c === 'name1'
  );
  const hasAmount = rowClean.some(c =>
    c.includes('คงเหลือ') || c.includes('จำนวน') || c.includes('รวม') ||
    c.includes('qty') || c === 'amount1'
  );
  const hasLot = rowClean.some(c => c.includes('lot') || c.includes('ล็อต') || c.includes('เลขที่ผลิต'));
  const hasTmt = rowClean.some(c => c.includes('tmt') || c.includes('24') || c.includes('รหัส') || c === 'code1');
  return hasDrugName && (hasAmount || hasLot || hasTmt);
}

function parseExcelBuffer(fileBuffer, originalFileName = '') {
  const workbook = xlsx.read(fileBuffer, { type: 'buffer', cellDates: false });

  // เลือกลำดับ Sheet ที่เหมาะสม: ให้ความสำคัญกับใบจัดเวชภัณฑ์/ใบเบิก/รับยา
  let sheetName = workbook.SheetNames[0];
  for (const s of workbook.SheetNames) {
    const sLower = s.toLowerCase();
    if (
      sLower.includes('ใบจัดเวชภัณฑ์') ||
      sLower.includes('ใบจัด') ||
      sLower.includes('จ่ายยา') ||
      sLower.includes('ยาคงเหลือ') ||
      sLower.includes('เบิกยา') ||
      sLower.includes('ใบเบิก') ||
      sLower.includes('คลังยา') ||
      sLower.includes('รับยา')
    ) {
      sheetName = s;
      break;
    }
  }

  const worksheet = workbook.Sheets[sheetName];

  // Convert to 2D array of rows
  const rawRows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('ไม่พบข้อมูลในไฟล์ Excel');
  }

  // ค้นหาแถวที่เป็นหัวตาราง (รองรับหัวตาราง 2 บรรทัดแบบใบเบิก รพ.สารภี เช่น แถว 1 Eng + แถว 2 ไทย)
  let headerRowIndex = 0;
  let mergedHeaders = rawRows[0] || [];
  const rawHeaderTexts = [];

  for (let i = 0; i < Math.min(rawRows.length, 12); i++) {
    if (isHeaderCandidateRow(rawRows[i])) {
      if (i + 1 < rawRows.length && isHeaderCandidateRow(rawRows[i + 1])) {
        // หัวตารางแบบ 2 แถว: ใช้แถว 2 (ภาษาไทย) เป็นหลัก และเติมช่องที่ว่างจากแถว 1 (เช่น LotNo)
        const topRow = rawRows[i] || [];
        const subRow = rawRows[i + 1] || [];
        const maxCols = Math.max(topRow.length, subRow.length);
        const combined = [];
        for (let c = 0; c < maxCols; c++) {
          const subVal = String(subRow[c] || '').trim();
          const topVal = String(topRow[c] || '').trim();
          combined.push(subVal || topVal);
          if (subVal) rawHeaderTexts.push(subVal);
          if (topVal) rawHeaderTexts.push(topVal);
        }
        headerRowIndex = i + 1;
        mergedHeaders = combined;
      } else {
        headerRowIndex = i;
        mergedHeaders = rawRows[i] || [];
        mergedHeaders.forEach(h => { if (h) rawHeaderTexts.push(String(h).trim()); });
      }
      break;
    }
  }

  const colMap = {};

  mergedHeaders.forEach((col, idx) => {
    const k = cleanKey(col);
    if (!k) return;

    if (
      k.includes('hosdrugcode') || k === 'hoscode' || k.includes('รหัสยาของรพ') ||
      k.includes('รหัสรพ') || k.includes('รหัสเวชภัณฑ์') || k === 'code1'
    ) {
      colMap.hosdrugcode = idx;
    } else if (k.includes('tmtid') || k.includes('tmt') || k.includes('24หลัก') || k.includes('รหัสมาตรฐาน')) {
      colMap.tmtid = idx;
    } else if (
      k === 'ชื่อยา' || k === 'ชื่อยาเวชภัณฑ์' || k.includes('ชื่อยา') ||
      k.includes('drugname') || k.includes('รายการยา') || k.includes('ชื่อสามัญ') || k === 'name1'
    ) {
      colMap.drugname = idx;
    } else if (k === 'ความแรง' || k.includes('strength')) {
      colMap.strength = idx;
    } else if (k === 'ชนิด' || k.includes('dosageform') || k === 'form' || k.includes('รูปแบบ')) {
      colMap.dosageform = idx;
    } else if (
      k.includes('จำนวนจ่าย') || k.includes('จำนวนรับ') || k.includes('ยอดจ่าย') ||
      k.includes('จ่ายจริง') || k === 'amount1'
    ) {
      colMap.dispensedQty = idx;
    } else if (k === 'คงเหลือ' || k.includes('ยอดคงเหลือ') || k.includes('remaining') || k === 'remaine') {
      colMap.remaining = idx;
    } else if (k.includes('จำนวนกล่อง') || k.includes('กล่องคงเหลือ') || k.includes('boxremaining')) {
      colMap.boxRemaining = idx;
    } else if (
      k.includes('เม็ดต่อกล่อง') || k.includes('เม็ดต่อ') || k.includes('จำนวนเม็ด') ||
      k.includes('packsize') || k === 'minoflotpack'
    ) {
      colMap.packSize = idx;
    } else if (k === 'รวม' || k.includes('ยอดรวม') || k.includes('totalunits') || k === 'total') {
      colMap.totalUnits = idx;
    } else if (k === 'มูลค่า' || k === 'value' || k === 'มูลค่ารวม') {
      colMap.lineValue = idx;
    } else if (k === 'บริษัท' || k === 'vendorcode' || k === 'vendor') {
      colMap.vendor = idx;
    } else if (k.includes('lot') || k.includes('batch') || k.includes('เลขที่ผลิต') || k.includes('ล็อต')) {
      colMap.lot = idx;
    } else if (k.includes('exp') || k.includes('หมดอายุ') || k.includes('วันหมด')) {
      colMap.expdate = idx;
    } else if (k.includes('ราคาต่อกล่อง') || k.includes('ราคากล่อง')) {
      colMap.pricePerBox = idx;
    } else if (k.includes('cost') || k.includes('price') || k.includes('ราคา') || k.includes('ราคาทุน')) {
      colMap.cost = idx;
    } else if (k.includes('drugtype') || k.includes('ประเภทยา') || k.includes('หมวด')) {
      colMap.drugtype = idx;
    } else if (k.includes('amount') || k.includes('qty') || k.includes('quantity') || k.includes('จำนวน')) {
      if (colMap.amount === undefined) colMap.amount = idx;
    }
  });

  // สกัดข้อมูลรายการยา (ข้ามแถวยอดเบิกเป็น 0 เพื่อไม่ให้เข้าสต็อก 0 ชิ้น)
  const items = [];
  const MAX_ROWS = 20000;
  const rowErrors = [];

  for (let r = headerRowIndex + 1; r < rawRows.length && items.length < MAX_ROWS; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0 || row.every(cell => cell === '')) continue;

    const rawName = colMap.drugname !== undefined ? String(row[colMap.drugname] || '').trim() : '';
    const hosdrugcode = colMap.hosdrugcode !== undefined ? String(row[colMap.hosdrugcode] || '').trim() : '';
    const rawTmt = colMap.tmtid !== undefined ? String(row[colMap.tmtid] || '').trim() : '';
    const tmtid = rawTmt.replace(/[^0-9]/g, '');

    // ข้ามแถวหัวหมวด เช่น "ยาเม็ด", "ยาฉีด", "ยาน้ำ" หรือแถวว่าง
    if (!rawName && !hosdrugcode && !tmtid) continue;
    if (rawName.startsWith('***') || rawName.includes('ขอความกรุณา')) continue;

    // รวม ชื่อยา + ความแรง + ชนิด ให้เป็นชื่อมาตรฐาน (เช่น Acyclovir 400 mg tab)
    const strength = colMap.strength !== undefined ? String(row[colMap.strength] || '').trim() : '';
    const dosageform = colMap.dosageform !== undefined ? String(row[colMap.dosageform] || '').trim() : '';

    let drugname = rawName;
    if (strength && !drugname.toLowerCase().includes(strength.toLowerCase())) {
      drugname += ' ' + strength;
    }
    if (dosageform && !drugname.toLowerCase().includes(dosageform.toLowerCase())) {
      drugname += ' ' + dosageform;
    }
    drugname = drugname.replace(/\s+/g, ' ').trim();

    let packSize = 1;
    if (colMap.packSize !== undefined) {
      packSize = parseFloat(String(row[colMap.packSize] || '').replace(/,/g, '')) || 1;
      if (packSize <= 0) packSize = 1;
    }

    let pricePerPack = 0;
    if (colMap.pricePerBox !== undefined) {
      pricePerPack = parseFloat(String(row[colMap.pricePerBox] || '').replace(/,/g, '')) || 0;
    } else if (colMap.cost !== undefined) {
      pricePerPack = parseFloat(String(row[colMap.cost] || '').replace(/,/g, '')) || 0;
    }

    const lineValue = colMap.lineValue !== undefined
      ? (parseFloat(String(row[colMap.lineValue] || '').replace(/,/g, '')) || 0)
      : 0;
    const vendor = colMap.vendor !== undefined ? String(row[colMap.vendor] || '').trim() : '';

    let amount = 0;
    let cost = 0;
    let issuedQty = 0;

    if (colMap.dispensedQty !== undefined) {
      // ใบเบิก/ใบจัดเวชภัณฑ์ รพ.แม่ข่าย: ห้ามดึง colMap.remaining (เพราะเป็นยอดคงเหลือคลัง รพ.แม่ข่าย!)
      issuedQty = parseFloat(String(row[colMap.dispensedQty] || '').replace(/,/g, '')) || 0;
      if (issuedQty <= 0) continue;

      amount = issuedQty * packSize;
      cost = (packSize > 1 && pricePerPack > 0)
        ? Number((pricePerPack / packSize).toFixed(4))
        : pricePerPack;
    } else {
      // รูปแบบไฟล์มาตรฐาน/แบบนับคงเหลือเดิม
      // 1. ตรวจจากช่อง "รวม"
      if (colMap.totalUnits !== undefined) {
        const t = parseFloat(String(row[colMap.totalUnits] || '').replace(/,/g, '')) || 0;
        if (t > 0) amount = t;
      }

      // 2. ตรวจจากช่อง "คงเหลือ" (สูตร 2*100 หรือตัวเลขเดี่ยว)
      if (amount === 0 && colMap.remaining !== undefined) {
        const rem = String(row[colMap.remaining] || '').trim();
        if (rem.includes('*')) {
          const parts = rem.split('*').map(p => parseFloat(p.replace(/,/g, '')) || 0);
          if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
            amount = parts[0] * parts[1];
          }
        } else {
          const v = parseFloat(rem.replace(/,/g, '')) || 0;
          if (v > 0) amount = v;
        }
      }

      // 3. ตรวจจาก กล่องคงเหลือ * เม็ดต่อกล่อง
      if (amount === 0 && colMap.boxRemaining !== undefined && colMap.packSize !== undefined) {
        const b = parseFloat(String(row[colMap.boxRemaining] || '').replace(/,/g, '')) || 0;
        if (b > 0 && packSize > 0) amount = b * packSize;
      }

      // 4. ตรวจจากช่องจำนวนทั่วไป
      if (amount === 0 && colMap.amount !== undefined) {
        amount = parseFloat(String(row[colMap.amount] || '').replace(/,/g, '')) || 0;
      }

      if (amount <= 0) continue;

      if (colMap.pricePerBox !== undefined) {
        const boxPrice = parseFloat(String(row[colMap.pricePerBox] || '').replace(/,/g, '')) || 0;
        if (boxPrice > 0) cost = Number((boxPrice / packSize).toFixed(4));
      }
      if (cost === 0 && colMap.cost !== undefined) {
        cost = parseFloat(String(row[colMap.cost] || '').replace(/,/g, '')) || 0;
      }
    }

    let lot = colMap.lot !== undefined ? String(row[colMap.lot] || '').trim() : '';
    if (lot === '0') lot = '';

    const rawExp = colMap.expdate !== undefined ? row[colMap.expdate] : '';
    const expdate = parseExpiryDate(rawExp);
    if (rawExp && !expdate) {
      rowErrors.push({ rowIndex: r + 1, field: 'exp.date', value: String(rawExp), message: 'รูปแบบวันหมดอายุไม่ถูกต้อง' });
    }

    const drugtype = colMap.drugtype !== undefined ? String(row[colMap.drugtype] || '').trim() : (dosageform || 'ยา');

    items.push({
      rowIndex: r + 1,
      hosdrugcode,
      tmtid,
      drugname,
      drugtype,
      lot,
      expdate,
      amount,
      cost,
      issuedQty: issuedQty > 0 ? issuedQty : null,
      packSize,
      pricePerPack,
      lineValue: lineValue > 0 ? lineValue : (issuedQty > 0 ? Number((issuedQty * pricePerPack).toFixed(2)) : 0),
      countByPack: false,
      vendor
    });
  }

  const metadata = extractExcelMetadata(originalFileName, rawHeaderTexts);

  return {
    sheetName,
    headerRow: headerRowIndex + 1,
    detectedColumns: colMap,
    metadata,
    totalRows: items.length,
    rowErrors,
    items
  };
}

module.exports = {
  parseExcelBuffer,
  parseExpiryDate,
  extractExcelMetadata
};
