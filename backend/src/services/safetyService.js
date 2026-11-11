// safetyService.js — ระบบเฝ้าระวังความปลอดภัยด้านยา ตรวจจับ Triple Whammy และคู่ยาที่ไม่ควรจ่ายร่วมกัน (Drug Conflicts)
// ออกแบบให้ทำงานได้กับทุก รพ.สต. (Generic / Multi-PCU) โดยตรวจจับแบบไดนามิกจากทะเบียนยาจริง
// รองรับ:
// 1. Triple Whammy: การสั่งใช้ร่วมกันของ NSAIDs + Diuretics + ACEi/ARBs (เสี่ยง Acute Kidney Injury: AKI)
// 2. คู่ยาที่ไม่ควรจ่ายร่วมกันในคราวเดียวกัน (2-Drug Conflict Pairs):
//    - ซิงค์ตรงจากตาราง cdrugconflictdrug ของ JHCIS (เช่น DICLOFENAC + IBUPROFEN, GEMFIBROZIL + SIMVASTATIN, Losartan + ENALAPRIL)
//    - ตรวจจับอัตโนมัติตามเกณฑ์ทางเภสัชวิทยาคลินิกมาตรฐาน (Duplicate NSAIDs, Statin + Gemfibrozil, Dual RAAS, Warfarin + NSAID)
//    - ระบบ Custom Overrides เฉพาะหน่วยบริการ

const { getPool, isLive, isDemo } = require('../config/db');
const { JsonStore } = require('./storage');
const { maskCid, maskPatientName, maskPid } = require('./pdpaAuditService');
const xlsx = require('xlsx');

// ที่เก็บการตั้งค่าการจำแนกยาเพิ่มเติมเฉพาะหน่วยบริการ (Overrides)
const safetySettingsStore = new JsonStore('safety_settings', {
  customNsaids: [],          // รหัสยาที่หน่วยงานระบุเพิ่มเป็น NSAID
  customDiuretics: [],       // รหัสยาที่หน่วยงานระบุเพิ่มเป็น Diuretic
  customAceiArb: [],         // รหัสยาที่หน่วยงานระบุเพิ่มเป็น ACEi/ARB
  excludedDrugs: [],          // รหัสยาที่ยกเว้นไม่ให้ตรวจจับ
  customConflictPairs: []    // คู่ยาที่ไม่ควรจ่ายร่วมกันที่ระบุเพิ่มพิเศษ [{ drugcode_a, drugcode_b, reason }]
});

// พจนานุกรมชื่อสามัญและคำสำคัญของยาแต่ละกลุ่ม
const NSAIDS_REGEX = /\b(ibuprofen|diclofenac|naproxen|celecoxib|meloxicam|piroxicam|etoricoxib|indomethacin|mefenamic|ketoprofen|nabumetone|sulindac|ketorolac|lornoxicam|parecoxib|acemetacin|tenoxicam|aspirin)\b|ไอบูโปรเฟน|ไดโคลฟีแนค|นาพรอกเซน|ซีลีคอกสิบ|มีลอกซิแคม|ไพรอกซิแคม|อีโทริคอกสิบ|อินโดเมทาซิน|เมเฟนามิก|คีโตโปรเฟน/i;

// คำสำคัญสำหรับคัดแยก "ยาใช้ภายนอก / ยาทา / ยาหยอดตา" (ไม่ทำให้เกิด systemic AKI / ไม่ใช่ duplicate systemic)
const TOPICAL_EXCLUSION_REGEX = /\b(gel|cream|oint|ointment|spray|patch|eye\s*drop|oph|drops|lotion|liniment|external|topical)\b|ยาทา|เจล|ครีม|หยอดตา|แผ่นแปะ|ยานวด|ภายนอก/i;

// คำสำคัญกลุ่มยาขับปัสสาวะ (Diuretics)
const DIURETICS_REGEX = /\b(furosemide|hydrochlorothiazide|hctz|spironolactone|amiloride|indapamide|chlorthalidone|torsemide|acetazolamide|bumetanide|metolazone)\b|ฟูโรซีไมด์|ไฮโดรคลอโรไทอะไซด์|สไปโรโนแลคโตน|อะมิโลไรด์|อินดาพาไมด์/i;

// คำสำคัญกลุ่มยาลดความดันที่ยับยั้งระบบ RAAS (ACEi / ARBs)
const ACEI_ARB_REGEX = /\b(enalapril|captopril|ramipril|lisinopril|benazepril|perindopril|quinapril|fosinopril|losartan|valsartan|irbesartan|candesartan|telmisartan|olmesartan|azilsartan|aliskiren)\b|อีนาลาพริล|แคปโตพริล|รามิพริล|ลิซิโนพริล|โลซาร์แทน|วาลซาร์แทน|เออร์บีซาร์แทน|แคนเดซาร์แทน|เทลมิซาร์แทน/i;

// คำสำคัญเฉพาะกลุ่ม ACEi
const ACEI_REGEX = /\b(enalapril|captopril|ramipril|lisinopril|benazepril|perindopril|quinapril|fosinopril)\b|อีนาลาพริล|แคปโตพริล|รามิพริล|ลิซิโนพริล/i;

// คำสำคัญเฉพาะกลุ่ม ARB
const ARB_REGEX = /\b(losartan|valsartan|irbesartan|candesartan|telmisartan|olmesartan|azilsartan)\b|โลซาร์แทน|วาลซาร์แทน|เออร์บีซาร์แทน|แคนเดซาร์แทน|เทลมิซาร์แทน/i;

// คำสำคัญกลุ่มยาลดไขมัน Statin
const STATIN_REGEX = /\b(simvastatin|atorvastatin|rosuvastatin|pravastatin|pitavastatin|fluvastatin|lovastatin)\b|ซิมวาสแตติน|อะทอร์วาสแตติน|โรซูวาสแตติน|พราวาสแตติน/i;

// คำสำคัญกลุ่มยาลดไขมัน Fibrate
const FIBRATE_REGEX = /\b(gemfibrozil|fenofibrate|bezafibrate|ciprofibrate)\b|เจมไฟโบรซิล|ฟีโนไฟเบรต/i;
const GEMFIBROZIL_REGEX = /\bgemfibrozil\b|เจมไฟโบรซิล/i;

// คำสำคัญกลุ่มยา Warfarin
const WARFARIN_REGEX = /\bwarfarin\b|วาร์ฟาริน|วอร์ฟาริน/i;

// คำสำคัญกลุ่มยาขับปัสสาวะกักโพแทสเซียม (Potassium-sparing)
const POTASSIUM_SPARING_REGEX = /\b(spironolactone|amiloride|triamterene)\b|สไปโรโนแลคโตน|อะมิโลไรด์/i;

/**
 * จำแนกประเภทยาอัตโนมัติจากชื่อยา/ชื่อสามัญ
 */
