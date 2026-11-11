// stockCardService.js — เครื่องยนต์บัญชีคุมยา (Stock Card Engine)
// หลักบัญชีใหม่ (แก้บั๊กรอบแรก):
//  1) ยอดยกมา (BF) ผูกกับ "วันที่ตรวจนับ" เสมอ
//     - นับ ณ C ที่อยู่ในช่วง [S,E]      → BF = ยอดนับ, นับเคลื่อนไหวเฉพาะ [C,E] (ไม่ซ้ำซ้อน)
//     - นับ ณ C ก่อน S                  → BF ที่ S = ยอดนับ − รับเข้า(S→C) + จ่ายออก(S→C) (คำนวณย้อนกลับ + แจ้งเตือน)
//     - นับ ณ C หลัง E                  → BF ที่ E = ยอดนับ − รับเข้า(E→C) + จ่ายออก(E→C) (คำนวณย้อนกลับ + แจ้งเตือน)
//     - ยังไม่เคยนับ                    → BF = 0 + เตือนว่ายังไม่ได้ตรวจนับ
//  2) ยอดคงเหลือ "แสดงติดลบได้" (ห้าม clamp เป็น 0) เพื่อให้เห็นความคลาดเคลื่อน
//  3) การรับเข้ามาจาก "ฐานข้อมูลของระบบเอง" (localdb/receipts.json) — ไม่แตะ jhcisdb
//     (เลือกใช้ drugstorereceive ของ JHCIS เพิ่มได้ผ่าน config.receiptSource = 'jhcis'|'local'|'both')
//  4) การจ่ายออกอ่านจาก visitdrug (read-only) แล้วกระจายออกตาม Lot ด้วยหลัก FEFO แบบคำนวณ
//  5) รายการปรับปรุง (ตัดจำหน่าย/โอนย้าย/คืนยา) นับเป็นธุรกรรมในบัญชีคุมด้วย

const { getPool, isLive, isDemo, memoryStore, getConfig, assertDataAvailable, getSchemaStatus } = require('../config/db');
const { getAllJhcisDrugs } = require('./matcherService');
const {
  getStockCounts, getStockCount, findReceipts, listAdjustments, itemDispenseUnits, getDrugSettings,
  listSubstockTransfers
} = require('./localStore');

function getDaysDiff(d1, d2 = new Date()) {
  const t1 = new Date(d1).getTime();
  const t2 = new Date(d2).getTime();
  if (isNaN(t1)) return 9999;
  return Math.ceil((t1 - t2) / (1000 * 60 * 60 * 24));
}

// ปีงบประมาณไทยปัจจุบัน: 1 ต.ค. N → 30 ก.ย. N+1 (คำนวณจากวันจริง ไม่ hardcode)
function currentFiscalYear(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m >= 10) return { startDate: `${y}-10-01`, endDate: `${y + 1}-09-30` };
  return { startDate: `${y - 1}-10-01`, endDate: `${y}-09-30` };
}

const JHCIS_DRUG_TYPES = {
  '01': { code: '01', name: 'ยาฯ (ยาแผนปัจจุบัน)', shortName: 'ยาแผนปัจจุบัน' },
  '02': { code: '02', name: 'ค่าบริการ/หัตถการ (ICD-9)', shortName: 'หัตถการ' },
  '03': { code: '03', name: 'วัสดุการแพทย์', shortName: 'วัสดุการแพทย์' },
  '04': { code: '04', name: 'เวชภัณฑ์คุมกำเนิด', shortName: 'คุมกำเนิด' },
  '05': { code: '05', name: 'วัคซีน', shortName: 'วัคซีน' },
  '06': { code: '06', name: 'บริการสร้างเสริมสุขภาพ (PP)', shortName: 'บริการ PP' },
  '07': { code: '07', name: 'ชันสูตร/แล็ป (Lab)', shortName: 'แล็ป' },
  '10': { code: '10', name: 'ยาสมุนไพร (แผนไทย)', shortName: 'ยาสมุนไพร' },
  '11': { code: '11', name: 'เวชภัณฑ์ที่ไม่ใช่ยา', shortName: 'เวชภัณฑ์มิใช่ยา' },
  '91': { code: '91', name: 'ยาในคลัง รพ.สต. (เบิก รพ.)', shortName: 'ยาคลัง รพ.สต.' }
};

function getJhcisSubtypeName(drugtype, drugtypesub) {
  if (!drugtypesub && drugtypesub !== 0) return '';
  const sub = String(drugtypesub).trim();
  if (!sub) return '';
  const type = String(drugtype || '').trim();

  // 02: หัตถการ (ตรงตาม Dropdown ของ JHCIS)
  if (type === '02') {
    if (sub === '1') return '1:ส่งเสริมทันตกรรม';
    if (sub === '2') return '2:รักษาทันตกรรม';
    if (sub === '3') return '3:หัตถการแผนปัจจุบัน';
    if (sub === '4') return '4:หัตถการ_แผนไทย';
    return `${sub}:หัตถการ`;
  }

  // 01: ยาแผนปัจจุบัน
  if (type === '01') {
    if (sub === '1') return '1:ยาใน รพ. องค์การฯ';
    if (sub === '2') return '2:ยาใน รพ. บริษัท';
    if (sub === '3') return '3:ยา รพ.สต.';
    if (sub === '8') return '8:บริการ/พิเศษ';
    return `${sub}:ยาแผนปัจจุบัน`;
  }

  // 10: ยาสมุนไพร (แผนไทย)
  if (type === '10') {
    if (sub === '11') return '11:ยาสมุนไพร';
    return `${sub}:ยาสมุนไพร`;
  }

  // 91: ยาคลัง รพ.สต.
  if (type === '91') {
    if (sub === '1') return '1:ยาใน รพ. องค์การฯ';
    if (sub === '2') return '2:ยาใน รพ. บริษัท';
    if (sub === '3') return '3:ยา รพ.สต.';
    if (sub === '4') return '4:หัตถการ_แผนไทย';
    if (sub === '8') return '8:หัตถการพิเศษ';
    if (sub === '11') return '11:ยาสมุนไพร';
    return `${sub}:ยาคลัง รพ.สต.`;
  }

  const fallback = {
    '1': '1:ยาใน รพ. องค์การฯ',
    '2': '2:ยาใน รพ. บริษัท',
    '3': '3:ยา รพ.สต.',
    '4': '4:หัตถการ_แผนไทย',
    '8': '8:หัตถการพิเศษ',
    '11': '11:ยาสมุนไพร'
  };
  return fallback[sub] || `${sub}`;
}

// ---------- แหล่งข้อมูลรับเข้า (ใบรับยาของระบบเอง) ----------
function localReceiptItems({ drugcode, startDate, endDate }) {
  const receipts = findReceipts({ drugcode, startDate, endDate });
  const rows = [];
  receipts.forEach(r => {
    r.items.forEach(it => {
      if (drugcode && it.drugcode !== drugcode) return;
      if (startDate && r.receivedate < startDate) return;
      if (endDate && r.receivedate > endDate) return;
      rows.push({
        receiveno: r.receiveno,
        receivedate: r.receivedate,
        supplier: r.supplier,
        drugcode: it.drugcode,
        lotno: it.lotno || '',
        dateexpire: it.dateexpire || null,
        amount: itemDispenseUnits(it), // แปลงเป็นหน่วยจ่ายจริงแล้ว (รองรับ pack)
        costprice: it.costprice || 0
      });
    });
  });
  return rows;
}

function jhcisReceiptItems({ drugcode, startDate, endDate }) {
  const cfg = getConfig();
  const source = cfg.receiptSource || 'local';
  if (!isLive()) return [];
  if (source === 'local') return [];
  // ใช้ตาราง drugstorereceive ของ JHCIS (ถ้ามี) — read-only
  if (getSchemaStatus().optionalMissing.includes('drugstorereceive')) return [];
  return null; // ผู้เรียกต้อง query เอง (async)
}

// ---------- แหล่งข้อมูลจ่ายออก: map ต่อ drugcode ต่อวัน ----------
async function fetchDispenseDayMap(startDate, endDate) {
  const map = {}; // { drugcode: { 'YYYY-MM-DD': units } }
  if (isLive()) {
    try {
      const pool = getPool();
      const [rows] = await pool.query(`
        SELECT drugcode, DATE(dateupdate) as d, SUM(unit) as units
        FROM visitdrug
        WHERE DATE(dateupdate) >= ? AND DATE(dateupdate) <= ?
        GROUP BY drugcode, DATE(dateupdate)
      `, [startDate, endDate]);
      rows.forEach(r => {
        const key = r.d ? new Date(r.d).toISOString().slice(0, 10) : null;
        if (!key) return;
        if (!map[r.drugcode]) map[r.drugcode] = {};
        map[r.drugcode][key] = (map[r.drugcode][key] || 0) + (Number(r.units) || 0);
      });
    } catch (err) {
      console.error('Error fetching live dispense map:', err.message);
      throw new Error(`อ่านข้อมูลการจ่ายยาจาก JHCIS ไม่สำเร็จ: ${err.message}`);
    }
  } else if (isDemo()) {
    memoryStore.dispensing.forEach(d => {
      if (d.date >= startDate && d.date <= endDate) {
        if (!map[d.drugcode]) map[d.drugcode] = {};
        map[d.drugcode][d.date] = (map[d.drugcode][d.date] || 0) + (Number(d.unit) || 0);
      }
    });
  }
  return map;
}

async function fetchJhcisReceiptRows(startDate, endDate) {
  const cfg = getConfig();
  if (!isLive()) return [];
  const source = cfg.receiptSource || 'local';
  if (source === 'local') return [];
  if (getSchemaStatus().optionalMissing.includes('drugstorereceive')) return [];
  try {
    const pool = getPool();
    const [rRows] = await pool.query(`
      SELECT r.receiveno, DATE(r.receivedate) as receivedate, r.companyname as supplier,
             d.drugcode, d.lotno, DATE(d.expiredate) as dateexpire, d.amount, d.cost as costprice
      FROM drugstorereceive r
      JOIN drugstorereceivedetail d ON r.receiveno = d.receiveno AND r.pcucode = d.pcucode
      WHERE DATE(r.receivedate) >= ? AND DATE(r.receivedate) <= ?
    `, [startDate, endDate]);
    return rRows.map(r => ({
      receiveno: r.receiveno,
      receivedate: r.receivedate ? new Date(r.receivedate).toISOString().slice(0, 10) : startDate,
      supplier: r.supplier,
      drugcode: r.drugcode,
      lotno: r.lotno || '',
      dateexpire: r.dateexpire ? new Date(r.dateexpire).toISOString().slice(0, 10) : null,
      amount: Number(r.amount) || 0,
      costprice: Number(r.costprice) || 0
    }));
  } catch (e) {
    console.warn('Error querying live drugstorereceive:', e.message);
    return [];
  }
}

