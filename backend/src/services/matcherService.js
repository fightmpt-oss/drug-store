const { memoryStore, getPool, isLive, getPcuCode } = require('../config/db');
const { getDrugSettings } = require('./localStore');

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
  'guiacolate': ['guaiacolate', 'guaifenesin'],
  'guaiacolate': ['guiacolate', 'guaifenesin'],
  'folic': ['folic acid'],
  'folic acid': ['folic'],
  'vitaminbco': ['bco', 'b complex', 'bcomplex'],
  'bco': ['vitaminbco', 'b complex', 'bcomplex'],
  'vitaminb1612': ['sambee', 'neurobion', 'b1-b6-b12'],
  'vitaminc': ['ascorbic'],
  'ascorbic': ['vitaminc'],
  'wfi': ['water for injection', 'sterile water'],
  'water for injection': ['wfi', 'sterile water'],
  'd5': ['dextrose 5%', 'd5w', 'd5s2'],
  'hyoscine': ['buscopan', 'butylbromide', 'hyoscine-n-butyl'],
  'carbon': ['charcoal', 'activated charcoal'],
  'charcoal': ['carbon'],
  'ferrous': ['ferdex'],
  'ferdex': ['ferrous'],
  'd50w': ['dextrose', 'glucose'],
  'glucose': ['dextrose', 'd50w'],
  'dextrose': ['glucose', 'd50w'],
  'amm': ['ammonium'],
  'ammonium': ['amm'],
  'doproct': ['doproctosedyl'],
  'doproctosedyl': ['doproct'],
  'cetiricine': ['cetirizine'],
  'cetirizine': ['cetiricine'],
  'moduretic': ['moduratic'],
  'moduratic': ['moduretic'],
  'contraceptive': ['rden', 'ยาคุม'],
  'levonorgestrel': ['rden', 'ยาคุม'],
  'rden': ['contraceptive', 'ยาคุม'],
  'irrigat': ['irrigate', 'ล้างแผล'],
  'irrigate': ['irrigat', 'ล้างแผล'],
  'เถาวัลเปรียง': ['เถาวัลย์เปรียง'],
  'เถาวัลย์เปรียง': ['เถาวัลเปรียง'],
  'คลีมไพล': ['ครีมไพล', 'ไพล'],
  'ครีมไพล': ['คลีมไพล', 'ไพล'],
  'ไพลรีนิกซ์': ['ไพล'],
  'พญายอ': ['เสลดพังพอน']
};

// คำที่ไม่ใช่ชื่อตัวยาสำคัญ (รูปแบบยา, หน่วย, คำขยาย) — ห้ามนำมาคิดเป็น nameScore โดยลำพัง
const NON_API_STOPWORDS = new Set([
  'tab', 'tabs', 'tablet', 'tablets', 'cap', 'caps', 'capsule', 'capsules',
  'syr', 'syrup', 'sus', 'susp', 'suspension', 'cre', 'cream', 'oin', 'oint', 'ointment',
  'gel', 'lot', 'lotion', 'pas', 'paste', 'inj', 'injection', 'sol', 'solution',
  'mix', 'mixt', 'mixture', 'pow', 'powder', 'sac', 'sachet', 'sup', 'supp', 'suppo', 'suppository',
  'inh', 'inhaler', 'neb', 'drop', 'drops', 'eye', 'ear', 'eye-ear', 'oral', 'in', 'for', 'and', 'with', 'plus',
  'sr', 'cr', 'er', 'xr', 'ed', 'oph', 'mdi', 'mg', 'ml', 'mcg', 'gm', 'g', 'cc', 'iu', 'l', 't',
  'bottle', 'box', 'pack', 'unit', 'dose', 'pc', 'pcs', 'amp', 'vial', 'infusion', 'irrigat', 'irrigate',
  'vitamin', 'vit', 'dry', 'vag', 'vaginal', 'plain', 'fort', 'coated', 'film',
  'r', 'den', // ป้องกันตัวอักษรเดี่ยว
  'ยา', 'เม็ด', 'แคปซูล', 'ยาแคปซูล', 'ขวด', 'หลอด', 'ซอง', 'แผง', 'ตลับ', 'กล่อง', 'กระปุก',
  'แอมพูล', 'ครีม', 'เจล', 'น้ำ', 'ยาชง', 'ชาชง', 'ยาน้ำ', 'ยาฉีด', 'ยาเม็ด', 'ยาอม', 'ยาผง', 'ยาหยอด',
  'ยาแก้ไอ', 'น้ำแก้ไอ', 'แก้ไอ', 'รสส้ม', 'รส', 'สำหรับ', 'ชนิด', 'ชนิดน้ำ', 'ชนิดเม็ด', 'ชนิดฉีด',
  'ผสม', 'ตรา', 'ประสะ', 'วัน', 'ชา', 'อม', 'เด็ก', 'ผู้ใหญ่', 'ล้างแผล', 'ล้างมือ', 'รีนิกซ์', 'อภัยภูเบศร',
  'ธงทอง', 'ไตร', 'แว็ก', 'ฉลากสีส้ม', 'ฉลากสีเหลือง', 'ทางปาก', 'ทวาร', 'น้ำเหลือง'
]);

