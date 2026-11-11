const fs = require('fs');
const path = require('path');
const { initPool } = require('../backend/src/config/db');

(async () => {
  try {
    const regPath = path.join(__dirname, '../backend/data/dtam/dtam_registry.json');
    if (!fs.existsSync(regPath)) {
      console.error('DTAM registry not found!');
      process.exit(1);
    }
    const registry = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    console.log('Loaded DTAM registry:', registry.version, 'items:', Object.keys(registry.byCode24).length);

    const pool = await initPool();
    // Query herbal drugs from JHCIS cdrug
    // Identification criteria:
    // 1. drugcode24 starts with '4' (standard traditional/herbal medicine prefix)
    // 2. OR drugcode starts with '4' and length >= 19
    // 3. OR drugname contains typical herbal keywords
    const [rows] = await pool.query(`
      SELECT drugcode, drugname, drugtype, tmtcode, drugcode24, cost, sell, unitsell, drugflag
      FROM cdrug
      WHERE (drugcode24 LIKE '4%' OR drugcode LIKE '4%')
         OR (drugname LIKE '%ฟ้าทะลาย%' 
             OR drugname LIKE '%ขมิ้น%' 
             OR drugname LIKE '%ไพล%' 
             OR drugname LIKE '%ประสะ%' 
             OR drugname LIKE '%มะขามป้อม%' 
             OR drugname LIKE '%ยาหอม%' 
             OR drugname LIKE '%เถาวัลย์%' 
             OR drugname LIKE '%รางจืด%')
            AND drugname NOT LIKE 'การ%'
    `);

    console.log(`Auditing ${rows.length} candidate herbal drugs from JHCIS cdrug:`);
    
    const results = [];
    let matchedCount = 0;
    let mismatchCount = 0;
    let revokedCount = 0;
    let missingCodeCount = 0;

    for (const r of rows) {
      const code24 = (r.drugcode24 || '').trim();
      const tmt = (r.tmtcode || '').trim();
      const code = (r.drugcode || '').trim();

      // Check revoked
      if (code24 && registry.revokedCodes[code24]) {
        revokedCount++;
        results.push({
          drugcode: code,
          drugname: r.drugname,
          currentCode24: code24,
          currentTmt: tmt,
          status: 'REVOKED',
          message: '⚠️ รหัสนี้ถูกกรมการแพทย์แผนไทยฯ สั่งยกเลิกแล้ว',
          dtamRef: registry.revokedCodes[code24]
        });
        continue;
      }

      // Check exact code24 match
      if (code24 && registry.byCode24[code24]) {
        const dtam = registry.byCode24[code24];
        const tmtMatch = !tmt || !dtam.tmtid || tmt === dtam.tmtid;
        if (tmtMatch) {
          matchedCount++;
          results.push({
            drugcode: code,
            drugname: r.drugname,
            currentCode24: code24,
            currentTmt: tmt,
            status: 'MATCHED',
            message: '✅ รหัส 24 หลักและ TMT ถูกต้องตรงตาม DTAM',
            dtamRef: dtam
          });
        } else {
          mismatchCount++;
          results.push({
            drugcode: code,
            drugname: r.drugname,
            currentCode24: code24,
            currentTmt: tmt,
            status: 'TMT_MISMATCH',
            message: `⚠️ รหัส 24 หลักตรง แต่ TMT ใน JHCIS (${tmt}) ไม่ตรงกับ DTAM (${dtam.tmtid})`,
            suggestedTmt: dtam.tmtid,
            dtamRef: dtam
          });
        }
        continue;
      }

      // If code24 doesn't match or is missing, check by TMT
      if (tmt && registry.byTmt[tmt]) {
        const candidateCodes = registry.byTmt[tmt];
        const dtam = registry.byCode24[candidateCodes[0]];
        mismatchCount++;
        results.push({
          drugcode: code,
          drugname: r.drugname,
          currentCode24: code24,
          currentTmt: tmt,
          status: 'CODE24_MISMATCH',
          message: `⚠️ TMT (${tmt}) ตรงกับ DTAM แต่รหัส 24 หลักใน JHCIS ไม่ตรง (เสนอแก้ไขเป็น: ${candidateCodes[0]})`,
          suggestedCode24: candidateCodes[0],
          dtamRef: dtam
        });
        continue;
      }

      // Neither code24 nor TMT matched
      missingCodeCount++;
      results.push({
        drugcode: code,
        drugname: r.drugname,
        currentCode24: code24,
        currentTmt: tmt,
        status: 'UNREGISTERED_OR_MISSING',
        message: '❌ ไม่พบข้อมูลรหัส 24 หลักหรือ TMT นี้ในบัญชี DTAM (อาจเป็นรหัสท้องถิ่น หรือยังไม่ได้ระบุ)',
        dtamRef: null
      });
    }

    const problematic = results.filter(x => x.status !== 'UNREGISTERED_OR_MISSING');
    console.log(`\nFound ${problematic.length} audited items in JHCIS:`);
    console.table(problematic.map(x => ({
      name: x.drugname.substring(0, 30),
      code24: x.currentCode24,
      tmt: x.currentTmt,
      status: x.status,
      message: x.message.substring(0, 60)
    })));

    process.exit(0);
  } catch (err) {
    console.error('Audit Error:', err);
    process.exit(1);
  }
})();