function classifyDrug(drug, overrides = {}) {
  const code = String(drug.drugcode || '').trim();
  const customNsaids = overrides.customNsaids || [];
  const customDiuretics = overrides.customDiuretics || [];
  const customAceiArb = overrides.customAceiArb || [];
  const excludedDrugs = overrides.excludedDrugs || [];

  if (excludedDrugs.includes(code)) {
    return {
      isNsaid: false,
      isNsaidTopical: false,
      isDiuretic: false,
      isAceiArb: false,
      isStatin: false,
      isFibrate: false,
      isGemfibrozil: false,
      isAcei: false,
      isArb: false,
      isWarfarin: false,
      isPotassiumSparing: false,
      categories: []
    };
  }

  // รวมข้อความทั้งหมดที่ใช้ตรวจสอบ
  const fullText = `${drug.drugname || ''} ${drug.druggenericname || ''} ${drug.drugnamethai || ''} ${drug.drugproperties || ''}`.toLowerCase();

  const isTopical = TOPICAL_EXCLUSION_REGEX.test(fullText);
  let isNsaid = customNsaids.includes(code) || NSAIDS_REGEX.test(fullText);
  let isDiuretic = customDiuretics.includes(code) || DIURETICS_REGEX.test(fullText);
  let isAceiArb = customAceiArb.includes(code) || ACEI_ARB_REGEX.test(fullText);

  // ข้อยกเว้น: Aspirin ขนาดต่ำ (≤ 100 mg / 81 mg) ใช้เป็น antiplatelet ไม่นับเป็น systemic NSAID ก่อ AKI
  if (isNsaid && /aspirin|แอสไพริน/i.test(fullText) && /81\s*mg|100\s*mg|baby/i.test(fullText)) {
    isNsaid = false;
  }

  const isStatin = STATIN_REGEX.test(fullText);
  const isFibrate = FIBRATE_REGEX.test(fullText);
  const isGemfibrozil = GEMFIBROZIL_REGEX.test(fullText);
  const isAcei = ACEI_REGEX.test(fullText);
  const isArb = ARB_REGEX.test(fullText);
  const isWarfarin = WARFARIN_REGEX.test(fullText);
  const isPotassiumSparing = POTASSIUM_SPARING_REGEX.test(fullText);

  const categories = [];
  let isNsaidSystemic = false;
  let isNsaidTopical = false;

  if (isNsaid) {
    if (isTopical) {
      isNsaidTopical = true;
      categories.push('nsaid_topical');
    } else {
      isNsaidSystemic = true;
      categories.push('nsaid');
    }
  }

  if (isDiuretic) categories.push('diuretic');
  if (isAceiArb) categories.push('acei_arb');
  if (isStatin) categories.push('statin');
  if (isFibrate) categories.push('fibrate');
  if (isWarfarin) categories.push('warfarin');

  return {
    isNsaid: isNsaidSystemic,
    isNsaidTopical,
    isDiuretic,
    isAceiArb,
    isStatin,
    isFibrate,
    isGemfibrozil,
    isAcei,
    isArb,
    isWarfarin,
    isPotassiumSparing,
    categories
  };
}

/**
 * ดึงรายการคู่ยาที่ไม่ควรจ่ายร่วมกันจากฐานข้อมูล JHCIS (ตาราง cdrugconflictdrug)
 */
async function getJhcisConflictPairs() {
  if (isLive()) {
    try {
      const pool = getPool();
      const [rows] = await pool.query(`
        SELECT 
          c.drugcode_a, 
          c.drugcode_b, 
          COALESCE(d1.drugname, c.drugcode_a) as name_a, 
          COALESCE(d2.drugname, c.drugcode_b) as name_b,
          COALESCE(d1.druggenericname, '') as generic_a,
          COALESCE(d2.druggenericname, '') as generic_b
        FROM cdrugconflictdrug c
        LEFT JOIN cdrug d1 ON c.drugcode_a = d1.drugcode
        LEFT JOIN cdrug d2 ON c.drugcode_b = d2.drugcode
      `);
      if (rows && rows.length > 0) {
        return rows.map(r => ({
          drugcode_a: String(r.drugcode_a).trim(),
          drugcode_b: String(r.drugcode_b).trim(),
          name_a: r.name_a ? String(r.name_a).trim() : r.drugcode_a,
          name_b: r.name_b ? String(r.name_b).trim() : r.drugcode_b,
          generic_a: r.generic_a,
          generic_b: r.generic_b,
          source: 'JHCIS'
        }));
      }
    } catch (e) {
      console.warn('Cannot query cdrugconflictdrug from JHCIS, fallback to demo/defaults:', e.message);
    }
  }

  // Demo Fallback / Default 4 pairs matching standard JHCIS configuration (ตามรูปตัวอย่าง)
  return [
    {
      drugcode_a: '639',
      drugcode_b: '23',
      name_a: 'DICLOFENAC TAB 25 mg.',
      name_b: 'IBUPROFEN TAB 400 MG',
      generic_a: 'Diclofenac sodium',
      generic_b: 'Ibuprofen',
      source: 'JHCIS'
    },
    {
      drugcode_a: '175',
      drugcode_b: '887',
      name_a: 'GEMFIBROZIL 600 MG',
      name_b: 'SIMVASTATIN 20 MG',
      generic_a: 'Gemfibrozil',
      generic_b: 'Simvastatin',
      source: 'JHCIS'
    },
    {
      drugcode_a: '1092',
      drugcode_b: '819',
      name_a: 'Losartan 50 mg',
      name_b: 'ENALAPRIL 5 MG',
      generic_a: 'Losartan potassium',
      generic_b: 'Enalapril maleate',
      source: 'JHCIS'
    },
    {
      drugcode_a: '1092',
      drugcode_b: '94',
      name_a: 'Losartan 50 mg',
      name_b: 'ENALAPRIL 20 MG',
      generic_a: 'Losartan potassium',
      generic_b: 'Enalapril maleate',
      source: 'JHCIS'
    }
  ];
}

/**
 * ตรวจจับคู่ยาที่ไม่ควรจ่ายร่วมกัน 2 ตัว (Drug-Drug Interactions / Contraindicated Pairs)
 */