const THAI_SPLIT_WORDS = [
  'ยาแคปซูล', 'แคปซูล', 'น้ำแก้ไอ', 'ยาแก้ไอ', 'แก้ไอ', 'ครีม',
  'ยาชง', 'ชาชง', 'ยาอม', 'รสบ๊วย', 'มะแว้ง', 'หลอด', 'ขวด', 'ซอง', 'ตลับ', 'กล่อง',
  'รีนิกซ์', 'ผสม', 'ตรา', 'ประสะ', 'เจล', 'ล้างมือ', 'รสส้ม', 'ผู้ใหญ่', 'เด็ก',
  'ชนิดน้ำ', 'ชนิดเม็ด', 'ชนิด'
];

function preNormalizeDrugText(str) {
  if (!str) return '';
  let s = String(str).toLowerCase();

  // รวมตัวย่อยาวที่มักเขียนติดหรือแยกไม่สม่ำเสมอ
  s = s.replace(/\bn[\s.\-]*s[\s.\-]*s\b/gi, ' nss ');
  s = s.replace(/\bd[\s\-]*50[\s\-]*w\b/gi, ' d50w ');
  s = s.replace(/\bd[\s\-]*5[\s\-]*(?:1\/2s|s\/2)\b/gi, ' d5s2 ');
  s = s.replace(/\b(?:vitamin|vit)?\s*b\s*1\s*[-+]\s*(?:b\s*)?6\s*[-+]\s*(?:b\s*)?12\b/gi, ' vitaminb1612 ');
  s = s.replace(/\b(?:vitamin|vit)\s*b\s*[- ]?\s*co(?:mplex)?\b/gi, ' vitaminbco ');
  s = s.replace(/\bb[\s\-]*co(?:mplex)?\b/gi, ' vitaminbco ');
  s = s.replace(/\b(?:vitamin|vit)\s*c\b/gi, ' vitaminc ');
  s = s.replace(/\b(?:vitamin|vit)\s*b\s*1\b(?![+\-0-9])/gi, ' vitaminb1 ');
  s = s.replace(/\br[\s\-]+den\b/gi, ' rden ');
  s = s.replace(/\bcta\b/gi, ' ta ');

  // แยกตัวอักษรไทยกับอังกฤษ/ตัวเลข (เช่น ฟ้าทะลายโจรแคปซูล500mg, povidine10%)
  s = s.replace(/([\u0E00-\u0E7F])([a-z0-9])/g, '$1 $2');
  s = s.replace(/([a-z0-9])([\u0E00-\u0E7F])/g, '$1 $2');

  // แยก % กับคำหรือตัวเลขที่ติดกัน และแยก ta0.1 -> ta 0.1
  s = s.replace(/%/g, '% ');
  s = s.replace(/\bta(?=\d)/gi, 'ta ');
  // แยกคำอังกฤษตั้งแต่ 4 ตัวขึ้นไปที่ติดตัวเลข (ไม่แยก b1, b12, d5, d50w, d5s2, vitaminb1612)
  s = s.replace(/\b([a-z]{4,})(\d)/g, (m, word, digit) => {
    if (word === 'vitaminb') return m;
    return `${word} ${digit}`;
  });
  // แยกตัวเลขกับหน่วย (500mg -> 500 mg, 120ml -> 120 ml)
  s = s.replace(/(\d+(?:\.\d+)?)(mg|mcg|ml|gm|g|cc|iu|dose|l)\b/gi, '$1 $2');

  // แทรกช่องว่างรอบคำภาษาไทยที่ใช้ประกอบชื่อยา
  for (const w of THAI_SPLIT_WORDS) {
    if (s.includes(w)) {
      s = s.split(w).join(` ${w} `);
    }
  }

  return s.replace(/\s+/g, ' ').trim();
}