// ---------- คำนวณยอดยกมาตามงวด (แก้บั๊กหลักของระบบเดิม) ----------
// dispenseMap[drugcode][date] = units, receiptRows = รับเข้าทั้งช่วง [S,E] (ของ drugcode)
function computeBroughtForward(count, startDate, endDate, dispenseDayMap, receiptRows) {
  // receiptRows ต้องครอบคลุมช่วงกว่ากว่า [S,E] เพื่อใช้ back-calc — ส่งมาเป็น [{date, amount}]
  const warnings = [];
  // นับเคลื่อนไหวในช่วง [from, to) — ขอบบนเป็น exclusive เพราะผลนับคือ snapshot "ต้นวัน" ของวัน to
  const sumRange = (from, to) => {
    let d = 0, r = 0;
    if (dispenseDayMap) {
      Object.keys(dispenseDayMap).forEach(day => {
        if ((!from || day >= from) && (!to || day < to)) d += dispenseDayMap[day];
      });
    }
    receiptRows.forEach(x => {
      if ((!from || x.receivedate >= from) && (!to || x.receivedate < to)) r += x.amount;
    });
    return { d, r };
  };

  if (!count || (Number(count.totalAmount) || 0) === 0 && !(count.lots || []).length) {
    warnings.push({
      code: 'NOT_COUNTED',
      message: 'ยังไม่มีผลตรวจนับสต็อกจริงของยาตัวนี้ — ยอดยกมาเริ่มต้นที่ 0 (ควรตรวจนับเพื่อให้บัญชีคุมถูกต้อง)'
    });
    return { bf: 0, bfDate: startDate, activityFrom: startDate, warnings, bfLots: [], derived: false };
  }

  const C = count.countDate;
  const counted = Number(count.totalAmount) || 0;

  if (C >= startDate && C <= endDate) {
    // นับอยู่ในช่วง: ยอดนับครอบคลุมทุกอย่างก่อน C → เคลื่อนไหวนับเฉพาะ [C,E]
    if (C > startDate) {
      warnings.push({
        code: 'ACTIVITY_BEFORE_COUNT_EXCLUDED',
        message: `การเคลื่อนไหวก่อนวันตรวจนับ (${C}) ไม่ถูกนำมาคำนวณ เพราะยอดยกมามาจากผลนับจริง ณ ${C} แล้ว`
      });
    }
    return { bf: counted, bfDate: C, activityFrom: C, warnings, bfLots: count.lots || [], derived: false };
  }

  if (C < startDate) {
    // นับก่อนช่วง → คำนวณย้อนกลับมาที่ startDate
    const { d, r } = sumRange(startDate, C);
    const bf = counted - r + d;
    warnings.push({
      code: 'OPENING_BALANCE_DERIVED',
      message: `ยอดยกมาต้นงวด (${startDate}) คำนวณย้อนกลับจากผลนับ ณ ${C}: ${counted.toLocaleString()} − รับเข้า ${r.toLocaleString()} + จ่ายออก ${d.toLocaleString()} = ${bf.toLocaleString()}. ควรตรวจนับยอดยกมาใหม่ในวันเริ่มงวด`
    });
    return { bf, bfDate: startDate, activityFrom: startDate, warnings, bfLots: count.lots || [], derived: true };
  }

  // C > endDate: นับหลังช่วง → คำนวณย้อนกลับมาที่ endDate
  const { d, r } = sumRange(endDate, C);
  const bf = counted - r + d;
  warnings.push({
    code: 'BALANCE_DERIVED_FROM_FUTURE_COUNT',
    message: `ยอดคงเหลือปลายงวด (${endDate}) คำนวณย้อนกลับจากผลนับ ณ ${C} (หลังสิ้นงวด)`
  });
  return { bf, bfDate: startDate, activityFrom: startDate, warnings, bfLots: count.lots || [], derived: true };
}

// ---------- FEFO: กระจายการจ่ายออก/ปรับปรุงลดออกจาก lot ที่หมดอายุก่อน ----------
function fefoRemainingLots(lotPool, totalOut, outByLot) {
  // lotPool: [{lotno, dateexpire, amount, costprice, source}]
  // outByLot: { lotno: qty } — ตัดเฉพาะ lot นั้นก่อน
  const lots = lotPool.map(l => ({ ...l, remaining: Number(l.amount) || 0 }));
  const sortFefo = (arr) => arr.slice().sort((a, b) => {
    const ea = a.dateexpire || '9999-12-31';
    const eb = b.dateexpire || '9999-12-31';
    if (ea !== eb) return ea < eb ? -1 : 1;
    return String(a.lotno).localeCompare(String(b.lotno));
  });

  let out = Number(totalOut) || 0;

  // 1) ตัดตาม lot ที่ระบุมา (รองรับหลายบรรทัดที่มีเลข lot เดียวกัน)
  Object.keys(outByLot || {}).forEach(lot => {
    let q = Number(outByLot[lot]) || 0;
    for (const target of lots) {
      if (q <= 0) break;
      if (target.lotno === lot && target.remaining > 0) {
        const cut = Math.min(target.remaining, q);
        target.remaining -= cut;
        q -= cut;
        out -= cut;
      }
    }
  });

  // 2) ที่เหลือตัด FEFO
  if (out > 0) {
    for (const l of sortFefo(lots)) {
      if (out <= 0) break;
      const cut = Math.min(l.remaining, out);
      l.remaining -= cut;
      out -= cut;
    }
  }
  return sortFefo(lots);
}

