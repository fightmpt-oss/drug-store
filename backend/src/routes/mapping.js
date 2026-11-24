const express = require('express');
const router = express.Router();
const { memoryStore, saveMappings, getPcuCode } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// ทุก route ต้อง login
router.use(requireAuth);

function normalizeKey(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]/g, '')
    .trim();
}

function matchesCurrentPcu(mapping, currentPcu) {
  return !mapping.pcucode || !currentPcu || mapping.pcucode === currentPcu;
}

// Get all mappings (scoped strictly to active PCU)
router.get('/', (req, res) => {
  const currentPcu = getPcuCode() || '';
  const list = (memoryStore.drugMappings || [])
    .filter(m => matchesCurrentPcu(m, currentPcu))
    .map((m, idx) => ({
      ...m,
      id: m.id || `map_${idx}_${m.hosdrugcode || normalizeKey(m.hospitalDrugName || m.drugname)}`
    }));
  res.json({ success: true, data: list });
});

// Create or update single mapping
router.post('/', (req, res) => {
  try {
    const {
      hosdrugcode, jhcisdrugcode, drugname, hospitalDrugName, matchedDrugName, tmtid,
      isLocalOnly, countByPack, localUnit
    } = req.body;
    const rawName = (hospitalDrugName || drugname || '').trim();
    const hosCode = (hosdrugcode || '').trim();

    if (!jhcisdrugcode || (!rawName && !hosCode)) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสยาหรือชื่อยา รพ. และรหัสยา JHCIS' });
    }

    const currentPcu = getPcuCode() || '';
    const normName = normalizeKey(rawName);
    const normHosCode = hosCode.toLowerCase();

    let idx = memoryStore.drugMappings.findIndex(m => {
      if (!matchesCurrentPcu(m, currentPcu)) return false;
      if (normHosCode && m.hosdrugcode && m.hosdrugcode.toLowerCase() === normHosCode) return true;
      const mNorm = normalizeKey(m.hospitalDrugName || m.drugname);
      if (normName && mNorm && mNorm === normName) return true;
      return false;
    });

    const targetCode = String(jhcisdrugcode).trim();
    const prev = idx >= 0 ? memoryStore.drugMappings[idx] : {};
    const mappingObj = {
      id: prev.id || `map_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      pcucode: currentPcu,
      hosdrugcode: hosCode,
      hospitalDrugName: rawName,
      drugname: rawName,
      jhcisdrugcode: targetCode,
      matchedDrugCode: targetCode,
      matchedDrugName: matchedDrugName || '',
      tmtid: tmtid || '',
      countByPack: countByPack !== undefined ? Boolean(countByPack) : Boolean(prev.countByPack),
      isLocalOnly: isLocalOnly !== undefined ? Boolean(isLocalOnly) : (Boolean(prev.isLocalOnly) || targetCode.startsWith('LOCAL-')),
      localUnit: localUnit !== undefined ? String(localUnit || '') : (prev.localUnit || ''),
      updatedAt: new Date().toISOString()
    };

    if (idx >= 0) {
      memoryStore.drugMappings[idx] = {
        ...prev,
        ...mappingObj,
        createdAt: prev.createdAt || new Date().toISOString()
      };
    } else {
      mappingObj.createdAt = new Date().toISOString();
      memoryStore.drugMappings.push(mappingObj);
    }

    saveMappings('บันทึกการจับคู่ยา (mapping)', req.user?.displayName || 'user');
    res.json({ success: true, message: 'บันทึกการจับคู่รหัสยาสำเร็จ (ระบบจะจดจำสำหรับการนำเข้าครั้งถัดไป)', data: mappingObj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Batch create or update mappings
router.post('/batch', (req, res) => {
  try {
    const { mappings } = req.body;
    if (!Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุรายการจับคู่ที่ต้องการบันทึก' });
    }

    const currentPcu = getPcuCode() || '';
    let savedCount = 0;
    for (const item of mappings) {
      const rawName = (item.hospitalDrugName || item.drugname || '').trim();
      const hosCode = (item.hosdrugcode || '').trim();
      const jhcisCode = String(item.jhcisdrugcode || item.drugcode || item.matchedDrugCode || '').trim();

      if (!jhcisCode || (!rawName && !hosCode)) continue;

      const normName = normalizeKey(rawName);
      const normHosCode = hosCode.toLowerCase();

      let idx = memoryStore.drugMappings.findIndex(m => {
        if (!matchesCurrentPcu(m, currentPcu)) return false;
        if (normHosCode && m.hosdrugcode && m.hosdrugcode.toLowerCase() === normHosCode) return true;
        const mNorm = normalizeKey(m.hospitalDrugName || m.drugname);
        if (normName && mNorm && mNorm === normName) return true;
        return false;
      });

      const prev = idx >= 0 ? memoryStore.drugMappings[idx] : {};
      const mappingObj = {
        id: prev.id || `map_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        pcucode: currentPcu,
        hosdrugcode: hosCode,
        hospitalDrugName: rawName,
        drugname: rawName,
        jhcisdrugcode: jhcisCode,
        matchedDrugCode: jhcisCode,
        matchedDrugName: item.matchedDrugName || '',
        tmtid: item.tmtid || '',
        countByPack: item.countByPack !== undefined ? Boolean(item.countByPack) : Boolean(prev.countByPack),
        isLocalOnly: item.isLocalOnly !== undefined ? Boolean(item.isLocalOnly) : (Boolean(prev.isLocalOnly) || jhcisCode.startsWith('LOCAL-')),
        localUnit: item.localUnit !== undefined ? String(item.localUnit || '') : (prev.localUnit || ''),
        updatedAt: new Date().toISOString()
      };

      if (idx >= 0) {
        memoryStore.drugMappings[idx] = {
          ...prev,
          ...mappingObj,
          createdAt: prev.createdAt || new Date().toISOString()
        };
      } else {
        mappingObj.createdAt = new Date().toISOString();
        memoryStore.drugMappings.push(mappingObj);
      }
      savedCount++;
    }

    if (savedCount > 0) {
      saveMappings(`บันทึกการจับคู่ยาแบบกลุ่ม (${savedCount} รายการ)`, req.user?.displayName || 'user');
    }

    res.json({ success: true, message: `บันทึกการจับคู่รหัสยาสำเร็จ ${savedCount} รายการ`, savedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete mapping by ID, hoscode, or normalized drugname (scoped strictly to current PCU)
router.delete('/:id', (req, res) => {
  try {
    const rawId = decodeURIComponent(req.params.id || '').trim();
    const normId = normalizeKey(rawId);
    const currentPcu = getPcuCode() || '';

    const initialLen = memoryStore.drugMappings.length;
    memoryStore.drugMappings = memoryStore.drugMappings.filter(m => {
      if (!matchesCurrentPcu(m, currentPcu)) return true;
      if (m.id && m.id === rawId) return false;
      if (m.hosdrugcode && m.hosdrugcode === rawId) return false;
      const mNorm = normalizeKey(m.hospitalDrugName || m.drugname);
      if (normId && mNorm && mNorm === normId) return false;
      return true;
    });

    if (memoryStore.drugMappings.length !== initialLen) {
      saveMappings('ลบรายการจับคู่ยา', req.user?.displayName || 'user');
    }

    res.json({ success: true, message: 'ลบการจับคู่สำเร็จ' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
