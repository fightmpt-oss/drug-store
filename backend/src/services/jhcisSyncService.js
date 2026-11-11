// jhcisSyncService.js — บันทึกใบรับยาจาก Excel เข้า "ฐานข้อมูลของระบบ" (data/localdb/receipts.json)
// กฎเหล็ก: ห้ามเขียนลง jhcisdb เด็ดขาด (อ่านอย่างเดียวเท่านั้น)
// จุดที่แก้จากรอบตรวจสอบ:
//  - เดิมบันทึกลง memoryStore (RAM) → รีสตาร์ทแล้วหาย  → ตอนนี้ persist ลงดิสก์แบบ atomic
//  - เดิมไม่กัน import ซ้ำ             → ตอนนี้ receiveno ซ้ำ = บล็อก (409)
//  - เดิมเติมวันหมดอายุปลอม 2028-12-31 → ตอนนี้เก็บ null แล้วแจ้งเตือนให้กรอก

const { saveReceipt, findReceipts } = require('./localStore');

async function commitStockReceipt(receiptData = {}) {
  const {
    receiveno = '',
    receivedate,
    supplier = '',
    receiver = '',
    note = '',
    sourceFile = '',
    sourceType = 'excel',
    items = []
  } = receiptData;

  if (!items || items.length === 0) {
    const err = new Error('ไม่พบรายการยาที่จะบันทึกเข้าคลัง');
    err.status = 400;
    throw err;
  }

  const saved = await saveReceipt({
    receiveno,
    receivedate,
    supplier,
    receiver,
    note,
    sourceFile,
    sourceType,
    items: items.map(it => ({
      drugcode: it.drugcode,
      drugname: it.drugname,
      hosdrugcode: it.hosdrugcode,
      tmtid: it.tmtid,
      lotno: it.lotno,
      dateexpire: it.dateexpire,
      amount: it.amount,
      unitType: it.unitType,
      packSize: it.packSize,
      costprice: it.costprice,
      matchType: it.matchType,
      confidence: it.confidence
    }))
  });

  // คำเตือน: รายการที่ไม่มีวันหมดอายุ (ไม่สมมุติค่าแทน)
  const missingExp = saved.items.filter(it => !it.dateexpire).length;

  return {
    success: true,
    receiveno: saved.receiveno,
    receivedate: saved.receivedate,
    totalItems: saved.items.length,
    missingExpiryItems: missingExp,
    message: `บันทึกใบรับยา ${saved.items.length} รายการ เข้าฐานข้อมูลของระบบ (data/localdb/receipts.json) เรียบร้อย` +
      (missingExp > 0 ? ` — ⚠️ มี ${missingExp} รายการไม่ระบุวันหมดอายุ กรุณากรอกให้ครบเพื่อการคุมยาตาม FEFO` : '') +
      ' (jhcisdb ถูกใช้แบบอ่านอย่างเดียว ไม่มีการแก้ไขข้อมูล JHCIS)'
  };
}

// ตรวจใบรับซ้ำก่อน commit (ให้ UI เรียกเช็คล่วงหน้าได้)
function checkDuplicateReceiveno(receiveno) {
  const clean = String(receiveno || '').trim();
  if (!clean) return { duplicate: false };
  const found = findReceipts({ receiveno: clean });
  return {
    duplicate: found.length > 0,
    existing: found.length > 0 ? {
      receiveno: found[0].receiveno,
      receivedate: found[0].receivedate,
      supplier: found[0].supplier,
      receiver: found[0].receiver,
      itemCount: found[0].items.length
    } : null
  };
}

module.exports = {
  commitStockReceipt,
  checkDuplicateReceiveno
};
