// localStore.js — ฐานข้อมูลของระบบคลังยา (แยกจาก jhcisdb 100%)
// เก็บ: ใบรับยาจาก Excel, รายการปรับปรุงยอด, ผลตรวจนับสต็อก, ค่าตั้งต่อยา, session ผู้ใช้
// jhcisdb ถูก "อ่านอย่างเดียว" เท่านั้น — ทุกการบันทึกของระบบอยู่ที่นี่

const { JsonStore, appendAudit } = require('./storage');
const crypto = require('crypto');

// ---------- Stores ----------
const receiptsStore = new JsonStore('receipts', []);        // ใบรับยาจาก รพ.แม่ข่าย (Excel)
const adjustmentsStore = new JsonStore('adjustments', []);  // ปรับปรุง/ตัดจำหน่าย/โอนย้าย/คืนยา
const countsStore = new JsonStore('stock_counts', {});      // ผลตรวจนับยอดยกมา (ย้ายจาก initial_stock.json)
const countsAuditStore = new JsonStore('stock_counts_audit', []);
const drugSettingsStore = new JsonStore('drug_settings', {}); // เกณฑ์ต่ำสุด/สูงสุด, conversion factor ต่อยา
const substockTransfersStore = new JsonStore('substock_transfers', []); // การเบิกยาจากคลังยาในไปจุดจ่ายยาเคาน์เตอร์ (QR Scan)

// ---------- Migration: initial_stock.json เดิม → stock_counts.json ----------
function migrateLegacyInitialStock() {
  const legacyFile = require('path').join(__dirname, '../data/initial_stock.json');
  const fs = require('fs');
  if (!fs.existsSync(legacyFile)) return;
  const counts = countsStore.get();
  if (counts && Object.keys(counts).length > 0) return; // มีข้อมูลแล้ว ไม่ต้อง migrate
  try {
    const legacy = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
    if (legacy && Object.keys(legacy).length > 0) {
      Object.keys(legacy).forEach(code => {
        const item = legacy[code];
        let lots = item.lots;
        if (!Array.isArray(lots) || lots.length === 0) {
          if (item.amount > 0 || item.lotno || item.dateexpire) {
            lots = [{ lotno: item.lotno || 'LOT-AUTO', dateexpire: item.dateexpire || '', amount: Number(item.amount) || 0, costprice: Number(item.costprice) || 0, remark: '' }];
          } else {
            lots = [];
          }
        }
        counts[code] = {
          drugcode: code,
          drugname: item.drugname || '',
          lots,
          totalAmount: lots.reduce((s, l) => s + (Number(l.amount) || 0), 0),
          countDate: item.countDate || new Date().toISOString().slice(0, 10),
          countedBy: item.countedBy || 'ย้ายจาก initial_stock.json',
          remark: item.remark || 'ย้ายข้อมูลจากระบบเดิม',
          updatedAt: item.updatedAt || new Date().toISOString()
        };
      });
      countsStore.set(counts);
      console.log(`[MIGRATE] ✅ ย้ายผลตรวจนับเดิม ${Object.keys(legacy).length} รายการ → data/localdb/stock_counts.json`);
    }
  } catch (e) {
    console.error('[MIGRATE] legacy initial_stock.json error:', e.message);
  }
}
migrateLegacyInitialStock();

// ---------- ใบรับยา (Receipts) ----------
function normalizeReceiptItem(it, idx) {
  const packSize = Number(it.packSize) > 0 ? Number(it.packSize) : null;
  const unitType = it.unitType === 'pack' && packSize ? 'pack' : 'dispense';
  return {
    line: idx + 1,
    drugcode: String(it.drugcode || '').trim(),
    drugname: String(it.drugname || '').trim(),
    hosdrugcode: String(it.hosdrugcode || '').trim(),
    tmtid: String(it.tmtid || '').trim(),
    lotno: String(it.lotno || '').trim(),
    dateexpire: it.dateexpire && String(it.dateexpire).trim() !== '' ? String(it.dateexpire).trim() : null, // ห้ามสมมุติวันหมดอายุ
    amount: Math.max(0, Number(it.amount) || 0),
    unitType,           // 'dispense' = หน่วยจ่ายจริง | 'pack' = หน่วยบรรจุ
    packSize,           // จำนวนหน่วยจ่ายต่อ 1 หน่วยบรรจุ (ถ้ารับเป็น pack)
    costprice: Math.max(0, Number(it.costprice) || 0),
    matchType: it.matchType || '',
    confidence: Number(it.confidence) || 0
  };
}

