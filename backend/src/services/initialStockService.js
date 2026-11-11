// initialStockService.js — ผลตรวจนับยอดยกมา (เก็บใน data/localdb/stock_counts.json)
// รองรับ:
//   1. แบบฟอร์มตรวจนับมาตรฐาน (Template Excel ที่มีคอลัมน์ "รหัสยา")
//   2. ไฟล์ยอดตรวจนับยาคงเหลือ รพ.สต. (เช่น "ใบเบิกยา รพสต69.xlsx" / แผ่นงาน "ยาคงเหลือ" ต้นปีงบประมาณ 2570)
//   3. การบันทึก/แก้ไข/ลบรายตัว และ Audit log old → new

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { getAllJhcisDrugs, scoreDrugClinicalMatch, parseStrength, parseDosageForm } = require('./matcherService');
const { memoryStore, saveMappings, getPcuCode } = require('../config/db');
const {
  saveStockCount, saveStockCountsBatch, getStockCounts, getStockCount,
  deleteStockCount, resetStockCounts, setDrugSettings
} = require('./localStore');

function getAllInitialCounts() { return getStockCounts(); }
function getInitialCount(drugcode) { return getStockCount(drugcode); }

async function saveSingleCount(data, actor) {
  return saveStockCount(data, actor);
}

async function saveBatchCounts(items, actor) {
  return saveStockCountsBatch(items, actor);
}

function deleteInitialCount(drugcode, actor) {
  return deleteStockCount(drugcode, actor);
}

function resetAllInitialCounts(actor) {
  return resetStockCounts(actor);
}

// สรุปผลการตรวจนับ
async function getInitialCountSummary() {
  const counts = getStockCounts();
  const drugs = await getAllJhcisDrugs();
  const activeDrugs = drugs.filter(d => d.drugflag === '1');

  const countedCodes = Object.keys(counts);
  let totalCountedUnits = 0;
  let totalCountedValue = 0;
  let totalLotsCount = 0;

  countedCodes.forEach(code => {
    const it = counts[code];
    const itemLots = Array.isArray(it.lots) && it.lots.length > 0
      ? it.lots
      : [{ amount: it.totalAmount || 0, costprice: 0 }];

    totalLotsCount += itemLots.length;
    itemLots.forEach(l => {
      const a = Number(l.amount) || 0;
      const c = Number(l.costprice) || 0;
      totalCountedUnits += a;
      totalCountedValue += (a * c);
    });
  });

  return {
    totalDrugsInPcu: drugs.length,
    activeDrugsInPcu: activeDrugs.length,
    totalCountedItems: countedCodes.length,
    totalUncountedItems: Math.max(0, activeDrugs.length - countedCodes.length),
    totalLotsCount,
    totalCountedUnits,
    totalCountedValue: Math.round(totalCountedValue * 100) / 100,
    countsMap: counts
  };
}