// รวมบรรทัด Lot ที่มีเลข Lot และวันหมดอายุตรงกันให้เป็นก้อนเดียว (เพื่อความชัดเจนตอนสแกน QR เบิกยาคลังใน)
function consolidateLots(lotsArr) {
  const map = new Map();
  (lotsArr || []).forEach(l => {
    const key = `${l.lotno || 'N/A'}__${l.dateexpire || ''}`;
    if (!map.has(key)) {
      map.set(key, {
        ...l,
        lotno: l.lotno || 'N/A',
        dateexpire: l.dateexpire || null,
        amount: Number(l.amount) || 0,
        remaining: Number(l.remaining) || 0
      });
    } else {
      const existing = map.get(key);
      existing.amount += Number(l.amount) || 0;
      existing.remaining += Number(l.remaining) || 0;
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    const ea = a.dateexpire || '9999-12-31';
    const eb = b.dateexpire || '9999-12-31';
    if (ea !== eb) return ea < eb ? -1 : 1;
    return String(a.lotno).localeCompare(String(b.lotno));
  });
}

// ---------- Stock Overview ----------
async function getDrugStockSummary(filters = {}) {
  assertDataAvailable('แดชบอร์ดสต็อกยา');
  const fy = currentFiscalYear();
  const {
    startDate = fy.startDate,
    endDate = fy.endDate,
    statusFilter = 'all',
    drugTypeFilter = 'all',
    drugFlagFilter = '1',
    search = '',
    page = 1,
    pageSize = 50,
    sortBy = 'default',
    sortOrder = 'asc',
    colFilters = {}
  } = filters;

  const drugs = await getAllJhcisDrugs();
  const today = new Date().toISOString().slice(0, 10);

  const dispenseMap = await fetchDispenseDayMap(startDate, endDate);
  const jhcisReceiptRows = await fetchJhcisReceiptRows(startDate, endDate);
  const counts = getStockCounts();
  const allAdjustments = listAdjustments({ startDate, endDate });
  const allSubstockTransfers = listSubstockTransfers({ startDate, endDate });
  const mappings = memoryStore.drugMappings || [];

  const drugMetrics = drugs.map(drug => {
    const code = drug.drugcode;
    const settings = getDrugSettings(code) || {};
    const warnings = [];
    const savedMap = mappings.find(m => String(m.jhcisdrugcode || m.matchedDrugCode || '').trim() === String(code).trim());

    const receiptRows = [
      ...localReceiptItems({ drugcode: code, startDate: '1970-01-01', endDate }), // ดึงทั้งหมดก่อน C (สำหรับ back-calc)
      ...jhcisReceiptRows.filter(r => r.drugcode === code)
    ];
    const dispenseDayMap = dispenseMap[code] || {};

    const bfInfo = computeBroughtForward(counts[code] || null, startDate, endDate, dispenseDayMap, receiptRows);
    warnings.push(...bfInfo.warnings);

    const activityFrom = bfInfo.activityFrom;

    // รับเข้าเฉพาะช่วงเคลื่อนไหวที่ถูกต้อง [activityFrom, endDate]
    const receiptRowsInWindow = receiptRows.filter(r => r.receivedate >= activityFrom && r.receivedate <= endDate);
    const totalReceived = receiptRowsInWindow.reduce((s, r) => s + r.amount, 0);

    // จ่ายออกเฉพาะ [activityFrom, endDate]
    let totalDispensed = 0;
    let lastDispenseDate = null;
    Object.keys(dispenseDayMap).forEach(day => {
      if (day >= activityFrom && day <= endDate) {
        totalDispensed += dispenseDayMap[day];
        if (!lastDispenseDate || day > lastDispenseDate) lastDispenseDate = day;
      }
    });

    // ปรับปรุงยอดในช่วง [activityFrom, endDate]
    const adjustments = allAdjustments.filter(a => a.drugcode === code && a.date >= activityFrom && a.date <= endDate);
    const adjIn = adjustments.filter(a => a.direction === 'in').reduce((s, a) => s + a.quantity, 0);
    const adjOut = adjustments.filter(a => a.direction === 'out').reduce((s, a) => s + a.quantity, 0);

    // การเบิกยาจากคลังยาในออกวางเคาน์เตอร์ (Sub-stock Transfers via QR Scan)
    const factor = Number(settings.conversionFactor) > 1 ? Number(settings.conversionFactor) : 1;
    const mainStoreUnit = settings.mainStoreUnit || (factor > 1 ? 'กระปุก' : drug.drugunit);
    const counterUnit = settings.counterUnit || drug.drugunit;

    const substockTransfers = allSubstockTransfers.filter(t => t.drugcode === code && t.date >= activityFrom && t.date <= endDate);
    // ยอดเบิกออกจากคลังยาใน (หน่วยคลังยาใน เช่น กระปุก 500g)
    const totalTransferredToCounter = substockTransfers.reduce((s, t) => s + t.amount, 0);

    // ยอดคงเหลือคลังยาใน (Main Store Balance) = ยกมา + รับเข้า + ปรับเพิ่ม - ปรับลด - เบิกออกวางเคาน์เตอร์ (หน่วย: กระปุก)
    const mainStoreBalance = bfInfo.bf + totalReceived + adjIn - adjOut - totalTransferredToCounter;

    // ยอดนำมาแบ่งบรรจุเข้าสู่หน้าเคาน์เตอร์ (แปลงเป็นหน่วยจ่ายผู้ป่วย เช่น 1 กระปุก = 50 ตลับ)
    const counterStockReceived = totalTransferredToCounter * factor;

    // ยอดคงเหลือหน้าเคาน์เตอร์ (Counter Stock Balance) = เบิกมาวางเคาน์เตอร์ - จ่ายผู้ป่วยจริงใน JHCIS (หน่วย: ตลับ)
    const counterBalance = counterStockReceived > 0 ? (counterStockReceived - totalDispensed) : (totalDispensed > 0 ? -totalDispensed : 0);

    // ยอดคงเหลือรวมสุทธิทั้ง รพ.สต. (Total PCU Balance) ในหน่วยจ่ายผู้ป่วย (ตลับ)
    const currentBalance = factor > 1
      ? ((mainStoreBalance * factor) + (counterStockReceived > 0 ? (counterStockReceived - totalDispensed) : -totalDispensed))
      : (bfInfo.bf + totalReceived - totalDispensed + adjIn - adjOut);

    // AMC ตามจำนวนวันจริงของช่วงเคลื่อนไหว
    const actualDays = Math.max(1, Math.round((new Date(endDate) - new Date(activityFrom)) / 86400000) + 1);
    const amc = Math.round((totalDispensed / actualDays) * 30.44);

    const dailyUsage = totalDispensed > 0 ? totalDispensed / actualDays : 0;
    const runwayDays = dailyUsage > 0 ? Math.round(currentBalance / dailyUsage) : (currentBalance > 0 ? 999 : 0);

    // ---------- Lot pool สำหรับ FEFO ----------
    const lotPool = [];
    // 1) จากยอดยกมาที่นับจริง (เฉพาะกรณีนับในช่วง — ถ้า derived จะไม่รู้ lot จริง จึงไม่แสดง lot ยกมา)
    if (!bfInfo.derived && bfInfo.bfLots && bfInfo.bfLots.length > 0) {
      bfInfo.bfLots.forEach(l => {
        const amt = Number(l.amount) || 0;
        if (amt > 0 || l.lotno) {
          lotPool.push({ lotno: l.lotno || 'LOT-COUNT', dateexpire: l.dateexpire || null, amount: amt, costprice: l.costprice || drug.costprice || 0, source: 'ยอดยกมา (ตรวจนับจริง)' });
        }
      });
    }
    // 2) จากใบรับเข้าในช่วง
    receiptRowsInWindow.forEach(r => {
      lotPool.push({ lotno: r.lotno || 'N/A', dateexpire: r.dateexpire || null, amount: r.amount, costprice: r.costprice || drug.costprice || 0, source: 'รับเข้า (ใบรับยาของระบบ)' });
    });

    const totalOut = totalDispensed + adjOut;
    const outByLot = {};
    adjustments.filter(a => a.direction === 'out' && a.lotno).forEach(a => {
      outByLot[a.lotno] = (outByLot[a.lotno] || 0) + a.quantity;
    });
    const activeLots = fefoRemainingLots(lotPool, totalOut, outByLot);

    // Lot คงเหลือเฉพาะใน "คลังยาใน (Main Store)" สำหรับสแกน QR เบิกยา
    const mainStoreOutByLot = { ...outByLot };
    substockTransfers.forEach(t => {
      if (t.lotno) {
        mainStoreOutByLot[t.lotno] = (mainStoreOutByLot[t.lotno] || 0) + t.amount;
      }
    });
    const mainStoreLots = consolidateLots(
      fefoRemainingLots(lotPool, totalTransferredToCounter + adjOut, mainStoreOutByLot)
    );

    // สถานะวันหมดอายุจาก "ยอดคงเหลือจริงต่อ lot"
    let nearestExpDays = 9999;
    let nearestExpDate = null;
    let hasExpiredLot = false, hasCriticalExpiryLot = false, hasNearExpiryLot = false, hasMissingExpiry = false;
    const lotsWithStatus = activeLots.map(lot => {
      let daysUntilExp;
      if (!lot.dateexpire) {
        daysUntilExp = 9999;
        if (lot.remaining > 0) hasMissingExpiry = true;
      } else {
        daysUntilExp = getDaysDiff(lot.dateexpire, today);
      }
      if (lot.remaining > 0 && lot.dateexpire && daysUntilExp < nearestExpDays) {
        nearestExpDays = daysUntilExp;
        nearestExpDate = lot.dateexpire;
      }
      if (lot.remaining > 0 && lot.dateexpire) {
        if (daysUntilExp <= 0) hasExpiredLot = true;
        else if (daysUntilExp <= 90) hasCriticalExpiryLot = true;
        else if (daysUntilExp <= 180) hasNearExpiryLot = true;
      }
      return {
        ...lot,
        daysUntilExp,
        isExpired: lot.remaining > 0 && lot.dateexpire && daysUntilExp <= 0,
        isCriticalNearExpiry: lot.remaining > 0 && lot.dateexpire && daysUntilExp > 0 && daysUntilExp <= 90,
        isWarningNearExpiry: lot.remaining > 0 && lot.dateexpire && daysUntilExp > 90 && daysUntilExp <= 180,
        missingExpiry: !lot.dateexpire
      };
    });

    // ---------- Status badges ----------
    const statuses = [];
    const minSetting = settings.minstock;
    const maxSetting = settings.maxstock;
    const minStock = minSetting !== undefined && minSetting !== null && minSetting !== '' ? Number(minSetting) : (Number(drug.minstock) || null);
    const maxStock = maxSetting !== undefined && maxSetting !== null && maxSetting !== '' ? Number(maxSetting) : (Number(drug.maxstock) || null);

    if (currentBalance < 0) {
      statuses.push({ code: 'NEGATIVE_STOCK', label: 'สต็อกติดลบ', detail: 'ยอดคงเหลือติดลบ (จ่ายมากกว่ายอดรับ/ยกมา)', color: 'rose', priority: 0 });
    }
    if (hasExpiredLot) {
      statuses.push({ code: 'EXPIRED', label: 'ยาหมดอายุ', detail: 'ยาหมดอายุแล้ว — ห้ามจ่าย ต้องตัดจำหน่าย', color: 'red', priority: 1 });
    }
    if (hasCriticalExpiryLot) {
      statuses.push({ code: 'CRITICAL_EXPIRY', label: 'หมดอายุ <3ด.', detail: 'ใกล้หมดอายุภายใน 3 เดือน', color: 'rose', priority: 2 });
    } else if (hasNearExpiryLot) {
      statuses.push({ code: 'NEAR_EXPIRY', label: 'หมดอายุ <6ด.', detail: 'ใกล้หมดอายุภายใน 6 เดือน', color: 'amber', priority: 3 });
    }
    if (hasMissingExpiry) {
      statuses.push({ code: 'MISSING_EXPIRY', label: 'ไม่ระบุวันหมด', detail: 'มี Lot ไม่ระบุวันหมดอายุ', color: 'slate', priority: 5 });
    }

    // ยาเหลือน้อย: ใช้ runway เสมอ (มีความหมายจริง) + เทียบ min เฉพาะเมื่อตั้งเกณฑ์ไว้
    const runwayForAlert = dailyUsage > 0 ? Math.round(currentBalance / dailyUsage) : (currentBalance > 0 ? 999 : 0);
    if (runwayForAlert >= 0 && runwayForAlert < 30 && (currentBalance > 0 || totalDispensed > 0)) {
      statuses.push({ code: 'LOW_STOCK', label: 'เสี่ยงขาด (<30วัน)', detail: 'ยาเหลือน้อย (พอใช้ < 30 วัน)', color: 'red', priority: 2 });
    } else if (minStock !== null && currentBalance <= minStock && currentBalance >= 0) {
      statuses.push({ code: 'LOW_STOCK', label: 'ต่ำกว่า Min', detail: `ยาเหลือน้อย (≤ เกณฑ์ต่ำสุด ${minStock.toLocaleString()})`, color: 'red', priority: 2 });
    } else if (minStock !== null && currentBalance <= minStock * 1.25 && currentBalance >= 0) {
      statuses.push({ code: 'REORDER_POINT', label: 'ใกล้จุดสั่งซื้อ', detail: 'ใกล้จุดสั่งซื้อยาเพิ่ม', color: 'yellow', priority: 4 });
    }

    const daysSinceLastDispense = lastDispenseDate ? getDaysDiff(today, lastDispenseDate) : 999;
    if (currentBalance > 0 && (totalDispensed === 0 || daysSinceLastDispense > 90)) {
      statuses.push({ code: 'DEAD_STOCK', label: 'ค้างสต็อก (>90วัน)', detail: 'ค้างสต็อก (ไม่เคลื่อนไหวเกิน 90 วัน)', color: 'purple', priority: 4 });
    }
    if (statuses.length === 0) {
      statuses.push({ code: 'NORMAL', label: 'สต็อกปกติ', detail: 'สต็อกปกติ พร้อมใช้งาน', color: 'emerald', priority: 6 });
    }
    statuses.sort((a, b) => a.priority - b.priority);

    const dtInfo = JHCIS_DRUG_TYPES[drug.drugtype] || {
      code: drug.drugtype || '-',
      name: drug.drugtype ? `ประเภท ${drug.drugtype}` : 'ไม่ระบุประเภท',
      shortName: drug.drugtype || 'ไม่ระบุ'
    };
    const isAntibiotic = drug.antibio === '1';
    const isDental = Boolean(drug.toothtype && drug.toothtype !== '');

    return {
      drugcode: drug.drugcode,
      drugname: drug.drugname,
      drugnamethai: drug.drugnamethai || '',
      drugflag: drug.drugflag ? String(drug.drugflag).trim() : '',
      drugflagLabel: drug.drugflag === '1' ? '1:ใช้ยา' : (drug.drugflag === '2' ? '2:ไม่ใช้' : 'ไม่ระบุ'),
      drugtype: drug.drugtype || '',
      drugtypeName: dtInfo.name,
      drugtypeShortName: dtInfo.shortName,
      drugtypesub: drug.drugtypesub || '',
      drugtypesubName: getJhcisSubtypeName(drug.drugtype, drug.drugtypesub),
      drugunit: drug.drugunit,
      unitpacking: drug.unitpacking,
      tmtcode: drug.tmtcode || '',
      drugcode24: drug.drugcode24 || '',
      didstandard: drug.didstandard,
      chargeitem: drug.chargeitem || '',
      chargeopdname: drug.chargeopdname || '',
      costprice: Number(drug.costprice) || 0,
      sellprice: Number(drug.sellprice) || 0,
      drugcaution: drug.drugcaution || '',
      antibio: drug.antibio || '2',
      isAntibiotic,
      toothtype: drug.toothtype || '',
      isDental,
      minstock: minStock,
      maxstock: maxStock,
      location: settings.location || drug.location || 'คลังยา',
      broughtForward: bfInfo.bf,
      bfDate: bfInfo.bfDate,
      bfDerived: bfInfo.derived,
      isCounted: Boolean(counts[code]),
      countedDetails: counts[code] || null,
      totalReceived,
      totalDispensed,
      adjustedIn: adjIn,
      adjustedOut: adjOut,
      totalTransferredToCounter,
      mainStoreBalance,
      mainStoreUnit,
      counterBalance,
      counterUnit,
      conversionFactor: factor,
      hasSubstockTransfers: totalTransferredToCounter > 0,
      currentBalance,
      hosdrugcode: savedMap?.hosdrugcode || receiptRowsInWindow[0]?.hosdrugcode || '',
      hospitalDrugName: savedMap?.hospitalDrugName || savedMap?.drugname || '',
      amc,
      runwayDays: runwayForAlert,
      lastDispenseDate,
      nearestExpDate,
      nearestExpDays,
      activeLots: lotsWithStatus,
      mainStoreLots,
      statuses,
      primaryStatus: statuses[0],
      warnings
    };
  });

  // ---------- Summary counts ----------
  const flagMatcher = d => {
    if (drugFlagFilter === '2') return d.drugflag === '2' || !d.drugflag;
    if (drugFlagFilter === 'all') return true;
    return d.drugflag === '1';
  };

  const summaryCounts = {
    totalDrugs: drugMetrics.length,
    activeDrugs: drugMetrics.filter(d => d.drugflag === '1').length,
    inactiveDrugs: drugMetrics.filter(d => d.drugflag === '2' || !d.drugflag).length,
    countedDrugs: drugMetrics.filter(d => d.isCounted && flagMatcher(d)).length,
    uncountedDrugs: drugMetrics.filter(d => !d.isCounted && flagMatcher(d)).length,
    modernDrugs: drugMetrics.filter(d => d.drugtype === '01' && flagMatcher(d)).length,
    procedureDrugs: drugMetrics.filter(d => d.drugtype === '02' && flagMatcher(d)).length,
    herbalDrugs: drugMetrics.filter(d => d.drugtype === '10' && flagMatcher(d)).length,
    vaccineDrugs: drugMetrics.filter(d => d.drugtype === '05' && flagMatcher(d)).length,
    contraceptiveDrugs: drugMetrics.filter(d => d.drugtype === '04' && flagMatcher(d)).length,
    materialDrugs: drugMetrics.filter(d => (d.drugtype === '03' || d.drugtype === '11') && flagMatcher(d)).length,
    serviceItems: drugMetrics.filter(d => (d.drugtype === '06' || d.drugtype === '07') && flagMatcher(d)).length,
    antibioticDrugs: drugMetrics.filter(d => d.isAntibiotic && flagMatcher(d)).length,
    dentalDrugs: drugMetrics.filter(d => d.isDental && flagMatcher(d)).length,
    lowStock: drugMetrics.filter(d => d.statuses.some(s => s.code === 'LOW_STOCK')).length,
    nearExpiry: drugMetrics.filter(d => d.statuses.some(s => s.code === 'CRITICAL_EXPIRY' || s.code === 'NEAR_EXPIRY')).length,
    expired: drugMetrics.filter(d => d.statuses.some(s => s.code === 'EXPIRED')).length,
    deadStock: drugMetrics.filter(d => d.statuses.some(s => s.code === 'DEAD_STOCK')).length,
    negativeStock: drugMetrics.filter(d => d.statuses.some(s => s.code === 'NEGATIVE_STOCK')).length,
    normal: drugMetrics.filter(d => d.statuses.some(s => s.code === 'NORMAL')).length
  };

  const drugTypeCounts = {};
  drugMetrics.forEach(d => {
    const t = d.drugtype || 'unknown';
    drugTypeCounts[t] = (drugTypeCounts[t] || 0) + 1;
  });

  const availableDrugTypes = [
    { code: 'all', name: 'ทุกประเภท (ทั้งหมด)', shortName: 'ทุกประเภท', count: drugMetrics.length },
    ...Object.keys(JHCIS_DRUG_TYPES).map(code => ({
      code,
      name: JHCIS_DRUG_TYPES[code].name,
      shortName: JHCIS_DRUG_TYPES[code].shortName,
      count: drugTypeCounts[code] || 0
    })).filter(t => t.count > 0)
  ];

  // ---------- Filters ----------
  let filtered = drugMetrics;

  if (drugFlagFilter && drugFlagFilter !== 'all') {
    if (drugFlagFilter === '1') filtered = filtered.filter(d => d.drugflag === '1');
    else if (drugFlagFilter === '2') filtered = filtered.filter(d => d.drugflag === '2' || !d.drugflag);
  }

  // รองรับทั้งแบบเดี่ยว, แบบ array, และแบบ comma-separated string เช่น "01,10"
  if (drugTypeFilter && drugTypeFilter !== 'all') {
    let types = [];
    if (Array.isArray(drugTypeFilter)) {
      types = drugTypeFilter.flatMap(t => String(t).split(',')).map(t => t.trim()).filter(Boolean);
    } else if (typeof drugTypeFilter === 'string') {
      types = drugTypeFilter.split(',').map(t => t.trim()).filter(Boolean);
    }

    if (types.length > 0 && !types.includes('all')) {
      const matchCat = (d, cat) => {
        if (cat === '01_10') return d.drugtype === '01' || d.drugtype === '10';
        if (cat === '03_11') return d.drugtype === '03' || d.drugtype === '11';
        if (cat === '02_07') return d.drugtype === '02' || d.drugtype === '07' || d.drugtype === '06';
        if (cat === 'antibio') return Boolean(d.isAntibiotic);
        if (cat === 'dental') return Boolean(d.isDental);
        return (d.drugtype || '') === cat;
      };

      filtered = filtered.filter(d => types.some(cat => matchCat(d, cat)));
    }
  }

  if (statusFilter && statusFilter !== 'all') {
    filtered = filtered.filter(d => {
      if (statusFilter === 'low_stock') return d.statuses.some(s => s.code === 'LOW_STOCK');
      if (statusFilter === 'near_expiry') return d.statuses.some(s => s.code === 'CRITICAL_EXPIRY' || s.code === 'NEAR_EXPIRY');
      if (statusFilter === 'expired') return d.statuses.some(s => s.code === 'EXPIRED');
      if (statusFilter === 'dead_stock') return d.statuses.some(s => s.code === 'DEAD_STOCK');
      if (statusFilter === 'negative') return d.statuses.some(s => s.code === 'NEGATIVE_STOCK');
      if (statusFilter === 'normal') return d.statuses.some(s => s.code === 'NORMAL');
      return true;
    });
  }

  if (search) {
    const s = search.toLowerCase().trim();
    filtered = filtered.filter(d =>
      (d.drugname && d.drugname.toLowerCase().includes(s)) ||
      (d.drugnamethai && d.drugnamethai.toLowerCase().includes(s)) ||
      (d.drugcode && d.drugcode.toLowerCase().includes(s)) ||
      (d.tmtcode && d.tmtcode.toLowerCase().includes(s)) ||
      (d.drugcode24 && d.drugcode24.toLowerCase().includes(s)) ||
      (d.chargeopdname && d.chargeopdname.toLowerCase().includes(s)) ||
      (d.drugcaution && d.drugcaution.toLowerCase().includes(s)) ||
      d.activeLots.some(l => (l.lotno || '').toLowerCase().includes(s))
    );
  }

  if (colFilters.drugcode) {
    const s = colFilters.drugcode.toLowerCase().trim();
    filtered = filtered.filter(d => d.drugcode.toLowerCase().includes(s));
  }
  if (colFilters.drugname) {
    const s = colFilters.drugname.toLowerCase().trim();
    filtered = filtered.filter(d =>
      (d.drugname && d.drugname.toLowerCase().includes(s)) ||
      (d.drugnamethai && d.drugnamethai.toLowerCase().includes(s))
    );
  }
  if (colFilters.drugtype) {
    const s = colFilters.drugtype.toLowerCase().trim();
    filtered = filtered.filter(d =>
      (d.drugtype && d.drugtype.toLowerCase().includes(s)) ||
      (d.drugtypeName && d.drugtypeName.toLowerCase().includes(s)) ||
      (d.drugtypeShortName && d.drugtypeShortName.toLowerCase().includes(s)) ||
      (d.drugtypesub && String(d.drugtypesub).toLowerCase().includes(s)) ||
      (d.drugtypesubName && d.drugtypesubName.toLowerCase().includes(s))
    );
  }
  if (colFilters.tmtcode) {
    const s = colFilters.tmtcode.toLowerCase().trim();
    filtered = filtered.filter(d => d.tmtcode && d.tmtcode.toLowerCase().includes(s));
  }
  if (colFilters.drugcode24) {
    const s = colFilters.drugcode24.toLowerCase().trim();
    filtered = filtered.filter(d =>
      (d.drugcode24 && d.drugcode24.toLowerCase().includes(s)) ||
      (d.didstandard && d.didstandard.toLowerCase().includes(s))
    );
  }
  if (colFilters.status && colFilters.status !== 'all') {
    const s = colFilters.status;
    if (s === 'low_stock') filtered = filtered.filter(d => d.statuses.some(st => st.code === 'LOW_STOCK'));
    else if (s === 'near_expiry') filtered = filtered.filter(d => d.statuses.some(st => st.code === 'CRITICAL_EXPIRY' || st.code === 'NEAR_EXPIRY'));
    else if (s === 'expired') filtered = filtered.filter(d => d.statuses.some(st => st.code === 'EXPIRED'));
    else if (s === 'dead_stock') filtered = filtered.filter(d => d.statuses.some(st => st.code === 'DEAD_STOCK'));
    else if (s === 'negative') filtered = filtered.filter(d => d.statuses.some(st => st.code === 'NEGATIVE_STOCK'));
    else if (s === 'normal') filtered = filtered.filter(d => d.statuses.some(st => st.code === 'NORMAL'));
  }
  if (colFilters.balance && colFilters.balance !== 'all') {
    if (colFilters.balance === 'in_stock') filtered = filtered.filter(d => d.currentBalance > 0);
    else if (colFilters.balance === 'out_of_stock') filtered = filtered.filter(d => d.currentBalance === 0);
    else if (colFilters.balance === 'negative') filtered = filtered.filter(d => d.currentBalance < 0);
  }
  if (colFilters.dispensed && colFilters.dispensed !== 'all') {
    if (colFilters.dispensed === 'has_dispensed') filtered = filtered.filter(d => d.totalDispensed > 0);
    else if (colFilters.dispensed === 'no_dispensed') filtered = filtered.filter(d => d.totalDispensed === 0);
  }
  if (colFilters.counted && colFilters.counted !== 'all') {
    if (colFilters.counted === 'counted') filtered = filtered.filter(d => d.isCounted);
    else if (colFilters.counted === 'uncounted') filtered = filtered.filter(d => !d.isCounted);
  }

  // ---------- Sorting ----------
  if (sortBy && sortBy !== 'default') {
    const mult = sortOrder === 'desc' ? -1 : 1;
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'drugcode': return mult * a.drugcode.localeCompare(b.drugcode, undefined, { numeric: true });
        case 'drugname': return mult * a.drugname.localeCompare(b.drugname, 'th');
        case 'drugtype': return mult * (a.drugtype || '').localeCompare(b.drugtype || '');
        case 'tmtcode': return mult * (a.tmtcode || '').localeCompare(b.tmtcode || '', undefined, { numeric: true });
        case 'drugcode24': return mult * (a.drugcode24 || a.didstandard || '').localeCompare(b.drugcode24 || b.didstandard || '');
        case 'broughtForward': return mult * (a.broughtForward - b.broughtForward);
        case 'totalReceived': return mult * (a.totalReceived - b.totalReceived);
        case 'totalDispensed': return mult * (a.totalDispensed - b.totalDispensed);
        case 'currentBalance': return mult * (a.currentBalance - b.currentBalance);
        case 'status': return mult * ((a.primaryStatus?.priority || 99) - (b.primaryStatus?.priority || 99));
        default: return 0;
      }
    });
  } else {
    filtered.sort((a, b) => {
      const aAlert = a.statuses.some(s => s.code === 'EXPIRED' || s.code === 'LOW_STOCK' || s.code === 'CRITICAL_EXPIRY' || s.code === 'NEGATIVE_STOCK');
      const bAlert = b.statuses.some(s => s.code === 'EXPIRED' || s.code === 'LOW_STOCK' || s.code === 'CRITICAL_EXPIRY' || s.code === 'NEGATIVE_STOCK');
      if (aAlert && !bAlert) return -1;
      if (!aAlert && bAlert) return 1;
      const aActive = (a.currentBalance !== 0 || a.totalDispensed > 0 || a.totalReceived > 0);
      const bActive = (b.currentBalance !== 0 || b.totalDispensed > 0 || b.totalReceived > 0);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      if (aActive && bActive && b.currentBalance !== a.currentBalance) {
        return b.currentBalance - a.currentBalance;
      }
      return a.drugname.localeCompare(b.drugname, 'th');
    });
  }

  const totalCount = filtered.length;
  const p = Math.max(1, Number(page) || 1);
  const ps = pageSize === 'all' ? totalCount : Math.min(2000, Math.max(1, Number(pageSize) || 50));
  const totalPages = Math.ceil(totalCount / ps) || 1;
  const pagedItems = pageSize === 'all' ? filtered : filtered.slice((p - 1) * ps, p * ps);

  const systemWarnings = [];
  if (summaryCounts.negativeStock > 0) {
    systemWarnings.push(`พบ ${summaryCounts.negativeStock} รายการที่ยอดคงเหลือติดลบ — ควรตรวจสอบการรับเข้า/นับสต็อกของรายการเหล่านั้น`);
  }
  if (summaryCounts.uncountedDrugs > 0) {
    systemWarnings.push(`ยังไม่ได้ตรวจนับสต็อก ${summaryCounts.uncountedDrugs} รายการ (ยอดยกมาเริ่มต้น 0)`);
  }

  return {
    summaryCounts,
    availableDrugTypes,
    dateRange: { startDate, endDate },
    fiscalYear: fy,
    warnings: systemWarnings,
    pagination: { page: p, pageSize: ps, totalCount, totalPages },
    items: pagedItems
  };
}

