import React, { useState, useEffect, useMemo } from 'react';
import { 
  ClipboardCheck, 
  Search, 
  Download, 
  Upload, 
  Printer, 
  RotateCcw, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  XCircle,
  Syringe,
  Filter, 
  Trash2, 
  Package, 
  Calendar, 
  DollarSign, 
  Layers, 
  PlusCircle,
  FileSpreadsheet,
  HelpCircle,
  Eye,
  Check,
  X,
  Tag,
  Plus,
  ListOrdered,
  CheckSquare,
  Square,
  ArrowRightLeft,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { api } from '../services/api';
import PaginationBar from './PaginationBar';

export default function InitialStockCountView({ user, onCountUpdated }) {
  const [loading, setLoading] = useState(true);
  const [drugs, setDrugs] = useState([]);
  const [summaryData, setSummaryData] = useState({
    totalDrugsInPcu: 0,
    activeDrugsInPcu: 0,
    totalCountedItems: 0,
    totalUncountedItems: 0,
    totalCountedUnits: 0,
    totalCountedValue: 0,
    countsMap: {}
  });

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('01'); // default 01: ยาแผนปัจจุบัน
  const [countFilter, setCountFilter] = useState('all'); // 'all', 'counted', 'uncounted'
  const [activeMode, setActiveMode] = useState('grid'); // 'grid' | 'single'
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Single Item Entry State (Multi-Lot Supported)
  const [singleDrugSearch, setSingleDrugSearch] = useState('');
  const [selectedDrug, setSelectedDrug] = useState(null);
  const [singleLots, setSingleLots] = useState([
    { lotno: '', dateexpire: '', amount: '', costprice: '', remark: '' }
  ]);
  const [singleMeta, setSingleMeta] = useState({
    countDate: new Date().toISOString().slice(0, 10),
    countedBy: user?.officername || user?.username || 'เจ้าหน้าที่คลังยา',
    remark: 'นับสต็อกเริ่มต้นรอบใหม่'
  });

  // Multi-Lot Modal for Table Grid
  const [multiLotModalDrug, setMultiLotModalDrug] = useState(null);
  const [multiLotRows, setMultiLotRows] = useState([]);
  const [savingMultiLot, setSavingMultiLot] = useState(false);

  // Table Grid In-line Edits State: { [drugcode]: { amount, lotno, dateexpire, costprice, isDirty } }
  const [gridEdits, setGridEdits] = useState({});
  const [savingCodes, setSavingCodes] = useState({});
  const [successToast, setSuccessToast] = useState('');
  const [errorToast, setErrorToast] = useState('');

  // Excel Upload Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Reset Confirmation Modal
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Excel Match & Review Modal State
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [loadingMatchPreview, setLoadingMatchPreview] = useState(false);
  const [matchPreviewData, setMatchPreviewData] = useState(null);
  const [matchItems, setMatchItems] = useState([]);
  const [matchSearch, setMatchSearch] = useState('');
  const [matchTab, setMatchTab] = useState('nonzero'); // 'nonzero', 'all', 'exact', 'suggested', 'unmatched', 'dualunit'
  const [resetBeforeCommit, setResetBeforeCommit] = useState(true);
  const [saveMappings, setSaveMappings] = useState(true);
  const [committingMatches, setCommittingMatches] = useState(false);

  // Drug Picker Submodal State
  const [pickingRowId, setPickingRowId] = useState(null);
  const [drugPickerSearch, setDrugPickerSearch] = useState('');

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [sumRes, drugsRes] = await Promise.all([
        api.getInitialStockCounts(),
        api.getAllDrugs()
      ]);

      if (sumRes.success) {
        setSummaryData(sumRes.data);
      }
      if (drugsRes.success) {
        setDrugs(drugsRes.data);
      }
    } catch (err) {
      console.error('Error loading stock count data:', err);
      setErrorToast('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (msg, isErr = false) => {
    if (isErr) {
      setErrorToast(msg);
      setTimeout(() => setErrorToast(''), 4000);
    } else {
      setSuccessToast(msg);
      setTimeout(() => setSuccessToast(''), 3000);
    }
  };

  // Filtered Drugs for Table Grid
  const filteredDrugs = useMemo(() => {
    return drugs.filter(d => {
      // Must be active drug by default unless searched
      if (!search && d.drugflag === '2') return false;

      // Category filter
      if (categoryFilter !== 'all') {
        if (categoryFilter === '01_10') {
          if (d.drugtype !== '01' && d.drugtype !== '10') return false;
        } else if (categoryFilter === 'antibio') {
          if (d.antibio !== '1') return false;
        } else if (d.drugtype !== categoryFilter) {
          return false;
        }
      }

      // Counted status filter
      const isCounted = Boolean(summaryData.countsMap[d.drugcode]);
      if (countFilter === 'counted' && !isCounted) return false;
      if (countFilter === 'uncounted' && isCounted) return false;

      // Search term
      if (search) {
        const s = search.toLowerCase().trim();
        const mCode = d.drugcode.toLowerCase().includes(s);
        const mName = (d.drugname || '').toLowerCase().includes(s);
        const mThai = (d.drugnamethai || '').toLowerCase().includes(s);
        const mTmt = (d.tmtcode || '').toLowerCase().includes(s);
        const m24 = (d.drugcode24 || d.didstandard || '').toLowerCase().includes(s);
        return mCode || mName || mThai || mTmt || m24;
      }

      return true;
    });
  }, [drugs, summaryData.countsMap, categoryFilter, countFilter, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, countFilter]);

  const totalGridItems = filteredDrugs.length;
  const isGridAll = pageSize === 'all';
  const numericGridSize = isGridAll ? Math.max(1, totalGridItems) : Number(pageSize);
  const totalGridPages = isGridAll ? 1 : Math.ceil(totalGridItems / numericGridSize);
  const validGridPage = Math.min(Math.max(1, currentPage), totalGridPages);

  const pagedDrugs = isGridAll
    ? filteredDrugs
    : filteredDrugs.slice((validGridPage - 1) * numericGridSize, validGridPage * numericGridSize);

  // Handle Input in Table Grid
  const handleGridInputChange = (drugcode, field, val) => {
    setGridEdits(prev => {
      const existing = prev[drugcode] || {
        amount: summaryData.countsMap[drugcode]?.amount ?? '',
        lotno: summaryData.countsMap[drugcode]?.lotno ?? '',
        dateexpire: summaryData.countsMap[drugcode]?.dateexpire ?? '',
        costprice: summaryData.countsMap[drugcode]?.costprice ?? ''
      };
      return {
        ...prev,
        [drugcode]: {
          ...existing,
          [field]: val,
          isDirty: true
        }
      };
    });
  };

  // Save single row from table
  const handleSaveGridRow = async (drug) => {
    const edit = gridEdits[drug.drugcode];
    const amountVal = edit?.amount !== undefined ? edit.amount : (summaryData.countsMap[drug.drugcode]?.amount ?? '');
    
    if (amountVal === '' || isNaN(Number(amountVal))) {
      showNotification(`กรุณากรอกจำนวนที่นับได้สำหรับ ${drug.drugname}`, true);
      return;
    }

    setSavingCodes(prev => ({ ...prev, [drug.drugcode]: true }));
    try {
      const payload = {
        drugcode: drug.drugcode,
        drugname: drug.drugname,
        amount: Number(amountVal),
        lotno: edit?.lotno !== undefined ? edit.lotno : (summaryData.countsMap[drug.drugcode]?.lotno || drug.lotno || ''),
        dateexpire: edit?.dateexpire !== undefined ? edit.dateexpire : (summaryData.countsMap[drug.drugcode]?.dateexpire || ''),
        costprice: edit?.costprice !== undefined ? Number(edit.costprice) : (summaryData.countsMap[drug.drugcode]?.costprice || Number(drug.costprice) || 0),
        countDate: new Date().toISOString().slice(0, 10),
        countedBy: user?.officername || user?.username || 'เจ้าหน้าที่คลังยา',
        remark: 'นับสต็อกเริ่มต้นรอบใหม่'
      };

      const res = await api.saveInitialStockCount(payload);
      if (!res.success) { showNotification(res.message || 'บันทึกไม่สำเร็จ', true); return; }
      if (res.success) {
        showNotification(`บันทึกยอดยกมา: ${drug.drugname} (${payload.amount} ${drug.drugunit}) เรียบร้อย`);
        // Update local state
        setSummaryData(prev => ({
          ...prev,
          countsMap: {
            ...prev.countsMap,
            [drug.drugcode]: res.data
          },
          totalCountedItems: Object.keys({ ...prev.countsMap, [drug.drugcode]: res.data }).length
        }));
        // Clear dirty flag
        setGridEdits(prev => {
          const next = { ...prev };
          if (next[drug.drugcode]) next[drug.drugcode].isDirty = false;
          return next;
        });
        if (onCountUpdated) onCountUpdated();
      } else {
        showNotification(res.message || 'บันทึกไม่สำเร็จ', true);
      }
    } catch (err) {
      showNotification('เกิดข้อผิดพลาด: ' + err.message, true);
    } finally {
      setSavingCodes(prev => ({ ...prev, [drug.drugcode]: false }));
    }
  };

  // Delete / Reset single item count
  const handleDeleteCount = async (drugcode, drugname) => {
    if (!confirm(`ต้องการลบยอดนับของ ${drugname} ใช่หรือไม่? (ยอดยกมาจะกลับเป็น 0)`)) return;

    try {
      const res = await api.deleteInitialStockCount(drugcode);
      if (res.success) {
        showNotification(`รีเซ็ตยอดยกมา ${drugname} เป็น 0 เรียบร้อย`);
        setSummaryData(prev => {
          const nextMap = { ...prev.countsMap };
          delete nextMap[drugcode];
          return {
            ...prev,
            countsMap: nextMap,
            totalCountedItems: Object.keys(nextMap).length
          };
        });
        setGridEdits(prev => {
          const next = { ...prev };
          delete next[drugcode];
          return next;
        });
        if (onCountUpdated) onCountUpdated();
      }
    } catch (err) {
      showNotification('เกิดข้อผิดพลาด: ' + err.message, true);
    }
  };

  // Save all modified rows in grid
  const handleSaveAllDirtyRows = async () => {
    const dirtyCodes = Object.keys(gridEdits).filter(code => gridEdits[code]?.isDirty);
    if (dirtyCodes.length === 0) {
      showNotification('ไม่มีรายการที่แก้ไขเพิ่มเติม', true);
      return;
    }

    const itemsToSave = [];
    dirtyCodes.forEach(code => {
      const drug = drugs.find(d => d.drugcode === code);
      if (!drug) return;
      const edit = gridEdits[code];
      if (edit.amount === '' || isNaN(Number(edit.amount))) return;

      itemsToSave.push({
        drugcode: code,
        drugname: drug.drugname,
        amount: Number(edit.amount),
        lotno: edit.lotno || '',
        dateexpire: edit.dateexpire || '',
        costprice: edit.costprice !== '' ? Number(edit.costprice) : Number(drug.costprice) || 0,
        countDate: new Date().toISOString().slice(0, 10),
        countedBy: user?.officername || user?.username || 'เจ้าหน้าที่คลังยา',
        remark: 'บันทึกพร้อมกันจากตาราง'
      });
    });

    if (itemsToSave.length === 0) {
      showNotification('ไม่มีข้อมูลที่ถูกต้องในการบันทึก', true);
      return;
    }

    try {
      const res = await api.saveBatchInitialStockCounts(itemsToSave); // ผู้บันทึกใช้ session ฝั่ง server
      if (!res.success) { showNotification(res.message || 'บันทึกไม่สำเร็จ', true); return; }
      if (res.success) {
        showNotification(`บันทึกยอดนับสำเร็จ ${res.data.savedCount} รายการ!`);
        await loadAllData();
        setGridEdits({});
        if (onCountUpdated) onCountUpdated();
      }
    } catch (err) {
      showNotification('เกิดข้อผิดพลาด: ' + err.message, true);
    }
  };

  // Single Item Selection & Multi-Lot Handlers
  const handleSelectDrugForSingle = (drug) => {
    setSelectedDrug(drug);
    const existing = summaryData.countsMap[drug.drugcode];

    if (existing?.lots && existing.lots.length > 0) {
      setSingleLots(existing.lots.map(l => ({
        lotno: l.lotno || '',
        dateexpire: l.dateexpire || '',
        amount: l.amount !== undefined ? l.amount : '',
        costprice: l.costprice !== undefined ? l.costprice : (Number(drug.costprice) || 0),
        remark: l.remark || ''
      })));
    } else if (existing && existing.amount !== undefined) {
      setSingleLots([
        {
          lotno: existing.lotno || drug.lotno || '',
          dateexpire: existing.dateexpire || (drug.dateexpire ? new Date(drug.dateexpire).toISOString().slice(0, 10) : ''),
          amount: existing.amount,
          costprice: existing.costprice !== undefined ? existing.costprice : (Number(drug.costprice) || 0),
          remark: existing.remark || ''
        }
      ]);
    } else {
      setSingleLots([
        {
          lotno: drug.lotno || '',
          dateexpire: drug.dateexpire ? new Date(drug.dateexpire).toISOString().slice(0, 10) : '',
          amount: '',
          costprice: Number(drug.costprice) || 0,
          remark: ''
        }
      ]);
    }

    setSingleMeta({
      countDate: existing?.countDate || new Date().toISOString().slice(0, 10),
      countedBy: existing?.countedBy || user?.officername || user?.username || 'เจ้าหน้าที่คลังยา',
      remark: existing?.remark || 'นับสต็อกเริ่มต้นรอบใหม่'
    });
  };

  const handleAddLotToSingle = () => {
    setSingleLots(prev => [
      ...prev,
      {
        lotno: '',
        dateexpire: '',
        amount: '',
        costprice: selectedDrug ? (Number(selectedDrug.costprice) || 0) : 0,
        remark: ''
      }
    ]);
  };

  const handleRemoveLotFromSingle = (index) => {
    if (singleLots.length <= 1) {
      setSingleLots([{
        lotno: '',
        dateexpire: '',
        amount: '',
        costprice: selectedDrug ? (Number(selectedDrug.costprice) || 0) : 0,
        remark: ''
      }]);
      return;
    }
    setSingleLots(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleLotChangeInSingle = (index, field, value) => {
    setSingleLots(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSaveSingleForm = async (e) => {
    e.preventDefault();
    if (!selectedDrug) return;

    const validLots = singleLots.filter(l => l.amount !== '' && !isNaN(Number(l.amount)));
    if (validLots.length === 0) {
      showNotification('กรุณากรอกจำนวนที่ตรวจนับได้ในอย่างน้อย 1 Lot', true);
      return;
    }

    const totalAmount = validLots.reduce((sum, l) => sum + Number(l.amount), 0);
    const expDates = validLots.map(l => l.dateexpire).filter(Boolean).sort();
    const nearestExp = expDates[0] || '';
    const mainLotNo = validLots[0]?.lotno || '';
    const avgCost = validLots[0]?.costprice !== undefined ? Number(validLots[0].costprice) : (Number(selectedDrug.costprice) || 0);

    try {
      const payload = {
        drugcode: selectedDrug.drugcode,
        drugname: selectedDrug.drugname,
        amount: totalAmount,
        lotno: mainLotNo,
        dateexpire: nearestExp,
        costprice: avgCost,
        lots: validLots.map(l => ({
          lotno: l.lotno || '',
          dateexpire: l.dateexpire || '',
          amount: Number(l.amount),
          costprice: l.costprice !== '' ? Number(l.costprice) : (Number(selectedDrug.costprice) || 0),
          remark: l.remark || ''
        })),
        countDate: singleMeta.countDate,
        countedBy: singleMeta.countedBy,
        remark: singleMeta.remark
      };

      const res = await api.saveInitialStockCount(payload);
      if (!res.success) { showNotification(res.message || 'บันทึกไม่สำเร็จ', true); return; }
      if (res.success) {
        showNotification(`บันทึกยอดยกมา: ${selectedDrug.drugname} (รวม ${payload.amount} ${selectedDrug.drugunit}, ${validLots.length} Lots) สำเร็จ!`);
        await loadAllData();
        setSelectedDrug(null);
        setSingleDrugSearch('');
        if (onCountUpdated) onCountUpdated();
      } else {
        showNotification(res.message || 'บันทึกไม่สำเร็จ', true);
      }
    } catch (err) {
      showNotification('เกิดข้อผิดพลาด: ' + err.message, true);
    }
  };

  // Multi-Lot Modal Handlers for Table Grid
  const handleOpenMultiLotModal = (drug) => {
    const existing = summaryData.countsMap[drug.drugcode];
    setMultiLotModalDrug(drug);

    if (existing?.lots && existing.lots.length > 0) {
      setMultiLotRows(existing.lots.map(l => ({
        lotno: l.lotno || '',
        dateexpire: l.dateexpire || '',
        amount: l.amount !== undefined ? l.amount : '',
        costprice: l.costprice !== undefined ? l.costprice : (Number(drug.costprice) || 0),
        remark: l.remark || ''
      })));
    } else if (existing && existing.amount !== undefined) {
      setMultiLotRows([
        {
          lotno: existing.lotno || drug.lotno || '',
          dateexpire: existing.dateexpire || (drug.dateexpire ? new Date(drug.dateexpire).toISOString().slice(0, 10) : ''),
          amount: existing.amount,
          costprice: existing.costprice !== undefined ? existing.costprice : (Number(drug.costprice) || 0),
          remark: existing.remark || ''
        },
        {
          lotno: '',
          dateexpire: '',
          amount: '',
          costprice: Number(drug.costprice) || 0,
          remark: ''
        }
      ]);
    } else {
      setMultiLotRows([
        {
          lotno: drug.lotno || '',
          dateexpire: drug.dateexpire ? new Date(drug.dateexpire).toISOString().slice(0, 10) : '',
          amount: '',
          costprice: Number(drug.costprice) || 0,
          remark: ''
        },
        {
          lotno: '',
          dateexpire: '',
          amount: '',
          costprice: Number(drug.costprice) || 0,
          remark: ''
        }
      ]);
    }
  };

  const handleAddRowToMultiLot = () => {
    setMultiLotRows(prev => [
      ...prev,
      {
        lotno: '',
        dateexpire: '',
        amount: '',
        costprice: multiLotModalDrug ? (Number(multiLotModalDrug.costprice) || 0) : 0,
        remark: ''
      }
    ]);
  };

  const handleRemoveRowFromMultiLot = (index) => {
    if (multiLotRows.length <= 1) {
      setMultiLotRows([{
        lotno: '',
        dateexpire: '',
        amount: '',
        costprice: multiLotModalDrug ? (Number(multiLotModalDrug.costprice) || 0) : 0,
        remark: ''
      }]);
      return;
    }
    setMultiLotRows(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleRowChangeInMultiLot = (index, field, value) => {
    setMultiLotRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSaveMultiLotModal = async (e) => {
    e.preventDefault();
    if (!multiLotModalDrug) return;

    const validLots = multiLotRows.filter(l => l.amount !== '' && !isNaN(Number(l.amount)));
    if (validLots.length === 0) {
      showNotification('กรุณากรอกจำนวนที่ตรวจนับได้ในอย่างน้อย 1 Lot', true);
      return;
    }

    const totalAmount = validLots.reduce((sum, l) => sum + Number(l.amount), 0);
    const expDates = validLots.map(l => l.dateexpire).filter(Boolean).sort();
    const nearestExp = expDates[0] || '';
    const mainLotNo = validLots[0]?.lotno || '';
    const avgCost = validLots[0]?.costprice !== undefined ? Number(validLots[0].costprice) : (Number(multiLotModalDrug.costprice) || 0);

    setSavingMultiLot(true);
    try {
      const payload = {
        drugcode: multiLotModalDrug.drugcode,
        drugname: multiLotModalDrug.drugname,
        amount: totalAmount,
        lotno: mainLotNo,
        dateexpire: nearestExp,
        costprice: avgCost,
        lots: validLots.map(l => ({
          lotno: l.lotno || '',
          dateexpire: l.dateexpire || '',
          amount: Number(l.amount),
          costprice: l.costprice !== '' ? Number(l.costprice) : (Number(multiLotModalDrug.costprice) || 0),
          remark: l.remark || ''
        })),
        countDate: new Date().toISOString().slice(0, 10),
        countedBy: user?.officername || user?.username || 'เจ้าหน้าที่คลังยา',
        remark: `ตรวจนับ ${validLots.length} Lots จากตารางคลังยา`
      };

      const res = await api.saveInitialStockCount(payload);
      if (!res.success) { showNotification(res.message || 'บันทึกไม่สำเร็จ', true); return; }
      if (res.success) {
        showNotification(`บันทึกยอดยกมา: ${multiLotModalDrug.drugname} (รวม ${totalAmount} ${multiLotModalDrug.drugunit}, ${validLots.length} Lots) เรียบร้อย`);
        setMultiLotModalDrug(null);
        await loadAllData();
        if (onCountUpdated) onCountUpdated();
      } else {
        showNotification(res.message || 'บันทึกไม่สำเร็จ', true);
      }
    } catch (err) {
      showNotification('เกิดข้อผิดพลาด: ' + err.message, true);
    } finally {
      setSavingMultiLot(false);
    }
  };

  // Upload Excel Handler
  const handleUploadExcel = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      showNotification('กรุณาเลือกไฟล์ Excel', true);
      return;
    }

    setUploading(true);
    try {
      const res = await api.uploadInitialStockExcel(uploadFile); // ผู้นำเข้าใช้ session ฝั่ง server
      if (!res.success) { showNotification(res.message || 'นำเข้าไม่สำเร็จ', true); return; }
      if (res.success) {
        showNotification(`นำเข้ายอดตรวจนับจาก Excel สำเร็จ ${res.data.count} รายการ!`);
        setShowUploadModal(false);
        setUploadFile(null);
        await loadAllData();
        if (onCountUpdated) onCountUpdated();
      } else {
        showNotification(res.message || 'นำเข้าไม่สำเร็จ', true);
      }
    } catch (err) {
      showNotification('เกิดข้อผิดพลาด: ' + err.message, true);
    } finally {
      setUploading(false);
    }
  };

  // Reset All to 0
  const handleResetAll = async () => {
    setResetting(true);
    try {
      const res = await api.resetAllInitialStockCounts();
      if (res.success) {
        showNotification('รีเซ็ตยอดยกมาทั้งหมดเป็น 0 เรียบร้อยแล้ว');
        setShowResetConfirm(false);
        await loadAllData();
        setGridEdits({});
        if (onCountUpdated) onCountUpdated();
      }
    } catch (err) {
      showNotification('เกิดข้อผิดพลาด: ' + err.message, true);
    } finally {
      setResetting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // =========================================================
  // EXCEL INITIAL STOCK MATCH & REVIEW HANDLERS
  // =========================================================

  const handleOpenMatchModalFromDefault = async () => {
    setLoadingMatchPreview(true);
    setShowMatchModal(true);
    try {
      const res = await api.getInitialStockExcelPreview();
      if (res.success && res.data) {
        setMatchPreviewData(res.data);
        setMatchItems(res.data.items || []);
      } else {
        showNotification(res.message || 'ไม่สามารถเปิดไฟล์ Excel ได้', true);
        setShowMatchModal(false);
      }
    } catch (err) {
      showNotification('เกิดข้อผิดพลาด: ' + err.message, true);
      setShowMatchModal(false);
    } finally {
      setLoadingMatchPreview(false);
    }
  };

  const handleUploadAndPreview = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      showNotification('กรุณาเลือกไฟล์ Excel', true);
      return;
    }
    setUploading(true);
    try {
      const res = await api.uploadInitialStockPreview(uploadFile);
      if (res.success && res.data) {
        setMatchPreviewData(res.data);
        setMatchItems(res.data.items || []);
        setShowUploadModal(false);
        setShowMatchModal(true);
      } else {
        showNotification(res.message || 'ไม่สามารถเปิดไฟล์ Excel ได้', true);
      }
    } catch (err) {
      showNotification('เกิดข้อผิดพลาด: ' + err.message, true);
    } finally {
      setUploading(false);
    }
  };

  const toggleItemSelection = (id) => {
    setMatchItems(prev => prev.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
  };

  const handleSelectAllFiltered = (selectAll = true) => {
    const visibleIds = new Set(filteredMatchItems.map(i => i.id));
    setMatchItems(prev => prev.map(item => visibleIds.has(item.id) ? { ...item, selected: selectAll } : item));
  };

  const handleSelectCandidate = (rowId, candidate) => {
    setMatchItems(prev => prev.map(item => {
      if (item.id !== rowId) return item;
      return {
        ...item,
        matchedDrug: {
          drugcode: candidate.drugcode,
          drugname: candidate.drugname,
          drugnamethai: candidate.drugnamethai,
          drugunit: candidate.drugunit,
          unitpacking: candidate.unitpacking,
          costprice: candidate.costprice
        },
        matchStatus: 'EXACT',
        selected: true
      };
    }));
  };

  const handleOpenDrugPicker = (rowId) => {
    setPickingRowId(rowId);
    setDrugPickerSearch('');
  };

  const handlePickDrug = (drug) => {
    if (!pickingRowId) return;
    setMatchItems(prev => prev.map(item => {
      if (item.id !== pickingRowId) return item;
      return {
        ...item,
        matchedDrug: {
          drugcode: drug.drugcode,
          drugname: drug.drugname,
          drugnamethai: drug.drugnamethai,
          drugunit: drug.drugunit,
          unitpacking: drug.unitpacking,
          costprice: Number(drug.costprice) || 0
        },
        matchStatus: 'EXACT',
        selected: true
      };
    }));
    setPickingRowId(null);
    setDrugPickerSearch('');
  };

  const handleToggleDualUnit = (itemId) => {
    setMatchItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      const isCurrentlyDual = it.repackInfo?.isDualUnit;
      return {
        ...it,
        repackInfo: isCurrentlyDual ? null : {
          isDualUnit: true,
          repackRatio: 50,
          mainStoreUnit: 'กระปุก',
          substockUnit: 'ตลับ',
          description: 'ยาครีมแบ่งบรรจุใส่ตลับ 10g (1 กระปุก = 50 ตลับ)'
        }
      };
    }));
  };

  const handleToggleFloorStock = (itemId) => {
    setMatchItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      const isCurrentlyFloor = it.floorStockInfo?.isFloorStock;
      return {
        ...it,
        floorStockInfo: isCurrentlyFloor ? null : {
          isFloorStock: true,
          usageType: 'procedure',
          department: 'ห้องทำแผล/อุบัติเหตุฉุกเฉิน',
          mainStoreUnit: 'ขวด',
          description: 'ยาหัตถการใช้ในห้องทำแผล/ฉุกเฉิน (ตัดสต็อกคลังในตามจำนวนขวดที่เบิก)'
        }
      };
    }));
  };

  const handleCommitMatches = async () => {
    const selectedItems = matchItems.filter(i => i.selected && i.matchedDrug);
    if (selectedItems.length === 0) {
      showNotification('กรุณาเลือกรายการยาที่ต้องการนำเข้าอย่างน้อย 1 รายการ', true);
      return;
    }

    const payloadItems = selectedItems.map(i => ({
      excelRowIndex: i.excelRowIndex,
      rawName: i.rawName,
      drugcode: i.matchedDrug.drugcode,
      drugname: i.matchedDrug.drugname,
      qty: i.qty,
      lotno: i.lotno,
      dateexpire: i.dateexpire,
      unitCostPrice: i.unitCostPrice,
      repackInfo: i.repackInfo,
      floorStockInfo: i.floorStockInfo,
      remark: `ยอดยกมา 1 ต.ค. 2569: ${i.rawName} ${i.rawStrength}`
    }));

    setCommittingMatches(true);
    try {
      const res = await api.commitInitialStockMatches({
        items: payloadItems,
        resetBeforeCommit,
        saveMappings,
        countDate: '2026-10-01'
      });

      if (res.success) {
        showNotification(`บันทึกยอดยกมาสำเร็จ ${res.data.count} รายการ! ${res.data.savedMappingsCount ? `(ผูกรหัสยา ${res.data.savedMappingsCount} รายการ)` : ''}`);
        setShowMatchModal(false);
        await loadAllData();
        if (onCountUpdated) onCountUpdated();
      } else {
        showNotification(res.message || 'บันทึกไม่สำเร็จ', true);
      }
    } catch (err) {
      showNotification('เกิดข้อผิดพลาดในการบันทึก: ' + err.message, true);
    } finally {
      setCommittingMatches(false);
    }
  };

  const filteredMatchItems = useMemo(() => {
    return matchItems.filter(item => {
      if (matchTab === 'nonzero' && item.qty <= 0) return false;
      if (matchTab === 'exact' && item.matchStatus !== 'EXACT') return false;
      if (matchTab === 'suggested' && item.matchStatus !== 'SUGGESTED') return false;
      if (matchTab === 'unmatched' && item.matchStatus !== 'UNMATCHED') return false;
      if (matchTab === 'dualunit' && !item.repackInfo?.isDualUnit) return false;
      if (matchTab === 'floorstock' && !item.floorStockInfo?.isFloorStock) return false;

      if (matchSearch) {
        const q = matchSearch.toLowerCase();
        const rName = (item.rawName || '').toLowerCase();
        const rStr = (item.rawStrength || '').toLowerCase();
        const mName = (item.matchedDrug?.drugname || '').toLowerCase();
        const mCode = (item.matchedDrug?.drugcode || '').toLowerCase();
        return rName.includes(q) || rStr.includes(q) || mName.includes(q) || mCode.includes(q);
      }
      return true;
    });
  }, [matchItems, matchTab, matchSearch]);

  const matchStats = useMemo(() => {
    const total = matchItems.length;
    const nonZero = matchItems.filter(i => i.qty > 0).length;
    const exact = matchItems.filter(i => i.matchStatus === 'EXACT').length;
    const suggested = matchItems.filter(i => i.matchStatus === 'SUGGESTED').length;
    const unmatched = matchItems.filter(i => i.matchStatus === 'UNMATCHED').length;
    const dualUnit = matchItems.filter(i => i.repackInfo?.isDualUnit).length;
    const floorStock = matchItems.filter(i => i.floorStockInfo?.isFloorStock).length;
    const selected = matchItems.filter(i => i.selected && i.matchedDrug).length;
    const selectedValue = matchItems
      .filter(i => i.selected && i.matchedDrug)
      .reduce((sum, i) => sum + (Number(i.qty) * Number(i.unitCostPrice || 0)), 0);

    return { total, nonZero, exact, suggested, unmatched, dualUnit, floorStock, selected, selectedValue };
  }, [matchItems]);

  const dirtyCount = Object.keys(gridEdits).filter(code => gridEdits[code]?.isDirty).length;

  return (
    <div className="space-y-3 sm:space-y-4 px-2 sm:px-4 md:px-5 lg:px-6 xl:px-8 py-3 sm:py-4 max-w-[1800px] mx-auto">
      
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center space-x-2 text-sm font-semibold animate-bounce">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}
      {errorToast && (
        <div className="fixed top-20 right-6 z-50 bg-rose-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center space-x-2 text-sm font-semibold animate-pulse">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorToast}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-md no-print">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-xl bg-white/10 text-emerald-300">
                <ClipboardCheck className="w-6 h-6" />
              </span>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                บันทึกตรวจนับยอดคงเหลือจริงในคลังยา (ยอดยกมารอบใหม่)
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-emerald-100/90 mt-1.5 max-w-3xl leading-relaxed">
              ตั้งต้นรอบสต็อกใหม่โดยการตรวจนับยาจริงบนชั้นวางหรือตู้ยา รพ.สต. เพื่อใช้เป็นยอดยกมาเริ่มต้น 
              <span className="font-semibold text-emerald-200"> (ยอดยกมาเดิมใน JHCIS ถูกรีเซ็ตเป็น 0 แล้วทั้งหมด ไม่มีการดึงยอดเดิมมาปะปน)</span>
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => api.downloadFile(api.getInitialStockTemplateUrl(), 'แบบฟอร์มตรวจนับสต็อกยกมา.xlsx').catch(err => showNotification(err.message, true))}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-bold transition-all"
              title="ดาวน์โหลดแบบฟอร์ม Excel ที่มีรายชื่อยาทั้งหมดใน รพ.สต. เพื่อนำไปกรอกหรือพิมพ์"
            >
              <Download className="w-4 h-4 text-emerald-300" />
              <span>โหลดแบบฟอร์ม Excel</span>
            </button>

            <button
              onClick={handleOpenMatchModalFromDefault}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-md transition-all active:scale-95"
              title="ตรวจสอบและจับคู่ยาคงเหลือ ณ 1 ต.ค. 2569 จากไฟล์ ใบเบิกยา รพสต69.xlsx ก่อนนำเข้า"
            >
              <Sparkles className="w-4 h-4 text-slate-950" />
              <span>ตรวจสอบ & Match ยา (ใบเบิกยา รพสต69)</span>
            </button>

            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs shadow-sm transition-all"
              title="นำเข้ายอดนับยาจำนวนมากจากไฟล์ Excel"
            >
              <Upload className="w-4 h-4" />
              <span>นำเข้า Excel ยอดนับ</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-xs font-bold transition-all"
              title="พิมพ์แบบฟอร์มตรวจนับสำหรับถือเดินตรวจนับที่ตู้ยา"
            >
              <Printer className="w-4 h-4 text-emerald-300" />
              <span className="hidden sm:inline">พิมพ์ใบตรวจนับ</span>
            </button>

            <button
              onClick={() => setShowResetConfirm(true)}
              className="inline-flex items-center space-x-1 px-2.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-200 rounded-xl text-xs font-semibold transition-all"
              title="รีเซ็ตยอดยกมาที่เคยนับไว้ทั้งหมดกลับเป็น 0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">รีเซ็ตเป็น 0</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 no-print">
        {/* Total Active Drugs */}
        <div className="group bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 hover:border-slate-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>ยาที่มีใช้ใน รพ.สต.</span>
            <Package className="w-4 h-4 text-slate-400 transition-transform duration-200 group-hover:scale-110" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1 font-mono tracking-tight">
            {summaryData.activeDrugsInPcu?.toLocaleString() || 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">cdrug.drugflag = 1</div>
        </div>

        {/* Counted Items */}
        <div 
          onClick={() => setCountFilter('counted')}
          className={`group cursor-pointer p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md active:translate-y-0 active:scale-[0.99] ${
            countFilter === 'counted' 
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20 shadow-xs' 
              : 'bg-white border-slate-200 hover:border-emerald-400 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700 text-xs font-bold">
            <span>ตรวจนับแล้ว</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 transition-transform duration-200 group-hover:scale-110" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-700 mt-1 font-mono tracking-tight">
            {summaryData.totalCountedItems?.toLocaleString() || 0}
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5 font-medium">
            {summaryData.activeDrugsInPcu > 0 
              ? `${Math.round((summaryData.totalCountedItems / summaryData.activeDrugsInPcu) * 100)}% ของยาทั้งหมด`
              : '0%'}
          </div>
        </div>

        {/* Uncounted Items */}
        <div 
          onClick={() => setCountFilter('uncounted')}
          className={`group cursor-pointer p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md active:translate-y-0 active:scale-[0.99] ${
            countFilter === 'uncounted' 
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20 shadow-xs' 
              : 'bg-white border-slate-200 hover:border-amber-400 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 text-xs font-bold">
            <span>ยังไม่ได้นับ (ยกมา 0)</span>
            <AlertCircle className="w-4 h-4 text-amber-600 transition-transform duration-200 group-hover:scale-110" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-700 mt-1 font-mono tracking-tight">
            {summaryData.totalUncountedItems?.toLocaleString() || 0}
          </div>
          <div className="text-[10px] text-amber-600 mt-0.5 font-medium">รอคีย์ยอดนับจริง</div>
        </div>

        {/* Total Units Counted */}
        <div className="group bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 hover:border-teal-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>จำนวนรวมที่นับได้</span>
            <Layers className="w-4 h-4 text-teal-600 transition-transform duration-200 group-hover:scale-110" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-teal-800 mt-1 font-mono tracking-tight">
            {summaryData.totalCountedUnits?.toLocaleString() || 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 font-medium">หน่วยนับ (เม็ด/แคปซูล/ขวด)</div>
        </div>

        {/* Total Value */}
        <div className="group bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 hover:border-emerald-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>มูลค่าสต็อกยกมารวม</span>
            <DollarSign className="w-4 h-4 text-emerald-600 transition-transform duration-200 group-hover:scale-110" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1 font-mono tracking-tight">
            ฿{summaryData.totalCountedValue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 font-medium">คำนวณตามราคาทุน</div>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 no-print">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveMode('grid')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeMode === 'grid'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>โหมดเดินตรวจนับตามตาราง (Fast Grid)</span>
          </button>

          <button
            onClick={() => setActiveMode('single')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeMode === 'single'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>โหมดค้นหาคีย์ทีละรายการ (Single Search)</span>
          </button>
        </div>

        {activeMode === 'grid' && dirtyCount > 0 && (
          <button
            onClick={handleSaveAllDirtyRows}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black shadow-sm transition-all animate-pulse"
          >
            <Save className="w-4 h-4" />
            <span>บันทึกที่แก้ไขทั้งหมด ({dirtyCount} รายการ)</span>
          </button>
        )}
      </div>

      {/* ========================================================= */}
      {/* MODE 1: GRID FAST ENTRY                                  */}
      {/* ========================================================= */}
      {activeMode === 'grid' && (
        <div className="space-y-3">
          {/* Filters Bar */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              {/* Search box */}
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อยา, รหัสยา JHCIS, TMT..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-emerald-500 font-medium"
                />
              </div>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 font-bold focus:outline-emerald-500 cursor-pointer"
              >
                <option value="01">ยาแผนปัจจุบัน (01)</option>
                <option value="10">ยาสมุนไพร (10)</option>
                <option value="01_10">ทั้งยาแผนปัจจุบัน + สมุนไพร</option>
                <option value="05">วัคซีน (05)</option>
                <option value="03">วัสดุการแพทย์ (03)</option>
                <option value="11">เวชภัณฑ์มิใช่ยา (11)</option>
                <option value="antibio">ยาปฏิชีวนะ (Anti-bio)</option>
                <option value="all">ทุกกลุ่มยา (ทั้งหมด)</option>
              </select>

              {/* Count Filter */}
              <select
                value={countFilter}
                onChange={(e) => setCountFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 font-bold focus:outline-emerald-500 cursor-pointer"
              >
                <option value="all">สถานะนับ: ทั้งหมด</option>
                <option value="counted">เฉพาะที่ตรวจนับแล้ว</option>
                <option value="uncounted">เฉพาะที่ยังไม่ได้นับ (0)</option>
              </select>

              {(search || categoryFilter !== '01' || countFilter !== 'all') && (
                <button
                  onClick={() => { setSearch(''); setCategoryFilter('01'); setCountFilter('all'); }}
                  className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>

            <div className="text-xs text-slate-500 font-medium">
              แสดง <strong>{filteredDrugs.length}</strong> รายการ
            </div>
          </div>

          {/* Top Pagination Bar */}
          {totalGridItems > 0 && (
            <PaginationBar
              currentPage={validGridPage}
              pageSize={pageSize}
              totalItems={totalGridItems}
              onPageChange={setCurrentPage}
              onPageSizeChange={(sz) => { setPageSize(sz); setCurrentPage(1); }}
              pageSizeOptions={[10, 20, 50, 100, 'all']}
              colorTheme="teal"
              position="top"
              className="mb-2"
            />
          )}

          {/* Table Container */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto table-scroll-visible">
              <table className="w-full text-left text-xs min-w-[950px]">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-xs backdrop-blur-xs">
                  <tr>
                    <th className="py-2.5 px-2.5 min-w-[100px] text-center bg-slate-100">รหัสยา</th>
                    <th className="py-2.5 px-3 min-w-[240px] bg-slate-100">ชื่อยา / รายการเวชภัณฑ์</th>
                    <th className="py-2.5 px-2 w-20 text-center bg-slate-100">หน่วยนับ</th>
                    <th className="py-2.5 px-2 w-28 text-right bg-emerald-50 text-emerald-900 border-x border-emerald-100">
                      จำนวนที่นับได้จริง *
                    </th>
                    <th className="py-2.5 px-2 w-28 text-center bg-slate-100">รุ่นผลิต (Lot)</th>
                    <th className="py-2.5 px-2 w-28 text-center bg-slate-100">วันหมดอายุ</th>
                    <th className="py-2.5 px-2 w-20 text-right bg-slate-100">ทุน/หน่วย</th>
                    <th className="py-2.5 px-2 w-28 text-center bg-slate-100">สถานะนับ</th>
                    <th className="py-2.5 px-2 w-28 text-center no-print bg-slate-100">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-400 font-medium">
                        กำลังโหลดข้อมูลคลังยา JHCIS...
                      </td>
                    </tr>
                  ) : filteredDrugs.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-400 font-medium">
                        ไม่พบรายการยาตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    pagedDrugs.map((drug) => {
                      const existingCount = summaryData.countsMap[drug.drugcode];
                      const isCounted = Boolean(existingCount);
                      const edit = gridEdits[drug.drugcode];
                      const isDirty = Boolean(edit?.isDirty);
                      const isSaving = Boolean(savingCodes[drug.drugcode]);

                      const displayAmount = edit?.amount !== undefined 
                        ? edit.amount 
                        : (existingCount?.amount !== undefined ? existingCount.amount : '');

                      const displayLot = edit?.lotno !== undefined 
                        ? edit.lotno 
                        : (existingCount?.lotno || drug.lotno || '');

                      const displayExp = edit?.dateexpire !== undefined 
                        ? edit.dateexpire 
                        : (existingCount?.dateexpire || (drug.dateexpire ? new Date(drug.dateexpire).toISOString().slice(0, 10) : ''));

                      const displayCost = edit?.costprice !== undefined 
                        ? edit.costprice 
                        : (existingCount?.costprice !== undefined ? existingCount.costprice : (Number(drug.costprice) || 0));

                      return (
                        <tr 
                          key={drug.drugcode}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isDirty ? 'bg-amber-50/40' : (isCounted ? 'bg-emerald-50/20' : '')
                          }`}
                        >
                          {/* รหัสยา */}
                          <td className="py-2 px-2 text-center font-mono font-bold text-slate-900 align-middle break-all max-w-[110px]">
                            {drug.drugcode}
                          </td>

                          {/* ชื่อยา */}
                          <td className="py-2 px-3 align-middle">
                            <div className="font-bold text-slate-900 leading-snug line-clamp-1" title={drug.drugname}>
                              {drug.drugname}
                            </div>
                            {drug.drugnamethai && (
                              <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1" title={drug.drugnamethai}>
                                {drug.drugnamethai}
                              </div>
                            )}
                            <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 mt-0.5">
                              {drug.unitpacking && <span>บรรจุ: {drug.unitpacking}</span>}
                              {drug.tmtcode && <span>• TMT: {drug.tmtcode}</span>}
                              {drug.location && <span>• พิกัด: {drug.location}</span>}
                            </div>
                          </td>

                          {/* หน่วยนับ */}
                          <td className="py-2 px-2 text-center text-slate-600 font-medium align-middle">
                            {drug.drugunit || 'หน่วย'}
                          </td>

                          {/* จำนวนที่นับได้จริง (Input) */}
                          <td className="py-1.5 px-2 bg-emerald-50/30 border-x border-emerald-100 align-middle">
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={displayAmount}
                              onChange={(e) => handleGridInputChange(drug.drugcode, 'amount', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveGridRow(drug);
                              }}
                              className={`w-full text-right px-2 py-1 font-mono font-black text-sm rounded border focus:outline-emerald-500 shadow-2xs ${
                                isDirty 
                                  ? 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-400/20' 
                                  : (isCounted 
                                      ? 'bg-white border-emerald-300 text-emerald-800 font-black' 
                                      : 'bg-white border-slate-300 text-slate-700')
                              }`}
                            />
                          </td>

                          {/* รุ่นผลิต (Lot) */}
                          <td className="py-1.5 px-1.5 align-middle">
                            {existingCount?.lots && existingCount.lots.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => handleOpenMultiLotModal(drug)}
                                className="w-full inline-flex items-center justify-center space-x-1 px-1.5 py-1 rounded bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-800 text-[10px] font-bold shadow-2xs transition-all"
                                title={`ยานี้มี ${existingCount.lots.length} Lots คลิกเพื่อดูหรือแก้ไข`}
                              >
                                <Tag className="w-3 h-3 text-teal-600 shrink-0" />
                                <span>{existingCount.lots.length} Lots</span>
                              </button>
                            ) : (
                              <div className="flex items-center space-x-0.5">
                                <input
                                  type="text"
                                  placeholder="Lot no."
                                  value={displayLot}
                                  onChange={(e) => handleGridInputChange(drug.drugcode, 'lotno', e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveGridRow(drug);
                                  }}
                                  className="w-full text-center px-1.5 py-1 font-mono text-[11px] rounded border border-slate-200 bg-white focus:outline-emerald-500 shadow-2xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleOpenMultiLotModal(drug)}
                                  className="p-1 rounded text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors shrink-0"
                                  title="เพิ่ม/ตรวจนับแบบหลาย Lot สำหรับยานี้"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </td>

                          {/* วันหมดอายุ */}
                          <td className="py-1.5 px-1.5 align-middle">
                            <input
                              type="text"
                              placeholder="YYYY-MM-DD"
                              value={displayExp}
                              onChange={(e) => handleGridInputChange(drug.drugcode, 'dateexpire', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveGridRow(drug);
                              }}
                              className="w-full text-center px-1.5 py-1 font-mono text-[11px] rounded border border-slate-200 bg-white focus:outline-emerald-500 shadow-2xs"
                            />
                          </td>

                          {/* ทุน/หน่วย */}
                          <td className="py-1.5 px-1.5 text-right font-mono align-middle">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={displayCost}
                              onChange={(e) => handleGridInputChange(drug.drugcode, 'costprice', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveGridRow(drug);
                              }}
                              className="w-full text-right px-1.5 py-1 font-mono text-[11px] rounded border border-slate-200 bg-white focus:outline-emerald-500 shadow-2xs"
                            />
                          </td>

                          {/* สถานะนับ */}
                          <td className="py-2 px-2 text-center align-middle">
                            {isCounted ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>นับแล้ว</span>
                                </span>
                                {existingCount.countedBy && (
                                  <span className="text-[9px] text-slate-400 mt-0.5 truncate max-w-[85px]" title={existingCount.countedBy}>
                                    {existingCount.countedBy}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                                ยังไม่นับ (0)
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-2 px-2 text-center align-middle no-print">
                            <div className="flex items-center justify-center space-x-1">
                              <button
                                onClick={() => handleSaveGridRow(drug)}
                                disabled={isSaving}
                                className={`inline-flex items-center space-x-1 px-2 py-1 rounded text-xs font-bold transition-all shadow-2xs ${
                                  isDirty
                                    ? 'bg-amber-600 hover:bg-amber-700 text-white animate-pulse'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                }`}
                                title="บันทึกยอดยกมารายการนี้"
                              >
                                <Save className="w-3 h-3" />
                                <span>{isSaving ? '...' : 'บันทึก'}</span>
                              </button>

                              {isCounted && (
                                <button
                                  onClick={() => handleDeleteCount(drug.drugcode, drug.drugname)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                  title="ลบยอดนับ (รีเซ็ตกลับเป็น 0)"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Pagination Bar */}
          {totalGridItems > 0 && (
            <PaginationBar
              currentPage={validGridPage}
              pageSize={pageSize}
              totalItems={totalGridItems}
              onPageChange={setCurrentPage}
              onPageSizeChange={(sz) => { setPageSize(sz); setCurrentPage(1); }}
              pageSizeOptions={[10, 20, 50, 100, 'all']}
              colorTheme="teal"
              position="bottom"
              className="mt-2"
            />
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODE 2: SINGLE ITEM QUICK SEARCH & ENTRY                 */}
      {/* ========================================================= */}
      {activeMode === 'single' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Drug Search & Picker */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                <Search className="w-4 h-4 text-emerald-600" />
                <span>1. ค้นหาและเลือกยาที่ต้องการนับ</span>
              </h2>

              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="พิมพ์ชื่อยา, รหัสยา, รหัส TMT..."
                  value={singleDrugSearch}
                  onChange={(e) => setSingleDrugSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-emerald-500 font-medium"
                />
              </div>

              {/* Picker List */}
              <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {drugs
                  .filter(d => {
                    if (!singleDrugSearch) return d.drugflag === '1';
                    const s = singleDrugSearch.toLowerCase().trim();
                    return d.drugcode.toLowerCase().includes(s) ||
                      (d.drugname || '').toLowerCase().includes(s) ||
                      (d.drugnamethai || '').toLowerCase().includes(s) ||
                      (d.tmtcode || '').toLowerCase().includes(s);
                  })
                  .slice(0, 50)
                  .map((drug) => {
                    const isSelected = selectedDrug?.drugcode === drug.drugcode;
                    const existing = summaryData.countsMap[drug.drugcode];

                    return (
                      <div
                        key={drug.drugcode}
                        onClick={() => handleSelectDrugForSingle(drug)}
                        className={`p-2.5 cursor-pointer text-xs transition-colors flex items-center justify-between ${
                          isSelected 
                            ? 'bg-emerald-50 border-l-4 border-emerald-600' 
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex-1 pr-2">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-mono font-bold text-slate-900">{drug.drugcode}</span>
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1 py-0.2 rounded">{drug.drugunit}</span>
                          </div>
                          <div className="font-semibold text-slate-800 mt-0.5 line-clamp-1">{drug.drugname}</div>
                          {drug.drugnamethai && (
                            <div className="text-[11px] text-slate-500 line-clamp-1">{drug.drugnamethai}</div>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          {existing ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              นับแล้ว: {existing.amount}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">ยังไม่นับ (0)</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Right Column: Key-in Form */}
          <div className="lg:col-span-7">
            {selectedDrug ? (
              <form onSubmit={handleSaveSingleForm} className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div className="border-b border-slate-100 pb-3 flex justify-between items-start">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        รหัสยา: {selectedDrug.drugcode}
                      </span>
                      <span className="text-xs text-slate-500">หน่วยนับ: <strong>{selectedDrug.drugunit || 'หน่วย'}</strong></span>
                      {selectedDrug.unitpacking && (
                        <span className="text-xs text-slate-400">• บรรจุ: {selectedDrug.unitpacking}</span>
                      )}
                    </div>
                    <h3 className="text-base font-black text-slate-900 mt-1">{selectedDrug.drugname}</h3>
                    {selectedDrug.drugnamethai && (
                      <p className="text-xs text-slate-600 mt-0.5">{selectedDrug.drugnamethai}</p>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">ราคาทุนอ้างอิง</span>
                    <span className="text-sm font-bold font-mono text-slate-700">
                      ฿{(Number(selectedDrug.costprice) || 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Multi-Lot Dynamic Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Tag className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-800">
                        รายการรุ่นการผลิต (Lot) ที่ตรวจนับได้บนชั้นวาง
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      * ถ้ายามีหลายรุ่นผลิตบนชั้นวาง ให้กดปุ่ม "+ เพิ่ม Lot" ด้านล่าง
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-2.5 w-10 text-center">#</th>
                          <th className="py-2 px-2.5 min-w-[130px]">เลขที่ Lot / รุ่นผลิต</th>
                          <th className="py-2 px-2.5 w-32">วันหมดอายุ (YYYY-MM-DD)</th>
                          <th className="py-2 px-2.5 w-32 text-right bg-emerald-50 text-emerald-900">
                            จำนวนที่นับได้จริง *
                          </th>
                          <th className="py-2 px-2.5 w-24 text-right">ทุน/หน่วย (บาท)</th>
                          <th className="py-2 px-2 w-12 text-center">ลบ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {singleLots.map((lot, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2 px-2 text-center font-mono font-bold text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                placeholder="เช่น LOT6901"
                                value={lot.lotno}
                                onChange={(e) => handleLotChangeInSingle(idx, 'lotno', e.target.value)}
                                className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono focus:outline-emerald-500"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                placeholder="YYYY-MM-DD"
                                value={lot.dateexpire}
                                onChange={(e) => handleLotChangeInSingle(idx, 'dateexpire', e.target.value)}
                                className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono focus:outline-emerald-500"
                              />
                            </td>
                            <td className="py-1.5 px-2 bg-emerald-50/30">
                              <input
                                type="number"
                                min="0"
                                required
                                placeholder="0"
                                value={lot.amount}
                                onChange={(e) => handleLotChangeInSingle(idx, 'amount', e.target.value)}
                                className="w-full text-right px-2 py-1 font-mono font-bold text-sm text-emerald-900 border border-emerald-300 rounded focus:outline-emerald-500 shadow-2xs"
                              />
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={lot.costprice}
                                onChange={(e) => handleLotChangeInSingle(idx, 'costprice', e.target.value)}
                                className="w-full text-right px-2 py-1 border border-slate-200 rounded text-xs font-mono focus:outline-emerald-500"
                              />
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveLotFromSingle(idx)}
                                className="p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="ลบ Lot นี้"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddLotToSingle}
                    className="w-full py-2 border-2 border-dashed border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5"
                  >
                    <Plus className="w-4 h-4 text-emerald-600" />
                    <span>+ เพิ่ม Lot (รุ่นการผลิต) อีกรายการ สำหรับยานี้</span>
                  </button>

                  {/* Summary Bar */}
                  <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-xs text-emerald-800 font-bold block">
                        จำนวนตรวจนับรวมทุก Lot ({selectedDrug.drugunit}):
                      </span>
                      <div className="text-2xl font-black font-mono text-emerald-950 mt-0.5">
                        {singleLots.reduce((sum, l) => sum + (Number(l.amount) || 0), 0).toLocaleString()} <span className="text-xs font-normal text-slate-600">{selectedDrug.drugunit}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-slate-600 font-medium block">มูลค่าสต็อกยกมารวม:</span>
                      <div className="text-base font-bold font-mono text-slate-800 mt-0.5">
                        ฿{singleLots.reduce((sum, l) => sum + ((Number(l.amount) || 0) * (Number(l.costprice) || 0)), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <span className="text-[10px] text-emerald-700">
                        ({singleLots.filter(l => Number(l.amount) > 0 || l.lotno).length} รุ่นการผลิต)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Meta details */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">วันที่ตรวจนับ</label>
                    <input
                      type="date"
                      value={singleMeta.countDate}
                      onChange={(e) => setSingleMeta({ ...singleMeta, countDate: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:outline-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">ผู้ตรวจนับ / เจ้าหน้าที่</label>
                    <input
                      type="text"
                      value={singleMeta.countedBy}
                      onChange={(e) => setSingleMeta({ ...singleMeta, countedBy: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">หมายเหตุ</label>
                    <input
                      type="text"
                      placeholder="เช่น นับรอบเริ่มต้นคลังยาใหม่"
                      value={singleMeta.remark}
                      onChange={(e) => setSingleMeta({ ...singleMeta, remark: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSelectedDrug(null)}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center space-x-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>บันทึกยอดยกมา (ทุก Lot)</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-white p-12 rounded-xl border border-dashed border-slate-300 text-center text-slate-400">
                <Search className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <div className="text-sm font-bold text-slate-600">กรุณาเลือกรายการยาจากฝั่งซ้าย</div>
                <div className="text-xs text-slate-400 mt-1">เพื่อทำการกรอกจำนวนที่ตรวจนับได้จริงในคลังยา</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* EXCEL UPLOAD MODAL                                        */}
      {/* ========================================================= */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2 text-emerald-800">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-base">นำเข้ายอดตรวจนับจากไฟล์ Excel</h3>
              </div>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Option: Match from System File */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>พบไฟล์ยอดคงเหลือ "ใบเบิกยา รพสต69.xlsx"</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowUploadModal(false); handleOpenMatchModalFromDefault(); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs shadow-xs transition-all text-center"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>เปิดตรวจสอบ &amp; Match ทันที</span>
                </button>
              </div>
              <p className="text-[11px] text-amber-800">
                ตรวจสอบการจับคู่ยาและยอดคงเหลือจริง 138 รายการ ณ 1 ต.ค. 2569 ก่อนกดยืนยันบันทึกเข้าระบบ
              </p>
            </div>

            <div className="text-xs text-slate-600 space-y-2">
              <p>
                หรือเลือกไฟล์ Excel ยอดตรวจนับอื่นจากคอมพิวเตอร์ของคุณ:
              </p>
            </div>

            <form onSubmit={handleUploadExcel} className="space-y-4">
              <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-6 text-center transition-colors">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => setUploadFile(e.target.files[0] || null)}
                  className="hidden"
                  id="excelCountUploadInput"
                />
                <label htmlFor="excelCountUploadInput" className="cursor-pointer block">
                  <Upload className="w-8 h-8 mx-auto text-emerald-600 mb-2" />
                  <span className="text-xs font-bold text-slate-700 block">
                    {uploadFile ? uploadFile.name : 'คลิกเพื่อเลือกไฟล์ Excel (.xlsx, .xls)'}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-1">ขนาดไฟล์ไม่เกิน 10MB</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleUploadAndPreview}
                  disabled={!uploadFile || uploading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-200 text-slate-950 rounded-lg text-xs font-black shadow-xs transition-all"
                  title="เปิดหน้าจอตรวจสอบและจับคู่ยาก่อนบันทึก"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{uploading ? 'กำลังอ่านไฟล์...' : 'ตรวจสอบและ Match ก่อน'}</span>
                </button>
                <button
                  type="submit"
                  disabled={!uploadFile || uploading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                  title="นำเข้าทันทีโดยไม่ผ่านหน้าจอจับคู่ (สำหรับ Template มาตรฐาน)"
                >
                  นำเข้าทันที
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MATCH & REVIEW EXCEL INITIAL STOCK MODAL                  */}
      {/* ========================================================= */}
      {showMatchModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl max-w-7xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-emerald-800 via-teal-800 to-emerald-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center space-x-3">
                <span className="p-2.5 rounded-xl bg-white/10 text-amber-300">
                  <Sparkles className="w-6 h-6" />
                </span>
                <div>
                  <h3 className="text-base sm:text-lg font-black tracking-tight">
                    ตรวจสอบและจับคู่ยาคงเหลือ ณ 1 ต.ค. 2569 (เริ่มต้นปีงบประมาณ 2570)
                  </h3>
                  <p className="text-xs text-emerald-200/90 mt-0.5">
                    ไฟล์: <span className="font-bold text-white underline">{matchPreviewData?.fileName || 'ใบเบิกยา รพสต69.xlsx'}</span> 
                    {matchPreviewData?.sheetName && ` | แผ่นงาน: ${matchPreviewData.sheetName}`} 
                    {' '}(ทั้งหมด {matchStats.total} แถว | มียอดคงเหลือจริง {matchStats.nonZero} รายการ)
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={handleOpenMatchModalFromDefault}
                  disabled={loadingMatchPreview}
                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-emerald-100 rounded-lg text-xs font-semibold transition-all"
                  title="โหลดข้อมูลจากไฟล์ใหม่อีกครั้ง"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingMatchPreview ? 'animate-spin' : ''}`} />
                  <span>รีเฟรช</span>
                </button>
                <button
                  onClick={() => setShowMatchModal(false)}
                  className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Filter & Stats Toolbar */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMatchTab('nonzero')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    matchTab === 'nonzero' 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  มียอดคงเหลือ &gt; 0 ({matchStats.nonZero})
                </button>
                <button
                  type="button"
                  onClick={() => setMatchTab('all')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    matchTab === 'all' 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  ทั้งหมด ({matchStats.total})
                </button>
                <button
                  type="button"
                  onClick={() => setMatchTab('exact')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    matchTab === 'exact' 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  <CheckCircle2 className={`w-3.5 h-3.5 ${matchTab === 'exact' ? 'text-white' : 'text-emerald-600'}`} />
                  <span>ตรงเป๊ะ ({matchStats.exact})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMatchTab('suggested')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    matchTab === 'suggested' 
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' 
                      : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  <AlertTriangle className={`w-3.5 h-3.5 ${matchTab === 'suggested' ? 'text-slate-950' : 'text-amber-500'}`} />
                  <span>แนะนำ/ตรวจ ({matchStats.suggested})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMatchTab('unmatched')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    matchTab === 'unmatched' 
                      ? 'bg-rose-600 text-white shadow-xs' 
                      : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  <XCircle className={`w-3.5 h-3.5 ${matchTab === 'unmatched' ? 'text-white' : 'text-rose-600'}`} />
                  <span>ยังไม่พบ ({matchStats.unmatched})</span>
                </button>
                {matchStats.dualUnit > 0 && (
                  <button
                    type="button"
                    onClick={() => setMatchTab('dualunit')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                      matchTab === 'dualunit' 
                        ? 'bg-purple-600 text-white shadow-xs' 
                        : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                    }`}
                  >
                    <Layers className={`w-3.5 h-3.5 ${matchTab === 'dualunit' ? 'text-white' : 'text-purple-600'}`} />
                    <span>ยาครีม 500g ({matchStats.dualUnit})</span>
                  </button>
                )}
                {matchStats.floorStock > 0 && (
                  <button
                    type="button"
                    onClick={() => setMatchTab('floorstock')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                      matchTab === 'floorstock' 
                        ? 'bg-sky-600 text-white shadow-xs' 
                        : 'bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200'
                    }`}
                  >
                    <Syringe className={`w-3.5 h-3.5 ${matchTab === 'floorstock' ? 'text-white' : 'text-sky-600'}`} />
                    <span>ยาห้องทำแผล ({matchStats.floorStock})</span>
                  </button>
                )}
              </div>

              {/* Search & Bulk Select Controls */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อยาใน Excel หรือ JHCIS..."
                    value={matchSearch}
                    onChange={(e) => setMatchSearch(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                  {matchSearch && (
                    <button onClick={() => setMatchSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✕</button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectAllFiltered(true)}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 whitespace-nowrap"
                  title="เลือกทุกรายการที่แสดงในตารางขณะนี้"
                >
                  เลือกทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectAllFiltered(false)}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-500 whitespace-nowrap"
                  title="ยกเลิกการเลือกในมุมมองนี้"
                >
                  ไม่เลือก
                </button>
              </div>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-auto p-4">
              {loadingMatchPreview ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3 text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
                  <p className="text-sm font-semibold">กำลังอ่านไฟล์ Excel และวิเคราะห์จับคู่ยาในทะเบียน JHCIS...</p>
                </div>
              ) : filteredMatchItems.length === 0 ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <Package className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-sm font-bold text-slate-600">ไม่พบรายการยาที่ตรงกับเงื่อนไขการกรอง</p>
                  <button onClick={() => { setMatchTab('all'); setMatchSearch(''); }} className="text-xs text-emerald-600 underline">ดูยาทั้งหมด</button>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">เลือก</th>
                        <th className="py-2.5 px-3 w-12 text-center">ลำดับ</th>
                        <th className="py-2.5 px-3">รายการยาในไฟล์ Excel (1 ต.ค. 69)</th>
                        <th className="py-2.5 px-3 text-right w-28">ยอดคงเหลือ</th>
                        <th className="py-2.5 px-3 w-32">Lot &amp; หมดอายุ</th>
                        <th className="py-2.5 px-3 w-80">ยาที่จับคู่ใน JHCIS (cdrug)</th>
                        <th className="py-2.5 px-3 w-28 text-center">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredMatchItems.map((item) => {
                        const isMatchExact = item.matchStatus === 'EXACT';
                        const isSuggested = item.matchStatus === 'SUGGESTED';
                        const isUnmatched = item.matchStatus === 'UNMATCHED';
                        const hasDualUnit = item.repackInfo?.isDualUnit;
                        const hasFloorStock = item.floorStockInfo?.isFloorStock;

                        return (
                          <tr 
                            key={item.id} 
                            className={`hover:bg-slate-50/80 transition-colors ${
                              !item.selected ? 'opacity-60 bg-slate-50/40' : (hasDualUnit ? 'bg-purple-50/30' : (hasFloorStock ? 'bg-sky-50/30' : ''))
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => toggleItemSelection(item.id)}
                                disabled={!item.matchedDrug}
                                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                              />
                            </td>

                            {/* Row Index */}
                            <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                              #{item.excelRowIndex}
                            </td>

                            {/* Excel Drug Information */}
                            <td className="py-2.5 px-3">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-800 text-[13px]">{item.rawName}</span>
                                {item.rawStrength && (
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold text-[11px]">
                                    {item.rawStrength}
                                  </span>
                                )}
                                {item.rawType && (
                                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px]">
                                    {item.rawType}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                                <span>{item.rawCategory || 'ยา'}</span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleDualUnit(item.id)}
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                    hasDualUnit 
                                      ? 'bg-purple-100 hover:bg-purple-200 text-purple-800 border-purple-300 shadow-2xs' 
                                      : 'bg-slate-50 hover:bg-purple-50 text-slate-400 hover:text-purple-700 border-slate-200'
                                  }`}
                                  title="คลิกเพื่อเปิด/ปิดระบบแบ่งบรรจุ (เช่น ยาครีม 500g -> 50 ตลับ 10g)"
                                >
                                  <Layers className="w-3 h-3 text-purple-600" />
                                  <span>{hasDualUnit ? 'ยาแบ่งบรรจุ (50 ตลับ)' : '+ ยาแบ่งบรรจุ'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleFloorStock(item.id)}
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                    hasFloorStock 
                                      ? 'bg-sky-100 hover:bg-sky-200 text-sky-800 border-sky-300 shadow-2xs' 
                                      : 'bg-slate-50 hover:bg-sky-50 text-slate-400 hover:text-sky-700 border-slate-200'
                                  }`}
                                  title="คลิกเพื่อเปิด/ปิดระบบยาหัตถการห้องทำแผล (Floor Stock เช่น Lidocaine)"
                                >
                                  <Syringe className="w-3 h-3 text-sky-600" />
                                  <span>{hasFloorStock ? 'ยาหัตถการห้องทำแผล' : '+ ยาหัตถการ'}</span>
                                </button>
                              </div>
                            </td>

                            {/* Quantity */}
                            <td className="py-2.5 px-3 text-right">
                              <div className="font-black text-slate-900 text-sm">
                                {Number(item.qty).toLocaleString()} {hasDualUnit ? 'กระปุก' : (hasFloorStock ? 'ขวด' : '')}
                              </div>
                              {hasDualUnit ? (
                                <div className="text-[10px] text-purple-700 font-semibold mt-0.5">
                                  (= {(item.qty * 50).toLocaleString()} ตลับที่เคาน์เตอร์)
                                </div>
                              ) : hasFloorStock ? (
                                <div className="text-[10px] text-sky-700 font-semibold mt-0.5">
                                  (เบิกตัดขวดคลังใน / ฉีด 3-5 ml/เคส)
                                </div>
                              ) : item.box > 0 && item.perBox > 0 ? (
                                <div className="text-[10px] text-slate-400">
                                  {item.box} กล่อง x {item.perBox}
                                </div>
                              ) : null}
                            </td>

                            {/* Lot & Exp */}
                            <td className="py-2.5 px-3">
                              <div className="font-mono text-slate-700 text-[11px] font-bold">
                                Lot: {item.lotno || '-'}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center space-x-1 mt-0.5">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>Exp: {item.dateexpire || 'ไม่ระบุ'}</span>
                              </div>
                            </td>

                            {/* Matched JHCIS Drug */}
                            <td className="py-2.5 px-3">
                              {item.matchedDrug ? (
                                <div className="space-y-1">
                                  <div className="flex items-start justify-between gap-1">
                                    <div>
                                      <div className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                                        <span className="text-emerald-700">{item.matchedDrug.drugname}</span>
                                        <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-mono text-[10px] font-bold">
                                          [{item.matchedDrug.drugcode}]
                                        </span>
                                      </div>
                                      {item.matchedDrug.drugnamethai && (
                                        <div className="text-[11px] text-slate-500">
                                          {item.matchedDrug.drugnamethai}
                                        </div>
                                      )}
                                      <div className="text-[10px] text-slate-400">
                                        หน่วยนับ: {item.matchedDrug.drugunit} {item.matchedDrug.unitpacking ? `(${item.matchedDrug.unitpacking})` : ''}
                                      </div>
                                    </div>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold shrink-0 border ${
                                      isMatchExact 
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                                        : 'bg-amber-50 text-amber-900 border-amber-300'
                                    }`}>
                                      {isMatchExact ? (
                                        <>
                                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                          <span>ตรงเป๊ะ</span>
                                        </>
                                      ) : (
                                        <>
                                          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                          <span>แนะนำ</span>
                                        </>
                                      )}
                                    </span>
                                  </div>

                                  {/* Candidate Suggestions Pills (if any alternative candidates exist) */}
                                  {item.candidates && item.candidates.length > 1 && (
                                    <div className="pt-1 flex flex-wrap items-center gap-1">
                                      <span className="text-[10px] text-slate-400">สลับเป็น:</span>
                                      {item.candidates
                                        .filter(c => c.drugcode !== item.matchedDrug.drugcode)
                                        .slice(0, 2)
                                        .map(cand => (
                                          <button
                                            key={cand.drugcode}
                                            type="button"
                                            onClick={() => handleSelectCandidate(item.id, cand)}
                                            className="px-1.5 py-0.5 bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 rounded text-[10px] transition-colors border border-slate-200"
                                            title={`เปลี่ยนเป็น: ${cand.drugname} (${cand.drugcode})`}
                                          >
                                            {cand.drugname.slice(0, 22)}... [{cand.drugcode}]
                                          </button>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="flex items-center space-x-1.5 text-rose-600 font-bold text-xs">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    <span>ยังไม่พบยาที่ตรงกันใน JHCIS</span>
                                  </div>
                                  <p className="text-[10px] text-slate-400">
                                    กดปุ่ม "เลือกยาใน JHCIS" ด้านขวา เพื่อเลือกยาที่ต้องการจับคู่
                                  </p>
                                </div>
                              )}
                            </td>

                            {/* Action Button */}
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleOpenDrugPicker(item.id)}
                                className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 hover:border-emerald-500 rounded-lg text-xs font-bold transition-all shadow-2xs whitespace-nowrap cursor-pointer"
                              >
                                {item.matchedDrug ? 'เปลี่ยนยา' : '+ เลือกยา'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Sticky Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
              {/* Options Checkboxes */}
              <div className="space-y-1.5 text-xs">
                <label className="flex items-center space-x-2 text-slate-700 cursor-pointer select-none font-medium">
                  <input
                    type="checkbox"
                    checked={resetBeforeCommit}
                    onChange={(e) => setResetBeforeCommit(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    ล้างยอดยกมาเดิมที่เคยร่างไว้ก่อนหน้าทั้งหมดก่อนบันทึกใหม่ 
                    <span className="text-slate-400 font-normal"> (แนะนำ เพื่อเริ่มต้นยอด ณ 1 ต.ค. 2569 อย่างถูกต้อง)</span>
                  </span>
                </label>
                <label className="flex items-center space-x-2 text-slate-700 cursor-pointer select-none font-medium">
                  <input
                    type="checkbox"
                    checked={saveMappings}
                    onChange={(e) => setSaveMappings(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    บันทึกการจับคู่นี้เข้าตารางผูกรหัสยา (Drug Mapping) 
                    <span className="text-slate-400 font-normal"> (ระบบจะจดจำชื่อยา รพ.สต. เพื่อใช้จับคู่อัตโนมัติในการรับยาครั้งถัดไป)</span>
                  </span>
                </label>
              </div>

              {/* Execution Summary & Confirm Button */}
              <div className="flex items-center space-x-3 self-end md:self-auto">
                <div className="text-right">
                  <div className="text-xs text-slate-500">เลือกนำเข้า</div>
                  <div className="text-sm font-black text-slate-900">
                    {matchStats.selected} รายการ
                    {matchStats.selectedValue > 0 && (
                      <span className="text-xs font-normal text-slate-500 ml-1.5">
                        (มูลค่า {matchStats.selectedValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.)
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMatchModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-600 cursor-pointer"
                >
                  ปิด
                </button>

                <button
                  type="button"
                  onClick={handleCommitMatches}
                  disabled={committingMatches || matchStats.selected === 0}
                  className="inline-flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {committingMatches ? 'กำลังบันทึกยอดยกมา...' : `ยืนยันนำเข้ายอดยกมา (${matchStats.selected} รายการ)`}
                  </span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DRUG PICKER SUBMODAL (FOR MANUAL MATCHING)               */}
      {/* ========================================================= */}
      {pickingRowId && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm">เลือกยาจากทะเบียน JHCIS (cdrug)</h4>
                <p className="text-[11px] text-slate-300">
                  สำหรับรายการ: <span className="font-bold text-amber-300">{matchItems.find(i => i.id === pickingRowId)?.rawName} {matchItems.find(i => i.id === pickingRowId)?.rawStrength}</span>
                </p>
              </div>
              <button onClick={() => { setPickingRowId(null); setDrugPickerSearch(''); }} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border-b border-slate-200">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="พิมพ์รหัสยา หรือชื่อยา JHCIS..."
                  value={drugPickerSearch}
                  onChange={(e) => setDrugPickerSearch(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto divide-y divide-slate-100 p-2 max-h-[50vh]">
              {drugs
                .filter(d => {
                  if (!drugPickerSearch) return true;
                  const q = drugPickerSearch.toLowerCase();
                  return (
                    (d.drugcode || '').toLowerCase().includes(q) ||
                    (d.drugname || '').toLowerCase().includes(q) ||
                    (d.drugnamethai || '').toLowerCase().includes(q) ||
                    (d.druggenericname || '').toLowerCase().includes(q)
                  );
                })
                .slice(0, 50)
                .map(d => (
                  <button
                    key={d.drugcode}
                    type="button"
                    onClick={() => handlePickDrug(d)}
                    className="w-full text-left p-2.5 hover:bg-emerald-50 rounded-xl transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-800 group-hover:text-emerald-700">
                        {d.drugname}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {d.drugnamethai || d.druggenericname || '-'} | หน่วย: {d.drugunit || 'หน่วย'}
                      </div>
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-400 group-hover:text-emerald-600 bg-slate-100 group-hover:bg-emerald-100 px-2 py-1 rounded-lg">
                      {d.drugcode}
                    </span>
                  </button>
                ))}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
              <button
                type="button"
                onClick={() => { setPickingRowId(null); setDrugPickerSearch(''); }}
                className="px-4 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ========================================================= */}
      {/* MULTI-LOT MODAL FOR TABLE GRID                            */}
      {/* ========================================================= */}
      {multiLotModalDrug && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2 text-emerald-800">
                <Tag className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-base">
                  ตรวจนับแยกตามรุ่นผลิต (Multi-Lot): {multiLotModalDrug.drugcode}
                </h3>
              </div>
              <button onClick={() => setMultiLotModalDrug(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="font-bold text-slate-900 text-sm">{multiLotModalDrug.drugname}</div>
              {multiLotModalDrug.drugnamethai && (
                <div className="text-xs text-slate-500 mt-0.5">{multiLotModalDrug.drugnamethai}</div>
              )}
              <div className="text-xs text-slate-600 mt-1 flex items-center space-x-2">
                <span>หน่วยนับ: <strong className="text-slate-800">{multiLotModalDrug.drugunit}</strong></span>
                <span>•</span>
                <span>ราคาทุนอ้างอิง: <strong className="text-slate-800">฿{(Number(multiLotModalDrug.costprice) || 0).toFixed(2)}</strong></span>
              </div>
            </div>

            {/* Lots Form Table */}
            <form onSubmit={handleSaveMultiLotModal} className="space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-slate-600 px-1">
                  <span className="col-span-1 text-center">#</span>
                  <span className="col-span-3">เลข Lot</span>
                  <span className="col-span-3">วันหมดอายุ</span>
                  <span className="col-span-3 text-right">จำนวนที่นับได้ *</span>
                  <span className="col-span-2 text-center">จัดการ</span>
                </div>

                <div className="space-y-2 max-h-[280px] overflow-y-auto p-1">
                  {multiLotRows.map((lot, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                      <span className="col-span-1 text-center font-mono font-bold text-xs text-slate-500">
                        {idx + 1}
                      </span>
                      <div className="col-span-3">
                        <input
                          type="text"
                          placeholder="เลข Lot"
                          value={lot.lotno}
                          onChange={(e) => handleRowChangeInMultiLot(idx, 'lotno', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono focus:outline-emerald-500"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="text"
                          placeholder="YYYY-MM-DD"
                          value={lot.dateexpire}
                          onChange={(e) => handleRowChangeInMultiLot(idx, 'dateexpire', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-mono focus:outline-emerald-500"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={lot.amount}
                          onChange={(e) => handleRowChangeInMultiLot(idx, 'amount', e.target.value)}
                          className="w-full px-2 py-1 border border-emerald-300 rounded text-xs text-right font-mono font-bold bg-emerald-50/30 focus:outline-emerald-500"
                        />
                      </div>
                      <div className="col-span-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRowFromMultiLot(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                          title="ลบแถว Lot นี้"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleAddRowToMultiLot}
                  className="w-full py-1.5 border border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ เพิ่มรุ่นการผลิต (Lot) อีกรายการ</span>
                </button>
              </div>

              {/* Live Auto-Sum Banner */}
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-emerald-800 font-bold">รวมทุก Lot ที่ตรวจนับได้:</span>
                  <div className="text-lg font-black font-mono text-emerald-900 mt-0.5">
                    {multiLotRows.reduce((sum, l) => sum + (Number(l.amount) || 0), 0).toLocaleString()} {multiLotModalDrug.drugunit}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-emerald-700 font-medium">จำนวน Lot ทั้งหมด:</span>
                  <div className="text-base font-bold font-mono text-emerald-800 mt-0.5">
                    {multiLotRows.filter(l => Number(l.amount) > 0 || l.lotno).length} รุ่น
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMultiLotModalDrug(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingMultiLot}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center space-x-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingMultiLot ? 'กำลังบันทึก...' : 'บันทึกข้อมูลทุก Lot'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* RESET ALL CONFIRMATION MODAL                             */}
      {/* ========================================================= */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">ยืนยันรีเซ็ตยอดยกมาทั้งหมด?</h3>
                <p className="text-xs text-slate-500 mt-0.5">การกระทำนี้จะล้างข้อมูลยอดยกมาที่เคยตรวจนับไว้ทั้งหมดกลับเป็น 0</p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800">
              เมื่อกดยืนยัน รายการยาทั้งหมดจะกลับไปมียอดยกมาเป็น <strong>0</strong> ทุกตัว 
              และจะต้องเริ่มทำการตรวจนับหรือนำเข้าใหม่อีกครั้ง
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleResetAll}
                disabled={resetting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
              >
                {resetting ? 'กำลังรีเซ็ต...' : 'ยืนยันลบทั้งหมดเป็น 0'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
