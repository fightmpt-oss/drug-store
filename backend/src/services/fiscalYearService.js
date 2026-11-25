// fiscalYearService.js — จัดการรอบปีงบประมาณไทย (1 ต.ค. - 30 ก.ย.) และการยกยอดคงเหลือสิ้นปีเข้าปีงบประมาณใหม่
const {
  getStockCounts,
  getFiscalYearsData,
  saveFiscalYearRecord,
  replaceStockCountsForFiscalYear
} = require('./localStore');
const { getDrugStockSummary } = require('./stockCardService');
const backupService = require('./backupService');

function detectCurrentFyBE(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return (m >= 10 ? y + 1 : y) + 543;
}

function getFiscalYearBounds(fyBE) {
  const fy = Number(fyBE);
  if (!Number.isInteger(fy) || fy < 2550 || fy > 2700) {
    const err = new Error(`ปีงบประมาณไม่ถูกต้อง (${fyBE}) — กรุณาระบุปี พ.ศ. เช่น 2570 หรือ 2571`);
    err.status = 400;
    throw err;
  }
  const endYearAD = fy - 543;
  const startYearAD = endYearAD - 1;
  const prevEndYearBE = fy - 1;
  return {
    fy,
    label: `ปีงบประมาณ ${fy}`,
    shortLabel: `ปีงบ ${fy}`,
    startDate: `${startYearAD}-10-01`,
    endDate: `${endYearAD}-09-30`,
    thaiRangeLabel: `1 ต.ค. ${prevEndYearBE} – 30 ก.ย. ${fy}`,
    prevFy: fy - 1,
    prevStartDate: `${startYearAD - 1}-10-01`,
    prevEndDate: `${startYearAD}-09-30`,
    prevThaiEndDate: `30 ก.ย. ${prevEndYearBE}`
  };
}

function inferFyFromDateStr(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [y, m] = parts;
  if (y < 1990 || y > 2300) return null;
  return (m >= 10 ? y + 1 : y) + 543;
}

function listFiscalYears() {
  const stored = getFiscalYearsData();
  const currentCalendarFy = detectCurrentFyBE();
  const counts = getStockCounts();
  const countValues = Object.values(counts || {});

  // ตรวจจับปีงบประมาณจากผลตรวจนับปัจจุบัน (หากยังไม่เคยบันทึกใน fiscal_years.json)
  const detectedCountsByFy = {};
  countValues.forEach(c => {
    const inferred = inferFyFromDateStr(c.countDate);
    if (inferred) {
      detectedCountsByFy[inferred] = (detectedCountsByFy[inferred] || 0) + 1;
    }
  });

  const fySet = new Set([
    currentCalendarFy - 1,
    currentCalendarFy,
    currentCalendarFy + 1
  ]);
  Object.keys(stored.years || {}).forEach(k => {
    const n = Number(k);
    if (!isNaN(n)) fySet.add(n);
  });
  Object.keys(detectedCountsByFy).forEach(k => {
    const n = Number(k);
    if (!isNaN(n)) fySet.add(n);
  });

  let activeFy = stored.activeFy ? Number(stored.activeFy) : null;
  if (!activeFy) {
    // ถ้ามียอดนับอยู่ในปีใดให้ถือปีนั้นเป็นปีงบประมาณที่ใช้งานอยู่ มิฉะนั้นใช้ปีงบตามปฏิทิน
    const inferredYears = Object.keys(detectedCountsByFy).map(Number).sort((a, b) => b - a);
    activeFy = inferredYears[0] || currentCalendarFy;
  }

  const years = Array.from(fySet)
    .sort((a, b) => b - a)
    .map(fy => {
      const bounds = getFiscalYearBounds(fy);
      const rec = (stored.years && stored.years[String(fy)]) || null;
      const inferredCount = detectedCountsByFy[fy] || 0;
      const openingDrugCount = rec?.openingCounts
        ? Object.keys(rec.openingCounts).length
        : (fy === activeFy ? countValues.length : inferredCount);

      let status = rec?.status || 'uninitialized';
      if (!rec) {
        if (fy === activeFy) status = 'active';
        else if (fy > currentCalendarFy) status = 'upcoming';
        else if (inferredCount > 0) status = 'active';
      }

      return {
        ...bounds,
        status,
        isActive: fy === activeFy,
        isCurrentCalendar: fy === currentCalendarFy,
        openingDrugCount,
        rolledOverAt: rec?.rolledOverAt || null,
        rolledOverBy: rec?.rolledOverBy || null,
        rolledOverFromFy: rec?.rolledOverFromFy || null,
        closedAt: rec?.closedAt || null,
        closedBy: rec?.closedBy || null,
        snapshotBackupFile: rec?.snapshotBackupFile || null,
        note: rec?.note || '',
        summary: rec?.summary || null
      };
    });

  return {
    activeFy,
    currentCalendarFy,
    nextRecommendedFy: activeFy + 1,
    years
  };
}