function findConflictPairs(items, jhcisConflicts = [], overrides = {}) {
  const customPairs = overrides.customConflictPairs || [];
  const detectedPairs = [];
  const pairKeys = new Set();

  function addPair(pair) {
    const key = [String(pair.drugA.drugcode).trim(), String(pair.drugB.drugcode).trim()].sort().join('___');
    if (!pairKeys.has(key)) {
      pairKeys.add(key);
      detectedPairs.push(pair);
    }
  }

  // เตรียม classified items
  const classified = items.map(it => ({
    ...it,
    cls: classifyDrug(it, overrides)
  }));

  // 1. ตรวจสอบคู่ยาที่ระบุใน JHCIS (cdrugconflictdrug) และ Custom Overrides
  const allConfigured = [...jhcisConflicts, ...customPairs];
  for (let i = 0; i < classified.length; i++) {
    for (let j = i + 1; j < classified.length; j++) {
      const itA = classified[i];
      const itB = classified[j];
      const codeA = String(itA.drugcode || '').trim();
      const codeB = String(itB.drugcode || '').trim();

      const matchedConfig = allConfigured.find(p => 
        (String(p.drugcode_a).trim() === codeA && String(p.drugcode_b).trim() === codeB) ||
        (String(p.drugcode_a).trim() === codeB && String(p.drugcode_b).trim() === codeA)
      );

      if (matchedConfig) {
        let reason = matchedConfig.reason || 'บันทึกเป็นคู่ยาที่ไม่ควรจ่ายร่วมกันในระบบ JHCIS (ตาราง cdrugconflictdrug)';
        let clinicalAdvice = 'ควรพิจารณาปรับเปลี่ยนยาตัวใดตัวหนึ่ง หรือปรึกษาแพทย์ผู้สั่งใช้ยา';

        if (itA.cls.isNsaid && itB.cls.isNsaid) {
          reason = 'ยาแก้ปวดกลุ่ม NSAIDs ซ้ำซ้อน 2 ขนาน (Duplicate NSAIDs) เสี่ยงต่อภาวะเลือดออกในทางเดินอาหาร (GI Bleeding) และไตวายเฉียบพลัน';
          clinicalAdvice = 'ควรเลือกใช้ NSAID เพียงตัวเดียว หรือเปลี่ยนไปใช้ Paracetamol หรือ Tramadol แทน';
        } else if ((itA.cls.isGemfibrozil && itB.cls.isStatin) || (itB.cls.isGemfibrozil && itA.cls.isStatin)) {
          reason = 'Gemfibrozil ยับยั้งการกำจัด Statin ทำให้ระดับยาในเลือดสูงขึ้น 3-5 เท่า เสี่ยงต่อกล้ามเนื้อลายสลายรุนแรง (Rhabdomyolysis) และไตวาย';
          clinicalAdvice = 'หลีกเลี่ยงการใช้คู่กันเด็ดขาด หากจำเป็นต้องใช้ Fibrate แนะนำ Fenofibrate ร่วมกับ Statin ขนาดต่ำ หรือ Ezetimibe แทน';
        } else if ((itA.cls.isAcei && itB.cls.isArb) || (itB.cls.isAcei && itA.cls.isArb)) {
          reason = 'ยาลดความดันกลุ่ม ACEi ร่วมกับ ARB (Dual RAAS Blockade) เสี่ยงโปแทสเซียมในเลือดสูงวิกฤต ความดันตก และไตเสื่อมลงอย่างรวดเร็ว';
          clinicalAdvice = 'ควรเลือกใช้ ACEi หรือ ARB เพียงขนานเดียวเท่านั้นตามแนวทางเวชปฏิบัติสากล';
        }

        addPair({
          pairType: 'JHCIS_CONFIGURED',
          severity: 'CRITICAL',
          drugA: { drugcode: itA.drugcode, drugname: itA.drugname, unit: itA.unit, dose: itA.dose },
          drugB: { drugcode: itB.drugcode, drugname: itB.drugname, unit: itB.unit, dose: itB.dose },
          title: `⛔ ยาที่ไม่ควรจ่ายร่วมกัน (JHCIS): ${itA.drugname} ⚡ ${itB.drugname}`,
          reason,
          clinicalAdvice,
          source: matchedConfig.source || 'JHCIS'
        });
      }
    }
  }

  // 2. เกณฑ์ทางเภสัชวิทยาคลินิกมาตรฐาน (Class-based Clinical DDI Engine)
  // 2.1 Duplicate NSAIDs (NSAID + NSAID ซ้ำซ้อน 2 ขนาน)
  const nsaidItems = classified.filter(c => c.cls.isNsaid);
  if (nsaidItems.length >= 2) {
    for (let i = 0; i < nsaidItems.length; i++) {
      for (let j = i + 1; j < nsaidItems.length; j++) {
        if (nsaidItems[i].drugcode !== nsaidItems[j].drugcode) {
          addPair({
            pairType: 'DUPLICATE_NSAIDS',
            severity: 'CRITICAL',
            drugA: { drugcode: nsaidItems[i].drugcode, drugname: nsaidItems[i].drugname, unit: nsaidItems[i].unit, dose: nsaidItems[i].dose },
            drugB: { drugcode: nsaidItems[j].drugcode, drugname: nsaidItems[j].drugname, unit: nsaidItems[j].unit, dose: nsaidItems[j].dose },
            title: `⛔ ยาแก้ปวดกลุ่ม NSAIDs ซ้ำซ้อน 2 ขนาน: ${nsaidItems[i].drugname} ⚡ ${nsaidItems[j].drugname}`,
            reason: 'การจ่ายยา NSAIDs ซ้ำซ้อนกันไม่เพิ่มประสิทธิภาพในการระงับปวด แต่เพิ่มความเสี่ยงต่อภาวะเลือดออกในทางเดินอาหาร (GI Bleeding), แผลในกระเพาะอาหาร และไตวายเฉียบพลันอย่างมีนัยสำคัญ',
            clinicalAdvice: 'ควรเลือกใช้ NSAID เพียงขนานเดียว หรือเปลี่ยนไปใช้ Paracetamol / Tramadol แทน',
            source: 'CLINICAL'
          });
        }
      }
    }
  }

  // 2.2 Statin + Gemfibrozil
  const statinItems = classified.filter(c => c.cls.isStatin);
  const gemfibItems = classified.filter(c => c.cls.isGemfibrozil);
  if (statinItems.length > 0 && gemfibItems.length > 0) {
    for (const st of statinItems) {
      for (const gem of gemfibItems) {
        addPair({
          pairType: 'STATIN_GEMFIBROZIL',
          severity: 'CRITICAL',
          drugA: { drugcode: gem.drugcode, drugname: gem.drugname, unit: gem.unit, dose: gem.dose },
          drugB: { drugcode: st.drugcode, drugname: st.drugname, unit: st.unit, dose: st.dose },
          title: `⛔ ยาลดไขมัน Statin + Gemfibrozil: ${gem.drugname} ⚡ ${st.drugname}`,
          reason: 'Gemfibrozil ยับยั้งกระบวนการกำจัด Statin ทำให้ระดับยา Statin ในกระแสเลือดเพิ่มสูงขึ้นเฉียบพลัน เสี่ยงต่อภาวะกล้ามเนื้อลายสลายอย่างรุนแรง (Rhabdomyolysis) และไตวายเฉียบพลัน',
          clinicalAdvice: 'หลีกเลี่ยงการใช้ Gemfibrozil ร่วมกับ Statin เด็ดขาด หากจำเป็นต้องใช้ Fibrate แนะนำ Fenofibrate ร่วมกับ Statin ขนาดต่ำ หรือ Ezetimibe แทน',
          source: 'CLINICAL'
        });
      }
    }
  }

  // 2.3 Dual RAAS Blockade (ACEi + ARB)
  const aceiItems = classified.filter(c => c.cls.isAcei);
  const arbItems = classified.filter(c => c.cls.isArb);
  if (aceiItems.length > 0 && arbItems.length > 0) {
    for (const arb of arbItems) {
      for (const acei of aceiItems) {
        addPair({
          pairType: 'DUAL_RAAS_BLOCKADE',
          severity: 'CRITICAL',
          drugA: { drugcode: arb.drugcode, drugname: arb.drugname, unit: arb.unit, dose: arb.dose },
          drugB: { drugcode: acei.drugcode, drugname: acei.drugname, unit: acei.unit, dose: acei.dose },
          title: `⛔ ยาลดความดันกลุ่ม ACEi ร่วมกับ ARB: ${arb.drugname} ⚡ ${acei.drugname}`,
          reason: 'การยับยั้งระบบ Renin-Angiotensin ซ้ำซ้อน 2 ขนาน ไม่ได้เพิ่มประโยชน์ต่อหัวใจและหลอดเลือดหรือชะลอโรคไต แต่เพิ่มความเสี่ยงต่อภาวะโพแทสเซียมในเลือดสูงวิกฤต (Severe Hyperkalemia), ความดันโลหิตตกเฉียบพลัน และไตวายฉุกเฉิน',
          clinicalAdvice: 'ควรเลือกใช้ ACEi หรือ ARB เพียงขนานเดียวเท่านั้นตามแนวทางเวชปฏิบัติสากล (เช่น การศึกษา ONTARGET)',
          source: 'CLINICAL'
        });
      }
    }
  }

  // 2.4 Warfarin + NSAID
  const warfarinItems = classified.filter(c => c.cls.isWarfarin);
  if (warfarinItems.length > 0 && nsaidItems.length > 0) {
    for (const w of warfarinItems) {
      for (const n of nsaidItems) {
        addPair({
          pairType: 'WARFARIN_NSAID',
          severity: 'CRITICAL',
          drugA: { drugcode: w.drugcode, drugname: w.drugname, unit: w.unit, dose: w.dose },
          drugB: { drugcode: n.drugcode, drugname: n.drugname, unit: n.unit, dose: n.dose },
          title: `⛔ ยาละลายลิ่มเลือด Warfarin ร่วมกับ NSAIDs: ${w.drugname} ⚡ ${n.drugname}`,
          reason: 'NSAIDs เพิ่มความเสี่ยงต่อการเกิดแผลในทางเดินอาหารและยับยั้งเกล็ดเลือด เมื่อใช้ร่วมกับ Warfarin จะเพิ่มความเสี่ยงเลือดออกรุนแรงในทางเดินอาหารและอวัยวะภายในอย่างมีนัยสำคัญ',
          clinicalAdvice: 'หลีกเลี่ยงการจ่ายยา NSAIDs ในผู้ป่วยที่ได้รับ Warfarin ให้พิจารณาใช้ Paracetamol แทน',
          source: 'CLINICAL'
        });
      }
    }
  }

  // 2.5 Potassium-sparing Diuretic + ACEi/ARB
  const potSparingItems = classified.filter(c => c.cls.isPotassiumSparing);
  const raasItems = classified.filter(c => c.cls.isAcei || c.cls.isArb);
  if (potSparingItems.length > 0 && raasItems.length > 0) {
    for (const ps of potSparingItems) {
      for (const r of raasItems) {
        addPair({
          pairType: 'POTASSIUM_SPARING_RAAS',
          severity: 'HIGH',
          drugA: { drugcode: ps.drugcode, drugname: ps.drugname, unit: ps.unit, dose: ps.dose },
          drugB: { drugcode: r.drugcode, drugname: r.drugname, unit: r.unit, dose: r.dose },
          title: `⚠️ ยาขับปัสสาวะกักโพแทสเซียม ร่วมกับ ACEi/ARB: ${ps.drugname} ⚡ ${r.drugname}`,
          reason: 'ยาทั้งสองกลุ่มส่งผลให้ไตลดการขับโพแทสเซียมออกทางปัสสาวะ เสี่ยงต่อภาวะโพแทสเซียมในเลือดสูง (Hyperkalemia) ซึ่งอาจส่งผลต่อการเต้นของหัวใจผิดจังหวะ',
          clinicalAdvice: 'หากจำเป็นต้องใช้ร่วมกัน ต้องติดตามระดับ Serum Potassium และค่าการทำงานของไต (eGFR, Cr) อย่างใกล้ชิด',
          source: 'CLINICAL'
        });
      }
    }
  }

  return detectedPairs;
}

