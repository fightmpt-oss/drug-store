const xlsx = require('xlsx');

// Normalize string for fuzzy header matching
function cleanKey(str) {
  if (!str) return '';
  return String(str).toLowerCase().replace(/[\s\-_.\/\(\)]/g, '');
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

function parseExcelBuffer(fileBuffer) {
  const workbook = xlsx.read(fileBuffer, { type: 'buffer', cellDates: false });

  // เลือกลำดับ Sheet ที่เหมาะสม: ให้ความสำคัญกับชีตที่มีชื่อ 'ยาคงเหลือ' หรือ 'เบิกยา' หรือ 'ใบเบิก' ก่อน
  let sheetName = workbook.SheetNames[0];
  for (const s of workbook.SheetNames) {
    const sLower = s.toLowerCase();
    if (sLower.includes('ยาคงเหลือ') || sLower.includes('เบิกยา') || sLower.includes('ใบเบิก') || sLower.includes('คลังยา') || sLower.includes('รับยา')) {
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

  // ค้นหาแถวที่เป็นหัวตาราง (หาคำสำคัญเช่น ชื่อยา, รายการยา, lot, tmt)
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rawRows.length, 12); i++) {
    const rowClean = rawRows[i].map(c => cleanKey(c));
    const hasDrugName = rowClean.some(c => c === 'ชื่อยา' || c.includes('drugname') || c.includes('รายการยา') || c === 'รายการ');
    const hasAmount = rowClean.some(c => c.includes('คงเหลือ') || c.includes('จำนวน') || c.includes('รวม') || c.includes('qty'));
    const hasLot = rowClean.some(c => c.includes('lot') || c.includes('ล็อต') || c.includes('เลขที่ผลิต'));
    const hasTmt = rowClean.some(c => c.includes('tmt') || c.includes('24') || c.includes('รหัส'));

    if (hasDrugName && (hasAmount || hasLot || hasTmt)) {
      headerRowIndex = i;
      break;
    }
  }

  const rawHeaders = rawRows[headerRowIndex];
  const colMap = {};

  rawHeaders.forEach((col, idx) => {
    const k = cleanKey(col);
    if (!k) return;

    if (k.includes('hosdrugcode') || k === 'hoscode' || k.includes('รหัสยาของรพ') || k.includes('รหัสรพ')) {
      colMap.hosdrugcode = idx;
    } else if (k.includes('tmtid') || k.includes('tmt') || k.includes('24หลัก') || k.includes('รหัสมาตรฐาน')) {
      colMap.tmtid = idx;
    } else if (k === 'ชื่อยา' || k.includes('drugname') || k.includes('รายการยา') || k.includes('ชื่อสามัญ')) {
      colMap.drugname = idx;
    } else if (k === 'ความแรง' || k.includes('strength')) {
      colMap.strength = idx;
    } else if (k === 'ชนิด' || k.includes('dosageform') || k === 'form' || k.includes('รูปแบบ')) {
      colMap.dosageform = idx;
    } else if (k === 'คงเหลือ' || k.includes('ยอดคงเหลือ') || k.includes('remaining')) {
      colMap.remaining = idx;
    } else if (k.includes('จำนวนกล่อง') || k.includes('กล่องคงเหลือ') || k.includes('boxremaining')) {
      colMap.boxRemaining = idx;
    } else if (k.includes('เม็ดต่อกล่อง') || k.includes('จำนวนเม็ด') || k.includes('packsize')) {
      colMap.packSize = idx;
    } else if (k === 'รวม' || k.includes('ยอดรวม') || k.includes('totalunits') || k === 'total') {
      colMap.totalUnits = idx;
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

    // คำนวณจำนวนรับเข้าสต็อก (หน่วยเม็ด/ขวด/แอมพูล)
    let amount = 0;

    // 1. ตรวจจากช่อง "รวม" (เช่น 200, 12000, 500)
    if (colMap.totalUnits !== undefined) {
      const t = parseFloat(String(row[colMap.totalUnits]).replace(/,/g, '')) || 0;
      if (t > 0) amount = t;
    }

    // 2. ตรวจจากช่อง "คงเหลือ" (สูตร 2*100 หรือตัวเลขเดี่ยว 10, 20 ของยาน้ำ/ยาฉีด)
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
      const b = parseFloat(String(row[colMap.boxRemaining]).replace(/,/g, '')) || 0;
      const p = parseFloat(String(row[colMap.packSize]).replace(/,/g, '')) || 0;
      if (b > 0 && p > 0) amount = b * p;
    }

    // 4. ตรวจจากช่องจำนวนทั่วไป
    if (amount === 0 && colMap.amount !== undefined) {
      amount = parseFloat(String(row[colMap.amount]).replace(/,/g, '')) || 0;
    }

    // กรองรายการที่ยอดเบิกเป็น 0 ออก (รายการที่ รพ.สต. ไม่ได้เบิกในงวดนี้)
    if (amount <= 0) continue;

    // คำนวณราคาทุนต่อหน่วยย่อย
    let packSize = 1;
    if (colMap.packSize !== undefined) {
      packSize = parseFloat(String(row[colMap.packSize]).replace(/,/g, '')) || 1;
      if (packSize <= 0) packSize = 1;
    }

    let cost = 0;
    if (colMap.pricePerBox !== undefined) {
      const boxPrice = parseFloat(String(row[colMap.pricePerBox]).replace(/,/g, '')) || 0;
      if (boxPrice > 0) {
        cost = Number((boxPrice / packSize).toFixed(4));
      }
    }
    if (cost === 0 && colMap.cost !== undefined) {
      cost = parseFloat(String(row[colMap.cost]).replace(/,/g, '')) || 0;
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
      cost
    });
  }

  return {
    sheetName,
    headerRow: headerRowIndex + 1,
    detectedColumns: colMap,
    totalRows: items.length,
    rowErrors,
    items
  };
}

module.exports = {
  parseExcelBuffer,
  parseExpiryDate
};