// ---------- Stock Card รายตัว (รองรับ 2 โหมด: คลังยาใน main_store & รวมทั้ง รพ.สต. total_pcu) ----------
async function getStockCardDetail(drugcode, startDate, endDate, mode = 'main_store') {
  assertDataAvailable('บัญชีคุมยา (Stock Card)');
  const fy = currentFiscalYear();
  const S = startDate || fy.startDate;
  const E = endDate || fy.endDate;
  if (new Date(S) > new Date(E)) {
    const err = new Error('ช่วงวันที่ไม่ถูกต้อง (วันเริ่มต้นมากกว่าวันสิ้นสุด)');
    err.status = 400;
    throw err;
  }

  const drugs = await getAllJhcisDrugs();
  const drug = drugs.find(d => d.drugcode === drugcode);
  if (!drug) {
    const err = new Error(`ไม่พบรหัสยา ${drugcode}`);
    err.status = 404;
    throw err;
  }

  const mappings = memoryStore.drugMappings || [];
  const savedMap = mappings.find(m => String(m.jhcisdrugcode || m.matchedDrugCode || '').trim() === String(drugcode).trim());

  const warnings = [];
  const baseTransactions = [];
  const counts = getStockCounts();
  const count = counts[drugcode] || null;
  const dispenseDayMap = (await fetchDispenseDayMap(S, E))[drugcode] || {};
  const receiptRowsAll = [
    ...localReceiptItems({ drugcode, startDate: '1970-01-01', endDate: E }),
    ...(await fetchJhcisReceiptRows(S, E)).filter(r => r.drugcode === drugcode)
  ];

  const bfInfo = computeBroughtForward(count, S, E, dispenseDayMap, receiptRowsAll);
  warnings.push(...bfInfo.warnings);
  const activityFrom = bfInfo.activityFrom;

  // 1) แถวยอดยกมา
  if (!bfInfo.derived && bfInfo.bfLots && bfInfo.bfLots.length > 0) {
    bfInfo.bfLots.forEach((l, idx) => {
      const lotAmt = Number(l.amount) || 0;
      baseTransactions.push({
        date: count.countDate,
        type: 'BROUGHT_FORWARD',
        typeLabel: bfInfo.bfLots.length > 1 ? `ยอดยกมา Lot ${idx + 1}/${bfInfo.bfLots.length} (ตรวจนับจริง)` : 'ยอดยกมา (ตรวจนับจริง)',
        docNo: 'PHYSICAL-COUNT',
        description: `ยอดยกมาจากการตรวจนับจริง ณ คลังยา - รุ่น ${l.lotno || '-'} (${count.countedBy || 'จนท.คลังยา'}${l.remark ? ' - ' + l.remark : ''})`,
        lotno: l.lotno || '-',
        dateexpire: l.dateexpire || '-',
        in: lotAmt,
        out: 0
      });
    });
  } else {
    baseTransactions.push({
      date: bfInfo.bfDate,
      type: 'BROUGHT_FORWARD',
      typeLabel: bfInfo.derived ? 'ยอดยกมาต้นงวด (คำนวณย้อนกลับ)' : 'ยอดยกมาเริ่มต้น (ยังไม่ได้นับ)',
      docNo: bfInfo.derived ? 'DERIVED' : '-',
      description: bfInfo.derived
        ? `ยอดยกมาคำนวณจากผลตรวจนับ ณ ${count.countDate} ปรับด้วยการเคลื่อนไหวในช่วงก่อนหน้า`
        : 'ยังไม่มีผลตรวจนับจริง — ยอดยกมาเริ่มต้นที่ 0',
      lotno: '-',
      dateexpire: '-',
      in: Math.max(0, bfInfo.bf),
      out: bfInfo.bf < 0 ? Math.abs(bfInfo.bf) : 0
    });
  }

  // 2) รับเข้า (จากใบรับยาของระบบ)
  const receiptRowsInWindow = receiptRowsAll.filter(r => r.receivedate >= activityFrom && r.receivedate <= E);
  const totalReceived = receiptRowsInWindow.reduce((s, r) => s + r.amount, 0);
  receiptRowsInWindow
    .sort((a, b) => a.receivedate.localeCompare(b.receivedate))
    .forEach(item => {
      baseTransactions.push({
        date: item.receivedate,
        type: 'RECEIVE',
        typeLabel: 'รับเข้า (จาก รพ.)',
        docNo: item.receiveno,
        description: `ใบส่งมอบยาจาก ${item.supplier || 'รพ.แม่ข่าย'}`,
        lotno: item.lotno || '-',
        dateexpire: item.dateexpire || 'ไม่ระบุ',
        costprice: item.costprice,
        in: item.amount,
        out: 0
      });
    });

  // 3) ปรับปรุงยอด (ตัดจำหน่าย/โอนย้าย/คืนยา)
  const adjustmentsInWindow = listAdjustments({ drugcode, startDate: activityFrom, endDate: E });
  adjustmentsInWindow
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(a => {
      baseTransactions.push({
        date: a.date,
        type: 'ADJUSTMENT',
        typeLabel: a.categoryLabel,
        docNo: a.docNo || a.id.slice(0, 8),
        description: a.reason || a.categoryLabel,
        lotno: a.lotno || '-',
        dateexpire: a.dateexpire || '-',
        in: a.direction === 'in' ? a.quantity : 0,
        out: a.direction === 'out' ? a.quantity : 0
      });
    });

  // 4A) รายการเบิกออกจากคลังยาในไปวางหน้าเคาน์เตอร์ (SUBSTOCK_OUT)
  const substockTransfers = listSubstockTransfers({ drugcode, startDate: activityFrom, endDate: E });
  const totalTransferredToCounter = substockTransfers.reduce((s, t) => s + t.amount, 0);
  const substockTxRows = substockTransfers
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(t => ({
      date: t.date,
      type: 'SUBSTOCK_OUT',
      typeLabel: 'เบิกไปเคาน์เตอร์ (QR)',
      docNo: t.transferNo || 'SUBSTOCK',
      description: `${t.note || 'เบิกยาจากคลังยาในไปจุดจ่ายยาหน้าเคาน์เตอร์'} (โดย ${t.dispensedBy || 'จนท.'})`,
      lotno: t.lotno || '-',
      dateexpire: t.dateexpire || '-',
      in: 0,
      out: t.amount
    }));

  // 4B) รายการจ่ายออกให้ผู้ป่วยจริงใน JHCIS (DISPENSE)
  const dispenseTxRows = [];
  let totalDispensed = 0;
  Object.keys(dispenseDayMap).sort().forEach(day => {
    if (day >= activityFrom && day <= E) {
      totalDispensed += dispenseDayMap[day];
      dispenseTxRows.push({
        date: day,
        type: 'DISPENSE',
        typeLabel: 'จ่ายออก (JHCIS)',
        docNo: 'visitdrug',
        description: 'จ่ายยาให้ผู้ป่วยตามบันทึก JHCIS (ตัดสต็อกแบบ FEFO คำนวณ)',
        lotno: 'FEFO',
        dateexpire: '-',
        in: 0,
        out: dispenseDayMap[day]
      });
    }
  });

  const typeOrder = { BROUGHT_FORWARD: 0, RECEIVE: 1, ADJUSTMENT: 2, SUBSTOCK_OUT: 3, DISPENSE: 4 };
  const buildRunningLedger = (rows) => {
    const cloned = rows.map(r => ({ ...r })).sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (typeOrder[a.type] || 9) - (typeOrder[b.type] || 9);
    });
    let bal = 0;
    cloned.forEach(tx => {
      bal = bal + (tx.in || 0) - (tx.out || 0);
      tx.balance = bal;
      if (bal < 0) tx.negative = true;
    });
    return { ledger: cloned, finalBalance: bal };
  };

  const settings = getDrugSettings(drugcode) || {};
  const factor = Number(settings.conversionFactor) > 1 ? Number(settings.conversionFactor) : 1;
  const mainStoreUnit = settings.mainStoreUnit || (factor > 1 ? 'กระปุก' : drug.drugunit);
  const counterUnit = settings.counterUnit || drug.drugunit;

  const totalPcuBaseTransactions = factor > 1
    ? baseTransactions.map(tx => {
        const copy = { ...tx };
        if (copy.in) copy.in = copy.in * factor;
        if (copy.out) copy.out = copy.out * factor;
        if (copy.type === 'BROUGHT_FORWARD') {
          copy.description = `${copy.description} (${tx.in} ${mainStoreUnit} × ${factor} = ${copy.in} ${counterUnit})`;
        } else if (copy.type === 'RECEIVE') {
          copy.description = `${copy.description} (${tx.in} ${mainStoreUnit} × ${factor} = ${copy.in} ${counterUnit})`;
        }
        return copy;
      })
    : baseTransactions;

  // สร้างทั้ง 2 บัญชีคุมยา (1. คลังยาใน ตัดตามการสแกน QR เบิกออก / 2. รวมทั้ง รพ.สต. ตัดตาม JHCIS)
  const mainStoreResult = buildRunningLedger([...baseTransactions, ...substockTxRows]);
  const totalPcuResult = buildRunningLedger([...totalPcuBaseTransactions, ...dispenseTxRows]);

  // ---------- Lots summary (ทั้งแบบคลังยาใน และแบบรวมทั้ง รพ.สต.) ----------
  const lotPool = [];
  if (!bfInfo.derived && bfInfo.bfLots && bfInfo.bfLots.length > 0) {
    bfInfo.bfLots.forEach(cl => {
      if (Number(cl.amount) > 0 || cl.lotno) {
        lotPool.push({ lotno: cl.lotno || 'N/A', dateexpire: cl.dateexpire || null, amount: Number(cl.amount) || 0, costprice: cl.costprice !== undefined ? cl.costprice : (Number(drug.costprice) || 0), source: 'ยอดยกมา (ตรวจนับจริง)' });
      }
    });
  }
  receiptRowsInWindow.forEach(t => {
    lotPool.push({ lotno: t.lotno || 'N/A', dateexpire: t.dateexpire || null, amount: t.amount, costprice: t.costprice, source: 'รับเข้าจาก รพ.' });
  });

  const adjOutByLot = {};
  let adjOutTotal = 0;
  adjustmentsInWindow.filter(a => a.direction === 'out').forEach(a => {
    if (a.lotno) adjOutByLot[a.lotno] = (adjOutByLot[a.lotno] || 0) + a.quantity;
    adjOutTotal += a.quantity;
  });

  const mainStoreOutByLot = { ...adjOutByLot };
  substockTransfers.forEach(t => {
    if (t.lotno) mainStoreOutByLot[t.lotno] = (mainStoreOutByLot[t.lotno] || 0) + t.amount;
  });

  const mainStoreLotsSummary = consolidateLots(
    fefoRemainingLots(lotPool, totalTransferredToCounter + adjOutTotal, mainStoreOutByLot)
  ).map(l => ({
    lotno: l.lotno,
    dateexpire: l.dateexpire || 'ไม่ระบุ',
    receivedDate: l.source === 'ยอดยกมา (ตรวจนับจริง)' ? (count ? count.countDate : activityFrom) : undefined,
    amount: l.amount,
    remaining: l.remaining,
    costprice: l.costprice,
    source: l.source
  }));

  const totalPcuLotPool = factor > 1
    ? lotPool.map(l => ({ ...l, amount: (Number(l.amount) || 0) * factor }))
    : lotPool;

  const totalPcuLotsSummary = consolidateLots(
    fefoRemainingLots(totalPcuLotPool, totalDispensed + (adjOutTotal * factor), adjOutByLot)
  ).map(l => ({
    lotno: l.lotno,
    dateexpire: l.dateexpire || 'ไม่ระบุ',
    receivedDate: l.source === 'ยอดยกมา (ตรวจนับจริง)' ? (count ? count.countDate : activityFrom) : undefined,
    amount: l.amount,
    remaining: l.remaining,
    costprice: l.costprice,
    source: l.source
  }));

  const counterReceived = totalTransferredToCounter * factor;
  const counterBalance = counterReceived > 0
    ? (counterReceived - totalDispensed)
    : (totalDispensed > 0 ? -totalDispensed : 0);

  const hybridSummary = {
    broughtForward: bfInfo.bf,
    totalReceived,
    totalTransferredToCounter,
    mainStoreBalance: mainStoreResult.finalBalance,
    mainStoreUnit,
    totalDispensed,
    counterBalance,
    counterUnit,
    conversionFactor: factor,
    totalPcuBalance: factor > 1
      ? ((mainStoreResult.finalBalance * factor) + (counterReceived > 0 ? (counterReceived - totalDispensed) : -totalDispensed))
      : totalPcuResult.finalBalance,
    hasSubstockTransfers: totalTransferredToCounter > 0
  };

  const useMainStore = mode === 'main_store';
  const activeTransactions = useMainStore ? mainStoreResult.ledger : totalPcuResult.ledger;
  const activeLotsSummary = useMainStore ? mainStoreLotsSummary : totalPcuLotsSummary;
  const activeBalance = useMainStore ? mainStoreResult.finalBalance : hybridSummary.totalPcuBalance;

  if (activeBalance < 0) {
    warnings.push({
      code: 'NEGATIVE_END_BALANCE',
      message: `ยอดคงเหลือปลายงวดติดลบ (${activeBalance.toLocaleString()}) — ควรตรวจสอบการรับเข้า/นับสต็อก หรือการเบิกยา`
    });
  }

  return {
    drug: {
      ...drug,
      conversionFactor: factor,
      mainStoreUnit,
      counterUnit,
      conversionNote: settings.note || (factor > 1 ? `1 ${mainStoreUnit} = ${factor} ${counterUnit}` : ''),
      hosdrugcode: savedMap?.hosdrugcode || receiptRowsInWindow[0]?.hosdrugcode || '',
      hospitalDrugName: savedMap?.hospitalDrugName || savedMap?.drugname || ''
    },
    fiscalYear: fy,
    dateRange: { startDate: S, endDate: E, activityFrom },
    mode: useMainStore ? 'main_store' : 'total_pcu',
    currentBalance: activeBalance,
    hybridSummary,
    warnings,
    transactions: activeTransactions,
    lotsSummary: activeLotsSummary,
    mainStoreTransactions: mainStoreResult.ledger,
    mainStoreLotsSummary,
    totalPcuTransactions: totalPcuResult.ledger,
    totalPcuLotsSummary,
    substockTransfers
  };
}