function cleanString(str) {
  if (!str) return '';
  return preNormalizeDrugText(str)
    .replace(/[^a-z0-9\u0E00-\u0E7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// แยก "ความเข้มข้น/ขนาดยา" (concNumbers, percents) ออกจาก "ขนาดบรรจุภาชนะ" (containerNumbers เช่น 60 ml, 500 g)
function parseStrength(str) {
  if (!str) return { numbers: [], concNumbers: [], containerNumbers: [], percents: [], isPercent: false, raw: '' };
  const s = preNormalizeDrugText(str);
  const isPercent = s.includes('%');
  const numbers = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);

  // เอาส่วนความเข้มข้นแบบสัดส่วน (เช่น 250 mg / 5 ml, 50 mg / 0.6 ml, 100 mg / 5 ml) ออกก่อน
  // เพื่อไม่ให้ "5 ml" หรือ "0.6 ml" ในสัดส่วนถูกนับผิดเป็นปริมาตรขวด!
  const concNumbers = [];
  const percents = [];
  const containerNumbers = [];

  let stripped = s.replace(/(\d+(?:\.\d+)?)\s*(?:mg|mcg|g|iu)\s*\/\s*(\d*(?:\.\d+)?)\s*(?:ml|l)\b/gi, (_, n1, n2) => {
    concNumbers.push(Number(n1));
    if (n2) concNumbers.push(Number(n2));
    return ' ';
  });

  // หาเปอร์เซ็นต์ เช่น 0.1 %, 0.02 %, 4 %, 1 %
  stripped = stripped.replace(/(\d+(?:\.\d+)?)\s*%/g, (_, n) => {
    const num = Number(n);
    percents.push(num);
    concNumbers.push(num);
    return ' ';
  });

  // หาขนาดยา mg / mcg / iu / ยาสัดส่วนเม็ด (1+100 mg, 0.03+0.15 mg, 50+5 mg)
  stripped = stripped.replace(/(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)(?:\s*(?:mg|mcg))?/gi, (_, n1, n2) => {
    concNumbers.push(Number(n1), Number(n2));
    return ' ';
  });
  stripped = stripped.replace(/(\d+(?:\.\d+)?)\s*(?:mg|mcg|iu)\b/gi, (_, n) => {
    concNumbers.push(Number(n));
    return ' ';
  });

  // หาขนาดบรรจุภาชนะ (ml, g, gm, l, cc)
  stripped = stripped.replace(/(\d+(?:\.\d+)?)\s*(?:ml|gm|g|cc|l)\b/gi, (_, n) => {
    containerNumbers.push(Number(n));
    return ' ';
  });

  // กรณีไม่มีหน่วยต่อท้าย แต่มีตัวเลขความแรงเดี่ยว (เช่น "ENALAPRIL 5 MG" ตัด mg ไปแล้ว หรือ "[14วัน]" ตัดคำว่าวันออก)
  const noDays = stripped.replace(/\[\s*\d+\s*วัน\s*\]/g, ' ').replace(/\d+\s*วัน/g, ' ');
  const leftoverNums = (noDays.match(/\b\d+(?:\.\d+)?\b/g) || []).map(Number);

  return {
    numbers,
    concNumbers: [...new Set(concNumbers)],
    containerNumbers: [...new Set(containerNumbers)],
    percents: [...new Set(percents)],
    leftoverNums,
    isPercent,
    raw: s
  };
}

function parseDosageForm(item) {
  let text = '';
  if (typeof item === 'string') {
    text = item.toLowerCase();
  } else if (item && typeof item === 'object') {
    text = `${item.rawType || ''} ${item.dosageForm || ''} ${item.drugtype || ''} ${item.rawName || item.drugname || ''} ${item.drugunit || ''} ${item.unitpacking || ''} ${item.rawCategory || item.category || ''}`.toLowerCase();
  }
  text = preNormalizeDrugText(text);

  if (/\b(?:supp|suppo|sup)\b/.test(text) || text.includes('เหน็บ')) return 'SUPPOSITORY';
  if (text.includes('eye drop') || text.includes('ear drop') || text.includes('drop') || /\boph\b/.test(text) || text.includes('ed sol') || text.includes('หยอด')) return 'DROPS';
  if (/\b(?:syr|sus|susp|elixir|mix|mixt)\b/.test(text) || text.includes('น้ำแก้ไอ') || text.includes('ยาน้ำ')) return 'SYRUP';
  if (/\b(?:cre|cream|oin|oint|ointment|lot|lotion|pas|paste)\b/.test(text) || text.includes('ครีม') || text.includes('ขี้ผึ้ง') || text.includes('ทา') || text.includes('ตลับ') || text.includes('ป้ายปาก')) return 'TOPICAL';
  if (/\b(?:inj|injection|amp|vial|infusion|irrigate|irrigat)\b/.test(text) || text.includes('ฉีด') || text.includes('ล้างแผล')) return 'INJECTION';
  if (/\b(?:tab|tabs|tablet)\b/.test(text) || text.includes('เม็ด')) return 'TABLET';
  if (/\b(?:cap|caps|capsule)\b/.test(text) || text.includes('แคป')) return 'CAPSULE';
  if (/\b(?:inh|neb|spray|respule|mdi)\b/.test(text) || text.includes('พ่น')) return 'INHALER';
  if (/\b(?:pow|powder|sac|sachet)\b/.test(text) || text.includes('ผง') || text.includes('ซอง') || text.includes('ชาชง') || text.includes('ยาชง') || text.includes('ยาอม')) return 'POWDER';
  if (text.includes('solution') || /\bsol\b/.test(text) || text.includes('gel') || text.includes('เจล')) return 'SOLUTION';
  if (text.includes('ขวด')) return 'SYRUP';
  return 'OTHER';
}

function parseCategory(item) {
  let text = '';
  let hasDrugText = '';
  if (typeof item === 'string') {
    text = item.toLowerCase();
    hasDrugText = text;
  } else if (item && typeof item === 'object') {
    text = `${item.rawCategory || item.category || ''} ${item.drugtype || ''} ${item.productcat || ''}`.toLowerCase().trim();
    hasDrugText = `${item.rawName || item.drugname || ''}`.toLowerCase();
  }
  if (text.includes('สมุนไพร') || text === '10' || text === '25') return 'HERB';
  if (text.includes('หัตถการ') || text === '02') return 'PROCEDURE';
  if (text.includes('เวชภัณฑ์') || text.includes('วัสดุ') || text === '03' || text === '11') return 'SUPPLY';
  if (text.includes('แผนปัจจุบัน') || text === '01' || text === '1') return 'MODERN';
  // ถ้าไม่ระบุประเภทยา (เช่น ใบเบิก รพ.สารภี ที่ไม่มีคอลัมน์ประเภทยา) ไม่ต้องหักคะแนนข้ามหมวดกับสมุนไพร
  if (!text || text === 'ยา' || /^[a-z]+$/.test(text)) {
    return /[\u0E00-\u0E7F]/.test(hasDrugText) ? 'UNKNOWN' : 'MODERN';
  }
  return 'UNKNOWN';
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

const KNOWN_SHORT_API_WORDS = new Set(['ta', 'gg']);

function tokenMatchesCandidate(term, candCombined, candWords) {
  if (!term || term.length < 2) return false;
  const isThai = /[\u0E00-\u0E7F]/.test(term);
  if (isThai) {
    if (term.length < 3) return false;
    return candCombined.includes(term);
  }
  // ตัวย่อสั้นพิเศษ (เช่น ta = Triamcinolone, gg = Glyceryl guaiacolate) เทียบเฉพาะคำเต็มเท่านั้น
  if (term.length === 2) {
    return KNOWN_SHORT_API_WORDS.has(term) && candWords.includes(term);
  }

  // ASCII token: ต้องตรงเป็นคำ หรือตรงด้วย fuzzy >= 0.82 (กัน 'carbon' ไปติด 'carbonate' หรือคำสั้นติดซับสตริงมั่ว)
  if (candWords.includes(term)) return true;

  for (const cw of candWords) {
    if (cw.length < 3) continue;
    if (term.length >= 5 && cw.length >= 5 && (cw.startsWith(term) || term.startsWith(cw)) && Math.abs(cw.length - term.length) <= 2) {
      return true;
    }
    if (cw.length >= 4 && term.length >= 4 && levenshtein(term, cw) >= 0.82) {
      return true;
    }
  }
  return false;
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
  const incRawMerged = `${incObj.rawName || incObj.drugname || ''} ${incObj.rawStrength || ''}`.trim();
  const incNameClean = cleanString(incRawMerged);
  const incTokens = incNameClean.split(' ').filter(t => {
    if (!t || t.length < 2) return false;
    if (/^\d+$/.test(t)) return false;
    if (/^\d+(?:mg|mcg|ml|gm|g|cc|iu|l)$/.test(t)) return false;
    if (NON_API_STOPWORDS.has(t)) return false;
    return true;
  });

  if (incTokens.length === 0) return { score: 0, status: 'UNMATCHED', reason: 'ไม่มีชื่อยา' };

  const candNameClean = cleanString(candObj.drugname || '');
  const candGenClean = cleanString(candObj.druggenericname || '');
  const candThaiClean = cleanString(candObj.drugnamethai || '');
  const candCombined = `${candNameClean} ${candGenClean} ${candThaiClean}`.trim();
  const candWords = candCombined.split(' ').filter(Boolean);

  // ป้องกันกรณีเฉพาะผู้ใหญ่/เด็กข้ามกลุ่ม (เช่น ORS รสส้มผู้ใหญ่ vs ORS เด็ก)
  const incFullText = `${incObj.rawName || incObj.drugname || ''}`.toLowerCase();
  const candFullText = `${candObj.drugname || ''} ${candObj.drugnamethai || ''}`.toLowerCase();
  if ((incFullText.includes('ผู้ใหญ่') || incFullText.includes('adult')) && (candFullText.includes('เด็ก') || candFullText.includes('child')) && !candFullText.includes('ผู้ใหญ่')) {
    return { score: 0, status: 'UNMATCHED', reason: 'สูตรยาสำหรับผู้ใหญ่ไม่ตรงกับสูตรเด็ก' };
  }
  if ((incFullText.includes('เด็ก') || incFullText.includes('child')) && (candFullText.includes('ผู้ใหญ่') || candFullText.includes('adult')) && !candFullText.includes('เด็ก')) {
    return { score: 0, status: 'UNMATCHED', reason: 'สูตรยาสำหรับเด็กไม่ตรงกับสูตรผู้ใหญ่' };
  }

  let nameScore = 0;
  let matchedTokenCount = 0;

  // เฉพาะกรณี Triamcinolone / TA + oral paste -> เทียบ Kanolone และแยกจาก TA cream ชัดเจน
  const incIsOralPaste = incFullText.includes('oral') || incFullText.includes('paste') || /\bpas\b/.test(incFullText) || incFullText.includes('ป้ายปาก');
  const candIsOralPaste = candFullText.includes('oral') || candFullText.includes('paste') || candFullText.includes('kanolone') || candFullText.includes('ป้ายปาก');
  const extraAliases = [];
  if ((incTokens.includes('triamcinolone') || incTokens.includes('ta')) && incIsOralPaste) {
    extraAliases.push('kanolone');
  }

  for (const t of incTokens) {
    const termVariants = new Set([t]);
    if (CLINICAL_EXPANSIONS[t]) {
      CLINICAL_EXPANSIONS[t].forEach(exp => {
        cleanString(exp).split(' ').forEach(w => { if (w.length >= 2) termVariants.add(w); });
      });
    }
    let matchedThisToken = false;
    for (const v of termVariants) {
      if (tokenMatchesCandidate(v, candCombined, candWords)) {
        matchedThisToken = true;
        break;
      }
    }
    if (matchedThisToken) {
      nameScore += 50;
      matchedTokenCount++;
    }
  }

  for (const alias of extraAliases) {
    if (tokenMatchesCandidate(alias, candCombined, candWords)) {
      nameScore += 55;
      matchedTokenCount++;
    }
  }

  // ⚠️ CRITICAL SAFETY GATE: ตัวยาสำคัญต้องตรงกันอย่างน้อย 1 ตัวยา ห้ามจับคู่ข้ามตัวยาเด็ดขาด!
  if (nameScore === 0) {
    return { score: 0, status: 'UNMATCHED', reason: 'ตัวยาสำคัญไม่ตรงกัน (Active ingredient mismatch)' };
  }

  // โบนัสเมื่อตัวยาสำคัญทุกตัวในชื่อยาตรงกัน และโบนัสเสริมเมื่อตรงหลายตัวยา
  if (matchedTokenCount >= incTokens.length) {
    nameScore += 20;
  }
  if (matchedTokenCount >= 2) {
    nameScore += 25;
  }

  // โบนัสคำจำเพาะสูตร/ผู้ป่วย/การใช้งาน (เช่น ผู้ใหญ่, เด็ก, รสบ๊วย, irrigate/ล้างแผล)
  if (incFullText.includes('ผู้ใหญ่') && candFullText.includes('ผู้ใหญ่')) nameScore += 25;
  if (incFullText.includes('เด็ก') && candFullText.includes('เด็ก')) nameScore += 25;
  if (incFullText.includes('บ๊วย') && candFullText.includes('บ๊วย')) nameScore += 30;
  if (incFullText.includes('ประสะ') && candFullText.includes('ประสะ')) nameScore += 30;
  const incIsIrrig = incFullText.includes('irrig') || incFullText.includes('ล้างแผล');
  const candIsIrrig = candFullText.includes('irrig') || candFullText.includes('ล้างแผล');
  if (incIsIrrig && candIsIrrig) nameScore += 30;
  else if (incIsIrrig !== candIsIrrig && (incFullText.includes('nss') || incFullText.includes('n-s-s') || candFullText.includes('nss'))) {
    nameScore -= 40;
  }
  if (incIsOralPaste && candIsOralPaste) nameScore += 30;
  else if (incIsOralPaste !== candIsOralPaste && (incTokens.includes('triamcinolone') || incTokens.includes('ta') || candFullText.includes('kanolone'))) {
    nameScore -= 55;
  }

  // 2. มิติขนาดยา (แยกความเข้มข้น concNumbers/percents ออกจากขนาดขวด/กระปุก containerNumbers)
  const incStr = parseStrength(`${incObj.rawStrength || ''} ${incObj.rawName || ''} ${incObj.drugname || ''}`);
  const candStr = parseStrength(`${candObj.drugname || ''} ${candObj.druggenericname || ''} ${candObj.unitpacking || ''}`);

  let strengthScore = 0;

  // 2A) เทียบเปอร์เซ็นต์ (เช่น 0.1% vs 0.02%)
  if (incStr.percents.length > 0 && candStr.percents.length > 0) {
    const pctMatch = incStr.percents.every(p => candStr.percents.includes(p));
    if (pctMatch) strengthScore += 25;
    else strengthScore -= 60;
  } else if (incStr.isPercent && !candStr.isPercent && !candStr.raw.includes('0')) {
    strengthScore -= 25;
  }

  // 2B) เทียบความเข้มข้น (mg, mcg, iu, ratio)
  if (incStr.concNumbers.length > 0 && candStr.concNumbers.length > 0) {
    const nonPctInc = incStr.concNumbers.filter(n => !incStr.percents.includes(n));
    const nonPctCand = candStr.concNumbers.filter(n => !candStr.percents.includes(n));
    if (nonPctInc.length > 0 && nonPctCand.length > 0) {
      const allMatch = nonPctInc.every(n => nonPctCand.includes(n));
      if (allMatch) {
        strengthScore += 40;
      } else {
        strengthScore -= 60; // ความแรง mg/mcg ขัดแย้งกันชัดเจน (เช่น 5 mg vs 20 mg)
      }
    }
  } else if (incStr.numbers.length > 0 && candStr.numbers.length > 0 && incStr.containerNumbers.length === 0 && candStr.containerNumbers.length === 0) {
    const allMatch = incStr.numbers.every(n => candStr.numbers.includes(n));
    if (allMatch) strengthScore += 35;
    else strengthScore -= 60;
  }

  // 2C) เทียบขนาดบรรจุภาชนะ (ml, g, gm — เช่น NSS 100 vs 500 vs 1000 ml หรือครีม 5g vs 10g)
  if (incStr.containerNumbers.length > 0 && candStr.containerNumbers.length > 0) {
    const sameContainer = incStr.containerNumbers.every(n => candStr.containerNumbers.includes(n));
    if (sameContainer) {
      strengthScore += 25;
    } else if (incStr.percents.length > 0 && candStr.percents.length > 0 && incStr.percents.every(p => candStr.percents.includes(p)) && !candFullText.includes('nss')) {
      // ครีมความเข้มข้น % ตรงกัน (เช่น TA 0.1% กระปุก 500g แบ่งใส่ตลับ 10g) — ลดคะแนนเล็กน้อยเท่านั้น
      strengthScore -= 5;
    } else {
      // ปริมาตรต่างกันชัดเจน เช่น NSS 100 ml vs 500 ml vs 1000 ml, มะขามป้อม 60 ml vs 120 ml
      strengthScore -= 45;
    }
  }

  // 3. มิติชนิดยา / รูปแบบยา (Dosage Form)
  const incForm = parseDosageForm(incObj);
  const candForm = parseDosageForm(candObj);

  let formScore = 0;
  if (incForm !== 'OTHER' && candForm !== 'OTHER') {
    if (incForm === candForm) {
      formScore += 30;
    } else if ((incForm === 'TABLET' && candForm === 'CAPSULE') || (incForm === 'CAPSULE' && candForm === 'TABLET')) {
      formScore += 10;
    } else if ((incForm === 'SYRUP' && candForm === 'DROPS') || (incForm === 'DROPS' && candForm === 'SYRUP') ||
               (incForm === 'SYRUP' && candForm === 'SOLUTION') || (incForm === 'SOLUTION' && candForm === 'SYRUP')) {
      formScore += 10; // ยาน้ำ/ยาหยอด (เช่น Ferrous Drop sus vs FERDEX Drop) หรือยาน้ำ/sol
    } else if ((incForm === 'DROPS' && candForm === 'SOLUTION') || (incForm === 'SOLUTION' && candForm === 'DROPS')) {
      formScore += 10;
    } else if ((incForm === 'TOPICAL' && candForm === 'SOLUTION') || (incForm === 'SOLUTION' && candForm === 'TOPICAL')) {
      formScore += 5;
    } else {
      // ⚠️ รูปแบบยาขัดแย้งกันรุนแรง (เช่น ยาเม็ด vs ยาฉีด หรือ ยาน้ำ vs ยาทาภายนอก)
      formScore -= 70;
    }
  }

  // 4. มิติประเภทยา / กลุ่มยา (Category)
  const incCat = parseCategory(incObj);
  const candCat = parseCategory(candObj);

  let catScore = 0;
  if (incCat !== 'UNKNOWN' && candCat !== 'UNKNOWN') {
    if (incCat === candCat) {
      catScore += 20;
    } else if ((incCat === 'HERB' && candCat !== 'HERB') || (incCat !== 'HERB' && candCat === 'HERB')) {
      catScore -= 40;
    }
  }

  if (incObj.rawCategory) {
    const rawCat = incObj.rawCategory;
    if (rawCat.includes('เม็ด') && candForm === 'TABLET') catScore += 15;
    if (rawCat.includes('น้ำ') && candForm === 'SYRUP') catScore += 15;
    if (rawCat.includes('ฉีด') && candForm === 'INJECTION') catScore += 15;
    if (rawCat.includes('ภายนอก') && candForm === 'TOPICAL') catScore += 15;
  }

  // ⚠️ CRITICAL SAFETY GATES ON CONFLICTS:
  if (formScore <= -50) {
    return {
      score: 0,
      status: 'UNMATCHED',
      reason: `ชนิด/รูปแบบยาขัดแย้งกันอย่างสิ้นเชิง (${incForm} vs ${candForm})`,
      nameScore, strengthScore, formScore, catScore, incForm, candForm
    };
  }

  if (strengthScore <= -45) {
    return {
      score: 30,
      status: 'UNMATCHED',
      reason: 'ขนาดยาหรือปริมาตรไม่ตรงกัน (Strength mismatch)',
      nameScore, strengthScore, formScore, catScore, incForm, candForm
    };
  }

  const totalScore = nameScore + strengthScore + formScore + catScore;
  let status = 'UNMATCHED';
  if (totalScore >= 85) {
    status = 'EXACT';
  } else if (totalScore >= 50) {
    status = 'SUGGESTED';
  }

  return {
    score: totalScore,
    status,
    nameScore, strengthScore, formScore, catScore, incForm, candForm
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

function inferLocalUnit(name = '') {
  const s = String(name || '').toLowerCase();
  if (s.includes('5l') || s.includes('5 l') || s.includes('แกลลอน')) return 'แกลลอน';
  if (s.includes('ml') || s.includes('ขวด')) return 'ขวด';
  if (s.includes('กล่อง')) return 'กล่อง';
  if (s.includes('ถุง') || s.includes('ห่อ') || s.includes('ซอง')) return 'ห่อ';
  return 'หน่วย';
}

// ตรวจจับยาครีม/ขี้ผึ้งกระปุกใหญ่แบ่งบรรจุ (Dual-Unit เช่น กระปุก 500 g แบ่งใส่ตลับ 10 g = 50 ตลับ)
function detectDualUnitRepack(item, matchedDrug, existingSettings = null) {
  if (existingSettings && (
    Number(existingSettings.conversionFactor) > 1 ||
    existingSettings.isRepackaged ||
    Number(existingSettings.unitRatio) > 1
  )) {
    const ratio = Math.max(2, Number(existingSettings.conversionFactor || existingSettings.unitRatio) || 50);
    const mainStoreUnit = existingSettings.mainStoreUnit || 'กระปุก';
    const substockUnit = existingSettings.counterUnit || existingSettings.substockUnit || 'ตลับ';
    return {
      isDualUnit: true,
      repackRatio: ratio,
      mainStoreUnit,
      substockUnit,
      description: existingSettings.repackNotice || existingSettings.note || `ยาแบ่งบรรจุ (1 ${mainStoreUnit} = ${ratio} ${substockUnit})`,
      source: 'saved_settings'
    };
  }

  const excelText = String(item?.drugname || '').toLowerCase();
  const jhcisText = String(matchedDrug?.drugname || '').toLowerCase();
  if (!excelText) return null;

  // ตัดรูปแบบยาที่ไม่ใช่กระปุกครีม/ขี้ผึ้งแบ่งตลับ (เช่น ยาเม็ด 500mg, แคปซูล, ยาฉีด, ยาป้ายปาก, ยาสอด, น้ำเชื่อม)
  if (/(?:\b(?:tab|cap|inj|syr|sus|susp|vaginal|supp|irrigat|drop|sol)\b|oral\s*paste|เม็ด|แคปซูล|ยาฉีด|น้ำเชื่อม|500\s*mg|450\s*mg)/i.test(excelText)) {
    return null;
  }

  // ตรวจจับน้ำหนักกระปุกใหญ่ 450g / 500g (รองรับทั้ง "500gm", "500 g", "Triamcinolone0.1%500gm", "500 กรัม")
  const bulkMatch = excelText.match(/(?:^|[^0-9.])(450|500)\s*(?:g|gm|กรัม)(?:$|[^a-z])/i);
  const hasJarSize = Boolean(bulkMatch) || (excelText.includes('กระปุก') && !excelText.includes('เม็ด') && !excelText.includes('แคปซูล'));
  const isTopicalCreamOint = /(?:(?:^|[^a-z])cre(?:am)?(?:$|[^a-z])|oint(?:ment)?|ครีม|ขี้ผึ้ง|clotrim|triamcinolone|(?:^|[^a-z])ta\s*0\.1|urea|sulfadiazine|clobetasol)/i.test(excelText) ||
    /(?:cream|oint|ครีม|ขี้ผึ้ง)/i.test(jhcisText);

  if (!hasJarSize || !isTopicalCreamOint) return null;

  const bulkGrams = bulkMatch ? Number(bulkMatch[1]) : 500;
  const dispenseMatch = jhcisText.match(/(?:^|[^0-9.])(\d+)\s*(?:g|gm)(?:$|[^a-z%])/i);
  const parsedDispense = dispenseMatch ? Number(dispenseMatch[1]) : 10;
  const dispenseGrams = (parsedDispense > 0 && parsedDispense < bulkGrams) ? parsedDispense : 10;
  const ratio = Math.max(2, Math.round(bulkGrams / dispenseGrams));

  return {
    isDualUnit: true,
    repackRatio: ratio,
    mainStoreUnit: 'กระปุก',
    substockUnit: 'ตลับ',
    bulkGrams,
    dispenseGrams,
    description: `ยาครีมกระปุก ${bulkGrams} g แบ่งใส่ตลับ ${dispenseGrams} g (1 กระปุก = ${ratio} ตลับ)`,
    source: 'auto_detected'
  };
}

function detectFloorStockInfo(item, matchedDrug, existingSettings = null) {
  if (existingSettings && existingSettings.isFloorStock) {
    return {
      isFloorStock: true,
      usageType: existingSettings.usageType || 'procedure',
      department: existingSettings.department || 'ห้องทำแผล/อุบัติเหตุฉุกเฉิน',
      mainStoreUnit: existingSettings.mainStoreUnit || 'ขวด',
      description: existingSettings.procedureNotice || existingSettings.note || 'ยาหัตถการใช้ในห้องทำแผล — ตัดสต็อกคลังในตามจำนวนขวดที่เบิกจริง',
      source: 'saved_settings'
    };
  }
  const combined = `${item?.drugname || ''} ${matchedDrug?.drugname || ''}`.toLowerCase();
  if (combined.includes('lidocaine') || combined.includes('ยาชา')) {
    return {
      isFloorStock: true,
      usageType: 'procedure',
      department: 'ห้องทำแผล/อุบัติเหตุฉุกเฉิน',
      mainStoreUnit: 'ขวด',
      description: 'ยาหัตถการใช้ในห้องทำแผล (1 ขวด 20 ml ดูดฉีด 3-5 ml/เคส) — ตัดสต็อกคลังในตามจำนวนขวดที่เบิกจริง',
      source: 'auto_detected'
    };
  }
  return null;
}

// Match an array of parsed Excel items against JHCIS catalogue
async function matchExcelItems(parsedItems) {
  const jhcisDrugs = await getAllJhcisDrugs();
  const mappings = memoryStore.drugMappings || [];
  const currentPcu = getPcuCode() || '';

  return parsedItems.map(item => {
    let matchedDrug = null;
    let isLocalOnly = false;
    let matchStatus = 'UNMATCHED';
    let matchType = '';
    let confidence = 0;
    let suggestions = [];

    const tmt24 = (item.tmtid || '').trim();
    const hosCode = (item.hosdrugcode || '').trim();

    const rawItemName = (item.drugname || '').trim();
    const normItemName = cleanString(rawItemName).replace(/\s+/g, '');
    const normHosCode = hosCode.toLowerCase();

    // ค้นหา Saved Mapping ก่อน (รองรับทั้งโหมด JHCIS และ Local-Only ที่ไม่ผูก JHCIS)
    const savedByCode = normHosCode
      ? mappings.find(m => (!m.pcucode || !currentPcu || m.pcucode === currentPcu) && m.hosdrugcode && String(m.hosdrugcode).trim().toLowerCase() === normHosCode)
      : null;
    const savedByName = (!savedByCode && normItemName)
      ? mappings.find(m => {
          if (m.pcucode && currentPcu && m.pcucode !== currentPcu) return false;
          const mNorm = cleanString(m.hospitalDrugName || m.drugname || '').replace(/\s+/g, '');
          return mNorm && mNorm === normItemName;
        })
      : null;
    const savedMap = savedByCode || savedByName;

    // 0. Check Local-Only saved mapping (รายการเฉพาะคลังยาใน ไม่ผูก JHCIS)
    if (savedMap && (savedMap.isLocalOnly || String(savedMap.jhcisdrugcode || '').startsWith('LOCAL-'))) {
      isLocalOnly = true;
      const localCode = String(savedMap.jhcisdrugcode || `LOCAL-${hosCode || Date.now()}`).trim();
      const localUnit = savedMap.localUnit || inferLocalUnit(item.drugname);
      return {
        ...item,
        isLocalOnly: true,
        countByPack: Boolean(savedMap.countByPack),
        repackInfo: null,
        floorStockInfo: null,
        matchStatus: 'MATCHED',
        matchType: 'LOCAL_ONLY (เฉพาะคลังยาใน ไม่ผูก JHCIS)',
        confidence: 100,
        matchedDrugCode: localCode,
        matchedDrugName: item.drugname || savedMap.matchedDrugName || localCode,
        matchedDrugUnit: localUnit,
        suggestions: []
      };
    }

    // 1. Check TMT 24 digits
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
    if (!matchedDrug && savedMap) {
      const targetCode = String(savedMap.jhcisdrugcode || savedMap.matchedDrugCode || '').trim();
      const candidate = jhcisDrugs.find(d => String(d.drugcode).trim().toLowerCase() === targetCode.toLowerCase()) ||
                        jhcisDrugs.find(d => String(d.drugcode).trim().replace(/^0+/, '') === targetCode.replace(/^0+/, ''));
      if (candidate) {
        // ถ้ายึดตาม hosdrugcode เชื่อถือได้โดยตรง; ถ้าเทียบแค่ชื่อ ให้กันกรณีความแรง/รูปแบบยาขัดแย้งกัน
        if (savedByCode) {
          matchedDrug = candidate;
        } else {
          const check = scoreDrugClinicalMatch(item, candidate);
          if (check.strengthScore > -45 && check.formScore > -50) {
            matchedDrug = candidate;
          }
        }
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

    // 4. 4-Dimensional Clinical Drug Matcher
    if (!matchedDrug && item.drugname) {
      const scored = jhcisDrugs.map(d => {
        const evalResult = scoreDrugClinicalMatch(item, d);
        return { drug: d, evalResult, score: evalResult.score };
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

    // 5. ตรวจจับยาแบ่งบรรจุกระปุก (Dual-Unit เช่น กระปุก 500 g -> 50 ตลับ 10 g) และยาหัตถการ (Floor Stock)
    const existingSettings = matchedDrug ? getDrugSettings(matchedDrug.drugcode) : null;
    const repackInfo = matchedDrug ? detectDualUnitRepack(item, matchedDrug, existingSettings) : null;
    const floorStockInfo = matchedDrug ? detectFloorStockInfo(item, matchedDrug, existingSettings) : null;

    // 6. คำนวณหน่วยรับ (countByPack) เช่น ยาคุมจ่ายเป็นแผง (28 เม็ด), ชาชงจ่ายเป็นห่อใหญ่, หรือยาครีมกระปุก 500g (รับเข้าคลังในเป็นกระปุก)
    let finalAmount = item.amount;
    let finalCost = item.cost;
    let countByPack = false;

    if (matchedDrug && item.issuedQty > 0 && item.packSize > 1) {
      const autoPackUnit =
        Boolean(repackInfo?.isDualUnit) ||
        matchedDrug.drugunit === 'แผง' ||
        (matchedDrug.drugname || '').includes('ถุงชาเล็ก');

      if (Boolean(repackInfo?.isDualUnit) || savedMap?.countByPack === true || (savedMap?.countByPack !== false && autoPackUnit)) {
        countByPack = true;
        finalAmount = item.issuedQty;
        finalCost = item.pricePerPack > 0 ? item.pricePerPack : item.cost;
      }
    }

    return {
      ...item,
      amount: finalAmount,
      cost: finalCost,
      countByPack,
      isLocalOnly,
      repackInfo,
      floorStockInfo,
      matchStatus,
      matchType,
      confidence,
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
  parseCategory,
  preNormalizeDrugText,
  inferLocalUnit,
  detectDualUnitRepack,
  detectFloorStockInfo
};