// หน่วยจ่ายจริง (dispense-equivalent) ของรายการรับเข้า
function itemDispenseUnits(item) {
  if (!item) return 0;
  const amt = Number(item.amount) || 0;
  if (item.unitType === 'pack' && Number(item.packSize) > 0) return amt * Number(item.packSize);
  return amt;
}

function saveReceipt({ receiveno, receivedate, supplier, receiver, items, note, sourceFile, sourceType }) {
  const cleanNo = String(receiveno || '').trim();
  const duplicates = findReceipts({ receiveno: cleanNo });
  if (cleanNo && duplicates.length > 0) {
    const err = new Error(`เลขที่ใบรับ "${cleanNo}" มีในระบบแล้ว (บันทึกเมื่อ ${duplicates[0].receivedate} โดย ${duplicates[0].receiver}) — ห้ามบันทึกซ้ำ`);
    err.code = 'DUPLICATE_RECEIVE_NO';
    err.status = 409;
    throw err;
  }
  const finalNo = cleanNo || `REC-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  const receipt = {
    receiveno: finalNo,
    receivedate: receivedate || new Date().toISOString().slice(0, 10),
    supplier: supplier || '',
    receiver: receiver || '',
    note: note || '',
    sourceFile: sourceFile || '',
    sourceType: sourceType || 'excel',
    createdBy: '',
    createdAt: new Date().toISOString(),
    items: (items || []).map(normalizeReceiptItem).filter(it => it.drugcode && it.amount >= 0)
  };
  if (receipt.items.length === 0) {
    const err = new Error('ไม่พบรายการยาที่มีรหัสยาถูกต้อง');
    err.code = 'EMPTY_ITEMS';
    err.status = 400;
    throw err;
  }

  const savedReceipt = receiptsStore.update(all => {
    all.unshift(receipt);
    appendAudit('receipts_audit', { ts: new Date().toISOString(), action: 'CREATE_RECEIPT', receiveno: receipt.receiveno, items: receipt.items.length, receivedate: receipt.receivedate, supplier: receipt.supplier });
    return receipt;
  });

  try {
    const backupService = require('./backupService');
    backupService.backupReceipts(`นำเข้าใบรับยา: ${receipt.receiveno}`, receipt.receiver || 'system');
  } catch (e) {}

  return savedReceipt;
}

function findReceipts({ receiveno, drugcode, startDate, endDate } = {}) {
  const all = receiptsStore.get();
  return all.filter(r => {
    if (receiveno && r.receiveno !== receiveno) return false;
    if (startDate && r.receivedate < startDate) return false;
    if (endDate && r.receivedate > endDate) return false;
    if (drugcode && !r.items.some(it => it.drugcode === drugcode)) return false;
    return true;
  });
}

function listReceipts(limit = 100) {
  return receiptsStore.get().slice(0, Math.max(1, Math.min(1000, Number(limit) || 100)));
}

// ---------- รายการปรับปรุง (Adjustments: ปรับปรุง/ตัดจำหน่าย/โอน/คืน) ----------
const ADJUST_CATEGORIES = {
  DESTROY_EXPIRED: { label: 'ตัดจำหน่ายยาหมดอายุ', direction: 'out' },
  DESTROY_DAMAGED: { label: 'ตัดจำหน่ายยาชำรุด', direction: 'out' },
  ADJUST_IN: { label: 'ปรับปรุงเพิ่ม (พบเกิน)', direction: 'in' },
  ADJUST_OUT: { label: 'ปรับปรุงลด (ตรวจพบขาด)', direction: 'out' },
  TRANSFER_IN: { label: 'โอนเข้าจากหน่วยงานอื่น', direction: 'in' },
  TRANSFER_OUT: { label: 'โอนออกให้หน่วยงานอื่น', direction: 'out' },
  RETURN_TO_HOSPITAL: { label: 'คืนยา รพ.แม่ข่าย', direction: 'out' },
  RETURN_FROM_PATIENT: { label: 'รับคืนจากผู้ป่วย', direction: 'in' }
};

function saveAdjustment({ drugcode, drugname, category, quantity, lotno, dateexpire, docNo, reason, date }) {
  const cat = ADJUST_CATEGORIES[category];
  if (!cat) {
    const err = new Error(`ประเภทรายการปรับปรุงไม่ถูกต้อง (ต้องเป็น: ${Object.keys(ADJUST_CATEGORIES).join(', ')})`);
    err.status = 400;
    throw err;
  }
  if (!drugcode) { const err = new Error('กรุณาระบุรหัสยา'); err.status = 400; throw err; }
  const qty = Math.abs(Number(quantity) || 0);
  if (qty <= 0) { const err = new Error('จำนวนต้องมากกว่า 0'); err.status = 400; throw err; }

  const entry = {
    id: crypto.randomUUID(),
    drugcode: String(drugcode).trim(),
    drugname: drugname || '',
    category,
    categoryLabel: cat.label,
    direction: cat.direction,
    quantity: qty,
    lotno: lotno ? String(lotno).trim() : '',
    dateexpire: dateexpire ? String(dateexpire).trim() : null,
    docNo: docNo ? String(docNo).trim() : '',
    reason: reason || '',
    date: date || new Date().toISOString().slice(0, 10),
    createdBy: '',
    createdAt: new Date().toISOString()
  };
  return adjustmentsStore.update(all => {
    all.unshift(entry);
    appendAudit('adjustments_audit', { ts: entry.createdAt, action: 'ADJUSTMENT', drugcode: entry.drugcode, category, qty, by: entry.createdBy, reason: entry.reason });
    return entry;
  });
}

function listAdjustments({ drugcode, startDate, endDate } = {}) {
  const all = adjustmentsStore.get();
  return all.filter(a => {
    if (drugcode && a.drugcode !== drugcode) return false;
    if (startDate && a.date < startDate) return false;
    if (endDate && a.date > endDate) return false;
    return true;
  });
}

// ---------- ผลตรวจนับยอดยกมา (Stock Counts) ----------
function normalizeLots(lots, fallbackAmount, fallbackLotno, fallbackExp, fallbackCost) {
  let validLots = [];
  if (Array.isArray(lots) && lots.length > 0) {
    validLots = lots.map((l, idx) => ({
      lotno: l.lotno ? String(l.lotno).trim() : `LOT-${idx + 1}`,
      dateexpire: l.dateexpire ? String(l.dateexpire).trim() : '',
      amount: Math.max(0, Number(l.amount) || 0),
      costprice: l.costprice !== undefined && l.costprice !== '' ? (Number(l.costprice) || 0) : (Number(fallbackCost) || 0),
      remark: l.remark ? String(l.remark).trim() : ''
    })).filter(l => l.amount > 0 || l.lotno);
  } else {
    const numAmount = Math.max(0, Number(fallbackAmount) || 0);
    validLots = [{
      lotno: fallbackLotno ? String(fallbackLotno).trim() : 'LOT-AUTO',
      dateexpire: fallbackExp ? String(fallbackExp).trim() : '',
      amount: numAmount,
      costprice: Number(fallbackCost) || 0,
      remark: ''
    }];
  }
  return validLots;
}

function saveStockCount({ drugcode, drugname, amount, lotno, dateexpire, costprice, countDate, countedBy, remark, lots }, actor) {
  if (!drugcode) { const err = new Error('กรุณาระบุรหัสยา'); err.status = 400; throw err; }
  const code = String(drugcode).trim();
  const validLots = normalizeLots(lots, amount, lotno, dateexpire, costprice);
  const totalAmount = validLots.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  return countsStore.update(all => {
    const previous = all[code] || null;
    all[code] = {
      drugcode: code,
      drugname: drugname || (previous && previous.drugname) || '',
      lots: validLots,
      totalAmount,
      countDate: countDate || (previous && previous.countDate) || new Date().toISOString().slice(0, 10),
      countedBy: countedBy || (previous && previous.countedBy) || 'เจ้าหน้าที่คลังยา',
      remark: remark !== undefined ? remark : ((previous && previous.remark) || ''),
      updatedBy: actor || 'เจ้าหน้าที่คลังยา',
      updatedAt: new Date().toISOString()
    };
    // Audit trail การแก้ยอดนับ (เก็บ old → new เสมอ)
    countsAuditStore.update(history => {
      history.push({
        ts: all[code].updatedAt,
        by: all[code].updatedBy,
        drugcode: code,
        oldTotal: previous ? previous.totalAmount : null,
        newTotal: totalAmount,
        oldCountDate: previous ? previous.countDate : null,
        newCountDate: all[code].countDate
      });
      if (history.length > 5000) history.splice(0, history.length - 5000);
      return history;
    });
    return all[code];
  });

  try {
    const backupService = require('./backupService');
    backupService.backupStockCounts(`บันทึกผลตรวจนับยา: ${code} (${totalAmount})`, actor || 'system');
  } catch (e) {}

  return updatedCount;
}

async function saveStockCountsBatch(items, actor) {
  if (!Array.isArray(items)) { const err = new Error('รูปแบบข้อมูลไม่ถูกต้อง'); err.status = 400; throw err; }
  const now = new Date().toISOString();
  const user = actor || 'เจ้าหน้าที่คลังยา';
  let saved = 0;
  const auditEntries = [];

  await countsStore.update(all => {
    items.forEach(it => {
      if (!it.drugcode) return;
      const code = String(it.drugcode).trim();
      const validLots = normalizeLots(it.lots, it.amount, it.lotno, it.dateexpire, it.costprice);
      const totalAmount = validLots.reduce((s, l) => s + (Number(l.amount) || 0), 0);
      const previous = all[code] || null;

      all[code] = {
        drugcode: code,
        drugname: it.drugname || (previous && previous.drugname) || '',
        lots: validLots,
        totalAmount,
        countDate: it.countDate || (previous && previous.countDate) || now.slice(0, 10),
        countedBy: it.countedBy || (previous && previous.countedBy) || user,
        remark: it.remark !== undefined ? it.remark : ((previous && previous.remark) || ''),
        updatedBy: user,
        updatedAt: now
      };

      auditEntries.push({
        ts: now,
        by: user,
        drugcode: code,
        oldTotal: previous ? previous.totalAmount : null,
        newTotal: totalAmount,
        oldCountDate: previous ? previous.countDate : null,
        newCountDate: all[code].countDate
      });
      saved++;
    });
    return all;
  });

  if (auditEntries.length > 0) {
    await countsAuditStore.update(history => {
      history.push(...auditEntries);
      if (history.length > 5000) history.splice(0, history.length - 5000);
      return history;
    });
  }

  try {
    const backupService = require('./backupService');
    backupService.backupStockCounts(`บันทึกตรวจนับยอดยกมาแบบกลุ่ม (${saved} รายการ)`, user);
  } catch (e) {}

  return { savedCount: saved, totalItems: items.length };
}

function getStockCounts() { return countsStore.get(); }
function getStockCount(drugcode) { return countsStore.get()[String(drugcode).trim()] || null; }
function getCountAudit(limit = 200) { return countsAuditStore.get().slice(-limit).reverse(); }

function deleteStockCount(drugcode, actor) {
  return countsStore.update(all => {
    if (!all[drugcode]) return false;
    const old = all[drugcode];
    delete all[drugcode];
    countsAuditStore.update(h => { h.push({ ts: new Date().toISOString(), by: actor || '-', drugcode, action: 'DELETE', oldTotal: old.totalAmount }); return h; });
    return true;
  });
}

function resetStockCounts(actor) {
  return countsStore.update(all => {
    countsAuditStore.update(h => { h.push({ ts: new Date().toISOString(), by: actor || '-', action: 'RESET_ALL', affectedItems: Object.keys(all).length }); return h; });
    return {};
  });
}

// ---------- ค่าตั้งต่อยา (เกณฑ์ต่ำสุด/สูงสุด, conversion) ----------
function getDrugSettings(drugcode) { return drugSettingsStore.get()[String(drugcode).trim()] || null; }
function setDrugSettings(drugcode, patch, actor) {
  if (!drugcode) { const err = new Error('กรุณาระบุรหัสยา'); err.status = 400; throw err; }
  const code = String(drugcode).trim();
  const updated = drugSettingsStore.update(all => {
    const prev = all[code] || {};
    all[code] = {
      ...prev,
      ...patch,
      drugcode: code,
      updatedBy: actor || '-',
      updatedAt: new Date().toISOString()
    };
    return all[code];
  });

  try {
    const backupService = require('./backupService');
    backupService.backupDrugSettings(`ตั้งค่ายาเฉพาะ: ${code}`, actor || 'system');
  } catch (e) {}

  return updated;
}

// ---------- การเบิกยาจากคลังยาในไปจุดจ่ายยาเคาน์เตอร์ (Sub-stock Transfers via QR Scan) ----------
function saveSubstockTransfer({ drugcode, drugname, hosdrugcode, hospitalDrugName, lotno, dateexpire, amount, conversionFactor, counterYield, mainStoreUnit, counterUnit, date, note }, actor) {
  if (!drugcode) { const err = new Error('กรุณาระบุรหัสยา'); err.status = 400; throw err; }
  const qty = Math.abs(Number(amount) || 0);
  if (qty <= 0) { const err = new Error('จำนวนที่เบิกต้องมากกว่า 0'); err.status = 400; throw err; }

  const today = new Date().toISOString().slice(0, 10);
  const dateCompact = (date || today).replace(/-/g, '');
  const randSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  const factor = Number(conversionFactor) > 1 ? Number(conversionFactor) : 1;
  const yieldQty = Number(counterYield) || (qty * factor);

  const entry = {
    id: crypto.randomUUID(),
    transferNo: `SUB-${dateCompact}-${randSuffix}`,
    date: date || today,
    time: new Date().toTimeString().slice(0, 8),
    drugcode: String(drugcode).trim(),
    drugname: drugname || '',
    hosdrugcode: hosdrugcode ? String(hosdrugcode).trim() : '',
    hospitalDrugName: hospitalDrugName ? String(hospitalDrugName).trim() : '',
    lotno: lotno ? String(lotno).trim() : 'N/A',
    dateexpire: dateexpire && String(dateexpire).trim() !== '' && dateexpire !== 'ไม่ระบุ' ? String(dateexpire).trim() : null,
    amount: qty,
    conversionFactor: factor,
    counterYield: yieldQty,
    mainStoreUnit: mainStoreUnit || '',
    counterUnit: counterUnit || '',
    dispensedBy: actor || 'เจ้าหน้าที่ห้องยา',
    note: note || 'เบิกยาจากคลังยาในไปจุดจ่ายยาหน้าเคาน์เตอร์',
    createdAt: new Date().toISOString()
  };

  return substockTransfersStore.update(all => {
    all.unshift(entry);
    appendAudit('substock_audit', {
      ts: entry.createdAt,
      action: 'SUBSTOCK_TRANSFER',
      transferNo: entry.transferNo,
      drugcode: entry.drugcode,
      lotno: entry.lotno,
      amount: entry.amount,
      by: entry.dispensedBy
    });
    return entry;
  });
}

function listSubstockTransfers({ drugcode, startDate, endDate, limit } = {}) {
  const all = substockTransfersStore.get();
  const filtered = all.filter(t => {
    if (drugcode && t.drugcode !== String(drugcode).trim()) return false;
    if (startDate && t.date < startDate) return false;
    if (endDate && t.date > endDate) return false;
    return true;
  });
  if (limit && Number(limit) > 0) {
    return filtered.slice(0, Number(limit));
  }
  return filtered;
}

function deleteSubstockTransfer(id, actor) {
  return substockTransfersStore.update(all => {
    const idx = all.findIndex(t => t.id === id || t.transferNo === id);
    if (idx < 0) return false;
    const removed = all[idx];
    all.splice(idx, 1);
    appendAudit('substock_audit', {
      ts: new Date().toISOString(),
      action: 'DELETE_SUBSTOCK_TRANSFER',
      transferNo: removed.transferNo,
      drugcode: removed.drugcode,
      amount: removed.amount,
      by: actor || '-'
    });
    return true;
  });
}

module.exports = {
  receiptsStore, adjustmentsStore, countsStore, drugSettingsStore, substockTransfersStore,
  saveReceipt, findReceipts, listReceipts, itemDispenseUnits,
  saveAdjustment, listAdjustments, ADJUST_CATEGORIES,
  saveStockCount, saveStockCountsBatch, getStockCounts, getStockCount, getCountAudit, deleteStockCount, resetStockCounts,
  getDrugSettings, setDrugSettings,
  saveSubstockTransfer, listSubstockTransfers, deleteSubstockTransfer
};