// แบบฟอร์ม Excel สำหรับตรวจนับ (มียาทุกตัวในทะเบียน + ผลนับเดิมถ้ามี)
async function generateCountingTemplateExcel() {
  const drugs = await getAllJhcisDrugs();
  const counts = getStockCounts();

  const sorted = [...drugs].sort((a, b) => {
    if (a.drugflag !== b.drugflag) return (a.drugflag || '1').localeCompare(b.drugflag || '1');
    return (a.drugname || '').localeCompare(b.drugname || '', 'th');
  });

  const rows = [];
  sorted.forEach(d => {
    const existing = counts[d.drugcode];
    const lots = existing && Array.isArray(existing.lots) && existing.lots.length > 0
      ? existing.lots
      : [null];

    lots.forEach((lot, lotIdx) => {
      rows.push({
        'รหัสยา': d.drugcode,
        'ชื่อยา': d.drugname,
        'ชื่อยาภาษาไทย': d.drugnamethai || '',
        'กลุ่มยา': d.drugtype || '',
        'หน่วยนับ': d.drugunit || 'หน่วย',
        'ขนาดบรรจุ': d.unitpacking || '',
        'ลำดับ Lot': lot ? (lotIdx + 1) : 1,
        'จำนวนที่ตรวจนับได้': lot ? lot.amount : '',
        'เลขที่ Lot': lot?.lotno || (lotIdx === 0 ? (d.lotno || '') : ''),
        'วันหมดอายุ (YYYY-MM-DD)': lot?.dateexpire || (lotIdx === 0 && d.dateexpire ? new Date(d.dateexpire).toISOString().slice(0, 10) : ''),
        'ราคาทุนต่อหน่วย': lot?.costprice !== undefined ? lot.costprice : (Number(d.costprice) || 0),
        'วันที่ตรวจนับ': existing?.countDate || new Date().toISOString().slice(0, 10),
        'หมายเหตุ': lot?.remark || existing?.remark || ''
      });
    });
  });

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(rows);

  ws['!cols'] = [
    { wch: 10 }, { wch: 38 }, { wch: 25 }, { wch: 8 }, { wch: 10 }, { wch: 15 },
    { wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 25 }
  ];

  xlsx.utils.book_append_sheet(wb, ws, 'แบบตรวจนับสต็อกยกมา');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// -------------------------------------------------------------------------
// Universal Pharmaceutical Abbreviations & Clinical Synonyms
// ใช้ได้กับทุก รพ.สต. และโรงพยาบาลทั่วประเทศ (ศัพท์สากลทางเภสัชกรรม)
// -------------------------------------------------------------------------
const CLINICAL_ABBREVIATIONS = {
  'ta': ['triamcinolone', 'acetonide'],
  'cpm': ['chlorpheniramine', 'maleate'],
  'pcm': ['paracetamol'],
  'para': ['paracetamol'],
  'amox': ['amoxicillin'],
  'amoxy': ['amoxicillin'],
  'clotri': ['clotrimazole'],
  'clotrim': ['clotrimazole'],
  'dexa': ['dexamethasone'],
  'hctz': ['hydrochlorothiazide'],
  'mtx': ['methotrexate'],
  'lido': ['lidocaine'],
  'bco': ['vitamin b complex', 'vitamin bco', 'b complex'],
  'b1-6-12': ['vitamin b1-6-12', 'neurobion', 'b1 b6 b12'],
  'ors': ['oral rehydration salts', 'ors'],
  'nss': ['sodium chloride', 'normal saline'],
  'd-5': ['dextrose'],
  'd5': ['dextrose'],
  'wfi': ['water for injection', 'water for inj'],
  'berodual': ['fenoterol', 'ipratropium'],
  'hyoscine': ['hyoscine', 'butylbromide'],
  'cafergot': ['cafegot', 'ergotamine', 'caffeine'],
  'cafegot': ['cafergot', 'ergotamine', 'caffeine'],
  'ergotamine': ['cafergot', 'cafegot']
};

// -------------------------------------------------------------------------
// Helper: Seed แมปเฉพาะกรณีเริ่มต้น รพ.สต.ท่ากว้าง (PCU 06020)
// สำหรับ รพ.สต. อื่นๆ ระบบจะไม่ใช้ชุดรหัสนี้ แต่จะใช้ Dynamic Matcher และ mappings.json แทน
// -------------------------------------------------------------------------
const HOSPITAL_06020_SEED_ALIASES = {
  // ยาเม็ด / แคปซูล
  'cafergot (ergotamine+caffeine) (1+100 mg) (tab)': '733',
  'cafergot (ergotamine+caffeine)': '733',
  'cafergot': '733',
  'cafegot': '733',
  'aspirin 81 mg (tab)': '662',
  'aspirin 81 mg': '662',
  'aspirin 300 mg (tab)': '8',
  'aspirin 300 mg': '8',
  'atenolol 50 mg (tab)': '993',
  'atenolol 50 mg': '993',
  'atenolol 100 mg (tab)': '126',
  'atenolol 100 mg': '126',
  'enalapril 5 mg (tab)': '819',
  'enalapril 5 mg': '819',
  'enalapril 20 mg (tab)': '94',
  'enalapril 20 mg': '94',
  'paracetamol 500 mg (tab)': '422',
  'paracetamol 500 mg': '422',
  'paracetamol 325 mg (tab)': '421',
  'paracetamol 325 mg': '421',
  'albendazole 200 mg (tab)': '21',
  'albendazole 200 mg': '21',
  'domperidone 10 mg (tab)': '195',
  'domperidone 10 mg': '195',
  'ibuprofen 400 mg (tab)': '23',
  'ibuprofen 400 mg': '23',
  'amoxicillin 500 mg (cap)': '328',
  'amoxicillin 500 mg': '328',
  'cetiricine 10 mg (tab)': '768',
  'cetiricine 10 mg': '768',
  'cinnarizine 25 mg (tab)': '129',
  'cinnarizine 25 mg': '129',
  'dimenhydrinate 50 mg': '190',
  'folic acid 5 mg': '231',
  'furosemide 40mg': '235',
  'moduretic (hctz+amiloride) (50+5mg) (tab)': '490',
  'multivitamin (tab)': '378',
  'propranolol 10 mg (tab)': '474',
  'propranolol 10 mg': '474',
  'sodium bicarbonate 300 mg': '61',
  'spironolactone 25 mg (tab)': '712',
  'spironolactone 25 mg': '712',
  'vitamin bco': '585',
  'vitamin b1-6-12': '580',
  'vitamin c tab100mg 100 mg': '58',
  'ors รสส้มเด็ก': '1093',
  'ors รสส้มผู้ใหญ่': '411',
  'cpm (chlorphen) 4 mg (tab)': '121',
  'cpm (chlorphen) 4 mg': '121',

  // ยาน้ำ / หยด / สารละลาย
  'amoxycillin 250 mg/5ml (syr)': '186',
  'amoxycillin 250 mg/5ml': '186',
  'paracetamol 60 ml (sus)': '419',
  'paracetamol 60 ml': '419',
  'domperidone 30 ml (sus)': '197',
  'domperidone 30 ml': '197',
  'ibuprofen 60 ml (sus)': '869',
  'ibuprofen 60 ml': '869',
  'albendazole 10 ml (syr)': '179',
  'albendazole 10 ml': '179',
  'chlopheniramine 60 ml (syr)': '119',
  'ferrous drop15ml 50mg/0.6ml (sus)': '173',
  'glyceryl. guaiacolate 60 ml (syr)': '902',
  'glyceryl. guaiacolate  60 ml (syr)': '902',
  'multivitamin syr 60ml. (syr)': '377',
  'hyoscine-n-bytyl br 30 ml (syr)': '713',
  'salbutamol 60 ml (syr)': '738',
  'simethicone drop 15ml (mix)': '837',
  'aromatic ammonia spirit 450 ml (sol)': '71',
  'ethyl alcohol (gpo alc)70% 450 ml (sol)': '1075',
  'povidone iodine 10% 450 ml (sol)': '152',
  'salbutamal solution 20ml. (sol)': '100409000000700170781592',
  'berodual inh กล่อง (pcs)': '704',

  // ยาฉีด / สารน้ำ
  'cpm 10mg/ml (inj)': '118',
  'dimenhydrinate 50mg/ml (inj)': '193',
  'glucose 50% in 50ml (inj)': '641',
  'hyoscine-n-butyl br 20mg/ml (inj)': '274',
  'd-5-1/2s 1000 ml (inj)': '160',
  'nss. 100 ml (inj)': '628',
  'nss 500 ml (inj)': '100942000000780210181474',
  'nss ล้างแผล 1000 ml (inj)': '793',
  'water for inj 10cc 10 ml (inj)': '969',

  // ยาทาภายนอก / ขี้ผึ้ง / ป้ายปาก
  'ta0.02% 15 gm (cre)': '784',
  'ta 0.1% 500g (cre)': '176',
  'ta 0.1% 500g': '176',
  'ta oral paste กล่อง (pas)': '896',
  'clotrimazole cr 1% 500 g (cre)': '848',
  'clotrimazole cr 1% 500 g': '848',

  // ยาสมุนไพร
  'ขมิ้นชัน แคปซูล (cap)': '410000000109150020182748',
  'เถาวัลเปรียง แคปซูล (cap)': '420000005549150020182737',
  'พญายอครีม (cre)': '410000000389300550282750',
  'เพชรสังฆาตยาแคปซูล (cap)': '420000003299150020182750',
  'ฟ้าทะลายโจร แคปซูล (cap)': '410000000047000002011376',
  'มะขามแขก (cap)': '420000007879140020182758',
  'มะขามป้อมน้ำแก้ไอ 60 ml. (ขวด)': '420000001540000094711170',
  'รางจืดแคปซูล (cap)': '420000007839140020182758',
  'หญ้าหนวดแมวชาชง (sac)': '410000000649200334182750',
  'มะแว้ง (sac)': '420000003969120021582750'
};

function parseExpiryDate(rawExp) {
  if (!rawExp) return '';
  if (rawExp instanceof Date && !isNaN(rawExp.getTime())) {
    let y = rawExp.getFullYear();
    if (y > 2400) y -= 543;
    const m = String(rawExp.getMonth() + 1).padStart(2, '0');
    const d = String(rawExp.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof rawExp === 'number') {
    const d = new Date(Math.round((rawExp - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      let y = d.getFullYear();
      if (y > 2400) y -= 543;
      return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  const s = String(rawExp).trim();
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    let y = parseInt(dmy[3], 10);
    if (y > 2400) y -= 543;
    return `${y}-${String(parseInt(dmy[2], 10)).padStart(2, '0')}-${String(parseInt(dmy[1], 10)).padStart(2, '0')}`;
  }
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    let y = parseInt(iso[1], 10);
    if (y > 2400) y -= 543;
    return `${y}-${String(parseInt(iso[2], 10)).padStart(2, '0')}-${String(parseInt(iso[3], 10)).padStart(2, '0')}`;
  }
  return '';
}

// -------------------------------------------------------------------------
// นำเข้าผลตรวจนับจาก Excel (รองรับทั้ง Template ปกติ และ ใบตรวจนับ รพ.สต.)
// -------------------------------------------------------------------------
async function importFromExcel(buffer, actor = 'เจ้าหน้าที่คลังยา') {
  const wb = xlsx.read(buffer, { type: 'buffer', cellDates: true, cellNF: true, cellText: true });
  
  // ตรวจสอบว่าเป็นไฟล์ตรวจนับ รพ.สต. (เช่น ใบเบิกยา รพสต69.xlsx / sheet ยาคงเหลือ) หรือไม่
  let sheetName = wb.SheetNames.find(n => n.includes('ยาคงเหลือ')) || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet);

  if (!rows || rows.length === 0) {
    const err = new Error('ไม่พบข้อมูลในไฟล์ Excel');
    err.status = 400;
    throw err;
  }
  if (rows.length > 20000) {
    const err = new Error('ไฟล์ใหญ่ผิดปกติ (เกิน 20,000 แถว)');
    err.status = 400;
    throw err;
  }

  const findKey = (r, matchFn) => Object.keys(r).find(k => matchFn(String(k).toLowerCase().replace(/[\s_]/g, '')));
  const firstRow = rows[0] || {};
  const hasCodeCol = findKey(firstRow, l => l === 'รหัสยา' || l === 'drugcode' || l === 'รหัส' || l === 'code');
  const isHospitalCountSheet = !hasCodeCol && (findKey(firstRow, l => l.includes('ชื่อยา')) && (findKey(firstRow, l => l.includes('คงเหลือ')) || findKey(firstRow, l => l.includes('รวม'))));

  const drugs = await getAllJhcisDrugs();
  const groupedIncoming = {};
  const skipped = [];

  if (isHospitalCountSheet) {
    // ---------------------------------------------------------------------
    // รูปแบบ 1: ใบยอดตรวจนับยาคงเหลือ รพ.สต. (ชื่อยา, ชนิด, คงเหลือ, รวม, lot No., วันหมดอายุ)
    // ---------------------------------------------------------------------
    rows.forEach(r => {
      const rawName = String(r['ชื่อยา'] || '').trim();
      const rawStrength = String(r['ความแรง'] || '').trim();
      const rawType = String(r['ชนิด'] || '').trim();
      const rawRem = r['คงเหลือ'];
      const box = Number(r['จำนวนกล่องคงเหลือ']) || 0;
      const perBox = Number(r['จำนวนเม็ดต่อกล่อง']) || 0;
      const totalCol = Number(r['รวม']) || 0;

      let qty = 0;
      if (totalCol > 0) qty = totalCol;
      else if (box > 0 && perBox > 0) qty = box * perBox;
      else if (typeof rawRem === 'string' && rawRem.includes('*')) {
        const p = rawRem.split('*').map(x => Number(x.trim())).filter(x => !isNaN(x));
        if (p.length === 2) qty = p[0] * p[1];
      } else if (Number(rawRem) > 0) {
        qty = Number(rawRem);
      }

      if (qty <= 0) return; // ไม่นับรายการที่ยอดเป็น 0

      const lotno = r['lot No.'] !== undefined && r['lot No.'] !== null ? String(r['lot No.']).trim() : '';
      const dateexpire = r['วันหมดอายุ'];
      const rawBoxPrice = Number(r['ราคาต่อกล่อง']) || 0;
      const category = r['ประเภทยา'] || '';

      let unitCostPrice = 0;
      if (perBox > 0 && rawBoxPrice > 0) {
        unitCostPrice = Math.round((rawBoxPrice / perBox) * 10000) / 10000;
      } else if (rawBoxPrice > 0) {
        unitCostPrice = rawBoxPrice;
      }

      const searchKey = `${rawName} ${rawStrength}`.toLowerCase().trim();
      const searchKeyWithType = `${rawName} ${rawStrength} (${rawType})`.toLowerCase().trim();

      let drugcode = null;

      // 1. ตรวจสอบ Saved Mappings (ผูกเฉพาะตาม pcucode ของหน่วยบริการปัจจุบัน และต้องเช็คความแรงด้วย)
      const currentPcu = getPcuCode() || '';
      const savedMappings = (memoryStore && Array.isArray(memoryStore.drugMappings)) ? memoryStore.drugMappings : [];
      const normRawName = rawName.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');
      const normWithStrength = `${rawName} ${rawStrength}`.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');
      const mapHit = savedMappings.find(m => {
        if (m.pcucode && currentPcu && m.pcucode !== currentPcu) return false;
        const mName = (m.hospitalDrugName || m.drugname || '').toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');
        if (mName === normWithStrength) return true;
        if (mName === normRawName) {
          const targetDrug = drugs.find(d => String(d.drugcode) === String(m.jhcisdrugcode || m.matchedDrugCode));
          if (targetDrug) {
            const evalRes = scoreDrugClinicalMatch({ rawName, rawStrength, rawType, rawCategory: category }, targetDrug);
            if (evalRes.strengthScore < 0) return false; // ขนาดยาไม่ตรงกัน ห้ามใช้ mapping นี้เด็ดขาด!
            return true;
          }
        }
        return false;
      });
      if (mapHit && (mapHit.jhcisdrugcode || mapHit.matchedDrugCode)) {
        drugcode = String(mapHit.jhcisdrugcode || mapHit.matchedDrugCode);
      }

      // 2. Fallback Seed สำหรับ รพ.สต. ท่ากว้าง (PCU 06020 เท่านั้น — ห้ามใช้ข้ามหน่วยบริการ)
      if (!drugcode && currentPcu === '06020') {
        for (const [k, code] of Object.entries(HOSPITAL_06020_SEED_ALIASES)) {
          if (searchKey === k || searchKeyWithType === k || searchKey.includes(k) || searchKeyWithType.includes(k) || k.includes(searchKey)) {
            drugcode = code;
            break;
          }
        }
      }

      // 3. 4-Dimensional Clinical Drug Matcher (ชื่อยา + ขนาดยา mg/ml + ชนิดยา + ประเภทยา)
      if (!drugcode) {
        const scoredCandidates = drugs.map(d => {
          const evalRes = scoreDrugClinicalMatch({ rawName, rawStrength, rawType, rawCategory: category }, d);
          return { drugcode: d.drugcode, score: evalRes.score, evalRes };
        }).filter(c => c.score >= 50)
          .sort((a, b) => b.score - a.score);

        if (scoredCandidates.length > 0 && (scoredCandidates[0].score >= 95 || scoredCandidates[0].evalRes?.status === 'EXACT')) {
          drugcode = scoredCandidates[0].drugcode;
        }
      }

      const matchedDrug = drugcode ? drugs.find(d => d.drugcode === drugcode) : null;
      if (!matchedDrug) {
        skipped.push({ name: `${rawName} ${rawStrength}`, reason: 'ไม่พบรหัสยาที่ตรงกันในทะเบียน JHCIS' });
        return;
      }

      if (unitCostPrice <= 0 && matchedDrug.costprice) {
        unitCostPrice = Number(matchedDrug.costprice) || 0;
      }

      const formattedExp = parseExpiryDate(dateexpire);

      if (!groupedIncoming[drugcode]) {
        groupedIncoming[drugcode] = {
          drugcode,
          drugname: matchedDrug.drugname,
          countDate: '2026-10-01',
          countedBy: actor || 'เจ้าหน้าที่คลังยา (นำเข้ายอดยกมา 1 ต.ค. 2569)',
          remark: 'ยอดยกมาคลังยาใน ณ 1 ต.ค. 2569 (เริ่มต้นปีงบประมาณ 2570)',
          lots: []
        };
      }

      groupedIncoming[drugcode].lots.push({
        lotno: lotno && lotno !== '0' ? lotno : 'LOT-BF69',
        dateexpire: formattedExp,
        amount: qty,
        costprice: unitCostPrice,
        remark: `${rawName} (${category || rawType})`
      });
    });

  } else {
    // ---------------------------------------------------------------------
    // รูปแบบ 2: Template ตรวจนับมาตรฐาน (มีคอลัมน์ รหัสยา, ยอดนับ, Lot, Exp)
    // ---------------------------------------------------------------------
    rows.forEach(r => {
      const codeKey = findKey(r, l => l === 'รหัสยา' || l === 'drugcode' || l === 'รหัส' || l === 'code');
      if (!codeKey || !r[codeKey]) return;
      const drugcode = String(r[codeKey]).trim();

      const amtKey = findKey(r, l => l.includes('จำนวน') || l.includes('ยอดนับ') || l === 'amount' || l === 'qty' || l === 'count' || l === 'ยอดยกมา');
      if (amtKey === undefined || r[amtKey] === '' || r[amtKey] === null) {
        skipped.push({ drugcode, reason: 'ไม่พบจำนวนที่นับได้' });
        return;
      }
      const amount = Math.max(0, Number(r[amtKey]) || 0);

      const lotKey = findKey(r, l => l.includes('lot') || l.includes('รุ่น'));
      const expKey = findKey(r, l => l.includes('หมดอายุ') || l.includes('expire') || l.includes('exp'));
      const costKey = findKey(r, l => l.includes('ทุน') || l.includes('ราคา') || l.includes('cost'));
      const dateKey = findKey(r, l => l.includes('วันที่') || l.includes('date'));
      const nameKey = findKey(r, l => l === 'ชื่อยา' || l === 'drugname' || l === 'name');
      const remarkKey = findKey(r, l => l.includes('หมายเหตุ') || l.includes('remark') || l.includes('note'));

      const formattedExp = parseExpiryDate(expKey ? r[expKey] : null);

      if (!groupedIncoming[drugcode]) {
        groupedIncoming[drugcode] = {
          drugcode,
          drugname: (nameKey && r[nameKey]) ? String(r[nameKey]).trim() : '',
          countDate: (dateKey && r[dateKey]) ? String(r[dateKey]).trim() : new Date().toISOString().slice(0, 10),
          countedBy: actor || 'เจ้าหน้าที่คลังยา',
          remark: 'นำเข้าจากไฟล์ Excel ตรวจนับสต็อก',
          lots: []
        };
      }

      groupedIncoming[drugcode].lots.push({
        lotno: (lotKey && r[lotKey]) ? String(r[lotKey]).trim() : `LOT-${groupedIncoming[drugcode].lots.length + 1}`,
        dateexpire: formattedExp,
        amount,
        costprice: (costKey && r[costKey] !== undefined) ? (Number(r[costKey]) || 0) : 0,
        remark: (remarkKey && r[remarkKey]) ? String(r[remarkKey]).trim() : ''
      });
    });
  }

  const batchList = Object.values(groupedIncoming);
  await saveStockCountsBatch(batchList, actor);

  return {
    success: true,
    count: batchList.length,
    sourceFormat: isHospitalCountSheet ? 'hospital_count_sheet' : 'standard_template',
    skipped,
    items: batchList
  };
}

function findInitialStockExcelFile() {
  const checkDirs = [
    process.cwd(),
    path.resolve(process.cwd(), 'received_documents/excel')
  ];
  for (const dir of checkDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      const match = files.find(f => {
        const lower = f.toLowerCase();
        if (lower.startsWith('~$') || lower.startsWith('.')) return false;
        if (lower.includes('dtam')) return false;
        return lower.endsWith('.xlsx') || lower.endsWith('.xls');
      });
      if (match) return path.join(dir, match);
    } catch (e) {
      // ignore
    }
  }
  return null;
}

// -------------------------------------------------------------------------
// แสดงตัวอย่างการจับคู่ยาจากไฟล์ Excel (ยังไม่บันทึกจริง เพื่อให้ผู้ใช้ตรวจสอบและ Match ก่อน)
// -------------------------------------------------------------------------
async function previewExcelInitialStock(bufferOrPath = null) {
  let wb;
  let sourceFileName = 'ไฟล์ Excel ยอดคงเหลือ';
  if (Buffer.isBuffer(bufferOrPath)) {
    wb = xlsx.read(bufferOrPath, { type: 'buffer', cellDates: true, cellNF: true, cellText: true });
    sourceFileName = 'ไฟล์ Excel ที่อัปโหลด';
  } else {
    const targetPath = bufferOrPath || findInitialStockExcelFile();
    if (!targetPath || !fs.existsSync(targetPath)) {
      const err = new Error('ไม่พบไฟล์ Excel ยอดยกมาในระบบ กรุณากดปุ่ม "นำเข้า Excel ยอดนับ" เพื่อเลือกไฟล์จากคอมพิวเตอร์ของคุณ');
      err.status = 404;
      throw err;
    }
    wb = xlsx.readFile(targetPath, { cellDates: true, cellNF: true, cellText: true });
    sourceFileName = path.basename(targetPath);
  }

  let sheetName = wb.SheetNames.find(n => n.includes('ยาคงเหลือ')) || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet);

  if (!rows || rows.length === 0) {
    const err = new Error('ไม่พบแถวข้อมูลในไฟล์ Excel');
    err.status = 400;
    throw err;
  }

  const drugs = await getAllJhcisDrugs();
  const savedMappings = (memoryStore && Array.isArray(memoryStore.drugMappings)) ? memoryStore.drugMappings : [];

  let exactMatches = 0;
  let suggestedMatches = 0;
  let unmatchedCount = 0;
  let nonZeroCount = 0;

  const items = rows.map((r, idx) => {
    const rawIndex = Number(r['ลำดับ']) || (idx + 1);
    const rawName = String(r['ชื่อยา'] || '').trim();
    const rawStrength = String(r['ความแรง'] || '').trim();
    const rawType = String(r['ชนิด'] || '').trim();
    const rawCategory = String(r['ประเภทยา'] || '').trim();
    const rawRem = r['คงเหลือ'];
    const box = Number(r['จำนวนกล่องคงเหลือ']) || 0;
    const perBox = Number(r['จำนวนเม็ดต่อกล่อง']) || 0;
    const totalCol = Number(r['รวม']) || 0;

    let qty = 0;
    if (totalCol > 0) qty = totalCol;
    else if (box > 0 && perBox > 0) qty = box * perBox;
    else if (typeof rawRem === 'string' && rawRem.includes('*')) {
      const p = rawRem.split('*').map(x => Number(x.trim())).filter(x => !isNaN(x));
      if (p.length === 2) qty = p[0] * p[1];
    } else if (Number(rawRem) > 0) {
      qty = Number(rawRem);
    }

    if (qty > 0) nonZeroCount++;

    const lotno = r['lot No.'] !== undefined && r['lot No.'] !== null ? String(r['lot No.']).trim() : '';
    const dateexpire = parseExpiryDate(r['วันหมดอายุ']);
    const rawBoxPrice = Number(r['ราคาต่อกล่อง']) || 0;

    let unitCostPrice = 0;
    if (perBox > 0 && rawBoxPrice > 0) {
      unitCostPrice = Math.round((rawBoxPrice / perBox) * 10000) / 10000;
    } else if (rawBoxPrice > 0) {
      unitCostPrice = rawBoxPrice;
    }

    // Matching logic
    const fullKey = `${rawName} ${rawStrength} (${rawType})`.toLowerCase().trim();
    const baseKey = `${rawName} ${rawStrength}`.toLowerCase().trim();
    const nameKey = rawName.toLowerCase().trim();

    // 1. Saved Mappings from mappings.json (highest user priority, scoped per PCU)
    let mappedCode = null;
    let matchSource = null;
    const currentPcu = getPcuCode() || '';
    const normRawName = rawName.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');
    const normWithStrength = `${rawName} ${rawStrength}`.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');

    const mapHit = savedMappings.find(m => {
      if (m.pcucode && currentPcu && m.pcucode !== currentPcu) return false;
      const mName = (m.hospitalDrugName || m.drugname || '').toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');
      if (mName === normWithStrength) return true;
      if (mName === normRawName) {
        const targetDrug = drugs.find(d => String(d.drugcode) === String(m.jhcisdrugcode || m.matchedDrugCode));
        if (targetDrug) {
          const evalRes = scoreDrugClinicalMatch({ rawName, rawStrength, rawType, rawCategory }, targetDrug);
          if (evalRes.strengthScore < 0) return false; // ขนาดยาขัดแย้งกัน ห้ามใช้ mapping นี้เด็ดขาด!
          return true;
        }
      }
      return false;
    });
    if (mapHit && (mapHit.jhcisdrugcode || mapHit.matchedDrugCode)) {
      mappedCode = String(mapHit.jhcisdrugcode || mapHit.matchedDrugCode);
      matchSource = 'saved_mapping';
    }

    // 2. Fallback Seed for PCU 06020 ONLY (ห้ามใช้กับ รพ.สต. อื่นเด็ดขาด)
    if (!mappedCode && currentPcu === '06020') {
      mappedCode = HOSPITAL_06020_SEED_ALIASES[baseKey] || HOSPITAL_06020_SEED_ALIASES[fullKey] || HOSPITAL_06020_SEED_ALIASES[nameKey];
      if (!mappedCode) {
        for (const [k, c] of Object.entries(HOSPITAL_06020_SEED_ALIASES)) {
          if (baseKey === k || fullKey === k || baseKey.includes(k) || k.includes(baseKey)) {
            mappedCode = c;
            matchSource = 'seed_alias';
            break;
          }
        }
      } else {
        matchSource = 'seed_alias';
      }
    }

    // 3. Multi-factor 4-Dimensional Clinical Drug Matcher (ชื่อยา + ขนาดยา mg/ml + ชนิดยา + ประเภทยา)
    const candidates = [];
    drugs.forEach(d => {
      const evalRes = scoreDrugClinicalMatch({ rawName, rawStrength, rawType, rawCategory }, d);
      let score = evalRes.score;

      // ⚠️ กฎความปลอดภัยสำคัญ: ให้คะแนนพิเศษเฉพาะกรณีที่ขนาดยาและรูปแบบยาไม่ขัดแย้งกันเท่านั้น!
      if (mappedCode && String(d.drugcode) === String(mappedCode)) {
        if (evalRes.strengthScore >= 0 && evalRes.formScore >= 0) {
          score += 150;
        }
      }

      if (score <= 0) return;

      candidates.push({
        drugcode: d.drugcode,
        drugname: d.drugname,
        drugnamethai: d.drugnamethai || '',
        drugunit: d.drugunit || 'หน่วย',
        unitpacking: d.unitpacking || '',
        costprice: Number(d.costprice) || 0,
        score,
        evalRes
      });
    });

    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, 6);
    const topMatch = topCandidates.length > 0 && topCandidates[0].score >= 50 ? topCandidates[0] : null;

    let matchStatus = 'UNMATCHED';
    if (topMatch) {
      // ⚠️ ห้ามเป็น EXACT หากขนาดยาหรือรูปแบบยาขัดแย้งกัน
      const hasStrengthMismatch = topMatch.evalRes?.strengthScore < 0;
      const hasFormMismatch = topMatch.evalRes?.formScore < 0;
      if (!hasStrengthMismatch && !hasFormMismatch && (topMatch.score >= 95 || (mappedCode && topMatch.evalRes?.strengthScore >= 0) || topMatch.evalRes?.status === 'EXACT')) {
        matchStatus = 'EXACT';
        exactMatches++;
      } else {
        matchStatus = 'SUGGESTED';
        suggestedMatches++;
      }
    } else {
      unmatchedCount++;
    }

    // Dual unit detection (generic bulk cream/liquid check)
    const isDualUnit = (
      (rawStrength.includes('500') || rawName.toLowerCase().includes('500') || rawName.toLowerCase().includes('450')) &&
      (rawType === 'cre' || rawType === 'lot' || rawName.toLowerCase().includes('cream') || rawName.toLowerCase().includes('clotri') || rawName.toLowerCase().includes('triamcinolone') || rawName.toLowerCase().includes('ta '))
    );

    let repackInfo = null;
    if (isDualUnit) {
      repackInfo = {
        isDualUnit: true,
        repackRatio: 50,
        mainStoreUnit: 'กระปุก',
        substockUnit: 'ตลับ',
        description: 'ยาครีมกระปุก 500 g แบ่งใส่ตลับ 10 g (1 กระปุก = 50 ตลับ)'
      };
    }

    // Floor stock / In-clinic procedure drug detection (e.g. Lidocaine 2% in 20ml, suture anesthetics, wound solutions)
    const isFloorStock = (
      rawName.toLowerCase().includes('lidocaine') ||
      rawName.toLowerCase().includes('lido') ||
      rawName.toLowerCase().includes('ยาชา') ||
      (topMatch && (topMatch.drugname.toLowerCase().includes('lidocaine') || topMatch.drugname.toLowerCase().includes('ยาชา')))
    );

    let floorStockInfo = null;
    if (isFloorStock) {
      floorStockInfo = {
        isFloorStock: true,
        usageType: 'procedure',
        department: 'ห้องทำแผล/อุบัติเหตุฉุกเฉิน',
        mainStoreUnit: 'ขวด',
        description: 'ยาหัตถการใช้ในห้องทำแผล (1 ขวด 20 ml ดูดฉีด 3-5 ml/เคส) — ตัดสต็อกคลังในตามจำนวนขวดที่เบิกจริง'
      };
    }

    return {
      id: `row_${rawIndex}_${idx}`,
      excelRowIndex: rawIndex,
      rawName,
      rawStrength,
      rawType,
      rawCategory,
      rawRem,
      box,
      perBox,
      totalCol,
      qty,
      lotno: lotno && lotno !== '0' ? lotno : 'LOT-BF69',
      dateexpire,
      unitCostPrice: unitCostPrice > 0 ? unitCostPrice : (topMatch ? topMatch.costprice : 0),
      matchedDrug: topMatch ? {
        drugcode: topMatch.drugcode,
        drugname: topMatch.drugname,
        drugnamethai: topMatch.drugnamethai,
        drugunit: topMatch.drugunit,
        unitpacking: topMatch.unitpacking,
        costprice: topMatch.costprice
      } : null,
      matchStatus,
      matchSource,
      candidates: topCandidates,
      repackInfo,
      floorStockInfo,
      selected: (qty > 0 && !!topMatch)
    };
  });

  return {
    success: true,
    fileName: sourceFileName,
    sheetName,
    totalRows: rows.length,
    nonZeroCount,
    exactMatches,
    suggestedMatches,
    unmatchedCount,
    items
  };
}

