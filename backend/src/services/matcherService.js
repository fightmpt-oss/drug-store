const { memoryStore, getPool, isLive } = require('../config/db');

// Clinical drug aliases dictionary (ตัวย่อและชื่อพ้องทางการแพทย์/เภสัชกรรม)
const COMMON_ALIASES = {
  'cpm': 'chlorpheniramine',
  'chlorphen': 'chlorpheniramine',
  'mtv': 'multivitamin',
  'asa': 'aspirin',
  'dexa': 'dexamethasone',
  'dimen': 'dimenhydrinate',
  'amoxycillin': 'amoxicillin',
  'frusemide': 'furosemide',
  'hctz': 'hydrochlorothiazide',
  'pcm': 'paracetamol',
  'para': 'paracetamol',
  'mtx': 'methotrexate',
  'cloxa': 'cloxacillin',
  'dicloxa': 'dicloxacillin',
  'cotrimoxazole': 'bactrim',
  'bactrim': 'cotrimoxazole',
  'mometasone': 'elomet',
  'salbutamol': 'ventolin',
  'ventolin': 'salbutamol',
  'berodual': 'ipratropium',
  'ors': 'ors',
  'nss': 'sodium chloride'
};

const DOSAGE_FORMS = [
  'tablet', 'tab', 'capsule', 'cap', 'injection', 'inj', 'syrup', 'syr',
  'suspension', 'susp', 'sus', 'cream', 'ointment', 'oint', 'gel', 'drop', 'drops',
  'solution', 'sol', 'spray', 'inhaler', 'nebule', 'neb', 'lotion', 'patch',
  'suppository', 'supp', 'dry syr', 'eye drop', 'ear drop', 'powder', 'pow', 'respule'
];