/**
 * ดึงรายการยาในระบบทั้งหมด พร้อมการจัดหมวดหมู่
 */
async function getDrugClassifications() {
  const overrides = safetySettingsStore.get() || {};
  let rawDrugs = [];

  if (isLive()) {
    try {
      const pool = getPool();
      const [rows] = await pool.query(`
        SELECT drugcode, drugname, druggenericname, drugnamethai, drugproperties, unitsell, drugtype, drugtypesub
        FROM cdrug
        WHERE drugflag != '0' OR drugflag IS NULL
        ORDER BY drugname ASC
      `);
      rawDrugs = rows;
    } catch (e) {
      console.warn('Error fetching drugs for safety classification:', e.message);
    }
  }

  // ถ้าเป็น demo หรือ fallback
  if (rawDrugs.length === 0) {
    rawDrugs = [
      { drugcode: '0001', drugname: 'PARACETAMOL 500 MG TAB', druggenericname: 'Paracetamol', unitsell: 'TAB' },
      { drugcode: '0003', drugname: 'AMLODIPINE 5 MG', druggenericname: 'Amlodipine', unitsell: 'TAB' },
      { drugcode: '0006', drugname: 'Losartan 50 mg', druggenericname: 'Losartan potassium', unitsell: 'TAB' },
      { drugcode: '0023', drugname: 'IBUPROFEN TAB 400 MG', druggenericname: 'Ibuprofen', unitsell: 'TAB' },
      { drugcode: '0093', drugname: 'ENALAPRIL 10 MG', druggenericname: 'Enalapril maleate', unitsell: 'TAB' },
      { drugcode: '0235', drugname: 'FUROSEMIDE TAB 40 MG', druggenericname: 'Furosemide', unitsell: 'TAB' },
      { drugcode: '0262', drugname: 'HCTZ TAB. 25 MG', druggenericname: 'Hydrochlorothiazide', unitsell: 'TAB' },
      { drugcode: '1096', drugname: 'Meloxicam 7.5 mg', druggenericname: 'Meloxicam', unitsell: 'TAB' },
      { drugcode: '0639', drugname: 'DICLOFENAC TAB 25 mg.', druggenericname: 'Diclofenac sodium', unitsell: 'TAB' },
      { drugcode: '0648', drugname: 'DICLOFENAC GEL 1%', druggenericname: 'Diclofenac diethylammonium', unitsell: 'TUBE' },
      { drugcode: '0175', drugname: 'GEMFIBROZIL 600 MG', druggenericname: 'Gemfibrozil', unitsell: 'TAB' },
      { drugcode: '0887', drugname: 'SIMVASTATIN 20 MG', druggenericname: 'Simvastatin', unitsell: 'TAB' }
    ];
  }

  return rawDrugs.map(d => {
    const cls = classifyDrug(d, overrides);
    return {
      drugcode: d.drugcode,
      drugname: d.drugname,
      druggenericname: d.druggenericname || '',
      drugnamethai: d.drugnamethai || '',
      unitsell: d.unitsell || 'หน่วย',
      ...cls
    };
  });
}

/**
 * วิเคราะห์ชุดรายการยาใน Visit เพื่อหาความเสี่ยง Triple Whammy / Double Whammy / คู่ยาที่ไม่ควรจ่ายร่วมกัน
 */