// ---------- ดึงข้อมูลยาและ Lot คงเหลือในคลังยาใน สำหรับหน้าสแกน QR Code เบิกยาไปเคาน์เตอร์ ----------
async function getDrugSubstockInfo(codeOrQr, startDate, endDate) {
  assertDataAvailable('ระบบสแกน QR เบิกยาคลังใน');
  const raw = String(codeOrQr || '').trim();
  if (!raw) {
    const err = new Error('กรุณาระบุรหัสยาหรือสแกน QR Code');
    err.status = 400;
    throw err;
  }

  // รองรับทั้งรูปแบบ JHCIS-DRUG:422, URL ที่มี ?scan=422 หรือ ?drug=422, รหัสยา JHCIS, หรือรหัสยา รพ. (hosdrugcode)
  let cleanCode = raw;
  if (cleanCode.startsWith('JHCIS-DRUG:')) {
    cleanCode = cleanCode.replace('JHCIS-DRUG:', '').trim();
  } else if (cleanCode.includes('scan=') || cleanCode.includes('drug=')) {
    try {
      const u = new URL(cleanCode, 'http://localhost');
      cleanCode = u.searchParams.get('scan') || u.searchParams.get('drug') || cleanCode;
      if (cleanCode.startsWith('JHCIS-DRUG:')) {
        cleanCode = cleanCode.replace('JHCIS-DRUG:', '').trim();
      }
    } catch (e) {}
  }

  const drugs = await getAllJhcisDrugs();
  const mappings = memoryStore.drugMappings || [];

  // 1. ค้นหาจาก drugcode ใน JHCIS
  let targetDrug = drugs.find(d => String(d.drugcode).trim().toLowerCase() === cleanCode.toLowerCase());

  // 2. ถ้าไม่พบ ให้ค้นหาจาก hosdrugcode หรือชื่อยาในตาราง mapping
  if (!targetDrug) {
    const mapHit = mappings.find(m =>
      (m.hosdrugcode && m.hosdrugcode.toLowerCase() === cleanCode.toLowerCase()) ||
      (m.hospitalDrugName && m.hospitalDrugName.toLowerCase() === cleanCode.toLowerCase())
    );
    if (mapHit) {
      const jCode = String(mapHit.jhcisdrugcode || mapHit.matchedDrugCode || '').trim();
      targetDrug = drugs.find(d => String(d.drugcode).trim().toLowerCase() === jCode.toLowerCase());
    }
  }

  // 3. ค้นหาจากรหัส TMT หรือ 24 หลัก
  if (!targetDrug) {
    targetDrug = drugs.find(d =>
      (d.tmtcode && String(d.tmtcode).trim() === cleanCode) ||
      (d.didstandard && String(d.didstandard).trim() === cleanCode)
    );
  }

  if (!targetDrug) {
    const err = new Error(`ไม่พบรายการยาจากรหัส "${cleanCode}" ในทะเบียน JHCIS`);
    err.status = 404;
    throw err;
  }

  const card = await getStockCardDetail(targetDrug.drugcode, startDate, endDate, 'main_store');
  const QRCode = require('qrcode');
  const qrPayload = `JHCIS-DRUG:${targetDrug.drugcode}`;
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 220, margin: 1 });
  } catch (e) {}

  return {
    drug: card.drug,
    qrPayload,
    qrDataUrl,
    dateRange: card.dateRange,
    hybridSummary: card.hybridSummary,
    mainStoreLots: card.mainStoreLotsSummary,
    recentTransfers: card.substockTransfers.slice(0, 20)
  };
}