function cleanString(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/[.,;:()\[\]{}\/\\+*\"\'\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDrugFeatures(rawName) {
  let cleaned = cleanString(rawName);

  // สกัดขนาดยา / ความแรง เช่น 100 mg, 10 mg/ml, 500 mg, 0.5%
  let strength = null;
  const strengthRegex = /\b(\d+(?:\.\d+)?)\s*(mg|ml|mcg|gm|g|iu|%|meq|mmol|mg\s*ml|mg\s*5ml|mcg\s*dose)\b/i;
  const sMatch = cleaned.match(strengthRegex);
  if (sMatch) {
    strength = sMatch[1] + sMatch[2].replace(/\s+/g, '');
    cleaned = cleaned.replace(sMatch[0], ' ');
  }

  // สกัดรูปแบบยา (Dosage form)
  let form = null;
  for (const f of DOSAGE_FORMS) {
    const fRegex = new RegExp('\\b' + f + '\\b', 'i');
    if (fRegex.test(cleaned)) {
      form = f.startsWith('tab') ? 'tab' :
             f.startsWith('cap') ? 'cap' :
             f.startsWith('inj') ? 'inj' :
             f.startsWith('syr') ? 'syr' :
             (f.startsWith('susp') || f === 'sus') ? 'susp' :
             f.startsWith('cream') ? 'cream' :
             f.startsWith('oint') ? 'oint' :
             f.startsWith('drop') ? 'drop' :
             (f === 'powder' || f === 'pow') ? 'powder' : f;
      cleaned = cleaned.replace(fRegex, ' ');
      break;
    }
  }

  let tokens = cleaned.split(/\s+/).filter(Boolean);
  // กรองคำสร้อยที่ไม่ใช่ชื่อยา
  tokens = tokens.filter(t => !['ยา', 'เม็ด', 'ขวด', 'หลอด', 'ซอง', 'แผง', 'oral', 'pediatric', 'adult', 'sterile', 'usp', 'bp', 'เด็ก', 'ผู้ใหญ่', 'รสส้ม'].includes(t));

  return {
    raw: rawName,
    core: tokens.join(' '),
    tokens,
    strength,
    form
  };
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
 * เปรียบเทียบความเข้ากันได้ของชื่อยาตามหลักเภสัชกรรม (Clinical Drug Matcher)
 * - ตัวยาสำคัญ (Active Generic Drug Name) ต้องตรงกันก่อนเสมอ!
 * - ขนาดยาและรูปแบบยาเป็นตัวถ่วงน้ำหนัก
 * - ถ้าตัวยาคนละตัว (เช่น Metoprolol vs Atenolol) จะได้ 0.0 ทันที ห้ามจับคู่ข้ามตัวยา!
 */
function compareClinicalDrugs(inputName, candidateDrug) {
  const targetName = candidateDrug.drugname;
  const f1 = parseDrugFeatures(inputName);
  const f2 = parseDrugFeatures(targetName);

  if (f1.tokens.length === 0 || f2.tokens.length === 0) return 0;

  // คำหลักที่เป็นชื่อตัวยา (First non-filler token)
  const rootToken = f1.tokens[0];
  const rootAlias = COMMON_ALIASES[rootToken] || rootToken;

  // GATE CHECK: ตัวยาใน JHCIS ต้องมีชื่อตัวยาหลักตรงกันหรือเป็นคำพ้องเดียวกัน
  let rootMatched = false;
  for (const t2 of f2.tokens) {
    const t2Alias = COMMON_ALIASES[t2] || t2;
    // ตรงกันเป๊ะ หรือเป็นตัวย่อพ้อง
    if (rootToken === t2 || (rootAlias.length >= 3 && t2Alias === rootAlias)) {
      rootMatched = true;
      break;
    }
    // Substring / คำนำหน้าสำหรับชื่อยาที่ยาวตั้งแต่ 4 ตัวอักษรขึ้นไป (เช่น amoxicillin vs amoxycillin)
    if (rootToken.length >= 4 && t2.length >= 4) {
      if (rootToken.includes(t2) || t2.includes(rootToken) || rootAlias.includes(t2Alias) || t2Alias.includes(rootAlias)) {
        rootMatched = true;
        break;
      }
      if (levenshtein(rootAlias, t2Alias) >= 0.8) {
        rootMatched = true;
        break;
      }
    }
  }

  // ตรวจเทียบชื่อภาษาไทยใน cdrugnamethai ด้วย
  if (!rootMatched && candidateDrug.drugnamethai) {
    const thClean = cleanString(candidateDrug.drugnamethai);
    if (thClean.includes(rootToken) || thClean.includes(rootAlias)) {
      rootMatched = true;
    }
  }

  // ⚠️ CRITICAL SAFETY GATE: ถ้าชื่อตัวยาหลักไม่ตรงกัน = ปฏิเสธทันที (Score = 0)
  // ป้องกันเด็ดขาดไม่ให้ Metoprolol จับคู่กับ Atenolol หรือ Hyoscine จับคู่กับ Domperidone
  if (!rootMatched) {
    return 0;
  }

  // คำนวณความครอบคลุมของคำในชื่อยา
  const matchedTokens = f1.tokens.filter(t => {
    const ta = COMMON_ALIASES[t] || t;
    return f2.tokens.some(t2 => {
      const t2a = COMMON_ALIASES[t2] || t2;
      return t === t2 || (ta.length >= 3 && ta === t2a) || (t.length >= 4 && t2.length >= 4 && (t.startsWith(t2) || t2.startsWith(t)));
    });
  });
  const coreScore = matchedTokens.length / f1.tokens.length;

  // ตรวจขนาดยา (Strength)
  let strengthScore = 0.85; // ค่าเริ่มต้นหากฝ่ายใดฝ่ายหนึ่งไม่ระบุ
  if (f1.strength && f2.strength) {
    if (f1.strength === f2.strength) {
      strengthScore = 1.0;
    } else {
      strengthScore = 0.25; // ขนาดยาไม่ตรงกัน (เช่น 50 mg vs 100 mg) -> ตัดคะแนนหนัก
    }
  }

  // ตรวจรูปแบบยา (Form)
  let formScore = 0.85;
  if (f1.form && f2.form) {
    if (f1.form === f2.form) {
      formScore = 1.0;
    } else {
      formScore = 0.25; // รูปแบบยาไม่ตรงกัน (เช่น ยาเม็ด vs ยาน้ำ/ยาฉีด) -> ตัดคะแนนหนัก
    }
  }

  let total = (coreScore * 0.6) + (strengthScore * 0.3) + (formScore * 0.1);

  // ถ้าขนาดยาไม่ตรงกัน ให้คะแนนไม่เกิน 65% (เป็นได้แค่ข้อเสนอแนะ SUGGESTED ห้าม auto-match)
  if (strengthScore <= 0.25) {
    total = Math.min(total, 0.65);
  }
  return total;
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

  return parsedItems.map(item => {
    let matchedDrug = null;
    let matchStatus = 'UNMATCHED';
    let matchType = '';
    let confidence = 0;
    let suggestions = [];

    const tmt24 = (item.tmtid || '').trim();
    const hosCode = (item.hosdrugcode || '').trim();

    // 1. Check TMT 24 digits (Highest priority) — รหัสมาตรฐาน 24 หลัก ตรงกันเป๊ะ
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

function normalizeDrugKey(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]/g, '')
    .trim();
}

    // 2. Check saved hospital code or drug name mapping (Hospital Alias Memory)
    if (!matchedDrug) {
      const rawItemName = (item.drugname || '').trim();
      const normItemName = normalizeDrugKey(rawItemName);
      const normHosCode = hosCode.toLowerCase();

      const savedMap = mappings.find(m => {
        if (normHosCode && m.hosdrugcode && m.hosdrugcode.toLowerCase() === normHosCode) return true;
        const mNorm = normalizeDrugKey(m.hospitalDrugName || m.drugname);
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

    // 4. Clinical Drug Matcher (ตรวจสอบตัวยาสำคัญ + ขนาดยา + รูปแบบยา)
    if (!matchedDrug && item.drugname) {
      const scored = jhcisDrugs.map(d => ({
        drug: d,
        score: compareClinicalDrugs(item.drugname, d)
      })).filter(s => s.score >= 0.50)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        const top = scored[0];
        const pct = Math.round(top.score * 100);

        // ถ้าตัวยาและขนาดยาตรงกันชัดเจน (>= 85%) ให้จัดเป็น MATCHED
        if (pct >= 85) {
          matchedDrug = top.drug;
          matchStatus = 'MATCHED';
          matchType = 'CLINICAL_MATCH (ชื่อตัวยาและขนาดยาตรงกัน)';
          confidence = pct;
        } else {
          // ถ้าใกล้เคียง (50-84%) จัดเป็น SUGGESTED — ห้าม auto-fill รหัสยา ให้คนตรวจยืนยันก่อนเสมอ!
          matchStatus = 'SUGGESTED';
          matchType = 'SUGGESTIONS (ตัวยาใกล้เคียง — โปรดตรวจยืนยัน)';
          confidence = pct;
        }

        suggestions = scored.slice(0, 3).map(s => ({
          drugcode: s.drug.drugcode,
          drugname: s.drug.drugname,
          score: Math.round(s.score * 100)
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
  compareClinicalDrugs
};
