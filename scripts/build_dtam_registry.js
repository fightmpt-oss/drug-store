const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function buildRegistry(xlsxPath) {
  console.time('Build DTAM Registry');
  const wb = XLSX.readFile(xlsxPath);
  
  const registry = {
    version: 'No_01-165',
    builtAt: new Date().toISOString(),
    stats: {
      singleCount: 0,
      formulaCount: 0,
      revokedCount: 0,
      totalActive: 0
    },
    // Indexed mappings
    byCode24: {},
    byTmt: {},
    revokedCodes: {},
    nameList: [] // For auto-suggest or matching by name
  };

  // Helper to extract rows
  function processSheet(sName, type) {
    const sheet = wb.Sheets[sName];
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    // Row 2 is header
    const headerRow = rows[2] || [];
    const code24Idx = headerRow.findIndex(h => String(h).includes('24 หลัก'));
    const tmtIdx = headerRow.findIndex(h => String(h).includes('TTMTID'));
    const nameIdx = headerRow.findIndex(h => String(h).trim() === 'ชื่อยา');
    const tradeIdx = headerRow.findIndex(h => String(h).includes('ชื่อการค้า'));
    const strengthIdx = headerRow.findIndex(h => String(h).includes('ขนาดความแรง'));
    const formIdx = headerRow.findIndex(h => String(h).includes('รูปแบบยา'));
    const mfgIdx = headerRow.findIndex(h => String(h).includes('ผู้ผลิต') && !String(h).includes('รหัส'));
    const regIdx = headerRow.findIndex(h => String(h).includes('เลขทะเบียนยา'));
    const indIdx = headerRow.findIndex(h => String(h).includes('สรรพคุณยา-ข้อบ่งใช้'));
    const noteIdx = headerRow.findIndex(h => String(h).includes('หมายเหตุ'));

    console.log(`Sheet "${sName}" columns detected:`, {
      code24Idx, tmtIdx, nameIdx, tradeIdx, strengthIdx, formIdx, mfgIdx, regIdx
    });

    for (let i = 3; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const code24 = r[code24Idx] ? String(r[code24Idx]).trim() : '';
      if (!code24) continue;

      const tmtid = r[tmtIdx] ? String(r[tmtIdx]).trim() : '';
      const name = r[nameIdx] ? String(r[nameIdx]).trim() : '';
      const tradeName = r[tradeIdx] ? String(r[tradeIdx]).trim() : '';
      const strength = r[strengthIdx] ? String(r[strengthIdx]).trim() : '';
      const form = r[formIdx] ? String(r[formIdx]).trim() : '';
      const manufacturer = r[mfgIdx] ? String(r[mfgIdx]).trim() : '';
      const regNo = r[regIdx] ? String(r[regIdx]).trim() : '';
      const indication = r[indIdx] ? String(r[indIdx]).trim() : '';
      const note = r[noteIdx] ? String(r[noteIdx]).trim() : '';

      const item = {
        code24,
        tmtid: tmtid && tmtid !== 'ยกเลิก ก่อนกำหนดรหัส TTMTID' ? tmtid : '',
        name,
        tradeName,
        strength,
        form,
        manufacturer,
        regNo,
        indication,
        type,
        isRevoked: type === 'ยกเลิก',
        note
      };

      if (type === 'ยกเลิก') {
        registry.revokedCodes[code24] = item;
        registry.stats.revokedCount++;
      } else {
        registry.byCode24[code24] = item;
        if (item.tmtid) {
          if (!registry.byTmt[item.tmtid]) registry.byTmt[item.tmtid] = [];
          registry.byTmt[item.tmtid].push(code24);
        }
        if (type === 'เดี่ยว') registry.stats.singleCount++;
        if (type === 'ตำรับ') registry.stats.formulaCount++;
      }
    }
  }

  for (const sName of wb.SheetNames) {
    if (sName.includes('เดี่ยว')) processSheet(sName, 'เดี่ยว');
    else if (sName.includes('ตำรับ')) processSheet(sName, 'ตำรับ');
    else if (sName.includes('ยกเลิก')) processSheet(sName, 'ยกเลิก');
  }

  registry.stats.totalActive = registry.stats.singleCount + registry.stats.formulaCount;
  console.log('Registry built stats:', registry.stats);
  console.timeEnd('Build DTAM Registry');

  const outDir = path.join(__dirname, '../backend/data/dtam');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  
  const outFile = path.join(outDir, 'dtam_registry.json');
  fs.writeFileSync(outFile, JSON.stringify(registry), 'utf8');
  console.log('Saved JSON registry to:', outFile, 'Size:', (fs.statSync(outFile).size / 1024 / 1024).toFixed(2), 'MB');

  // Also copy the master xlsx for long-term audit & reference
  const masterXlsx = path.join(outDir, 'dtam_master.xlsx');
  fs.copyFileSync(xlsxPath, masterXlsx);
  console.log('Copied master xlsx to:', masterXlsx);
}

buildRegistry(path.join(__dirname, 'dtam_sample.xlsx'));