// ---------- ประวัติจ่ายยาต่อผู้ป่วย (PDPA: mask ฝั่ง server เสมอ ยกเว้น reveal ที่มีเหตุผล) ----------
async function getDrugDispensingHistory(drugcode, options = {}) {
  assertDataAvailable('ประวัติการจ่ายยาให้ผู้ป่วย');
  const { maskPatientName, maskCid, maskPid, PDPA_POLICY } = require('./pdpaAuditService');
  const fy = currentFiscalYear();
  const {
    startDate = fy.startDate,
    endDate = fy.endDate,
    search = '',
    limit = 100,
    reveal = false
  } = options;
  const cappedLimit = Math.min(500, Math.max(1, Number(limit) || 100));

  const drugs = await getAllJhcisDrugs();
  const drug = drugs.find(d => d.drugcode === drugcode) || { drugcode, drugname: 'ยา', drugunit: 'หน่วย' };

  if (isLive()) {
    try {
      const pool = getPool();
      const [aggRows] = await pool.query(`
        SELECT COUNT(DISTINCT v.pid) as distinctPatients,
               COUNT(vd.visitno) as totalVisits,
               COALESCE(SUM(vd.unit), 0) as totalUnits
        FROM visitdrug vd
        JOIN visit v ON vd.visitno = v.visitno
        WHERE vd.drugcode = ? AND DATE(vd.dateupdate) >= ? AND DATE(vd.dateupdate) <= ?
      `, [drugcode, startDate, endDate]);

      const distinctPatients = Number(aggRows[0]?.distinctPatients) || 0;
      const totalUnits = Number(aggRows[0]?.totalUnits) || 0;
      const totalVisits = Number(aggRows[0]?.totalVisits) || 0;

      let query = `
        SELECT vd.visitno, vd.drugcode, cdrug.drugname, vd.unit,
               COALESCE(u.unitsellname, cdrug.unitsell, 'หน่วย') as drugunit,
               vd.costprice, vd.dose,
               COALESCE(DATE_FORMAT(vd.dateupdate, '%Y-%m-%d'), DATE_FORMAT(v.visitdate, '%Y-%m-%d')) as dispensedate,
               COALESCE(DATE_FORMAT(vd.dateupdate, '%H:%i:%s'), v.timestart, '') as dispensetime,
               COALESCE(DATE_FORMAT(vd.dateupdate, '%Y-%m-%d %H:%i:%s'), '') as dateupdate,
               v.pid, p.fname, p.lname, p.idcard, p.birth, p.sex,
               ct.titlename,
               vdiag.diagcode, cd.diseasename, cd.diseasenamethai
        FROM visitdrug vd
        JOIN cdrug ON vd.drugcode = cdrug.drugcode
        LEFT JOIN cdrugunitsell u ON cdrug.unitsell = u.unitsellcode
        JOIN visit v ON vd.visitno = v.visitno
        LEFT JOIN person p ON v.pid = p.pid
        LEFT JOIN ctitle ct ON p.prename = ct.titlecode
        LEFT JOIN visitdiag vdiag ON vd.visitno = vdiag.visitno AND (vdiag.dxtype = '01' OR vdiag.dxtype = '1' OR vdiag.dxtype IS NULL)
        LEFT JOIN cdisease cd ON vdiag.diagcode = cd.diseasecode
        WHERE vd.drugcode = ? AND DATE(vd.dateupdate) >= ? AND DATE(vd.dateupdate) <= ?
      `;
      const params = [drugcode, startDate, endDate];
      if (search) {
        query += ` AND (p.fname LIKE ? OR p.lname LIKE ? OR v.pid LIKE ? OR vdiag.diagcode LIKE ? OR cd.diseasenamethai LIKE ?)`;
        const s = `%${search}%`;
        params.push(s, s, s, s, s);
      }
      query += ` ORDER BY vd.dateupdate DESC LIMIT ?`;
      params.push(cappedLimit);

      const [rows] = await pool.query(query, params);
      const todayYear = new Date().getFullYear();

      const items = rows.map(r => {
        let age = null;
        if (r.birth) {
          age = Math.max(0, todayYear - new Date(r.birth).getFullYear());
        }
        let patientName = '';
        if (r.fname) patientName = `${r.titlename || ''}${r.fname} ${r.lname || ''}`.trim();
        else if (r.pid) patientName = `ผู้ป่วย (PID: ${r.pid})`;
        else patientName = 'ไม่ระบุชื่อผู้ป่วย';

        // PDPA: ส่งออกเฉพาะข้อมูลที่ mask แล้ว เว้นแต่ reveal=true (route บังคับ reason + audit แล้ว)
        return {
          visitno: r.visitno,
          pid: reveal ? (r.pid || '-') : maskPid(r.pid),
          patientName: reveal ? patientName : maskPatientName(patientName),
          cid: reveal && r.idcard ? String(r.idcard) : null,
          maskedCid: r.idcard ? maskCid(r.idcard) : null,
          age,
          sex: r.sex === '1' ? 'ชาย' : r.sex === '2' ? 'หญิง' : '-',
          unit: Number(r.unit) || 0,
          drugunit: r.drugunit,
          dose: r.dose || 'ตามแพทย์สั่ง',
          costprice: Number(r.costprice) || 0,
          dispensedate: r.dispensedate || '-',
          dispensetime: r.dispensetime || '',
          dateupdate: r.dateupdate || '',
          diagcode: r.diagcode || '-',
          diseasename: r.diseasename || '-',
          diseasenamethai: r.diseasenamethai || r.diseasename || '-'
        };
      });

      return {
        drug,
        totalRecords: totalVisits,
        totalUnits,
        distinctPatients,
        dateRange: { startDate, endDate },
        pdpaPolicy: PDPA_POLICY,
        masked: !reveal,
        items
      };
    } catch (err) {
      console.error('Error querying live patient dispensing history:', err.message);
      throw new Error(`เกิดข้อผิดพลาดในการดึงข้อมูลประวัติการจ่ายยา: ${err.message}`);
    }
  }

  // Demo mode (ข้อมูลจำลอง)
  const mockNames = [
    { title: 'นาย', fname: 'สมชาย', lname: 'ใจดี', pid: '1001', diag: 'E11.9', diagThai: 'เบาหวานชนิดที่ไม่ต้องพึ่งอินซูลิน', dose: 'กินครั้งละ 1 เม็ด หลังอาหาร เช้า-เย็น' },
    { title: 'นาง', fname: 'สมศรี', lname: 'พูนสุข', pid: '1025', diag: 'I10', diagThai: 'ความดันโลหิตสูง ไม่ระบุสาเหตุ', dose: 'กินครั้งละ 1 เม็ด หลังอาหาร เช้า' },
    { title: 'นาย', fname: 'บุญมี', lname: 'สุขเกษม', pid: '1044', diag: 'J00', diagThai: 'คอหอยอักเสบและหวัดเฉียบพลัน', dose: 'กินครั้งละ 1 เม็ด ทุก 4-6 ชั่วโมง เมื่อมีอาการ' },
    { title: 'นางสาว', fname: 'วรรณา', lname: 'รัตนชัย', pid: '1089', diag: 'K21.9', diagThai: 'โรคกรดไหลย้อน', dose: 'กินครั้งละ 1 แคปซูล ก่อนอาหาร 30 นาที เช้า' }
  ];

  const demoItems = memoryStore.dispensing
    .filter(d => d.drugcode === drugcode && d.date >= startDate && d.date <= endDate)
    .map((d, idx) => {
      const p = mockNames[idx % mockNames.length];
      const fullName = `${p.title}${p.fname} ${p.lname}`;
      return {
        visitno: d.visitno,
        pid: reveal ? p.pid : maskPid(p.pid),
        patientName: reveal ? fullName : maskPatientName(fullName),
        maskedCid: '1-5099-XXXXX-94-7',
        age: 50 + (idx * 5) % 30,
        sex: p.title === 'นาย' ? 'ชาย' : 'หญิง',
        unit: Number(d.unit),
        drugunit: drug.drugunit || 'เม็ด',
        dose: p.dose,
        costprice: drug.costprice || 0,
        dispensedate: d.date,
        dispensetime: '09:30:00',
        dateupdate: `${d.date} 09:30:00`,
        diagcode: p.diag,
        diseasename: p.diag,
        diseasenamethai: p.diagThai
      };
    });

  const distinctPatients = new Set(demoItems.map(i => i.pid)).size;
  return {
    drug,
    totalRecords: demoItems.length,
    totalUnits: demoItems.reduce((sum, it) => sum + it.unit, 0),
    distinctPatients,
    dateRange: { startDate, endDate },
    pdpaPolicy: PDPA_POLICY,
    masked: !reveal,
    items: demoItems
  };
}

