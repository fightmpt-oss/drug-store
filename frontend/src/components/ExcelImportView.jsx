import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  FileText,
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  Download, 
  Check, 
  Sparkles,
  Building,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  FolderOpen,
  Database,
  ExternalLink,
  Search,
  X
} from 'lucide-react';
import { api } from '../services/api';

export default function ExcelImportView({ onImportSuccess }) {
  const [file, setFile] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [showPdfViewer, setShowPdfViewer] = useState(true);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [allDrugs, setAllDrugs] = useState([]);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Saved receipts & document folder info
  const [recentReceipts, setRecentReceipts] = useState([]);
  const [savedFilesInfo, setSavedFilesInfo] = useState({ folderPath: '', files: [] });

  // Receipt Header Info — supplier เริ่มต้นจากค่าตั้งของหน่วย (motherHospital) ไม่ hardcode
  const [receiptInfo, setReceiptInfo] = useState({
    receiveno: '',
    receivedate: new Date().toISOString().slice(0, 10),
    supplier: '',
    note: ''
  });

  // Drug Picker Modal State (แทนที่ native select ที่สร้าง 940,000 DOM nodes จนหน้าค้าง)
  const [pickerState, setPickerState] = useState({
    isOpen: false,
    rowIndex: null,
    search: '',
    initialQuery: ''
  });

  const fileInputRef = useRef(null);

  useEffect(() => {
    loadDrugCatalogue();
    loadDefaultSupplier();
    loadReceiptsAndFiles();
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, []);

  const loadDefaultSupplier = async () => {
    try {
      const res = await api.getSettings();
      if (res.success && res.data?.motherHospital) {
        setReceiptInfo(prev => ({ ...prev, supplier: res.data.motherHospital }));
      }
    } catch (e) {}
  };

  const loadDrugCatalogue = async () => {
    try {
      const res = await api.getAllDrugs();
      if (res.success) setAllDrugs(res.data);
    } catch (e) {}
  };

  const loadReceiptsAndFiles = async () => {
    try {
      const [recRes, filesRes] = await Promise.all([
        api.getReceipts(20),
        api.getSavedReceiptFiles()
      ]);
      if (recRes.success && Array.isArray(recRes.data)) {
        setRecentReceipts(recRes.data);
      }
      if (filesRes.success) {
        setSavedFilesInfo({
          folderPath: filesRes.folderPath || 'received_documents',
          pdfFolderPath: filesRes.pdfFolderPath || 'received_documents/pdf',
          excelFolderPath: filesRes.excelFolderPath || 'received_documents/excel',
          files: filesRes.files || []
        });
      }
    } catch (e) {}
  };

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
    const isPdf = selectedFile.name?.toLowerCase().endsWith('.pdf') || selectedFile.type === 'application/pdf';
    if (isPdf) {
      setPdfPreviewUrl(URL.createObjectURL(selectedFile));
      setShowPdfViewer(true);
    }
    setFile(selectedFile);
    setError(null);
    setImportResult(null);
    uploadAndPreview(selectedFile);
  };

  const uploadAndPreview = async (targetFile) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.previewExcel(targetFile);
      if (res.success) {
        setPreviewData(res.data);
        // Auto-fill metadata if extracted from PDF
        if (res.data.metadata) {
          setReceiptInfo(prev => ({
            ...prev,
            receiveno: res.data.metadata.receiveno || prev.receiveno,
            receivedate: res.data.metadata.receivedate || prev.receivedate,
            supplier: res.data.metadata.supplier || prev.supplier
          }));
        }
        loadReceiptsAndFiles();
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const recomputeStats = (items) => {
    const total = items.length;
    const fullyMatched = items.filter(i => i.matchStatus === 'MATCHED').length;
    const suggested = items.filter(i => i.matchStatus === 'SUGGESTED').length;
    const unmatched = items.filter(i => !i.matchedDrugCode || i.matchStatus === 'UNMATCHED').length;
    return { total, fullyMatched, suggested, unmatched };
  };

  const handleDrugCodeChange = (index, newDrugCode) => {
    if (!previewData) return;
    const updatedItems = [...previewData.items];
    const prevItem = updatedItems[index];
    const found = allDrugs.find(d => d.drugcode === newDrugCode);

    updatedItems[index] = {
      ...prevItem,
      matchedDrugCode: newDrugCode,
      matchedDrugName: found ? found.drugname : '',
      matchedDrugUnit: found ? found.drugunit : '',
      drugname: prevItem.drugname || (found ? found.drugname : ''),
      cost: prevItem.cost || (found ? Number(found.costprice || 0) : 0),
      matchStatus: newDrugCode ? 'MATCHED' : 'UNMATCHED',
      matchType: newDrugCode ? 'MANUAL_SELECTED (ผู้ใช้เลือกเอง - บันทึกจำค่าแล้ว)' : '',
      confidence: newDrugCode ? 100 : 0,
      isAutoSaved: Boolean(newDrugCode)
    };

    const st = recomputeStats(updatedItems);
    setPreviewData({
      ...previewData,
      totalItems: st.total,
      stats: st,
      items: updatedItems
    });

    // บันทึกความจำการจับคู่ทันที (Hospital Alias Memory) เพื่อให้งวดถัดไปจำค่าได้อัตโนมัติ
    if (newDrugCode && (prevItem.drugname || prevItem.hosdrugcode)) {
      api.saveMapping({
        hospitalDrugName: prevItem.drugname,
        drugname: prevItem.drugname,
        hosdrugcode: prevItem.hosdrugcode || '',
        jhcisdrugcode: newDrugCode,
        matchedDrugName: found ? found.drugname : '',
        tmtid: found?.didstandard || prevItem.tmtid || ''
      }).catch(err => console.warn('Could not auto-save mapping:', err.message));
    }
  };

  const openDrugPicker = (index, defaultQuery = '') => {
    // ดึงคีย์เวิร์ดคำแรกที่ตัดขนาดยาออกเพื่อค้นหาได้ทันที
    const clean = (defaultQuery || '').replace(/[0-9]+(\.[0-9]+)?\s*(mg|ml|cap|tab|inj|syr|susp|g|gm)/gi, '').trim();
    const firstWord = clean.split(/[\s,()\/]+/)[0] || '';
    setPickerState({
      isOpen: true,
      rowIndex: index,
      search: firstWord.length >= 3 ? firstWord : (clean || defaultQuery),
      initialQuery: defaultQuery
    });
  };

  const closeDrugPicker = () => {
    setPickerState({ isOpen: false, rowIndex: null, search: '', initialQuery: '' });
  };

  const handleSelectFromPicker = (selectedDrug) => {
    if (pickerState.rowIndex !== null && selectedDrug) {
      handleDrugCodeChange(pickerState.rowIndex, selectedDrug.drugcode);
    }
    closeDrugPicker();
  };

  const handleAcceptAllSuggestions = () => {
    if (!previewData || !previewData.items) return;
    const mappingsToSave = [];
    const updatedItems = previewData.items.map(it => {
      if (it.matchStatus === 'SUGGESTED' && it.suggestions && it.suggestions.length > 0) {
        const top = it.suggestions[0];
        const found = allDrugs.find(d => d.drugcode === top.drugcode);
        if (it.drugname || it.hosdrugcode) {
          mappingsToSave.push({
            hospitalDrugName: it.drugname,
            drugname: it.drugname,
            hosdrugcode: it.hosdrugcode || '',
            jhcisdrugcode: top.drugcode,
            matchedDrugName: top.drugname,
            tmtid: found?.didstandard || it.tmtid || ''
          });
        }
        return {
          ...it,
          matchedDrugCode: top.drugcode,
          matchedDrugName: top.drugname,
          matchedDrugUnit: found ? found.drugunit : (it.matchedDrugUnit || ''),
          cost: it.cost || (found ? Number(found.costprice || 0) : 0),
          matchStatus: 'MATCHED',
          matchType: 'CONFIRMED_SUGGESTION (ยอมรับข้อเสนอแนะ - บันทึกจำค่าแล้ว)',
          confidence: 100,
          isAutoSaved: true
        };
      }
      return it;
    });
    const st = recomputeStats(updatedItems);
    setPreviewData({
      ...previewData,
      totalItems: st.total,
      stats: st,
      items: updatedItems
    });

    if (mappingsToSave.length > 0) {
      api.saveBatchMappings(mappingsToSave).catch(err => console.warn('Could not batch save mappings:', err.message));
    }
  };

  const filteredPickerDrugs = useMemo(() => {
    if (!pickerState.isOpen) return [];
    const q = (pickerState.search || '').trim().toLowerCase();
    if (!q) {
      return allDrugs.slice(0, 30);
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    const results = [];
    for (const d of allDrugs) {
      const name = (d.drugname || '').toLowerCase();
      const code = (d.drugcode || '').toLowerCase();
      const th = (d.drugnamethai || '').toLowerCase();
      const did = (d.didstandard || '').toLowerCase();
      const match = tokens.every(t => name.includes(t) || code.includes(t) || th.includes(t) || did.includes(t));
      if (match) {
        results.push(d);
        if (results.length >= 40) break; // จำกัด 40 รายการให้ render ลื่น 60fps ทันที
      }
    }
    return results;
  }, [allDrugs, pickerState.isOpen, pickerState.search]);

  const handleItemFieldChange = (index, field, value) => {
    if (!previewData) return;
    const updatedItems = [...previewData.items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: field === 'amount' || field === 'cost' ? (parseFloat(value) || 0) : value
    };
    setPreviewData({
      ...previewData,
      items: updatedItems
    });
  };

  const handleAddManualRow = () => {
    if (!previewData) return;
    const newRow = {
      rowIndex: previewData.items.length + 1,
      hosdrugcode: '',
      tmtid: '',
      drugname: '',
      drugtype: previewData.fileType === 'pdf' ? 'เพิ่มจากใบส่งยา PDF' : 'เพิ่มด้วยตนเอง',
      lot: '',
      expdate: '',
      amount: 1,
      cost: 0,
      matchStatus: 'UNMATCHED',
      matchType: '',
      confidence: 0,
      matchedDrugCode: '',
      matchedDrugName: '',
      matchedDrugUnit: ''
    };
    const updatedItems = [...previewData.items, newRow];
    const st = recomputeStats(updatedItems);
    setPreviewData({
      ...previewData,
      totalItems: st.total,
      stats: st,
      items: updatedItems
    });
  };

  const handleRemoveRow = (index) => {
    if (!previewData) return;
    const updatedItems = previewData.items.filter((_, idx) => idx !== index);
    const st = recomputeStats(updatedItems);
    setPreviewData({
      ...previewData,
      totalItems: st.total,
      stats: st,
      items: updatedItems
    });
  };

  const handleCommitImport = async () => {
    if (!previewData || !previewData.items || previewData.items.length === 0) return;

    const unassigned = previewData.items.filter(i => !i.matchedDrugCode);
    if (unassigned.length > 0) {
      if (!confirm(`มีรายการยา ${unassigned.length} รายการ ที่ยังไม่ได้จับคู่กับรหัสยา JHCIS ต้องการดำเนินการต่อโดยข้ามรายการเหล่านี้หรือไม่?`)) {
        return;
      }
    }

    try {
      setImporting(true);
      setError(null);

      const itemsToImport = previewData.items
        .filter(i => i.matchedDrugCode && Number(i.amount) > 0)
        .map(i => ({
          drugcode: i.matchedDrugCode,
          matchedDrugCode: i.matchedDrugCode,
          hospitalDrugName: i.drugname,
          drugname: i.drugname || i.matchedDrugName,
          matchedDrugName: i.matchedDrugName,
          hosdrugcode: i.hosdrugcode,
          tmtid: i.tmtid,
          lotno: i.lot,
          dateexpire: i.expdate,
          amount: Number(i.amount) || 0,
          costprice: Number(i.cost) || 0,
          matchType: i.matchType,
          confidence: i.confidence
        }));

      if (itemsToImport.length === 0) {
        setError('กรุณาจับคู่รหัสยา JHCIS และระบุจำนวนรับมากกว่า 0 อย่างน้อย 1 รายการ');
        setImporting(false);
        return;
      }

      // เช็คใบรับซ้ำก่อนบันทึก (กัน import เบิ้ลสต็อก)
      if (receiptInfo.receiveno && receiptInfo.receiveno.trim() !== '') {
        const dup = await api.checkReceiveno(receiptInfo.receiveno.trim());
        if (dup.success && dup.data?.duplicate) {
          setError(`เลขที่ใบรับ "${receiptInfo.receiveno}" มีในระบบแล้ว (บันทึกเมื่อ ${dup.data.existing.receivedate} โดย ${dup.data.existing.receiver || '-'} ${dup.data.existing.itemCount} รายการ) — กรุณาใช้เลขที่อื่น มิฉะนั้นสต็อกจะถูกนับซ้ำ`);
          setImporting(false);
          return;
        }
      }

      const res = await api.importExcel({
        ...receiptInfo,
        sourceFile: previewData.savedFileName || previewData.fileName || '',
        sourceType: previewData.fileType || 'excel',
        items: itemsToImport
      });

      if (res.success) {
        setImportResult(res);
        setPreviewData(null);
        setFile(null);
        if (pdfPreviewUrl) {
          URL.revokeObjectURL(pdfPreviewUrl);
          setPdfPreviewUrl(null);
        }
        loadReceiptsAndFiles();
        if (onImportSuccess) onImportSuccess();
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-5 sm:py-6 space-y-5">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
            <span>นำเข้าใบรับยาจาก รพ.แม่ข่าย (Excel / PDF)</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              รองรับทั้ง .PDF และ .XLSX / .XLS
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            อัปโหลดไฟล์ใบส่งยา PDF หรือ Excel จาก รพ.แม่ข่าย เพื่อเพิ่มรายการยาและจำนวนเข้าคลังทันที พร้อมเก็บไฟล์ต้นฉบับเข้าโฟลเดอร์ระบบอัตโนมัติ
          </p>
        </div>

        {/* Download Sample Button */}
        <button
          type="button"
          onClick={() => api.downloadFile(api.getSampleExcelUrl(), 'Sample_Drug_Receive_Template.xlsx').catch(err => setError(err.message))}
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4 text-emerald-600" />
          <span>ดาวน์โหลดไฟล์ Excel ตัวอย่าง</span>
        </button>
      </div>

      {/* Storage Architecture Info Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-start space-x-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div className="text-xs space-y-0.5">
            <div className="font-bold text-slate-800 text-sm">
              1. ฐานข้อมูลที่เก็บรายการยาและจำนวนที่รับเข้า
            </div>
            <p className="text-slate-600 leading-relaxed">
              เก็บไว้ในฐานข้อมูลคลังยาของระบบ <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-emerald-800 font-bold">backend/src/data/localdb/receipts.json</code> (แยกจากฐาน <code className="font-mono">jhcisdb</code> เพื่อให้ฐาน JHCIS ปลอดภัย 100%) และคำนวณยอดรวมเข้าแดชบอร์ด Drug Stock + Stock Card ทันที
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div className="text-xs space-y-0.5">
            <div className="font-bold text-slate-800 text-sm">
              2. โฟลเดอร์เก็บไฟล์ใบรับยาต้นฉบับ (PDF / Excel)
            </div>
            <p className="text-slate-600 leading-relaxed">
              ไฟล์ที่อัปโหลดทุกฉบับจะถูกจัดเก็บไว้ในโฟลเดอร์ของระบบที่ <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-blue-800 font-bold">received_documents/pdf/</code> และ <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-blue-800 font-bold">received_documents/excel/</code> สามารถเปิดดูย้อนหลังได้ตลอดเวลา
            </p>
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {importResult && (
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 flex items-start space-x-3 shadow-xs">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-bold text-base text-emerald-900">
              {importResult.message}
            </h3>
            <p className="text-xs text-emerald-700">
              บันทึกยอดยาเข้าคลังและเก็บไฟล์เอกสารไว้ในโฟลเดอร์ <code className="font-mono font-bold">received_documents/</code> เรียบร้อยแล้ว สามารถตรวจสอบยอดคงเหลือและ Stock Card ได้ที่เมนูแดชบอร์ดทันที
            </p>
          </div>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center space-x-3 text-sm">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload Dropzone */}
      {!previewData && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileSelect(e.dataTransfer.files[0]);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-10 sm:p-12 text-center bg-white hover:bg-emerald-50/20 transition-all cursor-pointer shadow-2xs group"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
            accept=".pdf,.xlsx,.xls,.csv"
            className="hidden"
          />

          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
              <FileText className="w-7 h-7" />
            </div>
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
          </div>

          <h3 className="text-lg font-bold text-slate-800">
            ลากไฟล์ PDF หรือ Excel ใบส่งยาจาก รพ.แม่ข่าย มาวางที่นี่
          </h3>
          <p className="text-xs text-slate-500 max-w-xl mx-auto mt-1 leading-relaxed">
            รองรับไฟล์ <span className="font-mono font-bold text-rose-700">.pdf</span> (ใบส่งยา/ใบเบิกยาจาก รพ.แม่ข่าย) และไฟล์ <span className="font-mono font-bold text-emerald-700">.xlsx, .xls, .csv</span> ระบบจะอ่านรายการยา จำนวน Lot และวันหมดอายุ พร้อมจับคู่รหัสยาใน JHCIS ให้อัตโนมัติ
          </p>

          <button
            type="button"
            className="mt-5 px-5 py-2.5 bg-emerald-600 group-hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            เลือกไฟล์ PDF หรือ Excel จากคอมพิวเตอร์
          </button>
        </div>
      )}

      {/* Loading state during upload */}
      {loading && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-2xs space-y-3">
          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <h3 className="font-bold text-slate-800">กำลังวิเคราะห์ไฟล์ใบรับยาและจับคู่รหัสยากับฐานข้อมูล JHCIS...</h3>
          <p className="text-xs text-slate-500">ระบบกำลังสกัดรายการยา จำนวนรับ และบันทึกไฟล์ต้นฉบับเข้าโฟลเดอร์ received_documents</p>
        </div>
      )}

      {/* Preview Section */}
      {previewData && !loading && (
        <div className="space-y-6">
          
          {/* Receipt Header Configuration Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-200 text-slate-800 font-bold text-sm">
              <div className="flex items-center space-x-2">
                <Building className="w-4 h-4 text-emerald-600" />
                <span>บันทึกข้อมูลการรับยาเข้าคลัง — ไฟล์: {previewData.fileName}</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                  previewData.fileType === 'pdf'
                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}>
                  {previewData.fileType}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-normal text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                  เก็บไฟล์ต้นฉบับแล้วที่: received_documents/{previewData.savedSubFolder}/{previewData.savedFileName}
                </span>
                <span className="text-[11px] font-normal text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                  ฐานข้อมูลสต็อก: data/localdb/receipts.json
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  เลขที่ใบรับ / เลขที่ใบส่งยา (Running No.)
                </label>
                <input
                  type="text"
                  placeholder="เว้นว่าง = ระบบรันเลขอัตโนมัติ"
                  value={receiptInfo.receiveno}
                  onChange={(e) => setReceiptInfo(prev => ({ ...prev, receiveno: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono bg-slate-50 text-slate-800 focus:outline-emerald-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  วันที่รับ (Received Date)
                </label>
                <input
                  type="date"
                  value={receiptInfo.receivedate}
                  onChange={(e) => setReceiptInfo(prev => ({ ...prev, receivedate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  ผู้ส่งมอบ / รพ.แม่ข่าย
                </label>
                <input
                  type="text"
                  placeholder="เช่น ชื่อ รพ.แม่ข่าย / องค์การเภสัชกรรม"
                  value={receiptInfo.supplier}
                  onChange={(e) => setReceiptInfo(prev => ({ ...prev, supplier: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block font-medium text-slate-700 mb-1">
                  หมายเหตุ (Note)
                </label>
                <input
                  type="text"
                  placeholder="เช่น รับยาประจำเดือนจาก รพ.แม่ข่าย"
                  value={receiptInfo.note}
                  onChange={(e) => setReceiptInfo(prev => ({ ...prev, note: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Stats & Action Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-wrap justify-between items-center gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-semibold text-slate-800">
                รายการยาทั้งหมด: <strong className="text-emerald-700">{previewData.totalItems} รายการ</strong>
              </span>
              <span className="text-slate-300">|</span>
              <span className="inline-flex items-center text-emerald-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                จับคู่สำเร็จ: {previewData.stats.fullyMatched}
              </span>
              <span className="text-slate-300">|</span>
              <span className="inline-flex items-center text-amber-700 font-medium">
                <HelpCircle className="w-3.5 h-3.5 mr-1" />
                แนะนำให้ตรวจยืนยัน: {previewData.stats.suggested}
              </span>
              {previewData.stats.unmatched > 0 && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="inline-flex items-center text-rose-700 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                    ยังไม่ได้จับคู่: {previewData.stats.unmatched}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {pdfPreviewUrl && (
                <button
                  type="button"
                  onClick={() => setShowPdfViewer(v => !v)}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 text-xs font-semibold transition-colors cursor-pointer"
                >
                  {showPdfViewer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showPdfViewer ? 'ซ่อนหน้าต่างไฟล์ PDF' : 'แสดงไฟล์ PDF ต้นฉบับ'}</span>
                </button>
              )}

              {previewData.stats.suggested > 0 && (
                <button
                  type="button"
                  onClick={handleAcceptAllSuggestions}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                  title="ยืนยันการจับคู่รายการยาที่มีข้อเสนอแนะทั้งหมดใน 1 คลิก"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>ยอมรับข้อเสนอแนะทั้งหมด ({previewData.stats.suggested})</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleAddManualRow}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มแถวรายการยา</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPreviewData(null);
                  setFile(null);
                  if (pdfPreviewUrl) {
                    URL.revokeObjectURL(pdfPreviewUrl);
                    setPdfPreviewUrl(null);
                  }
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium transition-colors cursor-pointer"
              >
                เลือกไฟล์ใหม่
              </button>

              <button
                type="button"
                onClick={handleCommitImport}
                disabled={importing}
                className="flex items-center space-x-1.5 px-5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                {importing ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                    <span>กำลังบันทึกเข้าคลังยา...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>ยืนยันนำเข้าคลังยาทันที</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Side-by-side PDF Viewer + Editable Table when PDF is uploaded */}
          <div className={`grid grid-cols-1 ${pdfPreviewUrl && showPdfViewer ? 'xl:grid-cols-12 gap-5' : ''}`}>
            
            {pdfPreviewUrl && showPdfViewer && (
              <div className="xl:col-span-5 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col min-h-[560px]">
                <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between">
                  <span className="flex items-center gap-2 truncate">
                    <FileText className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="truncate">เอกสาร PDF ต้นฉบับ: {previewData.fileName}</span>
                  </span>
                  <a
                    href={pdfPreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-300 hover:underline flex items-center gap-1 shrink-0 ml-2"
                  >
                    <span>เปิดเต็มจอ</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <iframe
                  src={pdfPreviewUrl}
                  title="PDF Receipt Preview"
                  className="w-full flex-1 min-h-[520px] border-0"
                />
              </div>
            )}

            {/* Table of Matched Items (Editable) */}
            <div className={`${pdfPreviewUrl && showPdfViewer ? 'xl:col-span-7' : ''} bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden`}>
              {previewData.fileType === 'pdf' && previewData.items.length === 0 && (
                <div className="p-4 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3">
                  <div>
                    <strong>หมายเหตุ:</strong> ไฟล์ PDF นี้อาจเป็นไฟล์สแกนรูปภาพหรือมีรูปแบบตารางเฉพาะ ท่านสามารถดูไฟล์ PDF ด้านซ้ายแล้วกดปุ่ม <strong>"+ เพิ่มแถวรายการยา"</strong> เพื่อเลือกรายการยาและกรอกจำนวนรับเข้าคลังได้ทันที
                  </div>
                  <button
                    type="button"
                    onClick={handleAddManualRow}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shrink-0 cursor-pointer"
                  >
                    + เพิ่มรายการยา
                  </button>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-2.5">#</th>
                      <th className="py-3 px-2.5 min-w-[160px]">ชื่อยา (จากไฟล์)</th>
                      <th className="py-3 px-2.5 min-w-[230px]">จับคู่รหัสยาใน JHCIS (cdrug)</th>
                      <th className="py-3 px-2.5 min-w-[110px]">Lot No.</th>
                      <th className="py-3 px-2.5 min-w-[130px]">วันหมดอายุ (Exp)</th>
                      <th className="py-3 px-2.5 text-right min-w-[100px]">จำนวนรับ</th>
                      <th className="py-3 px-2.5 text-right min-w-[95px]">ราคา/หน่วย</th>
                      <th className="py-3 px-2.5 text-center">สถานะ</th>
                      <th className="py-3 px-2 text-center">ลบ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewData.items.map((item, idx) => {
                      const isMatched = item.matchStatus === 'MATCHED';
                      const isSuggested = item.matchStatus === 'SUGGESTED';

                      return (
                        <tr 
                          key={idx}
                          className={`hover:bg-slate-50 transition-colors ${
                            !item.matchedDrugCode ? 'bg-rose-50/40' : ''
                          }`}
                        >
                          <td className="py-2.5 px-2.5 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2.5 px-2.5">
                            <input
                              type="text"
                              value={item.drugname || ''}
                              onChange={(e) => handleItemFieldChange(idx, 'drugname', e.target.value)}
                              placeholder="ชื่อรายการยา..."
                              className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-slate-900 font-medium text-xs"
                            />
                            {(item.hosdrugcode || item.tmtid) && (
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                {item.hosdrugcode ? `รหัส รพ.: ${item.hosdrugcode}` : ''} {item.tmtid ? `| TMT: ${item.tmtid}` : ''}
                              </div>
                            )}
                          </td>

                          {/* Match Cell: Ultra-fast responsive cell (NO 940,000 DOM options) */}
                          <td className="py-2.5 px-2.5">
                            {item.matchedDrugCode ? (
                              <div className="flex items-center justify-between gap-1.5 p-1.5 bg-emerald-50/80 border border-emerald-300 rounded-lg">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono text-[11px] font-bold text-emerald-800 bg-emerald-100 px-1 py-0.5 rounded">
                                      [{item.matchedDrugCode}]
                                    </span>
                                    <span className="text-xs font-semibold text-emerald-950 truncate block" title={item.matchedDrugName}>
                                      {item.matchedDrugName || allDrugs.find(d => d.drugcode === item.matchedDrugCode)?.drugname || ''}
                                    </span>
                                  </div>
                                  {item.matchedDrugUnit && (
                                    <div className="text-[10px] text-emerald-700 mt-0.5">หน่วยนับ: {item.matchedDrugUnit}</div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openDrugPicker(idx, item.drugname)}
                                  className="px-2 py-1 text-[11px] font-semibold bg-white text-emerald-700 hover:bg-emerald-100 border border-emerald-300 rounded shadow-2xs shrink-0 cursor-pointer transition-colors"
                                >
                                  เปลี่ยน
                                </button>
                              </div>
                            ) : isSuggested && item.suggestions && item.suggestions.length > 0 ? (
                              <div className="space-y-1">
                                <div className="flex flex-col gap-1">
                                  {item.suggestions.slice(0, 2).map((sugg, sIdx) => (
                                    <button
                                      key={sIdx}
                                      type="button"
                                      onClick={() => handleDrugCodeChange(idx, sugg.drugcode)}
                                      className="w-full text-left px-2 py-1 bg-amber-50 hover:bg-emerald-50 text-amber-900 hover:text-emerald-900 border border-amber-300 hover:border-emerald-400 rounded-md transition-colors flex items-center justify-between gap-1 cursor-pointer shadow-2xs group"
                                      title={`คลิกเลือก: [${sugg.drugcode}] ${sugg.drugname}`}
                                    >
                                      <div className="min-w-0 flex-1 truncate flex items-center gap-1">
                                        <Sparkles className="w-3 h-3 text-amber-600 group-hover:text-emerald-600 shrink-0" />
                                        <span className="font-mono font-bold text-amber-800 group-hover:text-emerald-800 shrink-0">
                                          [{sugg.drugcode}]
                                        </span>
                                        <span className="truncate text-xs font-medium">{sugg.drugname}</span>
                                      </div>
                                      <span className="text-[10px] font-bold text-amber-700 group-hover:text-emerald-700 shrink-0">
                                        {sugg.score}%
                                      </span>
                                    </button>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openDrugPicker(idx, item.drugname)}
                                  className="w-full py-1 px-2 text-[11px] font-medium bg-white hover:bg-slate-50 text-slate-600 hover:text-indigo-600 border border-slate-300 hover:border-indigo-300 rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Search className="w-3 h-3 text-slate-400" />
                                  <span>ค้นหายาอื่นใน JHCIS...</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openDrugPicker(idx, item.drugname)}
                                className="w-full py-2 px-2.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 hover:border-rose-400 rounded-lg flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                              >
                                <Search className="w-3.5 h-3.5 text-rose-500" />
                                <span>เลือกรหัสยาใน JHCIS...</span>
                              </button>
                            )}
                          </td>

                          <td className="py-2.5 px-2.5">
                            <input
                              type="text"
                              value={item.lot || ''}
                              onChange={(e) => handleItemFieldChange(idx, 'lot', e.target.value)}
                              placeholder="Lot No."
                              className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs text-slate-800 bg-white"
                            />
                          </td>

                          <td className="py-2.5 px-2.5">
                            <input
                              type="date"
                              value={item.expdate || ''}
                              onChange={(e) => handleItemFieldChange(idx, 'expdate', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-xs text-slate-800 bg-white"
                            />
                          </td>

                          <td className="py-2.5 px-2.5 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.amount}
                              onChange={(e) => handleItemFieldChange(idx, 'amount', e.target.value)}
                              className="w-24 px-2 py-1 border border-emerald-300 rounded text-right font-bold text-emerald-800 font-mono text-xs bg-emerald-50/30"
                            />
                          </td>

                          <td className="py-2.5 px-2.5 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.cost || 0}
                              onChange={(e) => handleItemFieldChange(idx, 'cost', e.target.value)}
                              className="w-20 px-2 py-1 border border-slate-200 rounded text-right font-mono text-xs text-slate-700 bg-white"
                            />
                          </td>

                          {/* Match Status Badge */}
                          <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                            {isMatched ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800" title={item.matchType}>
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                {item.matchType?.includes('HOSPITAL_ALIAS') 
                                  ? 'จำค่าเดิม (100%)' 
                                  : item.isAutoSaved 
                                  ? 'จำค่าแล้ว' 
                                  : item.confidence === 100 
                                  ? 'ตรงกัน' 
                                  : 'จับคู่แล้ว'}
                              </span>
                            ) : isSuggested ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800" title={item.matchType}>
                                <Sparkles className="w-3 h-3 mr-1" />
                                ใกล้เคียง ({item.confidence}%)
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                รอเลือกยา
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                              title="ลบแถวนี้"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* History of Imported Receipts & Stored PDF/Excel Files */}
      {(recentReceipts.length > 0 || savedFilesInfo.files.length > 0) && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <FolderOpen className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 text-base">
                คลังเก็บไฟล์ใบรับยาต้นฉบับและประวัติการนำเข้าล่าสุด
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-600 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
              โฟลเดอร์เก็บไฟล์: {savedFilesInfo.folderPath || 'received_documents'}
            </span>
          </div>

          {savedFilesInfo.files.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">
                ไฟล์เอกสารใบส่งยา (PDF / Excel) ที่เก็บอยู่ในโฟลเดอร์ระบบ ({savedFilesInfo.files.length} ไฟล์):
              </div>
              <div className="flex flex-wrap gap-2">
                {savedFilesInfo.files.slice(0, 12).map((f, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => api.openReceiptFile(f.type, f.filename).catch(err => setError(err.message))}
                    className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                      f.type === 'pdf'
                        ? 'bg-rose-50/70 border-rose-200 text-rose-900 hover:bg-rose-100'
                        : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 hover:bg-emerald-100'
                    }`}
                  >
                    {f.type === 'pdf' ? (
                      <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    )}
                    <span className="max-w-[240px] truncate">{f.filename}</span>
                    <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drug Picker Modal: Searchable catalogue modal with instant response */}
      {pickerState.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-800 text-white flex items-center justify-between shrink-0">
              <div className="min-w-0 pr-3">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>ค้นหาและจับคู่รหัสยา JHCIS (cdrug)</span>
                </h3>
                {pickerState.initialQuery && (
                  <p className="text-xs text-slate-300 truncate mt-0.5">
                    สำหรับรายการ: <span className="text-emerald-300 font-semibold">{pickerState.initialQuery}</span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeDrugPicker}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input Box */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  placeholder="พิมพ์ชื่อยา, รหัสยา JHCIS, หรือชื่อภาษาไทย เพื่อค้นหา..."
                  value={pickerState.search}
                  onChange={(e) => setPickerState(prev => ({ ...prev, search: e.target.value }))}
                  className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-emerald-500 focus:border-emerald-500 shadow-2xs"
                />
                {pickerState.search && (
                  <button
                    type="button"
                    onClick={() => setPickerState(prev => ({ ...prev, search: '' }))}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                <span>แสดงผลลัพธ์ {filteredPickerDrugs.length} รายการ (จากทั้งหมด {allDrugs.length.toLocaleString()} รายการในทะเบียน JHCIS)</span>
                <span className="text-slate-400">คลิกที่รายการยาเพื่อจับคู่ทันที</span>
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
              {filteredPickerDrugs.length > 0 ? (
                filteredPickerDrugs.map((d) => (
                  <div
                    key={d.drugcode}
                    onClick={() => handleSelectFromPicker(d)}
                    className="p-2.5 hover:bg-emerald-50/80 rounded-xl cursor-pointer transition-colors flex items-center justify-between gap-3 group border border-transparent hover:border-emerald-200"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                          {d.drugcode}
                        </span>
                        <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-950">
                          {d.drugname}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 mt-1 pl-1">
                        {d.drugnamethai && <span>ชื่อไทย: <strong className="text-slate-700">{d.drugnamethai}</strong></span>}
                        {d.drugunit && <span>หน่วย: <strong className="text-slate-700">{d.drugunit}</strong></span>}
                        {d.costprice !== undefined && <span>ราคาทุน: <strong className="text-slate-700">฿{Number(d.costprice).toFixed(2)}</strong></span>}
                        {d.didstandard && <span className="font-mono text-[10px] text-slate-400">TMT/DID: {d.didstandard}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-bold bg-white group-hover:bg-emerald-600 text-slate-700 group-hover:text-white border border-slate-300 group-hover:border-emerald-600 rounded-lg shrink-0 transition-colors shadow-2xs"
                    >
                      เลือกยานี้
                    </button>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <HelpCircle className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs">ไม่พบรายการยาที่ตรงกับคำค้นหา "{pickerState.search}"</p>
                  <p className="text-[11px] text-slate-400">ลองค้นหาด้วยคำอื่น หรือพิมพ์เฉพาะรหัสยา</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={closeDrugPicker}
                className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