// -------------------------------------------------------------------------
// ยืนยันบันทึกยอดยกมาตามที่ผู้ใช้งานตรวจสอบและจับคู่แล้ว (Commit Verified Stock)
// -------------------------------------------------------------------------
async function commitExcelInitialStock(items, options = {}, actor = 'เจ้าหน้าที่คลังยา') {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('ไม่พบรายการยาที่เลือกนำเข้า');
    err.status = 400;
    throw err;
  }

  const { resetBeforeCommit = false, saveMappings: shouldSaveMappings = true, countDate = '2026-10-01' } = options;

  // 1. Reset old stock counts if requested
  let resetPerformed = false;
  if (resetBeforeCommit) {
    resetStockCounts(actor);
    resetPerformed = true;
  }

  const drugs = await getAllJhcisDrugs();
  const drugMap = {};
  drugs.forEach(d => { drugMap[d.drugcode] = d; });

  const groupedIncoming = {};
  let savedMappingsCount = 0;
  let dualUnitsConfigured = 0;

  for (const it of items) {
    if (!it.drugcode) continue;
    const drugcode = String(it.drugcode).trim();
    const targetDrug = drugMap[drugcode];
    const drugname = it.drugname || targetDrug?.drugname || drugcode;
    const qty = Number(it.qty) || 0;

    // 1. Save mappings if requested and rawName is provided (จดจำการจับคู่เสมอ ไม่ว่าจะมียอดหรือยอดคงเหลือเป็น 0)
    if (shouldSaveMappings && it.rawName) {
      // รวมขนาดยาเข้าไปในชื่อเสมอหากมี เพื่อป้องกันยาชื่อเดียวกันคนละขนาดปนกัน
      const cleanRawName = it.rawStrength && !String(it.rawName).toLowerCase().includes(String(it.rawStrength).toLowerCase())
        ? `${String(it.rawName).trim()} ${String(it.rawStrength).trim()}`.trim()
        : String(it.rawName).trim();
      const normRaw = cleanRawName.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');
      const currentPcu = getPcuCode() || '';
      let existing = (memoryStore.drugMappings || []).find(m => {
        if (m.pcucode && currentPcu && m.pcucode !== currentPcu) return false;
        const mNorm = (m.hospitalDrugName || m.drugname || '').toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');
        return mNorm === normRaw;
      });

      if (existing) {
        existing.pcucode = currentPcu;
        existing.jhcisdrugcode = drugcode;
        existing.jhcisdrugname = drugname;
        existing.matchedDrugCode = drugcode;
        existing.matchedDrugName = drugname;
        existing.updatedAt = new Date().toISOString();
        savedMappingsCount++;
      } else {
        if (!memoryStore.drugMappings) memoryStore.drugMappings = [];
        memoryStore.drugMappings.push({
          id: `map_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          pcucode: currentPcu,
          hospitalDrugName: cleanRawName,
          drugname: cleanRawName,
          hosdrugcode: it.hosdrugcode || '',
          jhcisdrugcode: drugcode,
          matchedDrugCode: drugcode,
          jhcisdrugname: drugname,
          matchedDrugName: drugname,
          updatedAt: new Date().toISOString()
        });
        savedMappingsCount++;
      }
    }

    // 2. Dual-unit settings configuration
    if (it.repackInfo && it.repackInfo.isDualUnit) {
      try {
        await setDrugSettings(drugcode, {
          isRepackaged: true,
          mainStoreUnit: it.repackInfo.mainStoreUnit || 'กระปุก',
          substockUnit: it.repackInfo.substockUnit || 'ตลับ',
          unitRatio: Number(it.repackInfo.repackRatio) || 50,
          repackNotice: it.repackInfo.description || 'ยาครีมกระปุก 500g แบ่งใส่ตลับ 10g (1 กระปุก = 50 ตลับ)'
        }, actor);
        dualUnitsConfigured++;
      } catch (e) {
        console.warn('Could not set dual-unit setting for', drugcode, e.message);
      }
    }

    // 3. Floor stock / Procedure settings configuration (Lidocaine etc.)
    if (it.floorStockInfo && it.floorStockInfo.isFloorStock) {
      try {
        await setDrugSettings(drugcode, {
          isFloorStock: true,
          usageType: 'procedure',
          department: it.floorStockInfo?.department || 'ห้องทำแผล/อุบัติเหตุฉุกเฉิน',
          mainStoreUnit: it.floorStockInfo?.mainStoreUnit || 'ขวด',
          procedureNotice: it.floorStockInfo?.description || 'ยาหัตถการใช้ในห้องทำแผล (1 ขวด 20 ml ดูดฉีด 3-5 ml/เคส) — ตัดสต็อกคลังในตามจำนวนขวดที่เบิกจริง',
          note: 'เบิกออกจากคลังในเป็นขวด/ไวอัลไปตั้งไว้ที่ห้องทำแผล ไม่ได้จ่ายกลับบ้าน ตัดสต็อกคลังในตามยอดเบิกขวด'
        }, actor);
      } catch (e) {
        console.warn('Could not set floor-stock setting for', drugcode, e.message);
      }
    }

    // 4. บันทึกยอดตรวจนับเข้าคลัง (ข้ามเฉพาะกรณียอดติดลบ)
    if (qty < 0) continue;

    const lotno = it.lotno && String(it.lotno).trim() !== '0' ? String(it.lotno).trim() : 'LOT-BF69';
    const dateexpire = it.dateexpire || '';
    const costprice = Number(it.unitCostPrice) || Number(targetDrug?.costprice) || 0;

    if (!groupedIncoming[drugcode]) {
      groupedIncoming[drugcode] = {
        drugcode,
        drugname,
        countDate: countDate || '2026-10-01',
        countedBy: actor || 'เจ้าหน้าที่คลังยา (นำเข้ายอดยกมา 1 ต.ค. 2569)',
        remark: 'ยอดยกมาคลังยาใน ณ 1 ต.ค. 2569 (เริ่มต้นปีงบประมาณ 2570)',
        lots: []
      };
    }

    groupedIncoming[drugcode].lots.push({
      lotno,
      dateexpire,
      amount: qty,
      costprice,
      remark: it.remark || `${it.rawName || drugname} (นำเข้ายอดยกมา)`
    });
  }

  // Save mappings to file if any were added/updated
  if (shouldSaveMappings && savedMappingsCount > 0) {
    try {
      saveMappings();
    } catch (e) {
      console.warn('Could not save mappings file:', e.message);
    }
  }

  const batchList = Object.values(groupedIncoming);
  await saveStockCountsBatch(batchList, actor);

  return {
    success: true,
    count: batchList.length,
    resetPerformed,
    savedMappingsCount,
    dualUnitsConfigured,
    items: batchList
  };
}

module.exports = {
  getAllInitialCounts,
  getInitialCount,
  saveSingleCount,
  saveBatchCounts,
  deleteInitialCount,
  resetAllInitialCounts,
  getInitialCountSummary,
  generateCountingTemplateExcel,
  importFromExcel,
  previewExcelInitialStock,
  commitExcelInitialStock
};