// ---------- รายงานการจ่ายยาและเวชภัณฑ์ (rdrug_used) ----------
async function getDrugUsageReport(startDate, endDate) {
  assertDataAvailable('รายงานการจ่ายยาและเวชภัณฑ์');
  const fy = currentFiscalYear();
  const S = startDate || fy.startDate;
  const E = endDate || fy.endDate;

  if (isLive()) {
    const pool = getPool();
    const query = `
      SELECT c.drugcode, c.drugname, c.drugtype, c.drugtypesub,
             COALESCE(u.unitsellname, c.unitsell, 'หน่วย') as drugunit,
             SUM(v.unit) as totalUnits,
             SUM(v.unit * COALESCE(c.cost, 0)) as totalCost,
             SUM(v.unit * COALESCE(c.sell, 0)) as totalSell
      FROM visitdrug v
      JOIN cdrug c ON v.drugcode = c.drugcode
      LEFT JOIN cdrugunitsell u ON c.unitsell = u.unitsellcode
      WHERE DATE(v.dateupdate) >= ? AND DATE(v.dateupdate) <= ?
      GROUP BY c.drugcode, c.drugname, c.drugtype, c.drugtypesub, drugunit
      ORDER BY totalUnits DESC
    `;
    const [rows] = await pool.query(query, [S, E]);
    return buildUsageReport(rows, S, E);
  }

  // Demo mode
  const drugs = await getAllJhcisDrugs();
  const usageMap = {};
  memoryStore.dispensing.forEach(d => {
    if (d.date >= S && d.date <= E) {
      usageMap[d.drugcode] = (usageMap[d.drugcode] || 0) + (Number(d.unit) || 0);
    }
  });
  const rows = Object.entries(usageMap).map(([code, units]) => {
    const drug = drugs.find(d => d.drugcode === code);
    if (!drug) return null;
    return {
      drugcode: code,
      drugname: drug.drugname,
      drugtype: drug.drugtype,
      drugtypesub: drug.drugtypesub,
      drugunit: drug.drugunit || 'หน่วย',
      totalUnits: units,
      totalCost: units * (Number(drug.costprice) || 0),
      totalSell: units * (Number(drug.sellprice) || 0)
    };
  }).filter(Boolean);
  return buildUsageReport(rows, S, E);
}

