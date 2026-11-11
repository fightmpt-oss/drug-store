const { initPool, getPool } = require('../backend/src/config/db');

(async () => {
  try {
    const pool = await initPool();
    const dtam = require('../backend/src/services/dtamService');
    const reg = dtam.getRegistry();

    const [rows] = await pool.query(`
      SELECT 
        drugcode, 
        drugname, 
        druggenericname, 
        drugtype, 
        tmtcode, 
        drugcode24, 
        cost, 
        sell, 
        unitsell, 
        drugflag
      FROM cdrug
      WHERE drugflag = '1'
        AND (
          (drugcode24 LIKE '4%' OR (drugcode LIKE '4%' AND LENGTH(drugcode) >= 10))
          OR (
            drugname LIKE '%ฟ้าทะลาย%' 
            OR drugname LIKE '%ขมิ้น%' 
            OR drugname LIKE '%ไพล%' 
            OR drugname LIKE '%ประสะ%' 
            OR drugname LIKE '%มะขามป้อม%' 
            OR drugname LIKE '%ยาหอม%' 
            OR drugname LIKE '%ยาธาตุ%' 
            OR drugname LIKE '%เถาวัลย์%' 
            OR drugname LIKE '%รางจืด%'
            OR drugname LIKE '%ขิง%'
            OR drugname LIKE '%บัวบก%'
            OR drugname LIKE '%มะระขี้นก%'
            OR drugname LIKE '%ชุมเห็ด%'
            OR drugname LIKE '%เพชรสังฆาต%'
            OR drugname LIKE '%ตรีผลา%'
            OR drugname LIKE '%สหัสธารา%'
            OR drugname LIKE '%หญ้าหนวดแมว%'
            OR drugname LIKE '%หญ้าดอกขาว%'
            OR drugname LIKE '%ลูกประคบ%'
            OR drugname LIKE '%ดอกคำฝอย%'
            OR drugname LIKE '%มะแว้ง%'
            OR drugtype = '10'
          )
        )
        AND drugname NOT LIKE 'การ%'
      ORDER BY drugname ASC
    `);

    console.log(`Active herbs count (drugflag = '1'): ${rows.length}`);
    let matched = 0, tmtMismatch = 0, code24Mismatch = 0, revoked = 0, unreg = 0;
    for (const r of rows) {
      const c24 = (r.drugcode24 || '').trim();
      const tmt = (r.tmtcode || '').trim();
      if (c24 && reg.revokedCodes[c24]) {
        revoked++;
        console.log('REVOKED:', r.drugname, c24);
      } else if (c24 && reg.byCode24[c24]) {
        const dt = reg.byCode24[c24];
        if (!tmt || !dt.tmtid || tmt === dt.tmtid) {
          matched++;
        } else {
          tmtMismatch++;
          console.log('TMT MISMATCH:', r.drugname, 'JHCIS TMT:', tmt, 'DTAM TMT:', dt.tmtid);
        }
      } else if (tmt && reg.byTmt[tmt]) {
        code24Mismatch++;
        console.log('CODE24 MISMATCH:', r.drugname, 'tmt:', tmt);
      } else {
        unreg++;
        console.log('UNREG:', r.drugname, 'c24:', c24, 'tmt:', tmt);
      }
    }
    console.log('\nAudit summary of ACTIVE herbs:');
    console.log({ total: rows.length, matched, tmtMismatch, code24Mismatch, revoked, unreg });

    process.exit(0);

    const [herbsByFlag] = await pool.query(`
      SELECT drugflag, COUNT(*) as cnt
      FROM cdrug
      WHERE (drugcode24 LIKE '4%' OR (drugcode LIKE '4%' AND LENGTH(drugcode) >= 10))
         OR (
              drugname LIKE '%ฟ้าทะลาย%' 
           OR drugname LIKE '%ขมิ้น%' 
           OR drugname LIKE '%ไพล%' 
           OR drugname LIKE '%ประสะ%' 
           OR drugname LIKE '%มะขามป้อม%' 
           OR drugname LIKE '%ยาหอม%' 
           OR drugname LIKE '%ยาธาตุ%' 
           OR drugname LIKE '%เถาวัลย์%' 
           OR drugname LIKE '%รางจืด%'
         )
         AND drugname NOT LIKE 'การ%'
      GROUP BY drugflag
    `);
    console.log('Herbs grouped by drugflag:');
    console.table(herbsByFlag);

    process.exit(0);
    console.log('Actual herbal drugs found in JHCIS cdrug:', rows.length);
    console.table(rows);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