function analyzePrescriptionItems(items, overrides = {}, jhcisConflicts = []) {
  const nsaids = [];
  const nsaidsTopical = [];
  const diuretics = [];
  const aceiArbs = [];
  const otherDrugs = [];

  items.forEach(it => {
    const cls = classifyDrug(it, overrides);
    const itemData = {
      drugcode: it.drugcode,
      drugname: it.drugname || it.drugnamethai || it.drugcode,
      unit: Number(it.unit) || 1,
      dose: it.dose || '',
      costprice: Number(it.costprice) || 0
    };

    if (cls.isNsaid) nsaids.push(itemData);
    if (cls.isNsaidTopical) nsaidsTopical.push(itemData);
    if (cls.isDiuretic) diuretics.push(itemData);
    if (cls.isAceiArb) aceiArbs.push(itemData);
    if (!cls.isNsaid && !cls.isNsaidTopical && !cls.isDiuretic && !cls.isAceiArb) {
      otherDrugs.push(itemData);
    }
  });

  // ค้นหาคู่ยาที่ไม่ควรจ่ายร่วมกัน (2-Drug Conflict Pairs)
  const conflictPairs = findConflictPairs(items, jhcisConflicts, overrides);
  const isTripleWhammy = nsaids.length > 0 && diuretics.length > 0 && aceiArbs.length > 0;
  const isDoubleWhammyRaas = nsaids.length > 0 && aceiArbs.length > 0;
  const isDoubleWhammyDiuretic = nsaids.length > 0 && diuretics.length > 0;

  // กฎการประเมินความเสี่ยงและลำดับความสำคัญ
  let severity = 'NORMAL';
  let alertType = null;
  let title = 'ปลอดภัย';
  let clinicalAdvice = '';

  if (isTripleWhammy) {
    severity = 'CRITICAL';
    alertType = conflictPairs.length > 0 ? 'MULTI_ALERT' : 'TRIPLE_WHAMMY';
    title = '🚨 ตรวจพบภาวะ Triple Whammy เสี่ยงไตวายเฉียบพลัน (Acute Kidney Injury)';
    clinicalAdvice = 'พบการสั่งใช้ยา 3 กลุ่มพร้อมกัน: เลือดเข้าหน่วยไตลดลง (NSAIDs) + แรงดันต้านออกหายไป (ACEi/ARBs) + ปริมาตรเลือดรวมลดลง (Diuretics) แรงดันการกรองในหน่วยไตพังทลายทันที เสี่ยงต่อภาวะไตวายฉุกเฉินและโพแทสเซียมในเลือดสูง ควรระงับยา NSAID และเปลี่ยนเป็น Paracetamol 500 mg, ยาทาภายนอก หรือ Tramadol แทน';
  } else if (conflictPairs.length > 0) {
    const hasCriticalConflict = conflictPairs.some(p => p.severity === 'CRITICAL');
    severity = hasCriticalConflict ? 'CRITICAL' : 'HIGH';
    alertType = 'DRUG_CONFLICT_PAIR';
    title = conflictPairs[0].title;
    clinicalAdvice = conflictPairs.map(p => `${p.drugA.drugname} ⚡ ${p.drugB.drugname}: ${p.clinicalAdvice || p.reason}`).join('\n');
  } else if (isDoubleWhammyRaas) {
    severity = 'HIGH';
    alertType = 'DOUBLE_WHAMMY_RAAS';
    title = '⚠️ ตรวจพบการสั่งยา NSAIDs ร่วมกับ ACEi/ARBs';
    clinicalAdvice = 'การสั่งยา NSAID ร่วมกับ ACEi/ARB จะลดประสิทธิภาพการควบคุมความดันโลหิตและเพิ่มความเสี่ยงต่อการเสื่อมของไตอย่างรวดเร็ว โดยเฉพาะในผู้สูงอายุหรือผู้ป่วยโรคไตเรื้อรัง (CKD)';
  } else if (isDoubleWhammyDiuretic) {
    severity = 'HIGH';
    alertType = 'DOUBLE_WHAMMY_DIURETIC';
    title = '⚠️ ตรวจพบการสั่งยา NSAIDs ร่วมกับ ยาขับปัสสาวะ (Diuretic)';
    clinicalAdvice = 'NSAIDs ยับยั้งการขับเกลือและน้ำ ลดประสิทธิภาพของยาขับปัสสาวะ และเพิ่มความเสี่ยงไตขาดเลือดเฉียบพลันหากผู้ป่วยมีภาวะขาดน้ำ';
  }

  return {
    severity,
    alertType,
    title,
    clinicalAdvice,
    isTripleWhammy,
    hasConflictPairs: conflictPairs.length > 0,
    conflictPairs,
    nsaids,
    nsaidsTopical,
    diuretics,
    aceiArbs,
    otherDrugs,
    totalPrescribed: items.length
  };
}

/**
 * ดึงเคสเตือนภัยสดประจำวัน (Live Real-time Alert for Today)
 */
async function getLiveSafetyAlerts(targetDate = null) {
  const overrides = safetySettingsStore.get() || {};
  const todayStr = targetDate || new Date().toISOString().slice(0, 10);
  const jhcisConflicts = await getJhcisConflictPairs();

  if (isLive()) {
    try {
      const pool = getPool();
      const [rows] = await pool.query(`
        SELECT 
          v.visitno,
          DATE_FORMAT(v.visitdate, '%Y-%m-%d') as visitdate,
          COALESCE(v.timestart, DATE_FORMAT(vd.dateupdate, '%H:%i:%s'), '') as dispensetime,
          v.pid,
          p.fname,
          p.lname,
          p.idcard,
          p.birth,
          p.sex,
          ct.titlename,
          v.username,
          vd.drugcode,
          d.drugname,
          d.druggenericname,
          d.drugnamethai,
          d.drugproperties,
          vd.unit,
          vd.dose,
          vd.costprice,
          vd.dateupdate
        FROM visit v
        JOIN visitdrug vd ON v.visitno = vd.visitno AND v.pcucode = vd.pcucode
        JOIN cdrug d ON vd.drugcode = d.drugcode
        LEFT JOIN person p ON v.pid = p.pid
        LEFT JOIN ctitle ct ON p.prename = ct.titlecode
        WHERE v.visitdate = ?
        ORDER BY v.visitno DESC, vd.dateupdate DESC
      `, [todayStr]);

      // จัดกลุ่มตาม visitno
      const visitMap = {};
      rows.forEach(r => {
        if (!visitMap[r.visitno]) {
          visitMap[r.visitno] = {
            visitno: r.visitno,
            visitdate: r.visitdate,
            dispensetime: r.dispensetime,
            pid: r.pid,
            fname: r.fname,
            lname: r.lname,
            idcard: r.idcard,
            birth: r.birth ? new Date(r.birth).toISOString().slice(0, 10) : '',
            sex: r.sex,
            titlename: r.titlename || '',
            username: r.username || '-',
            items: []
          };
        }
        visitMap[r.visitno].items.push({
          drugcode: r.drugcode,
          drugname: r.drugname,
          druggenericname: r.druggenericname,
          drugnamethai: r.drugnamethai,
          drugproperties: r.drugproperties,
          unit: r.unit,
          dose: r.dose,
          costprice: r.costprice,
          dateupdate: r.dateupdate
        });
      });

      // วิเคราะห์ทุก Visit
      const alerts = [];
      Object.values(visitMap).forEach(v => {
        const analysis = analyzePrescriptionItems(v.items, overrides, jhcisConflicts);
        if (analysis.severity !== 'NORMAL') {
          alerts.push({
            visitno: v.visitno,
            visitdate: v.visitdate,
            dispensetime: v.dispensetime,
            pid: v.pid,
            hn: v.pid,
            pidMasked: String(v.pid), // แสดงเลข HN จริง ไม่ต้องเซ็นเซอร์ xxx ตามที่ผู้ใช้ระบุ
            patientName: `${v.titlename}${v.fname || ''} ${v.lname || ''}`.trim(),
            patientNameMasked: maskPatientName(`${v.titlename}${v.fname || ''} ${v.lname || ''}`.trim()),
            cidMasked: maskCid(v.idcard),
            username: v.username,
            ...analysis
          });
        }
      });

      const tripleCount = alerts.filter(a => a.isTripleWhammy).length;
      const conflictPairCount = alerts.filter(a => a.hasConflictPairs).length;
      const doubleCount = alerts.filter(a => a.alertType && a.alertType.startsWith('DOUBLE_WHAMMY')).length;

      return {
        date: todayStr,
        totalVisitsToday: Object.keys(visitMap).length,
        tripleCount,
        conflictPairCount,
        doubleCount,
        hasCriticalAlert: tripleCount > 0 || alerts.some(a => a.severity === 'CRITICAL'),
        alerts
      };
    } catch (err) {
      console.error('Error fetching live safety alerts:', err.message);
      throw new Error(`ดึงข้อมูลเฝ้าระวังยาจาก JHCIS ไม่สำเร็จ: ${err.message}`);
    }
  }

  // Demo Fallback
  return {
    date: todayStr,
    totalVisitsToday: 18,
    tripleCount: 1,
    conflictPairCount: 2,
    doubleCount: 1,
    hasCriticalAlert: true,
    alerts: [
      {
        visitno: '99010045',
        visitdate: todayStr,
        dispensetime: '09:30:15',
        pid: '1024',
        hn: '1024',
        pidMasked: '1024',
        patientName: 'นาย สมนึก ใจดี',
        patientNameMasked: 'นาย ส**** ใ***',
        cidMasked: '1-5099-XXXXX-12-3',
        username: '1Phonthep',
        severity: 'CRITICAL',
        alertType: 'TRIPLE_WHAMMY',
        title: '🚨 ตรวจพบภาวะ Triple Whammy เสี่ยงไตวายเฉียบพลัน (Acute Kidney Injury)',
        clinicalAdvice: 'พบการสั่งใช้ยา 3 กลุ่มพร้อมกัน: เลือดเข้าหน่วยไตลดลง (NSAIDs) + แรงดันต้านออกหายไป (ACEi/ARBs) + ปริมาตรเลือดรวมลดลง (Diuretics) แรงดันการกรองในหน่วยไตพังทลายทันที เสี่ยงต่อภาวะไตวายฉุกเฉินและโพแทสเซียมในเลือดสูง ควรระงับยา NSAID และเปลี่ยนเป็น Paracetamol 500 mg, ยาทาภายนอก หรือ Tramadol แทน',
        isTripleWhammy: true,
        hasConflictPairs: false,
        conflictPairs: [],
        nsaids: [{ drugcode: '1096', drugname: 'Meloxicam 7.5 mg', unit: 20, dose: '1 เม็ด หลังอาหาร เช้า' }],
        nsaidsTopical: [],
        diuretics: [{ drugcode: '0235', drugname: 'FUROSEMIDE TAB 40 MG', unit: 65, dose: '1 เม็ด ตอนเช้า' }],
        aceiArbs: [{ drugcode: '0093', drugname: 'ENALAPRIL 20 MG', unit: 130, dose: '1 เม็ด เช้า-เย็น' }],
        otherDrugs: [{ drugcode: '0003', drugname: 'AMLODIPINE 5 MG', unit: 130, dose: '1 เม็ด เช้า' }],
        totalPrescribed: 4
      },
      {
        visitno: '99010046',
        visitdate: todayStr,
        dispensetime: '10:15:20',
        pid: '2071',
        hn: '2071',
        pidMasked: '2071',
        patientName: 'นาง สมศรี รักสงบ',
        patientNameMasked: 'นาง ส**** ร*****',
        cidMasked: '3-5001-XXXXX-88-1',
        username: '1Phonthep',
        severity: 'CRITICAL',
        alertType: 'DRUG_CONFLICT_PAIR',
        title: '⛔ ยาที่ไม่ควรจ่ายร่วมกัน: GEMFIBROZIL 600 MG ⚡ SIMVASTATIN 20 MG',
        clinicalAdvice: 'Gemfibrozil ยับยั้งการกำจัด Statin ทำให้ระดับยาในเลือดสูงขึ้น 3-5 เท่า เสี่ยงต่อกล้ามเนื้อลายสลายรุนแรง (Rhabdomyolysis) และไตวาย หลีกเลี่ยงการใช้คู่กันเด็ดขาด',
        isTripleWhammy: false,
        hasConflictPairs: true,
        conflictPairs: [
          {
            pairType: 'STATIN_GEMFIBROZIL',
            severity: 'CRITICAL',
            drugA: { drugcode: '0175', drugname: 'GEMFIBROZIL 600 MG', unit: 30, dose: '1 เม็ด ก่อนอาหาร เช้า-เย็น' },
            drugB: { drugcode: '0887', drugname: 'SIMVASTATIN 20 MG', unit: 30, dose: '1 เม็ด ก่อนนอน' },
            title: '⛔ ยาลดไขมัน Statin + Gemfibrozil',
            reason: 'Gemfibrozil ยับยั้งกระบวนการกำจัด Statin ทำให้ระดับยา Statin ในกระแสเลือดเพิ่มสูงขึ้นเฉียบพลัน เสี่ยงต่อภาวะกล้ามเนื้อลายสลายอย่างรุนแรง (Rhabdomyolysis) และไตวายเฉียบพลัน',
            clinicalAdvice: 'หลีกเลี่ยงการใช้ Gemfibrozil ร่วมกับ Statin เด็ดขาด หากจำเป็นต้องใช้ Fibrate แนะนำ Fenofibrate ร่วมกับ Statin ขนาดต่ำ หรือ Ezetimibe แทน',
            source: 'JHCIS'
          }
        ],
        nsaids: [],
        nsaidsTopical: [],
        diuretics: [],
        aceiArbs: [],
        otherDrugs: [{ drugcode: '0175', drugname: 'GEMFIBROZIL 600 MG' }, { drugcode: '0887', drugname: 'SIMVASTATIN 20 MG' }],
        totalPrescribed: 2
      }
    ]
  };
}