async function previewFiscalYearRollover({ targetFy, excludeExpired = false } = {}) {
  const listed = listFiscalYears();
  const resolvedTargetFy = Number(targetFy) || listed.nextRecommendedFy || (detectCurrentFyBE() + 1);
  const bounds = getFiscalYearBounds(resolvedTargetFy);
  const stored = getFiscalYearsData();
  const existingTarget = (stored.years && stored.years[String(resolvedTargetFy)]) || null;

  // คำนวณยอดคงเหลือคลังยาใน ณ วันสิ้นปีงบประมาณก่อนหน้า (30 ก.ย.) โดยใช้ผลนับ + รับเข้า - เบิกคลังในของปีก่อน
  const summary = await getDrugStockSummary({
    startDate: bounds.prevStartDate,
    endDate: bounds.prevEndDate,
    page: 1,
    pageSize: 'all',
    drugFlagFilter: 'all',
    drugTypeFilter: 'all'
  });

  const previewItems = [];
  let totalLots = 0;
  let totalUnits = 0;
  let totalValue = 0;
  let expiredLotsCount = 0;
  let expiredUnitsCount = 0;
  let excludedExpiredLotsCount = 0;
  let excludedExpiredUnits = 0;
  let zeroBalanceDrugsCount = 0;

  (summary.items || []).forEach(drug => {
    const mainBal = Number(drug.mainStoreBalance) || 0;
    if (mainBal <= 0) {
      if (drug.isCounted || (Number(drug.totalReceived) || 0) > 0) zeroBalanceDrugsCount++;
      return;
    }

    const rawLots = Array.isArray(drug.mainStoreLots) ? drug.mainStoreLots : [];
    let positiveLots = rawLots
      .filter(l => (Number(l.remaining) || 0) > 0)
      .map(l => {
        const exp = l.dateexpire && l.dateexpire !== 'ไม่ระบุ' ? String(l.dateexpire).trim() : '';
        const isExpired = Boolean(exp && exp < bounds.startDate);
        return {
          lotno: l.lotno || 'N/A',
          dateexpire: exp,
          amount: Number(l.remaining) || 0,
          costprice: l.costprice !== undefined && l.costprice !== '' ? Number(l.costprice) || 0 : (Number(drug.costprice) || 0),
          isExpired
        };
      });

    // กรณีมียอดคงเหลือคลังใน > 0 แต่ไม่มีรายการ lot แยก หรือยอดยกมามาจากงวดคำนวณย้อนกลับ
    const lotsSum = positiveLots.reduce((s, l) => s + l.amount, 0);
    if (positiveLots.length === 0) {
      positiveLots = [{
        lotno: 'CARRY-FWD',
        dateexpire: drug.nearestExpDate || '',
        amount: mainBal,
        costprice: Number(drug.costprice) || 0,
        isExpired: Boolean(drug.nearestExpDate && drug.nearestExpDate < bounds.startDate)
      }];
    } else if (mainBal > lotsSum) {
      positiveLots.push({
        lotno: 'CARRY-BF',
        dateexpire: drug.nearestExpDate || '',
        amount: mainBal - lotsSum,
        costprice: Number(drug.costprice) || 0,
        isExpired: false
      });
    }

    if (positiveLots.length === 0) {
      if (drug.isCounted || (Number(drug.totalReceived) || 0) > 0) zeroBalanceDrugsCount++;
      return;
    }

    positiveLots.forEach(l => {
      if (l.isExpired) {
        expiredLotsCount++;
        expiredUnitsCount += l.amount;
      }
    });

    const carriedLots = excludeExpired
      ? positiveLots.filter(l => {
          if (l.isExpired) {
            excludedExpiredLotsCount++;
            excludedExpiredUnits += l.amount;
            return false;
          }
          return true;
        })
      : positiveLots;

    const itemTotalAmount = carriedLots.reduce((s, l) => s + l.amount, 0);
    if (itemTotalAmount <= 0) return;

    const itemTotalValue = carriedLots.reduce((s, l) => s + (l.amount * l.costprice), 0);
    const hasExpiredLot = carriedLots.some(l => l.isExpired);

    totalLots += carriedLots.length;
    totalUnits += itemTotalAmount;
    totalValue += itemTotalValue;

    previewItems.push({
      drugcode: drug.drugcode,
      drugname: drug.drugname,
      drugunit: drug.mainStoreUnit || drug.drugunit || 'หน่วย',
      isDualUnit: Boolean(drug.isDualUnit),
      mainStoreUnit: drug.mainStoreUnit || drug.drugunit || 'หน่วย',
      counterUnit: drug.counterUnit || drug.drugunit || 'หน่วย',
      conversionFactor: Number(drug.conversionFactor) || 1,
      isLocalOnly: Boolean(drug.isLocalOnly),
      totalAmount: itemTotalAmount,
      totalValue: Math.round(itemTotalValue * 100) / 100,
      hasExpiredLot,
      lots: carriedLots
    });
  });

  previewItems.sort((a, b) => String(a.drugname).localeCompare(String(b.drugname), 'th'));

  return {
    targetFy: resolvedTargetFy,
    bounds,
    prevFy: bounds.prevFy,
    sourceAsOfDate: bounds.prevEndDate,
    newStartDate: bounds.startDate,
    excludeExpired: Boolean(excludeExpired),
    alreadyRolledOver: Boolean(existingTarget && existingTarget.rolledOverAt),
    previousRolloverInfo: existingTarget ? {
      rolledOverAt: existingTarget.rolledOverAt || null,
      rolledOverBy: existingTarget.rolledOverBy || null
    } : null,
    summary: {
      drugCount: previewItems.length,
      totalLots,
      totalUnits,
      totalValue: Math.round(totalValue * 100) / 100,
      expiredLotsCount,
      expiredUnitsCount,
      excludedExpiredLotsCount,
      excludedExpiredUnits,
      zeroBalanceDrugsCount
    },
    items: previewItems
  };
}

