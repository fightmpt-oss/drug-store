const pdfParse = require('pdf-parse');
const { parseExpiryDate } = require('./excelParser');
const { getAllJhcisDrugs } = require('./matcherService');

const THAI_MONTHS = {
  'ม.ค.': 1, 'มกราคม': 1,
  'ก.พ.': 2, 'กุมภาพันธ์': 2,
  'มี.ค.': 3, 'มีนาคม': 3,
  'เม.ย.': 4, 'เมษายน': 4,
  'พ.ค.': 5, 'พฤษภาคม': 5,
  'มิ.ย.': 6, 'มิถุนายน': 6,
  'ก.ค.': 7, 'กรกฎาคม': 7,
  'ส.ค.': 8, 'สิงหาคม': 8,
  'ก.ย.': 9, 'กันยายน': 9,
  'ต.ค.': 10, 'ตุลาคม': 10,
  'พ.ย.': 11, 'พฤศจิกายน': 11,
  'ธ.ค.': 12, 'ธันวาคม': 12
};

function parseThaiDateString(str) {
  if (!str) return null;
  const s = String(str).trim();
  const std = parseExpiryDate(s);
  if (std) return std;

  // Match e.g. "18 ต.ค. 2569" or "18 ตุลาคม 2569" or "18 ต.ค. 69"
  for (const [mName, mNum] of Object.entries(THAI_MONTHS)) {
    const escaped = mName.replace(/\./g, '\\.');
    const re = new RegExp(`(\\d{1,2})\\s*${escaped}\\s*(\\d{2,4})`);
    const m = s.match(re);
    if (m) {
      const day = String(parseInt(m[1], 10)).padStart(2, '0');
      const month = String(mNum).padStart(2, '0');
      let year = parseInt(m[2], 10);
      if (year < 100) {
        year = year > 40 ? 2500 + year - 543 : 2000 + year;
      } else if (year > 2400) {
        year -= 543;
      }
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

/**
 * Extract receipt metadata (receiveno, receivedate, supplier) from PDF text
 */
function extractPdfMetadata(text) {
  const meta = {
    receiveno: '',
    receivedate: '',
    supplier: ''
  };

  if (!text) return meta;

  // 1. Receipt / Document number
  const docNoPatterns = [
    /(?:เลขที่ใบเบิก|เลขที่ใบส่งของ|เลขที่ใบนำส่ง|เลขที่เอกสาร|เลขที่ใบรับ|ใบเบิกเลขที่|เลขที่|No\.?|Document\s*No\.?)\s*[:：.]?\s*([A-Za-z0-9\-\/]{4,30})/i
  ];
  for (const re of docNoPatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      meta.receiveno = m[1].trim();
      break;
    }
  }

  // 2. Date
  const datePatterns = [
    /(?:วันที่เบิก|วันที่ส่ง|วันที่รับ|ลงวันที่|วันที่|Date)\s*[:：.]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    /(?:วันที่เบิก|วันที่ส่ง|วันที่รับ|ลงวันที่|วันที่|Date)\s*[:：.]?\s*(\d{1,2}\s+[^\s\d]{2,15}\s+\d{2,4})/i
  ];
  for (const re of datePatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const parsed = parseThaiDateString(m[1]);
      if (parsed) {
        meta.receivedate = parsed;
        break;
      }
    }
  }

  // 3. Supplier / Mother hospital
  const hospMatch = text.match(/(โรงพยาบาล[^\s\n\r]{2,40}|รพ\.[^\s\n\r]{2,40})/);
  if (hospMatch && hospMatch[1] && !hospMatch[1].includes('รพ.สต')) {
    meta.supplier = hospMatch[1].trim();
  }

  return meta;
}

/**
 * Parse lines of text from a PDF receipt into structured drug items
 */
async function parsePdfBuffer(fileBuffer) {
  let pdfData;
  try {
    pdfData = await pdfParse(fileBuffer);
  } catch (err) {
    throw new Error(`ไม่สามารถอ่านโครงสร้างไฟล์ PDF ได้: ${err.message}`);
  }

  const rawText = (pdfData && pdfData.text) ? String(pdfData.text) : '';
  const metadata = extractPdfMetadata(rawText);

  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Load JHCIS drugs to assist in recognizing drug names / codes inside free-form PDF table rows
  let jhcisDrugs = [];
  try {
    jhcisDrugs = await getAllJhcisDrugs();
  } catch (e) {}

  const items = [];
  const skipHeaderKeywords = /^(ลำดับ|รายการยา|ชื่อยา|จำนวน|หน่วย|ราคา|รวมเป็นเงิน|หมายเหตุ|ลงชื่อ|ผู้เบิก|ผู้จ่าย|ผู้อนุมัติ|ผู้รับของ|รวมทั้งสิ้น|หน้า\s*\d)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 4 || skipHeaderKeywords.test(line)) continue;

    // Extract 24-digit NDC or 6-7 digit TMT if present
    let tmtid = '';
    const ndc24Match = line.match(/\b(\d{24})\b/);
    if (ndc24Match) {
      tmtid = ndc24Match[1];
    } else {
      const tmtMatch = line.match(/\b(\d{6,7})\b/);
      if (tmtMatch) {
        tmtid = tmtMatch[1];
      }
    }

    // Extract expiry date (DD/MM/YYYY, YYYY-MM-DD, or Thai date)
    let expdate = null;
    let matchedDateRaw = '';
    const dateRegex = /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})\b/g;
    const dateMatches = [...line.matchAll(dateRegex)];
    if (dateMatches.length > 0) {
      // Pick the last date on the row as expiry date
      matchedDateRaw = dateMatches[dateMatches.length - 1][1];
      expdate = parseExpiryDate(matchedDateRaw);
    }
    if (!expdate) {
      const thaiDateMatch = line.match(/(\d{1,2}\s*(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*\d{2,4})/);
      if (thaiDateMatch) {
        matchedDateRaw = thaiDateMatch[1];
        expdate = parseThaiDateString(matchedDateRaw);
      }
    }

    // Extract Lot No.
    let lot = '';
    const lotExplicit = line.match(/(?:Lot(?:\s*No\.?)?|Batch|ล็อต|เลขที่ผลิต)\s*[:：.]?\s*([A-Za-z0-9\-_\/]{3,20})/i);
    if (lotExplicit) {
      lot = lotExplicit[1];
    } else {
      // Look for typical alphanumeric Lot token like LOT-xxx, A2401, etc.
      const lotTokens = line.match(/\b([A-Z]{1,4}[0-9]{3,12}[A-Z0-9\-]*|[0-9]{2}[A-Z]{1,3}[0-9]{2,8})\b/i);
      if (lotTokens && lotTokens[1] !== tmtid) {
        const candidate = lotTokens[1];
        // Avoid matching strength like 500mg, 10ml, 100s
        if (!/^\d+\s*(mg|ml|mcg|g|iu|tab|cap|amp|vial|box|bot)$/i.test(candidate)) {
          lot = candidate;
        }
      }
    }

    // Remove matched date, lot, and 24-digit code to isolate row index, drug code, drug name, quantity, and cost
    let working = line;
    if (matchedDateRaw) working = working.replace(matchedDateRaw, ' ');
    if (ndc24Match) working = working.replace(ndc24Match[1], ' ');
    if (lotExplicit) working = working.replace(lotExplicit[0], ' ');

    // Check if the line starts with a row number (e.g. "1 ", "1. ", "01 ") or hospital drug code
    let hosdrugcode = '';
    const leadingMatch = working.match(/^\s*(?:(\d{1,3})[\.\)\s]+)?([A-Za-z0-9\-]{4,15})\s+(.*)$/);
    let remainder = working;

    if (leadingMatch) {
      const possibleCode = leadingMatch[2];
      const restText = leadingMatch[3];
      // If possibleCode has digits and isn't a pure English word (like Paracetamol)
      if (/\d/.test(possibleCode) && !/^\d+(mg|ml|g|mcg)$/i.test(possibleCode)) {
        hosdrugcode = possibleCode;
        remainder = restText;
        if (!tmtid && /^\d{6,7}$/.test(hosdrugcode)) {
          tmtid = hosdrugcode;
        }
      } else {
        remainder = working.replace(/^\s*\d{1,3}[\.\)\s]+/, '');
      }
    } else {
      remainder = working.replace(/^\s*\d{1,3}[\.\)\s]+/, '');
    }

    // Look for trailing numbers (quantity, cost, total)
    // E.g. "Paracetamol 500 mg tab 1,000 เม็ด 0.35 350.00" or "Amoxicillin 500mg 500 1.20"
    const numberTokens = [...remainder.matchAll(/\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,4}))?\b/g)];

    // Filter out numbers that are clearly part of the drug strength (immediately followed by mg, ml, mcg, g, %, etc.)
    const tailNumbers = numberTokens.filter(m => {
      const after = remainder.slice(m.index + m[0].length).trim();
      if (/^(mg|ml|mcg|g|iu|%|เม็ด\/|แคปซูล\/|มก\.|มล\.)/i.test(after)) {
        return false;
      }
      // Must be in the second half of the line
      return m.index >= remainder.length * 0.25;
    });

    if (tailNumbers.length === 0) continue;

    let amount = 0;
    let cost = 0;
    let firstTailIndex = tailNumbers[0].index;

    const parsedNums = tailNumbers.map(m => ({
      val: parseFloat(m[0].replace(/,/g, '')),
      hasDecimal: m[2] !== undefined,
      index: m.index,
      raw: m[0]
    })).filter(n => Number.isFinite(n.val) && n.val > 0);

    if (parsedNums.length === 0) continue;

    if (parsedNums.length === 1) {
      amount = parsedNums[0].val;
    } else if (parsedNums.length === 2) {
      // Usually [amount, cost] or [amount, total]
      amount = parsedNums[0].val;
      cost = parsedNums[1].val;
    } else {
      // 3 or more numbers at the end: e.g. [packSize, amount, cost, total] or [amount, cost, total]
      // Find first integer-like quantity
      const intCandidate = parsedNums.find(n => !n.hasDecimal) || parsedNums[0];
      amount = intCandidate.val;
      const afterQty = parsedNums.filter(n => n.index > intCandidate.index);
      if (afterQty.length >= 1) {
        cost = afterQty[0].val;
      }
    }

    // Extract drugname from the part before the first tail number
    let drugname = remainder.slice(0, firstTailIndex).trim();
    // Clean trailing unit words or symbols
    drugname = drugname.replace(/[\-|:,]+$/, '').trim();

    // Must look like a valid drug name (at least 2 characters and contains letters or Thai characters)
    if (!drugname || drugname.length < 2 || !/[A-Za-zก-๙]/.test(drugname)) {
      continue;
    }

    // Skip summary/total lines
    if (/^(รวม|รวมเงิน|รวมมูลค่า|รวมทั้งสิ้น|ตัวอักษร|ผู้ส่ง|ผู้รับ|หมายเหตุ)/i.test(drugname)) {
      continue;
    }

    items.push({
      rowIndex: items.length + 1,
      hosdrugcode,
      tmtid,
      drugname,
      drugtype: 'ยา (จากไฟล์ PDF)',
      lot,
      expdate,
      amount,
      cost
    });
  }

  // Fallback: if line-by-line regex found 0 items, scan rawText against known JHCIS drug names
  if (items.length === 0 && jhcisDrugs.length > 0 && rawText.trim().length > 0) {
    const lowerText = rawText.toLowerCase();
    for (const d of jhcisDrugs) {
      const name = String(d.drugname || '').trim();
      if (name.length >= 4 && lowerText.includes(name.toLowerCase())) {
        items.push({
          rowIndex: items.length + 1,
          hosdrugcode: d.drugcode,
          tmtid: d.tmtcode || d.drugcode24 || '',
          drugname: name,
          drugtype: 'ยา (ตรวจพบจาก PDF)',
          lot: '',
          expdate: null,
          amount: 1,
          cost: Number(d.costprice || 0)
        });
      }
    }
  }

  return {
    sheetName: `PDF (${pdfData.numpages || 1} หน้า)`,
    numPages: pdfData.numpages || 1,
    rawText,
    metadata,
    totalRows: items.length,
    rowErrors: [],
    items
  };
}

module.exports = {
  parsePdfBuffer,
  extractPdfMetadata,
  parseThaiDateString
};