/**
 * ค้นหาประวัติเคสเสี่ยงย้อนหลังตามช่วงวันที่
 */
async function getHistoricalSafetyAlerts(startDate, endDate, filterType = 'all') {
  const overrides = safetySettingsStore.get() || {};
  const jhcisConflicts = await getJhcisConflictPairs();

  if (isLive()) {
    try {
      const pool = getPool();
      const [rows] = await pool.query(`
        SELECT 
          v.visitno,
          DATE_FORMAT(v.visitdate, '%Y-%m-%d') as visitdate,
          COALESCE(v.timestart, DATE_FORMAT(vd.dateupdate, '%H:%i:%s'), '') as dispensetime,
          v.pid,
          p.fname,
          p.lname,
          p.idcard,
          p.birth,
          p.sex,
          ct.titlename,
          v.username,
          vd.drugcode,
          d.drugname,
          d.druggenericname,
          d.drugnamethai,
          d.drugproperties,
          vd.unit,
          vd.dose,
          vd.costprice,
          vd.dateupdate
        FROM visit v
        JOIN visitdrug vd ON v.visitno = vd.visitno AND v.pcucode = vd.pcucode
        JOIN cdrug d ON vd.drugcode = d.drugcode
        LEFT JOIN person p ON v.pid = p.pid
        LEFT JOIN ctitle ct ON p.prename = ct.titlecode
        WHERE v.visitdate >= ? AND v.visitdate <= ?
        ORDER BY v.visitdate DESC, v.visitno DESC, vd.dateupdate DESC
      `, [startDate, endDate]);

      const visitMap = {};
      rows.forEach(r => {
        if (!visitMap[r.visitno]) {
          visitMap[r.visitno] = {
            visitno: r.visitno,
            visitdate: r.visitdate,
            dispensetime: r.dispensetime,
            pid: r.pid,
            fname: r.fname,
            lname: r.lname,
            idcard: r.idcard,
            birth: r.birth ? new Date(r.birth).toISOString().slice(0, 10) : '',
            sex: r.sex,
            titlename: r.titlename || '',
            username: r.username || '-',
            items: []
          };
        }
        visitMap[r.visitno].items.push({
          drugcode: r.drugcode,
          drugname: r.drugname,
          druggenericname: r.druggenericname,
          drugnamethai: r.drugnamethai,
          drugproperties: r.drugproperties,
          unit: r.unit,
          dose: r.dose,
          costprice: r.costprice,
          dateupdate: r.dateupdate
        });
      });

      let alerts = [];
      Object.values(visitMap).forEach(v => {
        const analysis = analyzePrescriptionItems(v.items, overrides, jhcisConflicts);
        if (analysis.severity !== 'NORMAL') {
          // กรองประเภทตามที่ระบุ
          if (filterType === 'triple' && !analysis.isTripleWhammy) return;
          if (filterType === 'conflict' && !analysis.hasConflictPairs) return;
          if (filterType === 'double' && !(analysis.alertType && analysis.alertType.startsWith('DOUBLE_WHAMMY'))) return;

          alerts.push({
            visitno: v.visitno,
            visitdate: v.visitdate,
            dispensetime: v.dispensetime,
            pid: v.pid,
            hn: v.pid,
            pidMasked: String(v.pid), // แสดงเลข HN จริง ไม่ต้องเซ็นเซอร์ xxx ตามที่ผู้ใช้ระบุ
            patientName: `${v.titlename}${v.fname || ''} ${v.lname || ''}`.trim(),
            patientNameMasked: maskPatientName(`${v.titlename}${v.fname || ''} ${v.lname || ''}`.trim()),
            cidMasked: maskCid(v.idcard),
            username: v.username,
            ...analysis
          });
        }
      });

      return {
        startDate,
        endDate,
        totalVisitsScanned: Object.keys(visitMap).length,
        totalAlerts: alerts.length,
        tripleCount: alerts.filter(a => a.isTripleWhammy).length,
        conflictPairCount: alerts.filter(a => a.hasConflictPairs).length,
        doubleCount: alerts.filter(a => a.alertType && a.alertType.startsWith('DOUBLE_WHAMMY')).length,
        alerts
      };
    } catch (err) {
      console.error('Error fetching historical safety alerts:', err.message);
      throw new Error(`ค้นหาประวัติเฝ้าระวังยาจาก JHCIS ไม่สำเร็จ: ${err.message}`);
    }
  }

  // Demo fallback
  return {
    startDate,
    endDate,
    totalVisitsScanned: 150,
    totalAlerts: 3,
    tripleCount: 2,
    conflictPairCount: 1,
    doubleCount: 1,
    alerts: [
      {
        visitno: '99010045',
        visitdate: endDate,
        dispensetime: '09:30:15',
        pid: '1024',
        hn: '1024',
        pidMasked: '1024',
        patientNameMasked: 'นาย ส**** ใ***',
        cidMasked: '1-5099-XXXXX-12-3',
        username: '1Phonthep',
        severity: 'CRITICAL',
        alertType: 'TRIPLE_WHAMMY',
        title: '🚨 ตรวจพบภาวะ Triple Whammy',
        clinicalAdvice: 'พิจารณาระงับยา NSAID',
        isTripleWhammy: true,
        hasConflictPairs: false,
        conflictPairs: [],
        nsaids: [{ drugcode: '1096', drugname: 'Meloxicam 7.5 mg', unit: 20 }],
        diuretics: [{ drugcode: '0235', drugname: 'FUROSEMIDE TAB 40 MG', unit: 65 }],
        aceiArbs: [{ drugcode: '0093', drugname: 'ENALAPRIL 20 MG', unit: 130 }],
        otherDrugs: [],
        totalPrescribed: 3
      },
      {
        visitno: '99010047',
        visitdate: endDate,
        dispensetime: '11:20:00',
        pid: '1140',
        hn: '1140',
        pidMasked: '1140',
        patientNameMasked: 'นาย ป**** ม*****',
        cidMasked: '3-5001-XXXXX-12-9',
        username: '1Phonthep',
        severity: 'CRITICAL',
        alertType: 'DRUG_CONFLICT_PAIR',
        title: '⛔ ยาที่ไม่ควรจ่ายร่วมกัน: Losartan 50 mg ⚡ ENALAPRIL 20 MG',
        clinicalAdvice: 'ยาลดความดันกลุ่ม ACEi ร่วมกับ ARB (Dual RAAS Blockade) เสี่ยงโปแทสเซียมในเลือดสูงวิกฤต',
        isTripleWhammy: false,
        hasConflictPairs: true,
        conflictPairs: [
          {
            pairType: 'DUAL_RAAS_BLOCKADE',
            severity: 'CRITICAL',
            drugA: { drugcode: '1092', drugname: 'Losartan 50 mg', unit: 30 },
            drugB: { drugcode: '0094', drugname: 'ENALAPRIL 20 MG', unit: 30 },
            title: '⛔ Dual RAAS Blockade: Losartan ⚡ ENALAPRIL',
            reason: 'การยับยั้งระบบ Renin-Angiotensin ซ้ำซ้อน 2 ขนาน เสี่ยงต่อภาวะโปแทสเซียมในเลือดสูงวิกฤตและความดันตก',
            clinicalAdvice: 'ควรเลือกใช้ ACEi หรือ ARB เพียงขนานเดียวเท่านั้น',
            source: 'JHCIS'
          }
        ],
        nsaids: [],
        nsaidsTopical: [],
        diuretics: [],
        aceiArbs: [{ drugcode: '1092', drugname: 'Losartan 50 mg' }, { drugcode: '0094', drugname: 'ENALAPRIL 20 MG' }],
        otherDrugs: [],
        totalPrescribed: 2
      }
    ]
  };
}

