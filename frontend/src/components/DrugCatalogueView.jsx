import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Search, 
  FileSpreadsheet, 
  Layers, 
  Sparkles, 
  ArrowRight, 
  Copy, 
  Download, 
  ShieldCheck, 
  RefreshCw,
  Database,
  Pill,
  Leaf,
  FileCode2,
  Check,
  UploadCloud,
  Plus,
  X,
  FolderUp,
  Type,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { api } from '../services/api';
import DtamHerbalAuditTab from './DtamHerbalAuditTab';
import PaginationBar from './PaginationBar';

export default function DrugCatalogueView() {
  const [activeSubTab, setActiveSubTab] = useState('pcu'); // 'pcu', 'herbs', 'dtam', 'sql'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Font scale preference: 'normal' (default balanced), 'large', 'xlarge'
  const [fontSizeScale, setFontSizeScale] = useState(() => {
    try {
      return localStorage.getItem('jhcis_catalogue_fontsize') || 'normal';
    } catch (e) {
      return 'normal';
    }
  });

  const handleSetFontSizeScale = (scale) => {
    setFontSizeScale(scale);
    try {
      localStorage.setItem('jhcis_catalogue_fontsize', scale);
    } catch (e) {}
  };

  const scaleStyles = {
    normal: { // Default: Balanced & compact — perfectly fits split-screen & half-screen layouts
      table: 'text-xs sm:text-[13px]',
      tradeName: 'text-xs sm:text-[13.5px] font-bold text-slate-900 leading-snug',
      genericName: 'text-[11px] sm:text-xs text-slate-500 font-medium',
      jhcisName: 'text-[11px] sm:text-xs text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 inline-block font-semibold',
      badge: 'text-[11px] sm:text-xs px-2 py-0.5 font-bold',
      subText: 'text-[10px] sm:text-[11px] text-slate-500',
      price: 'text-xs sm:text-[13px] font-bold font-mono',
      discrepancy: 'text-[11px] sm:text-xs',
      cardTitle: 'text-xs font-bold text-slate-500',
      cardNumber: 'text-2xl sm:text-3xl font-black font-mono tracking-tight',
      cardUnit: 'text-[11px] text-slate-400 font-normal',
      tableTh: 'py-2 px-2.5 sm:px-3 text-xs font-bold text-slate-700',
      tableTd: 'py-2 px-2.5 sm:px-3',
      filterBtn: 'text-xs font-bold px-3 py-1.5 rounded-xl',
      searchInput: 'text-xs sm:text-sm py-1.5 pl-9 pr-3'
    },
    large: { // Comfortable medium scale
      table: 'text-xs sm:text-sm',
      tradeName: 'text-sm sm:text-base font-extrabold text-slate-900 leading-snug',
      genericName: 'text-xs text-slate-600 font-medium',
      jhcisName: 'text-xs text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/80 inline-block font-semibold',
      badge: 'text-xs sm:text-[13px] px-2.5 py-1 font-bold',
      subText: 'text-xs text-slate-500',
      price: 'text-sm font-bold font-mono',
      discrepancy: 'text-xs sm:text-sm',
      cardTitle: 'text-xs sm:text-sm font-bold text-slate-600',
      cardNumber: 'text-2xl sm:text-3xl lg:text-4xl font-black font-mono tracking-tight',
      cardUnit: 'text-xs text-slate-500 font-normal',
      tableTh: 'py-2.5 px-3 text-xs sm:text-sm font-extrabold text-slate-800',
      tableTd: 'py-2.5 px-3',
      filterBtn: 'text-xs sm:text-sm font-bold px-3.5 py-2 rounded-xl',
      searchInput: 'text-xs sm:text-sm py-2 pl-9 pr-3'
    },
    xlarge: { // Maximum legibility for distant reading or presentation
      table: 'text-sm sm:text-base',
      tradeName: 'text-base sm:text-lg font-black text-slate-900 leading-snug',
      genericName: 'text-xs sm:text-sm text-slate-700 font-semibold',
      jhcisName: 'text-xs sm:text-sm text-blue-900 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-300 inline-block font-bold',
      badge: 'text-xs sm:text-sm px-3 py-1 font-black',
      subText: 'text-xs sm:text-sm text-slate-600',
      price: 'text-sm sm:text-base font-black font-mono',
      discrepancy: 'text-xs sm:text-sm',
      cardTitle: 'text-sm font-bold text-slate-700',
      cardNumber: 'text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight',
      cardUnit: 'text-xs sm:text-sm text-slate-600 font-medium',
      tableTh: 'py-3 px-3.5 text-xs sm:text-sm font-black text-slate-800',
      tableTd: 'py-3 px-3.5',
      filterBtn: 'text-sm font-black px-4 py-2.5 rounded-xl',
      searchInput: 'text-sm py-2.5 pl-10 pr-4'
    }
  };

  const fs = scaleStyles[fontSizeScale] || scaleStyles.normal;

  // Available files & active selection
  const [availableFiles, setAvailableFiles] = useState([]);
  const [selectedPcuFile, setSelectedPcuFile] = useState('');
  const [selectedHerbsFile, setSelectedHerbsFile] = useState('');

  // Upload modal states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('pcu_approved'); // 'pcu_approved' | 'hospital_herbs'
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);

  // Data states
  const [pcuAudit, setPcuAudit] = useState(null);
  const [herbsAudit, setHerbsAudit] = useState(null);
  const [sqlData, setSqlData] = useState(null);

  // Filters
  const [pcuFilter, setPcuFilter] = useState('all'); // 'all', 'complete', 'discrepancy', 'missing'
  const [pcuSearch, setPcuSearch] = useState('');
  const [herbSearch, setHerbSearch] = useState('');

  // SQL Options
  const [sqlOptions, setSqlOptions] = useState({
    updateTmt: true,
    updatePrice: true,
    updateNdc: true,
    updateIsed: true
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadAllAuditData();
  }, []);

  const loadAllAuditData = async (customPcu, customHerbs) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch available files list
      let files = [];
      try {
        const filesRes = await api.getCatalogueFiles();
        if (filesRes.success && Array.isArray(filesRes.files)) {
          files = filesRes.files;
          setAvailableFiles(files);
        }
      } catch (fe) {}

      const pcuCandidates = files.filter(f => f.type === 'pcu_approved');
      const herbCandidates = files.filter(f => f.type === 'saraphi_herbs' || f.type === 'hospital_shared');

      const activePcu = customPcu || selectedPcuFile || (pcuCandidates[0] ? pcuCandidates[0].filename : null);
      const activeHerbs = customHerbs || selectedHerbsFile || (herbCandidates[0] ? herbCandidates[0].filename : null);

      if (activePcu) setSelectedPcuFile(activePcu);
      if (activeHerbs) setSelectedHerbsFile(activeHerbs);

      // 2. Fetch audits
      const [pcuRes, herbsRes] = await Promise.all([
        api.auditPcuCatalogue(activePcu),
        api.auditSaraphiHerbs(activeHerbs)
      ]);

      if (pcuRes.success) setPcuAudit(pcuRes.data);
      if (herbsRes.success) setHerbsAudit(herbsRes.data);

      // 3. Generate initial SQL
      const sqlRes = await api.generateCatalogueSql({
        ...sqlOptions,
        pcuFilename: activePcu,
        herbsFilename: activeHerbs
      });
      if (sqlRes.success) setSqlData(sqlRes.data);
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล Drug Catalogue');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPcuFile = async (filename) => {
    setSelectedPcuFile(filename);
    setLoading(true);
    try {
      const res = await api.auditPcuCatalogue(filename);
      if (res.success) setPcuAudit(res.data);
      const sqlRes = await api.generateCatalogueSql({
        ...sqlOptions,
        pcuFilename: filename,
        herbsFilename: selectedHerbsFile
      });
      if (sqlRes.success) setSqlData(sqlRes.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectHerbsFile = async (filename) => {
    setSelectedHerbsFile(filename);
    setLoading(true);
    try {
      const res = await api.auditSaraphiHerbs(filename);
      if (res.success) setHerbsAudit(res.data);
      const sqlRes = await api.generateCatalogueSql({
        ...sqlOptions,
        pcuFilename: selectedPcuFile,
        herbsFilename: filename
      });
      if (sqlRes.success) setSqlData(sqlRes.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', uploadCategory);

    try {
      const res = await api.uploadCatalogueFile(formData);
      if (res.success) {
        setUploadSuccess(`อัปโหลดและประมวลผลไฟล์ "${res.data.filename}" เรียบร้อยแล้ว (พบรายการยา ${res.data.totalRows} รายการ)`);
        setTimeout(() => {
          setShowUploadModal(false);
          setUploadSuccess(null);
          if (res.data.type === 'pcu_approved') {
            loadAllAuditData(res.data.filename, selectedHerbsFile);
            setActiveSubTab('pcu');
          } else {
            loadAllAuditData(selectedPcuFile, res.data.filename);
            setActiveSubTab('herbs');
          }
        }, 1200);
      } else {
        setUploadError(res.message || 'ไม่สามารถอัปโหลดไฟล์ได้');
      }
    } catch (err) {
      setUploadError(err.message || 'เกิดข้อผิดพลาดในการอัปโหลด');
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateSql = async (newOptions) => {
    const opts = newOptions || sqlOptions;
    try {
      const res = await api.generateCatalogueSql({
        ...opts,
        pcuFilename: selectedPcuFile,
        herbsFilename: selectedHerbsFile
      });
      if (res.success) setSqlData(res.data);
    } catch (err) {
      console.error('Error generating SQL:', err);
    }
  };

  const handleCopySql = () => {
    if (!sqlData?.sql) return;
    navigator.clipboard.writeText(sqlData.sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleDownloadSql = () => {
    if (!sqlData?.sql) return;
    const blob = new Blob([sqlData.sql], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `update_jhcis_cdrug_${new Date().toISOString().slice(0, 10)}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered PCU items
  const filteredPcuItems = (pcuAudit?.items || []).filter(item => {
    if (pcuFilter === 'complete' && item.status !== 'matched') return false;
    if (pcuFilter === 'discrepancy' && item.status !== 'discrepancy') return false;
    if (pcuFilter === 'missing' && item.status !== 'missing_in_db') return false;

    if (pcuSearch) {
      const s = pcuSearch.toLowerCase();
      const code = String(item.drugcode || '').toLowerCase();
      const trade = String(item.excelData?.tradeName || '').toLowerCase();
      const gen = String(item.excelData?.genericName || '').toLowerCase();
      const dbName = String(item.dbData?.drugname || '').toLowerCase();
      return code.includes(s) || trade.includes(s) || gen.includes(s) || dbName.includes(s);
    }
    return true;
  });

  // Filtered Herbs items
  const filteredHerbsItems = (herbsAudit?.items || []).filter(item => {
    if (herbSearch) {
      const s = herbSearch.toLowerCase();
      const code = String(item.saraphiCode || '').toLowerCase();
      const trade = String(item.tradeName || '').toLowerCase();
      const gen = String(item.genericName || '').toLowerCase();
      const tmt = String(item.tmt || '').toLowerCase();
      return code.includes(s) || trade.includes(s) || gen.includes(s) || tmt.includes(s);
    }
    return true;
  });

  // Sort states
  const [pcuSort, setPcuSort] = useState({ key: 'drugcode', direction: 'asc' });
  const [herbsSort, setHerbsSort] = useState({ key: 'saraphiCode', direction: 'asc' });

  // Scroll tracking refs & state for horizontal overflow indication
  const pcuTableRef = useRef(null);
  const herbsTableRef = useRef(null);
  const [pcuScroll, setPcuScroll] = useState({ hasOverflow: false, canScrollLeft: false, canScrollRight: false });
  const [herbsScroll, setHerbsScroll] = useState({ hasOverflow: false, canScrollLeft: false, canScrollRight: false });

  const updateScrollState = (el, setter) => {
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 5;
    const canScrollLeft = el.scrollLeft > 10;
    const canScrollRight = el.scrollLeft < (el.scrollWidth - el.clientWidth - 10);
    setter({ hasOverflow, canScrollLeft, canScrollRight });
  };

  useEffect(() => {
    const checkAll = () => {
      if (pcuTableRef.current) updateScrollState(pcuTableRef.current, setPcuScroll);
      if (herbsTableRef.current) updateScrollState(herbsTableRef.current, setHerbsScroll);
    };
    checkAll();
    window.addEventListener('resize', checkAll);
    const timer = setTimeout(checkAll, 200);
    return () => {
      window.removeEventListener('resize', checkAll);
      clearTimeout(timer);
    };
  }, [activeSubTab, filteredPcuItems.length, filteredHerbsItems.length, fontSizeScale]);

  const handlePcuSort = (key) => {
    setPcuSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleHerbsSort = (key) => {
    setHerbsSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Sorted PCU items
  const sortedPcuItems = [...filteredPcuItems].sort((a, b) => {
    const dir = pcuSort.direction === 'asc' ? 1 : -1;
    switch (pcuSort.key) {
      case 'drugcode': {
        const numA = Number(a.drugcode);
        const numB = Number(b.drugcode);
        if (!isNaN(numA) && !isNaN(numB)) return (numA - numB) * dir;
        return String(a.drugcode || '').localeCompare(String(b.drugcode || ''), 'th') * dir;
      }
      case 'tradeName':
        return String(a.excelData?.tradeName || '').localeCompare(String(b.excelData?.tradeName || ''), 'th') * dir;
      case 'tmt':
        return String(a.excelData?.tmt || '').localeCompare(String(b.excelData?.tmt || '')) * dir;
      case 'ndc24':
        return String(a.excelData?.ndc24 || '').localeCompare(String(b.excelData?.ndc24 || '')) * dir;
      case 'price':
        return ((Number(a.excelData?.price) || 0) - (Number(b.excelData?.price) || 0)) * dir;
      case 'ised':
        return String(a.excelData?.ised || '').localeCompare(String(b.excelData?.ised || '')) * dir;
      case 'status':
        return String(a.status || '').localeCompare(String(b.status || '')) * dir;
      default:
        return 0;
    }
  });

  // Sorted Herbs items
  const sortedHerbsItems = [...filteredHerbsItems].sort((a, b) => {
    const dir = herbsSort.direction === 'asc' ? 1 : -1;
    switch (herbsSort.key) {
      case 'saraphiCode': {
        const numA = Number(a.saraphiCode);
        const numB = Number(b.saraphiCode);
        if (!isNaN(numA) && !isNaN(numB)) return (numA - numB) * dir;
        return String(a.saraphiCode || '').localeCompare(String(b.saraphiCode || ''), 'th') * dir;
      }
      case 'tradeName':
        return String(a.tradeName || '').localeCompare(String(b.tradeName || ''), 'th') * dir;
      case 'tmt':
        return String(a.tmt || '').localeCompare(String(b.tmt || '')) * dir;
      case 'price':
        return ((Number(a.price) || 0) - (Number(b.price) || 0)) * dir;
      case 'matchedDbDrug':
        return String(a.matchedDbDrug?.drugname || '').localeCompare(String(b.matchedDbDrug?.drugname || ''), 'th') * dir;
      case 'mappingStatus':
        return String(a.mappingStatus || '').localeCompare(String(b.mappingStatus || '')) * dir;
      default:
        return 0;
    }
  });

  // Pagination states
  const [pcuPageSize, setPcuPageSize] = useState(20);
  const [pcuCurrentPage, setPcuCurrentPage] = useState(1);

  const [herbsPageSize, setHerbsPageSize] = useState(20);
  const [herbsCurrentPage, setHerbsCurrentPage] = useState(1);

  // Reset page when filter or search changes
  useEffect(() => {
    setPcuCurrentPage(1);
  }, [pcuFilter, pcuSearch, selectedPcuFile]);

  useEffect(() => {
    setHerbsCurrentPage(1);
  }, [herbSearch, selectedHerbsFile]);

  // Paginated PCU items
  const pcuNumericSize = pcuPageSize === 'all' ? Math.max(1, sortedPcuItems.length) : (Number(pcuPageSize) || 20);
  const pcuTotalPages = pcuPageSize === 'all' || sortedPcuItems.length === 0 ? 1 : Math.ceil(sortedPcuItems.length / pcuNumericSize);
  const validPcuPage = Math.min(Math.max(1, pcuCurrentPage), pcuTotalPages);
  const pcuStartIndex = pcuPageSize === 'all' ? 0 : (validPcuPage - 1) * pcuNumericSize;
  const pcuEndIndex = pcuPageSize === 'all' ? sortedPcuItems.length : Math.min(pcuStartIndex + pcuNumericSize, sortedPcuItems.length);
  const paginatedPcuItems = sortedPcuItems.slice(pcuStartIndex, pcuEndIndex);

  // Paginated Herbs items
  const herbsNumericSize = herbsPageSize === 'all' ? Math.max(1, sortedHerbsItems.length) : (Number(herbsPageSize) || 20);
  const herbsTotalPages = herbsPageSize === 'all' || sortedHerbsItems.length === 0 ? 1 : Math.ceil(sortedHerbsItems.length / herbsNumericSize);
  const validHerbsPage = Math.min(Math.max(1, herbsCurrentPage), herbsTotalPages);
  const herbsStartIndex = herbsPageSize === 'all' ? 0 : (validHerbsPage - 1) * herbsNumericSize;
  const herbsEndIndex = herbsPageSize === 'all' ? sortedHerbsItems.length : Math.min(herbsStartIndex + herbsNumericSize, sortedHerbsItems.length);
  const paginatedHerbsItems = sortedHerbsItems.slice(herbsStartIndex, herbsEndIndex);

  const renderSortableHeader = (label, sortKey, currentSort, onSort, align = 'left', extraClass = '') => {
    const isActive = currentSort.key === sortKey;
    return (
      <th
        onClick={() => onSort(sortKey)}
        className={`${fs.tableTh} ${extraClass} cursor-pointer select-none hover:bg-slate-100 transition-colors group`}
        title={`คลิกเพื่อเรียงลำดับตาม ${label}`}
      >
        <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
          <span>{label}</span>
          <span className="text-slate-400 group-hover:text-slate-700 transition-colors shrink-0">
            {isActive ? (
              currentSort.direction === 'asc' ? (
                <ArrowUp className="w-3.5 h-3.5 text-blue-600 stroke-[2.5]" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5 text-blue-600 stroke-[2.5]" />
              )
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-40 group-hover:opacity-100" />
            )}
          </span>
        </div>
      </th>
    );
  };

  const renderScrollHint = (scrollState, tableRef, label = 'ตาราง') => {
    if (!scrollState.hasOverflow) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-amber-50/90 border border-amber-200/90 rounded-xl text-xs text-amber-900 shadow-2xs mb-2">
        <div className="flex items-center gap-2 font-medium">
          <span className="text-base animate-pulse">👉</span>
          <span>
            {label}มีข้อมูลกว้างกว่าจอแสดงผล: <strong>เลื่อนตารางไปทางขวา</strong> เพื่อดูคอลัมภ์เพิ่มเติม (หรือกดปุ่มเลื่อนด้านขวา)
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={!scrollState.canScrollLeft}
            onClick={() => tableRef.current?.scrollBy({ left: -260, behavior: 'smooth' })}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all ${
              scrollState.canScrollLeft
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-2xs cursor-pointer'
                : 'opacity-40 cursor-not-allowed text-slate-400 border-transparent'
            }`}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>ซ้าย</span>
          </button>
          <button
            type="button"
            disabled={!scrollState.canScrollRight}
            onClick={() => tableRef.current?.scrollBy({ left: 260, behavior: 'smooth' })}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all ${
              scrollState.canScrollRight
                ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700 shadow-2xs cursor-pointer'
                : 'opacity-40 cursor-not-allowed text-slate-400 border-transparent'
            }`}
          >
            <span>ขวา</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full px-2 sm:px-4 md:px-5 lg:px-6 xl:px-8 2xl:px-10 py-3 sm:py-5 space-y-4 sm:space-y-6 pb-16">
      
      {/* Top Banner / Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Pill className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl lg:text-2xl xl:text-3xl font-extrabold text-slate-900 tracking-tight">
                  ตรวจสอบและปรับปรุง Drug Catalogue
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs sm:text-sm font-bold border border-blue-200">
                  สปสช. &amp; รพ.แม่ข่าย
                </span>
              </div>
              <p className="text-xs sm:text-sm lg:text-base text-slate-500 mt-1">
                เปรียบเทียบข้อมูลยาที่ผ่านการอนุมัติ (Approved) กับตาราง <code className="text-blue-700 font-mono font-bold bg-blue-50 px-1 rounded">cdrug</code> ในฐานข้อมูล JHCIS
              </p>
            </div>
          </div>
        </div>

        {/* Font Size & Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 self-stretch lg:self-auto justify-end">
          {/* Quick Font Size Selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] sm:text-xs font-bold text-slate-500 px-2 flex items-center gap-1">
              <Type className="w-3.5 h-3.5 text-slate-600" />
              <span>ขนาดอักษร:</span>
            </span>
            <button
              type="button"
              onClick={() => handleSetFontSizeScale('normal')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                fontSizeScale === 'normal'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="ขนาดกะทัดรัด พอดีหน้าจอ เหมาะสำหรับแบ่งครึ่งจอ (แนะนำ)"
            >
              ก ปกติ (แนะนำ)
            </button>
            <button
              type="button"
              onClick={() => handleSetFontSizeScale('large')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                fontSizeScale === 'large'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="ขนาดใหญ่ สบายตา"
            >
              ก+ ใหญ่
            </button>
            <button
              type="button"
              onClick={() => handleSetFontSizeScale('xlarge')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                fontSizeScale === 'xlarge'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="ขนาดใหญ่พิเศษ เหมาะกับจอขนาดใหญ่หรือมองจากระยะไกล"
            >
              ก++ ขยาย
            </button>
          </div>

          <button
            onClick={() => { setUploadCategory('pcu_approved'); setShowUploadModal(true); }}
            className="flex items-center space-x-1.5 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
          >
            <UploadCloud className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>อัปโหลดไฟล์ Excel</span>
          </button>

          <button
            onClick={() => loadAllAuditData()}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 sm:px-3.5 py-2 sm:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-bold transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveSubTab('pcu')}
          className={`flex items-center space-x-2 px-4 sm:px-5 py-3 sm:py-3.5 border-b-2 font-bold text-sm sm:text-base lg:text-lg transition-all cursor-pointer shrink-0 ${
            activeSubTab === 'pcu'
              ? 'border-blue-600 text-blue-700 bg-blue-50/60 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
          <span>บัญชียา รพ.สต. {pcuAudit?.pcuCode ? `(${pcuAudit.pcuCode})` : ''}</span>
          {pcuAudit?.summary && (
            <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold">
              {pcuAudit.summary.total} รายการ
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('herbs')}
          className={`flex items-center space-x-2 px-4 sm:px-5 py-3 sm:py-3.5 border-b-2 font-bold text-sm sm:text-base lg:text-lg transition-all cursor-pointer shrink-0 ${
            activeSubTab === 'herbs'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/60 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Leaf className="w-4 h-4 sm:w-5 sm:h-5" />
          <span>ยา/สมุนไพร รพ.แม่ข่าย (CUP)</span>
          {herbsAudit?.summary && (
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs sm:text-sm font-bold">
              {herbsAudit.summary.total} รายการ
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('dtam')}
          className={`flex items-center space-x-2 px-4 sm:px-5 py-3 sm:py-3.5 border-b-2 font-bold text-sm sm:text-base lg:text-lg transition-all cursor-pointer shrink-0 ${
            activeSubTab === 'dtam'
              ? 'border-teal-600 text-teal-700 bg-teal-50/70 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Leaf className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
          <span>ตรวจรหัสสมุนไพร DTAM 24 หลัก</span>
          <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 text-xs sm:text-sm font-bold">
            แพทย์แผนไทย 44,541 รายการ
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('sql')}
          className={`flex items-center space-x-2 px-4 sm:px-5 py-3 sm:py-3.5 border-b-2 font-bold text-sm sm:text-base lg:text-lg transition-all cursor-pointer shrink-0 ${
            activeSubTab === 'sql'
              ? 'border-purple-600 text-purple-700 bg-purple-50/60 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileCode2 className="w-4 h-4 sm:w-5 sm:h-5" />
          <span>ชุดคำสั่ง SQL ปรับปรุงฐาน JHCIS</span>
          {sqlData && (
            <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs sm:text-sm font-bold">
              {sqlData.totalUpdates} คำสั่ง
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: PCU APPROVED */}
      {activeSubTab === 'pcu' && (
        <div className="space-y-4 sm:space-y-6">
          
          {/* File Selector Toolbar for PCU */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5 min-w-0">
                <span className="text-xs sm:text-sm lg:text-base font-bold text-slate-800 whitespace-nowrap">ไฟล์ที่กำลังตรวจสอบ:</span>
                <select
                  value={selectedPcuFile}
                  onChange={(e) => handleSelectPcuFile(e.target.value)}
                  className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 sm:py-2 text-xs sm:text-sm lg:text-base font-bold text-blue-950 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-full sm:max-w-[460px] lg:max-w-[560px] truncate shadow-2xs"
                >
                  {availableFiles.filter(f => f.type === 'pcu_approved').map(f => (
                    <option key={f.filename} value={f.filename}>
                      {f.filename} {f.itemCount ? `(${f.itemCount} รายการ)` : ''}
                    </option>
                  ))}
                  {availableFiles.filter(f => f.type === 'pcu_approved').length === 0 && (
                    <option value="">(ไม่พบไฟล์ PCU - กรุณากดอัปโหลดไฟล์)</option>
                  )}
                </select>
              </div>
            </div>
            <button
              onClick={() => { setUploadCategory('pcu_approved'); setShowUploadModal(true); }}
              className="flex items-center space-x-1.5 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm lg:text-base font-bold shrink-0 self-end sm:self-auto cursor-pointer transition-colors shadow-2xs"
            >
              <Plus className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              <span>อัปโหลดไฟล์ รพ.สต. ใหม่</span>
            </button>
          </div>
          
          {/* Summary Cards */}
          {pcuAudit?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              <div className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-slate-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform flex flex-col justify-between">
                <span className={fs.cardTitle}>ยาทั้งหมดในไฟล์</span>
                <div className={`${fs.cardNumber} text-slate-900 mt-1 sm:mt-2`}>
                  {pcuAudit.summary.total} <span className={fs.cardUnit}>รายการ</span>
                </div>
              </div>

              <div className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-blue-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform flex flex-col justify-between">
                <span className={fs.cardTitle}>ตรงใน JHCIS</span>
                <div className={`${fs.cardNumber} text-blue-600 mt-1 sm:mt-2`}>
                  {pcuAudit.summary.matched} <span className={fs.cardUnit}>({pcuAudit.summary.total > 0 ? ((pcuAudit.summary.matched/pcuAudit.summary.total)*100).toFixed(0) : 0}%)</span>
                </div>
              </div>

              <div className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-emerald-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform flex flex-col justify-between">
                <span className={fs.cardTitle}>ตรงกันสมบูรณ์</span>
                <div className={`${fs.cardNumber} text-emerald-600 mt-1 sm:mt-2`}>
                  {pcuAudit.summary.completeMatch} <span className={fs.cardUnit}>รายการ</span>
                </div>
              </div>

              <div className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-amber-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform flex flex-col justify-between">
                <span className={`${fs.cardTitle} !text-amber-700`}>TMT ไม่ตรง/ว่าง</span>
                <div className={`${fs.cardNumber} text-amber-600 mt-1 sm:mt-2`}>
                  {pcuAudit.summary.tmtDiscrepancies} <span className={fs.cardUnit}>รายการ</span>
                </div>
              </div>

              <div className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-amber-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform flex flex-col justify-between">
                <span className={`${fs.cardTitle} !text-amber-700`}>ราคาไม่ตรงกัน</span>
                <div className={`${fs.cardNumber} text-amber-600 mt-1 sm:mt-2`}>
                  {pcuAudit.summary.priceDiscrepancies} <span className={fs.cardUnit}>รายการ</span>
                </div>
              </div>

              <div className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-rose-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform flex flex-col justify-between">
                <span className={`${fs.cardTitle} !text-rose-700`}>ไม่พบใน JHCIS</span>
                <div className={`${fs.cardNumber} text-rose-600 mt-1 sm:mt-2`}>
                  {pcuAudit.summary.missingInDb} <span className={fs.cardUnit}>รายการ</span>
                </div>
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row justify-between items-center gap-3.5">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <button
                onClick={() => setPcuFilter('all')}
                className={`${fs.filterBtn} transition-all cursor-pointer ${
                  pcuFilter === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                ทั้งหมด ({pcuAudit?.summary?.total || 0})
              </button>
              <button
                onClick={() => setPcuFilter('discrepancy')}
                className={`${fs.filterBtn} transition-all cursor-pointer ${
                  pcuFilter === 'discrepancy' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60'
                }`}
              >
                ข้อมูลไม่ตรงกัน ({pcuAudit ? (pcuAudit.summary.matched - pcuAudit.summary.completeMatch) : 0})
              </button>
              <button
                onClick={() => setPcuFilter('complete')}
                className={`${fs.filterBtn} transition-all cursor-pointer ${
                  pcuFilter === 'complete' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/60'
                }`}
              >
                ตรงกันสมบูรณ์ ({pcuAudit?.summary?.completeMatch || 0})
              </button>
              <button
                onClick={() => setPcuFilter('missing')}
                className={`${fs.filterBtn} transition-all cursor-pointer ${
                  pcuFilter === 'missing' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
                }`}
              >
                ไม่พบใน JHCIS ({pcuAudit?.summary?.missingInDb || 0})
              </button>
            </div>

            <div className="relative w-full md:w-80 lg:w-96">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ค้นหารหัสยา หรือชื่อยา..."
                value={pcuSearch}
                onChange={(e) => setPcuSearch(e.target.value)}
                className={`w-full ${fs.searchInput} bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-medium`}
              />
            </div>
          </div>

          {/* Scroll Hint & Quick Scroll Controls */}
          {renderScrollHint(pcuScroll, pcuTableRef, 'ตาราง Drug Catalogue')}

          {/* Top Pagination Bar */}
          <PaginationBar
            currentPage={validPcuPage}
            pageSize={pcuPageSize}
            totalItems={sortedPcuItems.length}
            onPageChange={setPcuCurrentPage}
            onPageSizeChange={(sz) => { setPcuPageSize(sz); setPcuCurrentPage(1); }}
            colorTheme="blue"
            position="top"
          />

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div 
              ref={pcuTableRef} 
              onScroll={() => updateScrollState(pcuTableRef.current, setPcuScroll)}
              className="overflow-x-auto table-responsive table-scroll-visible max-h-[calc(100vh-220px)] overflow-y-auto"
            >
              <table className={`w-full text-left ${fs.table}`}>
                <thead className="bg-slate-50/90 text-slate-800 border-b border-slate-200 sticky top-0 z-10 backdrop-blur-xs">
                  <tr>
                    {renderSortableHeader('รหัสยา (Drug Code)', 'drugcode', pcuSort, handlePcuSort, 'left', 'whitespace-nowrap w-20 sm:w-24')}
                    {renderSortableHeader('ชื่อยา (การค้า / สามัญ)', 'tradeName', pcuSort, handlePcuSort, 'left', 'min-w-[130px] max-w-[210px]')}
                    {renderSortableHeader('รหัส TMT', 'tmt', pcuSort, handlePcuSort, 'left', 'whitespace-nowrap w-24 sm:w-28')}
                    {renderSortableHeader('รหัส 24 หลัก (NDC24)', 'ndc24', pcuSort, handlePcuSort, 'left', 'whitespace-nowrap min-w-[200px] w-52 sm:w-56')}
                    {renderSortableHeader('ราคาต่อหน่วย', 'price', pcuSort, handlePcuSort, 'right', 'whitespace-nowrap w-24')}
                    {renderSortableHeader('บัญชียาหลัก', 'ised', pcuSort, handlePcuSort, 'center', 'whitespace-nowrap w-20 sm:w-24')}
                    {renderSortableHeader('สถานะความต่าง', 'status', pcuSort, handlePcuSort, 'left', 'min-w-[150px]')}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedPcuItems.map((item, idx) => {
                    const isMissing = item.status === 'missing_in_db';
                    const isDiff = item.status === 'discrepancy';

                    return (
                      <tr key={idx} className="hover:bg-slate-50/90 transition-colors">
                        
                        {/* Drug Code */}
                        <td className={`${fs.tableTd} font-mono font-bold text-slate-900 whitespace-nowrap`}>
                          {item.drugcode}
                        </td>

                        {/* Drug Name */}
                        <td className={`${fs.tableTd} max-w-[210px]`}>
                          <div className={`${fs.tradeName} break-words`}>
                            {item.excelData.tradeName}
                          </div>
                          <div className={`${fs.genericName} mt-0.5 break-words line-clamp-2`} title={item.excelData.genericName}>
                            {item.excelData.genericName}
                          </div>
                          {item.dbData && item.dbData.drugname !== item.excelData.tradeName && (
                            <div className={`${fs.jhcisName} mt-1 break-words`} title={item.dbData.drugname}>
                              JHCIS: {item.dbData.drugname}
                            </div>
                          )}
                        </td>

                        {/* TMT Code */}
                        <td className={`${fs.tableTd} whitespace-nowrap font-mono`}>
                          {isMissing ? (
                            <span className="text-slate-400 font-mono">{item.excelData.tmt || '-'}</span>
                          ) : item.flags.tmtMatch ? (
                            <span className={`text-emerald-800 bg-emerald-50 rounded-lg border border-emerald-300 ${fs.badge}`}>
                              {item.excelData.tmt || '-'}
                            </span>
                          ) : (
                            <div>
                              <div className={`text-amber-900 bg-amber-50 rounded-lg border border-amber-300 ${fs.badge}`}>
                                Drug Catalogue: {item.excelData.tmt || '-'}
                              </div>
                              <div className={`${fs.subText} mt-1`}>
                                JHCIS: {item.dbData?.tmt || 'ว่าง'}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* NDC24 (แสดงเต็มจำนวน 24 หลัก ไม่ตัดย่อ) */}
                        <td className={`${fs.tableTd} whitespace-nowrap`}>
                          {isMissing ? (
                            <span className="text-slate-400 font-mono text-[11px] sm:text-xs tracking-tighter select-all">
                              {item.excelData.ndc24 || '-'}
                            </span>
                          ) : item.flags.ndcMatch ? (
                            <span
                              className="text-emerald-800 bg-emerald-50 rounded-md border border-emerald-300 px-1.5 py-0.5 font-mono text-[11px] sm:text-xs tracking-tighter font-bold inline-block select-all"
                              title={`รหัส 24 หลักตรงกัน: ${item.excelData.ndc24}`}
                            >
                              {item.excelData.ndc24 || '-'}
                            </span>
                          ) : (
                            <div className="space-y-1">
                              <div>
                                <span
                                  className="text-amber-900 bg-amber-50 rounded-md border border-amber-300 px-1.5 py-0.5 font-mono text-[11px] sm:text-xs tracking-tighter font-bold inline-block select-all"
                                  title={`Drug Catalogue: ${item.excelData.ndc24 || 'ไม่มี'}`}
                                >
                                  {item.excelData.ndc24 || '-'}
                                </span>
                              </div>
                              <div
                                className="text-[10px] text-slate-500 font-mono tracking-tighter select-all"
                                title={`JHCIS: ${item.dbData?.ndc24 || 'ว่าง'}`}
                              >
                                {item.dbData?.ndc24 ? `JHCIS: ${item.dbData.ndc24}` : 'JHCIS: ว่าง'}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Price */}
                        <td className={`${fs.tableTd} text-right whitespace-nowrap`}>
                          {isMissing ? (
                            <span className={`${fs.price} text-slate-600`}>{item.excelData.price.toFixed(2)}</span>
                          ) : item.flags.priceMatch ? (
                            <span className={`${fs.price} text-emerald-700`}>
                              {item.excelData.price.toFixed(2)}
                            </span>
                          ) : (
                            <div>
                              <div className={`text-amber-800 bg-amber-50 rounded-lg border border-amber-200 inline-block ${fs.badge}`}>
                                Drug Catalogue: {item.excelData.price.toFixed(2)}
                              </div>
                              <div className={`${fs.subText} mt-1`}>
                                JHCIS: {item.dbData?.price.toFixed(2)}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* ISED */}
                        <td className={`${fs.tableTd} text-center whitespace-nowrap font-mono`}>
                          {item.excelData.ised === 'E' ? (
                            <span className={`bg-blue-50 text-blue-700 border border-blue-200 rounded-lg ${fs.badge}`}>
                              ในบัญชี (E)
                            </span>
                          ) : (
                            <span className={`bg-slate-100 text-slate-600 rounded-lg ${fs.badge}`}>
                              {item.excelData.ised || '-'}
                            </span>
                          )}
                        </td>

                        {/* Discrepancies Details */}
                        <td className={fs.tableTd}>
                          {isMissing ? (
                            <span className={`inline-flex items-center text-rose-700 bg-rose-50 border border-rose-200 rounded-lg ${fs.badge}`}>
                              <XCircle className="w-4 h-4 mr-1.5 shrink-0" /> ไม่พบในตาราง cdrug
                            </span>
                          ) : item.discrepancies.length === 0 ? (
                            <span className={`inline-flex items-center text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg ${fs.badge}`}>
                              <CheckCircle2 className="w-4 h-4 mr-1.5 shrink-0" /> ตรงกันสมบูรณ์
                            </span>
                          ) : (
                            <div className="space-y-1">
                              {item.discrepancies.map((d, dIdx) => (
                                <div key={dIdx} className={`${fs.discrepancy} text-amber-900 flex items-start font-medium`}>
                                  <AlertTriangle className="w-4 h-4 text-amber-600 mr-1.5 shrink-0 mt-0.5" />
                                  <span>{d}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Pagination Bar */}
          <PaginationBar
            currentPage={validPcuPage}
            pageSize={pcuPageSize}
            totalItems={sortedPcuItems.length}
            onPageChange={setPcuCurrentPage}
            onPageSizeChange={(sz) => { setPcuPageSize(sz); setPcuCurrentPage(1); }}
            colorTheme="blue"
            position="bottom"
          />

        </div>
      )}

      {/* TAB 2: HOSPITAL / CUP HERBS */}
      {activeSubTab === 'herbs' && (
        <div className="space-y-4 sm:space-y-6">
          
          {/* File Selector Toolbar for Herbs / Hospital */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Leaf className="w-4 h-4 sm:w-5 h-5" />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5 min-w-0">
                <span className="text-xs sm:text-sm lg:text-base font-bold text-slate-800 whitespace-nowrap">ไฟล์ยา/สมุนไพร รพ.:</span>
                <select
                  value={selectedHerbsFile}
                  onChange={(e) => handleSelectHerbsFile(e.target.value)}
                  className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 sm:py-2 text-xs sm:text-sm lg:text-base font-bold text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500 max-w-full sm:max-w-[460px] lg:max-w-[560px] truncate shadow-2xs"
                >
                  {availableFiles.filter(f => f.type === 'saraphi_herbs' || f.type === 'hospital_shared').map(f => (
                    <option key={f.filename} value={f.filename}>
                      {f.filename} {f.itemCount ? `(${f.itemCount} รายการ)` : ''}
                    </option>
                  ))}
                  {availableFiles.filter(f => f.type === 'saraphi_herbs' || f.type === 'hospital_shared').length === 0 && (
                    <option value="">(ไม่พบไฟล์ยา รพ. - กรุณากดอัปโหลดไฟล์)</option>
                  )}
                </select>
              </div>
            </div>
            <button
              onClick={() => { setUploadCategory('hospital_herbs'); setShowUploadModal(true); }}
              className="flex items-center space-x-1.5 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm lg:text-base font-bold shrink-0 self-end sm:self-auto cursor-pointer transition-colors shadow-2xs"
            >
              <Plus className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              <span>อัปโหลดไฟล์ รพ. เพิ่ม</span>
            </button>
          </div>

          {/* Explanation Banner */}
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 sm:p-5 flex items-start space-x-3.5">
            <Leaf className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm lg:text-base text-emerald-950 leading-relaxed">
              <strong className="font-extrabold text-sm sm:text-base lg:text-lg block mb-1">
                มาตรฐานยาสมุนไพร/ยา จาก รพ.แม่ข่าย (CUP)
              </strong>
              รพ.แม่ข่าย ส่งรายการยาสมุนไพรที่ได้รับการอนุมัติ (Approved) จาก Drug Catalogue สปสช. มาให้ รพ.สต. เพื่อให้ใช้รหัส TMT, รหัส 24 หลัก และราคากลางเดียวกัน 
              โดยระบบได้ทำการจับคู่ (Map) กับยาในฐานข้อมูล JHCIS ของ รพ.สต. ให้โดยอัตโนมัติ
            </div>
          </div>

          {/* Herbs KPI Cards */}
          {herbsAudit?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-slate-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform flex flex-col justify-between">
                <span className={fs.cardTitle}>ยาสมุนไพรทั้งหมด</span>
                <div className={`${fs.cardNumber} text-slate-900 mt-1 sm:mt-2`}>
                  {herbsAudit.summary.total} <span className={fs.cardUnit}>รายการ</span>
                </div>
              </div>

              <div className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-emerald-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform flex flex-col justify-between">
                <span className={`${fs.cardTitle} !text-emerald-700`}>TMT ตรงกันเป๊ะ</span>
                <div className={`${fs.cardNumber} text-emerald-600 mt-1 sm:mt-2`}>
                  {herbsAudit.summary.tmtMatched} <span className={fs.cardUnit}>รายการ</span>
                </div>
              </div>

              <div className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-amber-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform flex flex-col justify-between">
                <span className={`${fs.cardTitle} !text-amber-700`}>ชื่อตรงกัน (ต้องอัปเดต TMT)</span>
                <div className={`${fs.cardNumber} text-amber-600 mt-1 sm:mt-2`}>
                  {herbsAudit.summary.nameMatchedNeedsTmt} <span className={fs.cardUnit}>รายการ</span>
                </div>
              </div>

              <div className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-rose-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform flex flex-col justify-between">
                <span className={`${fs.cardTitle} !text-rose-700`}>ยาใหม่ที่ รพ.สต. ยังไม่มี</span>
                <div className={`${fs.cardNumber} text-rose-600 mt-1 sm:mt-2`}>
                  {herbsAudit.summary.newToImport} <span className={fs.cardUnit}>รายการ</span>
                </div>
              </div>
            </div>
          )}

          {/* Herbs Search */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ค้นหายาสมุนไพร หรือรหัส TMT..."
                value={herbSearch}
                onChange={(e) => setHerbSearch(e.target.value)}
                className={`w-full ${fs.searchInput} bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium`}
              />
            </div>
            <div className="text-xs sm:text-sm lg:text-base text-slate-600 font-medium">
              แสดง <strong className="text-slate-900">{filteredHerbsItems.length}</strong> จาก {herbsAudit?.summary?.total || 22} รายการ
            </div>
          </div>

          {/* Scroll Hint & Quick Scroll Controls */}
          {renderScrollHint(herbsScroll, herbsTableRef, 'ตารางยาสมุนไพรแม่ข่าย')}

          {/* Top Pagination Bar */}
          <PaginationBar
            currentPage={validHerbsPage}
            pageSize={herbsPageSize}
            totalItems={sortedHerbsItems.length}
            onPageChange={setHerbsCurrentPage}
            onPageSizeChange={(sz) => { setHerbsPageSize(sz); setHerbsCurrentPage(1); }}
            colorTheme="emerald"
            position="top"
          />

          {/* Herbs Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div 
              ref={herbsTableRef} 
              onScroll={() => updateScrollState(herbsTableRef.current, setHerbsScroll)}
              className="overflow-x-auto table-responsive table-scroll-visible max-h-[calc(100vh-220px)] overflow-y-auto"
            >
              <table className={`w-full text-left ${fs.table}`}>
                <thead className="bg-slate-50/90 text-slate-800 border-b border-slate-200 sticky top-0 z-10 backdrop-blur-xs">
                  <tr>
                    {renderSortableHeader('รหัส รพ.แม่ข่าย', 'saraphiCode', herbsSort, handleHerbsSort, 'left', 'whitespace-nowrap w-24 sm:w-28')}
                    {renderSortableHeader('ชื่อยาสมุนไพร', 'tradeName', herbsSort, handleHerbsSort, 'left', 'min-w-[170px] max-w-[260px]')}
                    {renderSortableHeader('รหัส TMT', 'tmt', herbsSort, handleHerbsSort, 'left', 'whitespace-nowrap w-28')}
                    {renderSortableHeader('ราคากลาง', 'price', herbsSort, handleHerbsSort, 'right', 'whitespace-nowrap w-24')}
                    {renderSortableHeader('ยาใน JHCIS รพ.สต. ที่จับคู่ได้', 'matchedDbDrug', herbsSort, handleHerbsSort, 'left', 'min-w-[170px] max-w-[260px]')}
                    {renderSortableHeader('สถานะการเชื่อมโยง', 'mappingStatus', herbsSort, handleHerbsSort, 'left', 'whitespace-nowrap w-36')}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedHerbsItems.map((h, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/90 transition-colors">
                      
                      {/* Code */}
                      <td className={`${fs.tableTd} font-mono font-bold text-slate-900 whitespace-nowrap`}>
                        {h.saraphiCode}
                      </td>

                      {/* Name */}
                      <td className={fs.tableTd}>
                        <div className={fs.tradeName}>
                          {h.tradeName}
                        </div>
                        <div className={`${fs.genericName} mt-1`}>
                          {h.genericName} • {h.strength || h.dosageForm}
                        </div>
                      </td>

                      {/* TMT */}
                      <td className={`${fs.tableTd} whitespace-nowrap font-mono`}>
                        {h.mappingStatus === 'name_matched_needs_tmt' ? (
                          <div>
                            <div className={`text-amber-900 bg-amber-50 rounded-lg border border-amber-300 inline-block ${fs.badge}`}>
                              TMT แม่ข่าย: {h.tmt || '-'}
                            </div>
                            <div className={`${fs.subText} mt-1 font-semibold`}>
                              TMT JHCIS: {h.matchedDbDrug?.tmtcode || 'ว่าง'}
                            </div>
                          </div>
                        ) : (
                          <span className={`bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg ${fs.badge}`}>
                            {h.tmt || '-'}
                          </span>
                        )}
                      </td>

                      {/* Price */}
                      <td className={`${fs.tableTd} text-right whitespace-nowrap font-mono font-bold text-slate-900 ${fs.price}`}>
                        {h.price.toFixed(2)} บาท
                      </td>

                      {/* Matched in JHCIS */}
                      <td className={fs.tableTd}>
                        {h.matchedDbDrug ? (
                          <div>
                            <div className={`${fs.tradeName} !text-slate-800`}>
                              {h.matchedDbDrug.drugname}
                            </div>
                            <div className={`${fs.jhcisName} mt-1`}>
                              รหัส: {h.matchedDbDrug.drugcode} | TMT: {h.matchedDbDrug.tmtcode || 'ว่าง'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-xs sm:text-sm">
                            - ยังไม่มีรายการยานี้ในฐาน JHCIS -
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className={`${fs.tableTd} whitespace-nowrap`}>
                        {h.mappingStatus === 'tmt_matched' || h.mappingStatus === 'code_matched' ? (
                          <span className={`inline-flex items-center text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg ${fs.badge}`}>
                            <CheckCircle2 className="w-4 h-4 mr-1.5 shrink-0" /> {h.mappingLabel}
                          </span>
                        ) : h.mappingStatus === 'name_matched_needs_tmt' ? (
                          <span className={`inline-flex items-center text-amber-800 bg-amber-50 border border-amber-200 rounded-lg ${fs.badge}`}>
                            <AlertTriangle className="w-4 h-4 mr-1.5 shrink-0" /> {h.mappingLabel}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center text-rose-700 bg-rose-50 border border-rose-200 rounded-lg ${fs.badge}`}>
                            <Sparkles className="w-4 h-4 mr-1.5 shrink-0" /> ยาใหม่ (แนะนำเพิ่มเข้าระบบ)
                          </span>
                        )}
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Pagination Bar */}
          <PaginationBar
            currentPage={validHerbsPage}
            pageSize={herbsPageSize}
            totalItems={sortedHerbsItems.length}
            onPageChange={setHerbsCurrentPage}
            onPageSizeChange={(sz) => { setHerbsPageSize(sz); setHerbsCurrentPage(1); }}
            colorTheme="emerald"
            position="bottom"
          />

        </div>
      )}

      {/* TAB: DTAM TRADITIONAL & HERBAL 24-DIGIT REGISTRY */}
      {activeSubTab === 'dtam' && (
        <DtamHerbalAuditTab fs={fs} onSwitchToSqlTab={() => setActiveSubTab('sql')} />
      )}

      {/* TAB 3: SQL SYNC GENERATOR */}
      {activeSubTab === 'sql' && (
        <div className="space-y-6">
          
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 shadow-2xs space-y-5">
            <div>
              <h2 className="text-lg sm:text-xl lg:text-2xl font-extrabold text-slate-900 flex items-center space-x-2.5">
                <Database className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
                <span>ตัวสร้างชุดคำสั่ง SQL ปรับปรุงฐานข้อมูล JHCIS (cdrug)</span>
              </h2>
              <p className="text-xs sm:text-sm lg:text-base text-slate-500 mt-1">
                สร้างสคริปต์คำสั่ง SQL UPDATE ที่ปลอดภัย 100% พร้อมคำสั่งสำรองข้อมูล (Backup Table) อัตโนมัติก่อนรัน
              </p>
            </div>

            {/* Checkbox Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200">
              <label className="flex items-center space-x-2.5 text-xs sm:text-sm lg:text-base font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sqlOptions.updateTmt}
                  onChange={(e) => {
                    const updated = { ...sqlOptions, updateTmt: e.target.checked };
                    setSqlOptions(updated);
                    handleGenerateSql(updated);
                  }}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <span>อัปเดตรหัส TMT ({pcuAudit?.summary?.tmtDiscrepancies || 0})</span>
              </label>

              <label className="flex items-center space-x-2.5 text-xs sm:text-sm lg:text-base font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sqlOptions.updatePrice}
                  onChange={(e) => {
                    const updated = { ...sqlOptions, updatePrice: e.target.checked };
                    setSqlOptions(updated);
                    handleGenerateSql(updated);
                  }}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <span>อัปเดตราคาต่อหน่วย ({pcuAudit?.summary?.priceDiscrepancies || 0})</span>
              </label>

              <label className="flex items-center space-x-2.5 text-xs sm:text-sm lg:text-base font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sqlOptions.updateNdc}
                  onChange={(e) => {
                    const updated = { ...sqlOptions, updateNdc: e.target.checked };
                    setSqlOptions(updated);
                    handleGenerateSql(updated);
                  }}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <span>อัปเดตรหัส 24 หลัก ({pcuAudit?.summary?.ndcDiscrepancies || 0})</span>
              </label>

              <label className="flex items-center space-x-2.5 text-xs sm:text-sm lg:text-base font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sqlOptions.updateIsed}
                  onChange={(e) => {
                    const updated = { ...sqlOptions, updateIsed: e.target.checked };
                    setSqlOptions(updated);
                    handleGenerateSql(updated);
                  }}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <span>อัปเดตบัญชียาหลัก (ISED)</span>
              </label>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2">
              <div className="text-xs sm:text-sm lg:text-base text-slate-600">
                รวมคำสั่งอัปเดตทั้งหมด: <strong className="text-purple-700 font-extrabold font-mono text-sm sm:text-base lg:text-lg">{sqlData?.totalUpdates || 0}</strong> รายการ | ตารางสำรอง: <code className="text-slate-800 font-mono font-bold bg-slate-100 px-2 py-0.5 rounded-md">{sqlData?.backupTable || 'cdrug_backup'}</code>
              </div>
              <div className="flex items-center space-x-2.5 self-end sm:self-auto">
                <button
                  onClick={handleCopySql}
                  className="flex items-center space-x-1.5 px-3.5 sm:px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'คัดลอกสำเร็จ!' : 'คัดลอก SQL'}</span>
                </button>
                <button
                  onClick={handleDownloadSql}
                  className="flex items-center space-x-1.5 px-3.5 sm:px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors shadow-2xs cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>ดาวน์โหลดไฟล์ .sql</span>
                </button>
              </div>
            </div>

            {/* Code Box */}
            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 sm:p-5 rounded-2xl text-xs sm:text-sm font-mono overflow-x-auto max-h-[500px] leading-relaxed border border-slate-800">
                {sqlData?.sql || '-- กำลังสร้างชุดคำสั่ง...'}
              </pre>
            </div>

          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 sm:p-7 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs">
                  <UploadCloud className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base sm:text-lg lg:text-xl">อัปโหลดไฟล์ Drug Catalogue</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">รองรับไฟล์ Excel (.xls, .xlsx) หรือ JSON จากระบบ e-Claim</p>
                </div>
              </div>
              <button
                onClick={() => { setShowUploadModal(false); setUploadError(null); setUploadSuccess(null); }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category Selector */}
            <div className="space-y-2.5">
              <label className="text-xs sm:text-sm font-bold text-slate-800">ระบุประเภทของไฟล์ที่ต้องการอัปโหลด:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className={`flex items-start space-x-2.5 p-3.5 rounded-2xl border text-xs sm:text-sm cursor-pointer transition-all ${
                  uploadCategory === 'pcu_approved'
                    ? 'border-blue-500 bg-blue-50/70 text-blue-950 font-bold shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="catType"
                    checked={uploadCategory === 'pcu_approved'}
                    onChange={() => setUploadCategory('pcu_approved')}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                  />
                  <div>
                    <div className="font-bold">🏥 บัญชียา รพ.สต.</div>
                    <div className="text-xs text-slate-500 font-medium mt-0.5">ไฟล์อนุมัติ สปสช. (APPROVED_รหัสรพสต)</div>
                  </div>
                </label>

                <label className={`flex items-start space-x-2.5 p-3.5 rounded-2xl border text-xs sm:text-sm cursor-pointer transition-all ${
                  uploadCategory === 'hospital_herbs'
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-bold shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="catType"
                    checked={uploadCategory === 'hospital_herbs'}
                    onChange={() => setUploadCategory('hospital_herbs')}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500 cursor-pointer w-4 h-4"
                  />
                  <div>
                    <div className="font-bold">🌿 ยา/สมุนไพร รพ.แม่ข่าย</div>
                    <div className="text-xs text-slate-500 font-medium mt-0.5">ไฟล์ยาที่ได้รับจาก รพ.แม่ข่าย (CUP)</div>
                  </div>
                </label>
              </div>
            </div>

            {/* File Drop / Select Area */}
            <div className="relative border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-3xl p-6 sm:p-7 text-center bg-slate-50/50 hover:bg-blue-50/20 transition-all cursor-pointer">
              <input
                type="file"
                accept=".xls,.xlsx,.json,.csv"
                onChange={handleFileUpload}
                disabled={uploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="flex flex-col items-center space-y-2 pointer-events-none">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-2xs">
                  <FolderUp className="w-6 h-6" />
                </div>
                <div className="text-sm sm:text-base font-bold text-slate-800">
                  {uploading ? 'กำลังอัปโหลดและประมวลผลข้อมูล...' : 'คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่'}
                </div>
                <p className="text-xs text-slate-400">
                  ระบบจะอ่านหัวตารางและเลข 24 หลัก (NDC24) ให้ตรงเป๊ะโดยอัตโนมัติ
                </p>
              </div>
            </div>

            {/* Feedback alert */}
            {uploadSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm font-semibold flex items-center space-x-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{uploadSuccess}</span>
              </div>
            )}

            {uploadError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm font-semibold flex items-center space-x-2.5">
                <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Security note */}
            <div className="pt-2 border-t border-slate-100 flex items-center space-x-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>บันทึกและประมวลผลบนเครื่องนี้แบบ 100% On-Premise ไม่ส่งออกข้อมูลขึ้นอินเทอร์เน็ต (PDPA Compliance)</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
