const { memoryStore, getPool, isLive, getPcuCode } = require('../config/db');

// Clinical drug expansions & synonyms (ครอบคลุมทั้งชื่อการค้า ชื่อสามัญทางยา และตัวย่อทางการแพทย์)
const CLINICAL_EXPANSIONS = {
  'cafergot': ['cafegot', 'ergotamine', 'caffeine', 'migana', 'avamigran'],
  'cafegot': ['cafergot', 'ergotamine', 'caffeine', 'migana'],
  'ergotamine': ['cafergot', 'cafegot', 'caffeine'],
  'cpm': ['chlorpheniramine', 'chlorphen'],
  'chlorphen': ['chlorpheniramine', 'cpm'],
  'chlorpheniramine': ['cpm', 'chlorphen', 'chlopheniramine'],
  'chlopheniramine': ['chlorpheniramine', 'cpm'],
  'mtv': ['multivitamin', 'multi-vitamin'],
  'multivitamin': ['mtv'],
  'asa': ['aspirin', 'asprex'],
  'aspirin': ['asa', 'asprex'],
  'asprex': ['aspirin', 'asa'],
  'dexa': ['dexamethasone'],
  'dexamethasone': ['dexa'],
  'dimen': ['dimenhydrinate'],
  'dimenhydrinate': ['dimen'],
  'amoxycillin': ['amoxicillin', 'amoxil'],
  'amoxicillin': ['amoxycillin', 'amoxil'],
  'frusemide': ['furosemide', 'lasix'],
  'furosemide': ['frusemide', 'lasix'],
  'lasix': ['furosemide', 'frusemide'],
  'hctz': ['hydrochlorothiazide'],
  'hydrochlorothiazide': ['hctz'],
  'pcm': ['paracetamol', 'para', 'tylenol', 'sara'],
  'para': ['paracetamol', 'pcm', 'tylenol', 'sara'],
  'paracetamol': ['pcm', 'para', 'tylenol', 'sara'],
  'mtx': ['methotrexate'],
  'methotrexate': ['mtx'],
  'cloxa': ['cloxacillin'],
  'cloxacillin': ['cloxa'],
  'dicloxa': ['dicloxacillin'],
  'dicloxacillin': ['dicloxa'],
  'cotrimoxazole': ['bactrim', 'trimethoprim', 'sulfamethoxazole'],
  'bactrim': ['cotrimoxazole'],
  'mometasone': ['elomet'],
  'salbutamol': ['ventolin'],
  'ventolin': ['salbutamol'],
  'berodual': ['fenoterol', 'ipratropium'],
  'ipratropium': ['berodual', 'fenoterol'],
  'ors': ['oral rehydration salts', 'เกลือแร่'],
  'nss': ['sodium chloride', 'normal saline'],
  'sodium chloride': ['nss'],
  'ta': ['triamcinolone', 'triamcinolone acetonide'],
  'triamcinolone': ['ta'],
  'clotrimazole': ['canesten'],
  'canesten': ['clotrimazole'],
  'gg': ['glyceryl guaiacolate', 'guaifenesin'],
  'glyceryl guaiacolate': ['gg', 'guaifenesin'],
  'folic': ['folic acid'],
  'folic acid': ['folic'],
  'vitamin bco': ['vitamin b complex', 'b complex', 'bco'],
  'bco': ['vitamin b complex', 'vitamin bco'],
  'vitamin b1-6-12': ['neurobion', 'b1-b6-b12'],
  'vitamin c': ['ascorbic acid'],
  'ascorbic acid': ['vitamin c'],
  'wfi': ['water for injection', 'sterile water'],
  'water for injection': ['wfi', 'sterile water'],
  'd5': ['dextrose 5%', 'd-5-w', 'd-5-s'],
  'hyoscine': ['buscopan', 'butylbromide', 'hyoscine-n-butyl']
};