function buildUsageReport(rows, startDate, endDate) {
  const report = {
    dateRange: { startDate, endDate },
    services: [], herbals: [], modernDrugs: [],
    totals: {
      services: { count: 0, units: 0, cost: 0, sell: 0 },
      herbals: { count: 0, units: 0, cost: 0, sell: 0 },
      modernDrugs: { count: 0, units: 0, cost: 0, sell: 0 },
      grand: { count: 0, units: 0, cost: 0, sell: 0 }
    }
  };

  rows.forEach(r => {
    const item = {
      drugcode: r.drugcode,
      drugname: r.drugname,
      drugunit: r.drugunit,
      units: Number(r.totalUnits) || 0,
      cost: Number(r.totalCost) || 0,
      sell: Number(r.totalSell) || 0
    };
    // จำแนกตามรหัสประเภท JHCIS เป็นหลัก (ไม่เดาจากชื่อ)
    const isService = r.drugtype === '02' || r.drugtype === '06' || r.drugtype === '07' || r.drugtypesub === '4' || r.drugtypesub === '8';
    const isHerbal = r.drugtype === '10' || r.drugtypesub === '11';

    if (isService) {
      report.services.push(item);
      report.totals.services.count++;
      report.totals.services.units += item.units;
      report.totals.services.cost += item.cost;
      report.totals.services.sell += item.sell;
    } else if (isHerbal) {
      report.herbals.push(item);
      report.totals.herbals.count++;
      report.totals.herbals.units += item.units;
      report.totals.herbals.cost += item.cost;
      report.totals.herbals.sell += item.sell;
    } else {
      report.modernDrugs.push(item);
      report.totals.modernDrugs.count++;
      report.totals.modernDrugs.units += item.units;
      report.totals.modernDrugs.cost += item.cost;
      report.totals.modernDrugs.sell += item.sell;
    }
    report.totals.grand.count++;
    report.totals.grand.units += item.units;
    report.totals.grand.cost += item.cost;
    report.totals.grand.sell += item.sell;
  });

  return report;
}

// ---------- รายงานความคลาดเคลื่อน (Variance): ยอดนับ vs ยอดคุม ณ วันนับ ----------
async function getVarianceReport(asOfDate) {
  assertDataAvailable('รายงานความคลาดเคลื่อนสต็อก');
  const counts = getStockCounts();
  const today = new Date().toISOString().slice(0, 10);
  const target = asOfDate || today;
  const drugs = await getAllJhcisDrugs();
  const drugMap = {};
  drugs.forEach(d => { drugMap[d.drugcode] = d; });

  // ต้องรู้การเคลื่อนไหวตั้งแต่วันนับแต่ละตัวถึงวัน target
  const minCountDate = Object.values(counts).map(c => c.countDate).sort()[0] || target;
  const dispenseMap = await fetchDispenseDayMap(minCountDate, target);
  const results = [];

  Object.values(counts).forEach(count => {
    const code = count.drugcode;
    const drug = drugMap[code];
    if (!drug) {
      results.push({ drugcode: code, drugname: count.drugname || '(ไม่พบในทะเบียน JHCIS)', foundInJhcis: false, countDate: count.countDate, counted: count.totalAmount, computed: null, variance: null });
      return;
    }
    const C = count.countDate;
    if (C > target) return;
    const dayMap = dispenseMap[code] || {};
    // เคลื่อนไหว "ตั้งแต่วันนับ" (นับ = snapshot ต้นวัน จึงรวมเหตุการณ์ของวันนับด้วย)
    const dispensed = Object.keys(dayMap).reduce((s, day) => (day >= C && day <= target ? s + dayMap[day] : s), 0);
    const received = localReceiptItems({ drugcode: code, startDate: C, endDate: target })
      .filter(r => r.receivedate >= C)
      .reduce((s, r) => s + r.amount, 0);
    const adj = listAdjustments({ drugcode: code, startDate: C, endDate: target });
    const adjIn = adj.filter(a => a.direction === 'in' && a.date >= C).reduce((s, a) => s + a.quantity, 0);
    const adjOut = adj.filter(a => a.direction === 'out' && a.date >= C).reduce((s, a) => s + a.quantity, 0);
    // ยอดคุมปัจจุบัน (forward จากผลนับ): ยอดนับ + รับเข้า − จ่ายออก + ปรับปรุง ตั้งแต่วันนับถึงวัน target
    // (ใช้สูตรเดียวกับเครื่องยนต์ Stock Card จึงได้ตัวเลขเดียวกันเสมอ)
    const computed = count.totalAmount + received - dispensed + adjIn - adjOut;
    results.push({
      drugcode: code,
      drugname: drug.drugname,
      drugunit: drug.drugunit,
      foundInJhcis: true,
      countDate: C,
      counted: count.totalAmount,
      receivedSinceCount: received,
      dispensedSinceCount: dispensed,
      adjustedIn: adjIn,
      adjustedOut: adjOut,
      computedBalance: computed,
      isNegative: computed < 0
    });
  });

  return {
    asOfDate: target,
    totalItems: results.length,
    negativeItems: results.filter(r => r.isNegative).length,
    items: results.sort((a, b) => (a.isNegative === b.isNegative ? 0 : a.isNegative ? -1 : 1))
  };
}

module.exports = {
  getDrugStockSummary,
  getStockCareSummary: getDrugStockSummary,
  getStockCardDetail,
  getDrugSubstockInfo,
  getDrugDispensingHistory,
  getDrugUsageReport,
  getVarianceReport,
  currentFiscalYear
};