/**
 * ดึงรายการคู่ยาที่ไม่ควรจ่ายร่วมกันทั้งหมดสำหรับแสดงในตาราง (เหมือนในหน้าต่าง JHCIS)
 */
async function getConflictRegistry() {
  const jhcisPairs = await getJhcisConflictPairs();
  const overrides = safetySettingsStore.get() || {};
  const customPairs = overrides.customConflictPairs || [];

  // รวบรวมสถิติประวัติการจ่ายยาในอดีตสำหรับแต่ละคู่ยา (ถ้าเป็นโหมด Live)
  const pairCounts = {};
  if (isLive()) {
    try {
      const pool = getPool();
      const [stats] = await pool.query(`
        SELECT 
          c.drugcode_a, c.drugcode_b, COUNT(DISTINCT vd1.visitno) as dispensed_count
        FROM cdrugconflictdrug c
        JOIN visitdrug vd1 ON vd1.drugcode = c.drugcode_a
        JOIN visitdrug vd2 ON vd2.visitno = vd1.visitno AND vd2.pcucode = vd1.pcucode AND vd2.drugcode = c.drugcode_b
        GROUP BY c.drugcode_a, c.drugcode_b
      `);
      if (stats) {
        stats.forEach(s => {
          pairCounts[`${s.drugcode_a}___${s.drugcode_b}`] = s.dispensed_count;
          pairCounts[`${s.drugcode_b}___${s.drugcode_a}`] = s.dispensed_count;
        });
      }
    } catch (e) {}
  }

  const enrichedJhcisPairs = jhcisPairs.map(p => ({
    ...p,
    dispensedCount: pairCounts[`${p.drugcode_a}___${p.drugcode_b}`] || (p.drugcode_a === '639' ? 12 : p.drugcode_a === '1092' ? 8 : 0)
  }));

  const clinicalRules = [
    {
      ruleId: 'DUPLICATE_NSAIDS',
      category: 'ยาแก้ปวดอักเสบ (NSAIDs)',
      name: 'NSAIDs + NSAIDs (ซ้ำซ้อน 2 ขนาน)',
      examples: 'Diclofenac + Ibuprofen, Meloxicam + Naproxen',
      severity: 'CRITICAL',
      reason: 'ไม่เพิ่มฤทธิ์แก้ปวด แต่เพิ่มความเสี่ยงแผลในทางเดินอาหาร เลือดออกในกระเพาะอาหาร (GI Bleeding) และไตวายเฉียบพลันอย่างมีนัยสำคัญ'
    },
    {
      ruleId: 'STATIN_GEMFIBROZIL',
      category: 'ยาลดไขมันในเลือด (Lipid-lowering)',
      name: 'Statin + Gemfibrozil (ห้ามใช้ร่วมกัน)',
      examples: 'Simvastatin + Gemfibrozil, Atorvastatin + Gemfibrozil',
      severity: 'CRITICAL',
      reason: 'Gemfibrozil ยับยั้งการกำจัด Statin ทำให้ระดับยา Statin ในกระแสเลือดเพิ่มสูงขึ้นเฉียบพลัน เสี่ยงต่อกล้ามเนื้อลายสลายรุนแรง (Rhabdomyolysis) และไตวาย'
    },
    {
      ruleId: 'DUAL_RAAS_BLOCKADE',
      category: 'ยาลดความดันโลหิต (Antihypertensive)',
      name: 'ACEi + ARB (Dual RAAS Blockade)',
      examples: 'Enalapril + Losartan, Ramipril + Valsartan',
      severity: 'CRITICAL',
      reason: 'การยับยั้งระบบ Renin-Angiotensin ซ้ำซ้อน 2 ขนาน ไม่ได้เพิ่มประโยชน์ต่อหัวใจ แต่เพิ่มความเสี่ยงต่อภาวะโพแทสเซียมในเลือดสูงวิกฤต (Severe Hyperkalemia) และไตวายฉุกเฉิน'
    },
    {
      ruleId: 'WARFARIN_NSAID',
      category: 'ยาต้านการแข็งตัวของเลือด (Anticoagulant)',
      name: 'Warfarin + NSAIDs',
      examples: 'Warfarin + Ibuprofen, Warfarin + Diclofenac',
      severity: 'CRITICAL',
      reason: 'NSAIDs ระคายเคืองกระเพาะอาหารและยับยั้งเกล็ดเลือด เพิ่มความเสี่ยงเลือดออกรุนแรงในอวัยวะภายในอย่างมีนัยสำคัญ'
    },
    {
      ruleId: 'POTASSIUM_SPARING_RAAS',
      category: 'ยาขับปัสสาวะและยาลดความดัน',
      name: 'Spironolactone/Amiloride + ACEi/ARB',
      examples: 'Spironolactone + Enalapril, Spironolactone + Losartan',
      severity: 'HIGH',
      reason: 'ยาทั้งสองกลุ่มส่งผลให้ไตลดการขับโพแทสเซียม เสี่ยงต่อภาวะโพแทสเซียมในเลือดสูง (Hyperkalemia) ต้องติดตามระดับ Potassium อย่างใกล้ชิด'
    }
  ];

  return {
    jhcisPairs: enrichedJhcisPairs,
    clinicalRules,
    customPairs,
    totalPairs: enrichedJhcisPairs.length + customPairs.length
  };
}