function cleanString(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseStrength(str) {
  if (!str) return { numbers: [], isPercent: false, raw: '' };
  const s = String(str).toLowerCase();
  const isPercent = s.includes('%');
  const numbers = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  return { numbers, isPercent, raw: s };
}

function parseDosageForm(item) {
  let text = '';
  if (typeof item === 'string') {
    text = item.toLowerCase();
  } else if (item && typeof item === 'object') {
    text = `${item.rawType || ''} ${item.dosageForm || ''} ${item.drugtype || ''} ${item.rawName || item.drugname || ''} ${item.drugunit || ''} ${item.unitpacking || ''} ${item.rawCategory || item.category || ''}`.toLowerCase();
  }

  if (text.includes('inj') || text.includes('ฉีด') || text.includes('amp') || text.includes('vial') || text.includes('infusion')) return 'INJECTION';
  if (text.includes('tab') || text.includes('เม็ด') || text.includes('coated tablet') || text.includes('film-coated')) return 'TABLET';
  if (text.includes('cap') || text.includes('แคป') || text.includes('capsule')) return 'CAPSULE';
  if (text.includes('syr') || text.includes('sus') || text.includes('น้ำ') || text.includes('elixir') || text.includes('mix') || text.includes('solution') || text.includes('liquid')) return 'SYRUP';
  if (text.includes('cre') || text.includes('oin') || text.includes('gel') || text.includes('lot') || text.includes('pas') || text.includes('ครีม') || text.includes('ขี้ผึ้ง') || text.includes('เจล') || text.includes('ทา') || text.includes('ตลับ') || text.includes('ป้ายปาก')) return 'TOPICAL';
  if (text.includes('drop') || text.includes('หยอด')) return 'DROPS';
  if (text.includes('inh') || text.includes('neb') || text.includes('พ่น') || text.includes('spray') || text.includes('respule')) return 'INHALER';
  if (text.includes('pow') || text.includes('sac') || text.includes('ผง') || text.includes('ซอง') || text.includes('ชาชง')) return 'POWDER';
  if (text.includes('supp') || text.includes('เหน็บ')) return 'SUPPOSITORY';
  return 'OTHER';
}

function parseCategory(item) {
  let text = '';
  if (typeof item === 'string') {
    text = item.toLowerCase();
  } else if (item && typeof item === 'object') {
    text = `${item.rawCategory || item.category || ''} ${item.drugtype || ''} ${item.productcat || ''}`.toLowerCase();
  }
  if (text.includes('สมุนไพร') || text === '25') return 'HERB';
  if (text.includes('หัตถการ') || text === '02') return 'PROCEDURE';
  if (text.includes('เวชภัณฑ์') || text.includes('วัสดุ') || text === '03' || text === '11') return 'SUPPLY';
  return 'MODERN';
}

function levenshtein(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  const d = [];
  for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return 1 - (d[a.length][b.length] / Math.max(a.length, b.length));
}

/**
 * 4-Dimensional Clinical Drug Matcher
 * ตรวจสอบความเข้ากันได้ตาม 4 องค์ประกอบสำคัญ:
 * 1. ชื่อยา (Active Generic Name, Trade Name, Thai Name, Clinical Synonyms)
 * 2. ขนาดยา (Strength: mg, ml, mcg, gm, %, compound, ratio)
 * 3. ชนิดยา / รูปแบบยา (Dosage Form: tab, cap, inj, syr, cre, etc.)
 * 4. ประเภทยา / กลุ่มยา (Category: ยาแผนปัจจุบัน, ยาสมุนไพร, ยาเม็ด, ยาน้ำ, ยาฉีด, ยาทาภายนอก)
 */
function scoreDrugClinicalMatch(incoming, candidate) {
  const incObj = typeof incoming === 'string' ? { rawName: incoming } : (incoming || {});
  const candObj = candidate || {};

  // 1. มิติชื่อยา (Name & Active Pharmaceutical Ingredient)
  const incNameClean = cleanString(incObj.rawName || incObj.drugname || '');
  const incTokens = incNameClean.split(' ').filter(t => t.length > 0 && !['ยา', 'เม็ด', 'ขวด', 'หลอด', 'ซอง', 'แผง', 'tab', 'cap', 'mg', 'ml'].includes(t));
  
  if (incTokens.length === 0) return { score: 0, status: 'UNMATCHED', reason: 'ไม่มีชื่อยา' };

  // ขยายคำพ้องและตัวย่อทางการแพทย์
  const searchTerms = new Set();
  incTokens.forEach(t => {
    searchTerms.add(t);
    if (CLINICAL_EXPANSIONS[t]) {
      CLINICAL_EXPANSIONS[t].forEach(exp => searchTerms.add(exp));
    }
  });

  const candNameClean = cleanString(candObj.drugname || '');
  const candGenClean = cleanString(candObj.druggenericname || '');
  const candThaiClean = cleanString(candObj.drugnamethai || '');
  const candCombined = `${candNameClean} ${candGenClean} ${candThaiClean}`.trim();

  let nameScore = 0;
  let matchedTokenCount = 0;

  for (const term of searchTerms) {
    if (term.length < 3) continue;
    if (candCombined.includes(term)) {
      nameScore += 50;
      matchedTokenCount++;
    } else {
      // Fuzzy Levenshtein match (ตรวจจับตัวสะกดผิด เช่น Cafergot vs Cafegot)
      const candWords = candCombined.split(' ');
      for (const cw of candWords) {
        if (cw.length >= 4 && term.length >= 4 && levenshtein(term, cw) >= 0.82) {
          nameScore += 45;
          matchedTokenCount++;
          break;
        }
      }
    }
  }

  // ⚠️ CRITICAL SAFETY GATE: ตัวยาสำคัญต้องตรงกันอย่างน้อย 1 ตัวยา ห้ามจับคู่ข้ามตัวยาเด็ดขาด!
  if (nameScore === 0) {
    return { score: 0, status: 'UNMATCHED', reason: 'ตัวยาสำคัญไม่ตรงกัน (Active ingredient mismatch)' };
  }

  // โบนัสถ้าตรงทั้งตัวยาหลักและตัวยารอง (เช่น Ergotamine + Caffeine)
  if (matchedTokenCount >= 2) {
    nameScore += 25;
  }

  // 2. มิติขนาดยา (Strength: mg, ml, %, compound)
  const incStr = parseStrength(`${incObj.rawStrength || ''} ${incObj.rawName || ''} ${incObj.drugname || ''}`);
  const candStr = parseStrength(`${candObj.drugname || ''} ${candObj.druggenericname || ''} ${candObj.unitpacking || ''}`);
  
  let strengthScore = 0;
  if (incStr.numbers.length > 0 && candStr.numbers.length > 0) {
    const allIncMatch = incStr.numbers.every(n => candStr.numbers.includes(n));
    if (allIncMatch) {
      strengthScore += 40; // ขนาดยาตรงกันเป๊ะ
    } else {
      // ⚠️ ขนาดยาขัดแย้งกันอย่างชัดเจน (เช่น 5 mg vs 10 mg หรือ 500 mg vs 250 mg) -> ตัดคะแนนรุนแรง!
      strengthScore -= 60;
    }
  }
  if (incStr.isPercent) {
    if (candStr.isPercent) strengthScore += 20;
    else strengthScore -= 40;
  }

  // 3. มิติชนิดยา / รูปแบบยา (Dosage Form: tab, cap, inj, syr, cre, etc.)
  const incForm = parseDosageForm(incObj);
  const candForm = parseDosageForm(candObj);
  
  let formScore = 0;
  if (incForm !== 'OTHER' && candForm !== 'OTHER') {
    if (incForm === candForm) {
      formScore += 30; // รูปแบบยาตรงกันเป๊ะ
    } else if ((incForm === 'TABLET' && candForm === 'CAPSULE') || (incForm === 'CAPSULE' && candForm === 'TABLET')) {
      formScore += 10; // อนุโลมยาเม็ดกับแคปซูล (ยากินชนิดแข็ง)
    } else {
      // ⚠️ รูปแบบยาขัดแย้งกันรุนแรง (เช่น ยาเม็ด vs ยาฉีด หรือ ยาน้ำ vs ยาทาภายนอก) -> ตัดคะแนนหนักมาก!
      formScore -= 70;
    }
  }

  // 4. มิติประเภทยา / กลุ่มยา (Category: ยาเม็ด, ยาน้ำ, ยาฉีด, ยาทาภายนอก, สมุนไพร)
  const incCat = parseCategory(incObj);
  const candCat = parseCategory(candObj);

  let catScore = 0;
  if (incCat === candCat) {
    catScore += 20;
  } else if ((incCat === 'HERB' && candCat !== 'HERB') || (incCat !== 'HERB' && candCat === 'HERB')) {
    catScore -= 40; // ห้ามจับคู่ยาสมุนไพรกับยาแผนปัจจุบันปะปนกัน
  }

  // โบนัสเสริมจากคอลัมน์ประเภทยาภาษาไทย
  if (incObj.rawCategory) {
    const rawCat = incObj.rawCategory;
    if (rawCat.includes('เม็ด') && candForm === 'TABLET') catScore += 15;
    if (rawCat.includes('น้ำ') && candForm === 'SYRUP') catScore += 15;
    if (rawCat.includes('ฉีด') && candForm === 'INJECTION') catScore += 15;
    if (rawCat.includes('ภายนอก') && candForm === 'TOPICAL') catScore += 15;
  }

  // ⚠️ CRITICAL SAFETY GATES ON CONFLICTS:
  // 1. ถ้าชนิดยา/รูปแบบยาขัดแย้งกันรุนแรง (เช่น ยาเม็ด vs ยาฉีด หรือ ยาน้ำ vs ยาทาภายนอก) -> ปฏิเสธเด็ดขาด ห้ามจับคู่ข้ามรูปแบบยา!
  if (formScore <= -50) {
    return {
      score: 0,
      status: 'UNMATCHED',
      reason: `ชนิด/รูปแบบยาขัดแย้งกันอย่างสิ้นเชิง (${incForm} vs ${candForm})`,
      nameScore,
      strengthScore,
      formScore,
      catScore,
      incForm,
      candForm
    };
  }

  // 2. ถ้าขนาดยาขัดแย้งกันชัดเจน (เช่น 5 mg vs 10 mg หรือ 500 mg vs 250 mg) -> ปฏิเสธ ห้าม auto-match ข้ามขนาดยาเด็ดขาด!
  if (strengthScore <= -50) {
    return {
      score: 30,
      status: 'UNMATCHED',
      reason: 'ขนาดยาไม่ตรงกัน (Strength mismatch)',
      nameScore,
      strengthScore,
      formScore,
      catScore,
      incForm,
      candForm
    };
  }

  const totalScore = nameScore + strengthScore + formScore + catScore;
  let status = 'UNMATCHED';
  if (totalScore >= 95) {
    status = 'EXACT';
  } else if (totalScore >= 55) {
    status = 'SUGGESTED';
  }

  return {
    score: totalScore,
    status,
    nameScore,
    strengthScore,
    formScore,
    catScore,
    incForm,
    candForm
  };
}

function compareClinicalDrugs(inputName, candidateDrug) {
  const result = scoreDrugClinicalMatch(inputName, candidateDrug);
  if (result.score <= 0) return 0;
  return Math.min(1.0, Math.round((result.score / 150) * 100) / 100);
}

// Get all real JHCIS pharmacy items from Live DB or Memory Store (ตัดหัตถการและอุปกรณ์ผ่าตัดออก)
async function getAllJhcisDrugs() {
  if (isLive()) {
    try {
      const pool = getPool();
      // ดึงเฉพาะ "เวชภัณฑ์ยาและเวชภัณฑ์คลังยา" ใน cdrug (ตัดหัตถการ ICD-9 และบริการตรวจแล็บออก)
      const [rows] = await pool.query(`
        SELECT c.drugcode, 
               c.drugname, 
               c.druggenericname,
               c.drugnamethai,
               c.drugtype, 
               c.drugtypesub,
               c.drugflag,
               COALESCE(u.unitsellname, c.unitsell, 'หน่วย') as drugunit, 
               c.unitpacking, 
               CAST(COALESCE(c.cost, 0) AS DECIMAL(10,2)) as costprice, 
               CAST(COALESCE(c.sell, 0) AS DECIMAL(10,2)) as sellprice, 
               c.tmtcode,
               c.drugcode24,
               COALESCE(c.drugcode24, c.tmtcode, '') as didstandard, 
               c.chargeitem,
               ch.chargeopdname,
               c.drugcaution,
               c.antibio,
               c.toothtype,
               c.lotno, 
               c.dateexpire,
               COALESCE(c.daystockremain, 30) as daystockremain
        FROM cdrug c
        LEFT JOIN cdrugunitsell u ON c.unitsell = u.unitsellcode
        LEFT JOIN cchargeopd ch ON c.chargeitem = ch.chargeopdcode
        WHERE c.drugname IS NOT NULL AND c.drugname != ''
          -- ⚠️ กรองยาที่มีสถานะ 2 (ไม่มีใช้) ออกเด็ดขาด ไม่นำมาเทียบกับยาที่จะนำเข้า
          AND (c.drugflag IS NULL OR c.drugflag != '2')
          AND c.drugflag = '1'
          -- กรองหัตถการและเวชภัณฑ์ที่ไม่ใช่ตัวยาออก
          AND NOT (c.drugtype = '02' OR c.drugcode LIKE '%-%' OR c.drugname LIKE '%ซองยา%' OR c.drugname LIKE '%ถุงยา%')
        ORDER BY c.drugcode ASC
      `);
      return rows;
    } catch (err) {
      console.error('Error querying live cdrug:', err.message);
    }
  }
  return memoryStore.drugs;
}

// Match an array of parsed Excel items against JHCIS catalogue
async function matchExcelItems(parsedItems) {
  const jhcisDrugs = await getAllJhcisDrugs();
  const mappings = memoryStore.drugMappings || [];
  const currentPcu = getPcuCode() || '';

  return parsedItems.map(item => {
    let matchedDrug = null;
    let matchStatus = 'UNMATCHED';
    let matchType = '';
    let confidence = 0;
    let suggestions = [];

    const tmt24 = (item.tmtid || '').trim();
    const hosCode = (item.hosdrugcode || '').trim();

    // 1. Check TMT 24 digits (Universal across all hospitals) — รหัสมาตรฐาน 24 หลัก ตรงกันเป๊ะ
    if (tmt24 && tmt24.length >= 6) {
      matchedDrug = jhcisDrugs.find(d => {
        const drugDid = (d.didstandard || d.tmtid || '').toString().replace(/[^0-9]/g, '').trim();
        return drugDid && drugDid === tmt24;
      });

      if (matchedDrug) {
        matchStatus = 'MATCHED';
        matchType = 'TMT_24 (รหัสมาตรฐาน 24 หลัก ตรงกันเป๊ะ)';
        confidence = 100;
      }
    }

    // 2. Check saved hospital code or drug name mapping (Scoped strictly to current PCU)
    if (!matchedDrug) {
      const rawItemName = (item.drugname || '').trim();
      const normItemName = cleanString(rawItemName).replace(/\s+/g, '');
      const normHosCode = hosCode.toLowerCase();

      const savedMap = mappings.find(m => {
        // กรองเฉพาะหน่วยบริการปัจจุบัน ห้ามใช้รหัสข้ามหน่วยบริการ
        if (m.pcucode && currentPcu && m.pcucode !== currentPcu) return false;
        if (normHosCode && m.hosdrugcode && m.hosdrugcode.toLowerCase() === normHosCode) return true;
        const mNorm = cleanString(m.hospitalDrugName || m.drugname || '').replace(/\s+/g, '');
        if (normItemName && mNorm && mNorm === normItemName) return true;
        return false;
      });

      if (savedMap) {
        const targetCode = String(savedMap.jhcisdrugcode || savedMap.matchedDrugCode || '').trim();
        matchedDrug = jhcisDrugs.find(d => String(d.drugcode).trim().toLowerCase() === targetCode.toLowerCase()) ||
                      jhcisDrugs.find(d => String(d.drugcode).trim().replace(/^0+/, '') === targetCode.replace(/^0+/, ''));
        if (matchedDrug) {
          matchStatus = 'MATCHED';
          matchType = 'HOSPITAL_ALIAS (จดจำจากการจับคู่ที่เคยบันทึกไว้ 100%)';
          confidence = 100;
        }
      }
    }

    // 3. Direct match on local drug code
    if (!matchedDrug && hosCode) {
      matchedDrug = jhcisDrugs.find(d => d.drugcode.toLowerCase() === hosCode.toLowerCase());
      if (matchedDrug) {
        matchStatus = 'MATCHED';
        matchType = 'EXACT_CODE (รหัสยาตรงกัน)';
        confidence = 90;
      }
    }

    // 4. 4-Dimensional Clinical Drug Matcher (ชื่อยา + ขนาดยา mg/ml + ชนิดยา + ประเภทยา)
    if (!matchedDrug && item.drugname) {
      const scored = jhcisDrugs.map(d => {
        const evalResult = scoreDrugClinicalMatch(item, d);
        return {
          drug: d,
          evalResult,
          score: evalResult.score
        };
      }).filter(s => s.score >= 50)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        const top = scored[0];
        const pct = Math.min(100, Math.round((top.score / 150) * 100));

        if (top.evalResult.status === 'EXACT') {
          matchedDrug = top.drug;
          matchStatus = 'MATCHED';
          matchType = 'CLINICAL_MATCH (ชื่อยา ขนาดยา ชนิดยา และประเภทยา ตรงกัน)';
          confidence = Math.max(85, pct);
        } else {
          matchStatus = 'SUGGESTED';
          matchType = 'SUGGESTIONS (ตัวยาใกล้เคียง — โปรดตรวจยืนยัน)';
          confidence = pct;
        }

        suggestions = scored.slice(0, 3).map(s => ({
          drugcode: s.drug.drugcode,
          drugname: s.drug.drugname,
          score: Math.min(100, Math.round((s.score / 150) * 100))
        }));
      }
    }

    return {
      ...item,
      matchStatus,
      matchType,
      confidence,
      // ⚠️ กฎความปลอดภัยสำคัญ: ถ้าไม่ได้ MATCHED จริง รหัสยาต้องเป็นว่าง '' ห้ามเติมรหัสเดาเด็ดขาด!
      matchedDrugCode: matchedDrug ? matchedDrug.drugcode : '',
      matchedDrugName: matchedDrug ? matchedDrug.drugname : '',
      matchedDrugUnit: matchedDrug ? matchedDrug.drugunit : '',
      suggestions
    };
  });
}

module.exports = {
  matchExcelItems,
  getAllJhcisDrugs,
  compareClinicalDrugs,
  scoreDrugClinicalMatch,
  parseStrength,
  parseDosageForm,
  parseCategory
};