async function executeFiscalYearRollover({ targetFy, excludeExpired = false, note = '' } = {}, actor = 'admin') {
  const preview = await previewFiscalYearRollover({ targetFy, excludeExpired });
  const { bounds } = preview;
  const now = new Date().toISOString();

  // 1. สำรองข้อมูลทั้งระบบอัตโนมัติก่อนเริ่มปีงบประมาณใหม่ทุกครั้ง
  const snapshot = backupService.createFullSnapshot(
    `สำรองข้อมูลครบชุดก่อนเปิดปีงบประมาณ ${bounds.fy} (ยกยอด ${bounds.prevThaiEndDate})`,
    actor
  );

  // 2. เก็บข้อมูลตั้งต้นของปีงบประมาณก่อนหน้า (prevFy) ไว้เป็นประวัติถาวร เพื่อให้ดูย้อนหลังได้ตลอดแม้ขึ้นปีใหม่แล้ว
  const currentCounts = getStockCounts();
  const stored = getFiscalYearsData();
  const prevFyKey = String(bounds.prevFy);
  const prevBounds = getFiscalYearBounds(bounds.prevFy);
  const existingPrevRec = (stored.years && stored.years[prevFyKey]) || {};

  const prevCountsSnapshot = {};
  Object.keys(currentCounts || {}).forEach(code => {
    const c = currentCounts[code];
    if (!c) return;
    const cDate = String(c.countDate || '');
    // ถ้ายอดนับปัจจุบันยังไม่ใช่ของวันเริ่มงวดปีใหม่ ให้ถือเป็นของปีงบก่อนหน้า
    if (!cDate || cDate < bounds.startDate) {
      prevCountsSnapshot[code] = JSON.parse(JSON.stringify(c));
    }
  });

  await saveFiscalYearRecord(bounds.prevFy, {
    ...prevBounds,
    status: 'closed',
    closedAt: now,
    closedBy: actor,
    openingCounts: (existingPrevRec.openingCounts && Object.keys(existingPrevRec.openingCounts).length > 0)
      ? existingPrevRec.openingCounts
      : prevCountsSnapshot
  }, { setActive: false, actor });

  // 3. สร้างยอดยกมา (1 ต.ค.) สำหรับปีงบประมาณใหม่ จากคงเหลือคลังยาใน ณ 30 ก.ย.
  const newCountsMap = {};
  const remarkText = String(note || '').trim() ||
    `ยกยอดคงเหลือคลังยาใน ณ ${bounds.prevThaiEndDate} (${bounds.label})`;

  preview.items.forEach(item => {
    const entry = {
      drugcode: item.drugcode,
      drugname: item.drugname,
      lots: item.lots.map(l => ({
        lotno: l.lotno || 'N/A',
        dateexpire: l.dateexpire || '',
        amount: Number(l.amount) || 0,
        costprice: Number(l.costprice) || 0,
        remark: `ยกยอดจาก ${bounds.prevThaiEndDate}`
      })),
      totalAmount: item.totalAmount,
      countDate: bounds.startDate,
      countedBy: `ยกยอดปีงบ ${bounds.fy} (${actor})`,
      remark: remarkText,
      updatedBy: actor,
      updatedAt: now
    };
    if (item.isLocalOnly) {
      entry.isLocalOnly = true;
      entry.localUnit = item.mainStoreUnit || 'หน่วย';
    }
    newCountsMap[item.drugcode] = entry;
  });

  await replaceStockCountsForFiscalYear(
    newCountsMap,
    actor,
    `เริ่มต้นปีงบประมาณ ${bounds.fy} (${bounds.startDate})`
  );

  // 4. บันทึกทะเบียนปีงบประมาณใหม่เป็น Active Fiscal Year
  await saveFiscalYearRecord(bounds.fy, {
    ...bounds,
    status: 'active',
    rolledOverFromFy: bounds.prevFy,
    rolledOverAt: now,
    rolledOverBy: actor,
    excludeExpired: Boolean(excludeExpired),
    note: remarkText,
    snapshotBackupFile: snapshot?.filename || null,
    summary: preview.summary,
    openingCounts: newCountsMap
  }, { setActive: true, actor });

  return {
    success: true,
    targetFy: bounds.fy,
    bounds,
    snapshotFile: snapshot?.filename || null,
    summary: preview.summary,
    message: `เปิดปีงบประมาณ ${bounds.fy} (${bounds.startDate}) เรียบร้อยแล้ว — ยกยอด ${preview.summary.drugCount} รายการ (${preview.summary.totalLots} Lot)`
  };
}

module.exports = {
  detectCurrentFyBE,
  getFiscalYearBounds,
  listFiscalYears,
  previewFiscalYearRollover,
  executeFiscalYearRollover
};