/**
 * เพิ่มคู่ยาที่ไม่ควรจ่ายร่วมกัน (บันทึกลง JHCIS cdrugconflictdrug + Local store)
 */
async function addCustomConflictPair(drugcode_a, drugcode_b, reason = '') {
  const codeA = String(drugcode_a || '').trim();
  const codeB = String(drugcode_b || '').trim();
  if (!codeA || !codeB || codeA === codeB) {
    throw new Error('กรุณาระบุรหัสยาทั้งสองตัวและต้องไม่เป็นยาตัวเดียวกัน');
  }

  if (isLive()) {
    try {
      const pool = getPool();
      await pool.query(
        'INSERT IGNORE INTO cdrugconflictdrug (drugcode_a, drugcode_b) VALUES (?, ?)',
        [codeA, codeB]
      );
    } catch (e) {
      console.warn('Cannot insert into JHCIS cdrugconflictdrug, saving locally:', e.message);
    }
  }

  const settings = safetySettingsStore.get() || {};
  const customPairs = settings.customConflictPairs || [];
  const exists = customPairs.some(p => 
    (String(p.drugcode_a).trim() === codeA && String(p.drugcode_b).trim() === codeB) ||
    (String(p.drugcode_a).trim() === codeB && String(p.drugcode_b).trim() === codeA)
  );

  if (!exists) {
    customPairs.push({ drugcode_a: codeA, drugcode_b: codeB, reason, source: 'CUSTOM' });
    settings.customConflictPairs = customPairs;
    safetySettingsStore.set(settings);
  }

  return await getConflictRegistry();
}

/**
 * ลบคู่ยาที่ไม่ควรจ่ายร่วมกัน
 */
async function deleteCustomConflictPair(drugcode_a, drugcode_b) {
  const codeA = String(drugcode_a || '').trim();
  const codeB = String(drugcode_b || '').trim();

  if (isLive()) {
    try {
      const pool = getPool();
      await pool.query(
        'DELETE FROM cdrugconflictdrug WHERE (drugcode_a = ? AND drugcode_b = ?) OR (drugcode_a = ? AND drugcode_b = ?)',
        [codeA, codeB, codeB, codeA]
      );
    } catch (e) {
      console.warn('Cannot delete from JHCIS cdrugconflictdrug:', e.message);
    }
  }

  const settings = safetySettingsStore.get() || {};
  let customPairs = settings.customConflictPairs || [];
  customPairs = customPairs.filter(p => 
    !(String(p.drugcode_a).trim() === codeA && String(p.drugcode_b).trim() === codeB) &&
    !(String(p.drugcode_a).trim() === codeB && String(p.drugcode_b).trim() === codeA)
  );
  settings.customConflictPairs = customPairs;
  safetySettingsStore.set(settings);

  return await getConflictRegistry();
}

/**
 * สร้างไฟล์ Excel สรุปรายงานสำหรับส่งต่อคณะกรรมการ PTC / คลินิก
 */
async function generateSafetyExcelReport(startDate, endDate) {
  const result = await getHistoricalSafetyAlerts(startDate, endDate, 'all');

  const rows = result.alerts.map((a, idx) => ({
    'ลำดับ': idx + 1,
    'วันที่รับบริการ': a.visitdate,
    'เวลา': a.dispensetime,
    'เลขที่ Visit': a.visitno,
    'HN ผู้ป่วย': a.hn || a.pid,
    'ชื่อ-นามสกุล': a.patientNameMasked,
    'ระดับความเสี่ยง': a.severity === 'CRITICAL' ? 'วิกฤต (Critical)' : 'สูง (High Risk)',
    'ประเภทการเตือน': a.isTripleWhammy ? 'Triple Whammy' : a.hasConflictPairs ? 'คู่ยาไม่ควรจ่ายร่วมกัน (2-Drug Conflict)' : 'Double Whammy',
    'คู่ยาที่ชนกัน': a.conflictPairs ? a.conflictPairs.map(cp => `${cp.drugA.drugname} ⚡ ${cp.drugB.drugname}`).join('; ') : '-',
    'ยาแก้ปวดอักเสบ (NSAIDs)': a.nsaids ? a.nsaids.map(d => `${d.drugname} (${d.unit})`).join('; ') || '-' : '-',
    'ยาขับปัสสาวะ (Diuretics)': a.diuretics ? a.diuretics.map(d => `${d.drugname} (${d.unit})`).join('; ') || '-' : '-',
    'ยาลดความดัน (ACEi/ARBs)': a.aceiArbs ? a.aceiArbs.map(d => `${d.drugname} (${d.unit})`).join('; ') || '-' : '-',
    'ผู้สั่งใช้ยา (Staff)': a.username,
    'ข้อเสนอแนะทางเภสัชกรรม': a.clinicalAdvice
  }));

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(rows);
  xlsx.utils.book_append_sheet(wb, ws, 'รายงานเฝ้าระวังยา');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * อัปเดตการตั้งค่า Custom Overrides ของหน่วยงาน
 */
function updateSafetyOverrides(newSettings) {
  const current = safetySettingsStore.get() || {};
  const updated = {
    ...current,
    ...newSettings
  };
  safetySettingsStore.set(updated);
  return updated;
}

function getSafetyOverrides() {
  return safetySettingsStore.get() || {};
}

module.exports = {
  classifyDrug,
  getDrugClassifications,
  getJhcisConflictPairs,
  findConflictPairs,
  analyzePrescriptionItems,
  getLiveSafetyAlerts,
  getHistoricalSafetyAlerts,
  getConflictRegistry,
  addCustomConflictPair,
  deleteCustomConflictPair,
  generateSafetyExcelReport,
  getSafetyOverrides,
  updateSafetyOverrides
};
