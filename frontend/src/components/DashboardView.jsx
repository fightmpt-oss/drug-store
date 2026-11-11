import React, { useState, useEffect, useRef } from 'react';
import { 
  AlertOctagon, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Package, 
  Search, 
  Filter, 
  Calendar, 
  FileText, 
  ArrowUpDown, 
  ArrowUp,
  ArrowDown,
  RefreshCw, 
  TrendingDown, 
  ShieldAlert,
  Archive,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  Database,
  Users,
  Eye,
  Pill,
  Leaf,
  Syringe,
  Shield,
  Activity,
  Stethoscope,
  Info,
  XCircle,
  Folder,
  X,
  ClipboardCheck,
  Check,
  LogOut,
  User,
  Tag,
  Trash2,
  Plus,
  QrCode
} from 'lucide-react';
import { api } from '../services/api';
import { currentFiscalYear, prevFiscalYear } from '../utils/fiscalYear';
import PaginationBar from './PaginationBar';


// นิยามกลุ่มเวชภัณฑ์ JHCIS ทั้งหมดสำหรับ Dropdown ตัวเลือกหลายกลุ่ม (Multi-Select)
const ALL_JHCIS_CATEGORIES = [
  { id: '01', label: 'ยาแผนปัจจุบัน', icon: Pill, countKey: 'modernDrugs' },
  { id: '10', label: 'ยาสมุนไพร', icon: Leaf, countKey: 'herbalDrugs' },
  { id: '02', label: 'หัตถการ (02)', icon: Stethoscope, countKey: 'procedureDrugs' },
  { id: '05', label: 'วัคซีน', icon: Syringe, countKey: 'vaccineDrugs' },
  { id: '04', label: 'เวชภัณฑ์คุมกำเนิด', icon: Shield, countKey: 'contraceptiveDrugs' },
  { id: '03_11', label: 'เวชภัณฑ์มิใช่ยา/วัสดุ (03,11)', icon: Package, countKey: 'materialDrugs' },
  { id: 'antibio', label: 'ยาปฏิชีวนะ (Anti-Bio)', icon: AlertTriangle, countKey: 'antibioticDrugs' },
  { id: 'dental', label: 'ทันตกรรม', icon: Activity, countKey: 'dentalDrugs' },
  { id: '02_07', label: 'ค่าบริการ & ตรวจแล็ป (06,07)', icon: Activity, countKey: 'serviceItems' }
];

export default function DashboardView({
  user,
  onLogout,
  onOpenStockCard, 
  onOpenPatientDispense, 
  onNavigateToImport, 
  onNavigateToCount,
  onOpenSubstockQr,
  isSidebarPinned = false
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState(['01']); // Default to modern medicine '01' like JHCIS
  const [drugFlagFilter, setDrugFlagFilter] = useState('1'); // Default to '1:ใช้ยา' like JHCIS
  const [isFlagDropdownOpen, setIsFlagDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearchText, setCategorySearchText] = useState('');
  const flagDropdownRef = useRef(null);
  const categoryDropdownRef = useRef(null);

  // Click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (flagDropdownRef.current && !flagDropdownRef.current.contains(event.target)) {
        setIsFlagDropdownOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)) {
        setIsCategoryDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [dateRange, setDateRange] = useState(() => {
    const fy = currentFiscalYear();
    return { startDate: fy.startDate, endDate: fy.endDate };
  });

  // Table Density / Font Size Mode: 'compact' (A- กะทัดรัด), 'normal' (A ปกติ), 'large' (A+ สบายตา)
  const [tableDensity, setTableDensity] = useState(() => {
    try {
      const saved = localStorage.getItem('jhcis_table_density');
      if (saved && ['compact', 'normal', 'large'].includes(saved)) {
        return saved;
      }
      if (typeof window !== 'undefined' && (window.innerWidth < 1440 || isSidebarPinned)) {
        return 'compact';
      }
      return 'normal';
    } catch (e) {
      return 'compact';
    }
  });

  const handleSetDensity = (newDensity) => {
    setTableDensity(newDensity);
    try {
      localStorage.setItem('jhcis_table_density', newDensity);
    } catch (e) {}
  };

  const densityStyles = {
    compact: {
      tableText: 'text-[11px] leading-tight',
      headerPadding: 'py-1.5 px-1.5',
      cellPadding: 'py-1.5 px-1.5',
      filterInput: 'px-1 py-0.5 text-[10px]',
      filterSelect: 'px-0.5 py-0.5 text-[10px]',
      badge: 'text-[9px] px-1 py-0.2',
      codeText: 'text-[11px]',
      nameTitle: 'text-xs font-bold leading-snug',
      nameThai: 'text-[10px]',
      nameMeta: 'text-[9px] gap-1',
      actionBtn: 'px-1.5 py-0.5 text-[10px]',
      actionIcon: 'w-2.5 h-2.5',
      numText: 'text-[11px] font-mono font-bold'
    },
    normal: {
      tableText: 'text-xs sm:text-[12.5px] leading-normal',
      headerPadding: 'py-2 px-2',
      cellPadding: 'py-2 px-2',
      filterInput: 'px-1.5 py-1 text-[11px]',
      filterSelect: 'px-1 py-1 text-[10px]',
      badge: 'text-[10px] sm:text-[11px] px-1.5 py-0.5',
      codeText: 'text-xs sm:text-[13px]',
      nameTitle: 'text-xs sm:text-sm font-bold leading-snug',
      nameThai: 'text-[11px]',
      nameMeta: 'text-[10px] gap-1.5',
      actionBtn: 'px-1.5 py-1 text-[10px] sm:text-xs',
      actionIcon: 'w-3 h-3',
      numText: 'text-xs sm:text-sm font-mono font-bold'
    },
    large: {
      tableText: 'text-sm sm:text-[14.5px] leading-relaxed',
      headerPadding: 'py-2.5 px-2.5',
      cellPadding: 'py-2.5 px-2.5',
      filterInput: 'px-2 py-1 text-xs',
      filterSelect: 'px-1.5 py-1 text-xs',
      badge: 'text-xs px-2 py-0.5',
      codeText: 'text-sm sm:text-base',
      nameTitle: 'text-sm sm:text-base font-bold leading-snug',
      nameThai: 'text-xs sm:text-sm',
      nameMeta: 'text-[11px] gap-2',
      actionBtn: 'px-2 py-1.5 text-xs font-bold',
      actionIcon: 'w-3.5 h-3.5',
      numText: 'text-sm sm:text-base font-mono font-bold'
    }
  };

  const currentDensity = densityStyles[tableDensity] || densityStyles.compact;

  // Table Sorting State
  const [sortBy, setSortBy] = useState('default');
  const [sortOrder, setSortOrder] = useState('asc');

  // Quick Count State for Single Drug Popup (Supports Multi-Lot)
  const [quickCountDrug, setQuickCountDrug] = useState(null);
  const [quickCountLots, setQuickCountLots] = useState([
    { lotno: '', dateexpire: '', amount: '', costprice: '' }
  ]);
  const [savingQuickCount, setSavingQuickCount] = useState(false);
  const [quickToast, setQuickToast] = useState('');

  // Table Column Filters State
  const [showColumnFilters, setShowColumnFilters] = useState(true);
  const [colFilters, setColFilters] = useState({
    drugcode: '',
    drugname: '',
    drugtype: '',
    tmtcode: '',
    drugcode24: '',
    status: 'all',
    balance: 'all',
    dispensed: 'all',
    counted: 'all'
  });

  const drugTypeParam = selectedCategories.length === 0 || selectedCategories.length === ALL_JHCIS_CATEGORIES.length
    ? 'all'
    : selectedCategories.join(',');

  const loadData = async (targetPage = page, targetPageSize = pageSize) => {
    try {
      setLoading(true);
      const res = await api.getStockOverview({
        ...dateRange,
        statusFilter,
        drugTypeFilter: drugTypeParam,
        drugFlagFilter,
        search,
        page: targetPage,
        pageSize: targetPageSize,
        sortBy,
        sortOrder,
        col_drugcode: colFilters.drugcode,
        col_drugname: colFilters.drugname,
        col_drugtype: colFilters.drugtype,
        col_tmtcode: colFilters.tmtcode,
        col_drugcode24: colFilters.drugcode24,
        col_status: colFilters.status,
        col_balance: colFilters.balance,
        col_dispensed: colFilters.dispensed,
        col_counted: colFilters.counted
      });
      if (res.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Error fetching stock overview:', err);
    } finally {
      setLoading(false);
    }
  };

  // Debounced effect for search, column filters, and sorting
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadData(1, pageSize);
    }, 250);
    return () => clearTimeout(timer);
  }, [
    statusFilter, 
    drugTypeParam, 
    drugFlagFilter, 
    sortBy, 
    sortOrder, 
    colFilters.drugcode,
    colFilters.drugname,
    colFilters.drugtype,
    colFilters.tmtcode,
    colFilters.drugcode24,
    colFilters.status,
    colFilters.balance,
    colFilters.dispensed,
    colFilters.counted,
    dateRange.startDate, 
    dateRange.endDate
  ]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadData(1, pageSize);
  };

  const handleSort = (columnKey) => {
    let nextOrder = 'asc';
    if (sortBy === columnKey) {
      if (sortOrder === 'asc') {
        nextOrder = 'desc';
      } else if (sortOrder === 'desc') {
        setSortBy('default');
        setSortOrder('asc');
        setPage(1);
        return;
      }
    }
    setSortBy(columnKey);
    setSortOrder(nextOrder);
    setPage(1);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    loadData(newPage, pageSize);
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setPage(1);
    loadData(1, newSize);
  };

  const handleColFilterChange = (key, value) => {
    setColFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearAllColFilters = () => {
    setColFilters({
      drugcode: '',
      drugname: '',
      drugtype: '',
      tmtcode: '',
      drugcode24: '',
      status: 'all',
      balance: 'all',
      dispensed: 'all',
      counted: 'all'
    });
    setPage(1);
  };

  // Quick Count Modal Handlers (Multi-Lot Supported)
  const handleOpenQuickCount = (drug) => {
    setQuickCountDrug(drug);
    if (drug.countedDetails?.lots && drug.countedDetails.lots.length > 0) {
      setQuickCountLots(drug.countedDetails.lots.map(l => ({
        lotno: l.lotno || '',
        dateexpire: l.dateexpire || '',
        amount: l.amount !== undefined ? l.amount : '',
        costprice: l.costprice !== undefined ? l.costprice : (drug.costprice || 0)
      })));
    } else {
      setQuickCountLots([
        {
          amount: drug.isCounted ? drug.broughtForward : '',
          lotno: drug.countedDetails?.lotno || drug.activeLots?.[0]?.lotno || '',
          dateexpire: drug.countedDetails?.dateexpire || (drug.nearestExpDate ? drug.nearestExpDate : ''),
          costprice: drug.countedDetails?.costprice !== undefined ? drug.countedDetails.costprice : (drug.costprice || 0)
        }
      ]);
    }
  };

  const handleAddQuickLot = () => {
    setQuickCountLots(prev => [
      ...prev,
      {
        lotno: '',
        dateexpire: '',
        amount: '',
        costprice: quickCountDrug ? (Number(quickCountDrug.costprice) || 0) : 0
      }
    ]);
  };

  const handleRemoveQuickLot = (idx) => {
    if (quickCountLots.length <= 1) {
      setQuickCountLots([{
        lotno: '',
        dateexpire: '',
        amount: '',
        costprice: quickCountDrug ? (Number(quickCountDrug.costprice) || 0) : 0
      }]);
      return;
    }
    setQuickCountLots(prev => prev.filter((_, i) => i !== idx));
  };

  const handleQuickLotChange = (idx, field, val) => {
    setQuickCountLots(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const handleSaveQuickCount = async (e) => {
    e.preventDefault();
    if (!quickCountDrug) return;

    const validLots = quickCountLots.filter(l => l.amount !== '' && !isNaN(Number(l.amount)));
    if (validLots.length === 0) {
      alert('กรุณากรอกจำนวนที่นับได้ในอย่างน้อย 1 Lot');
      return;
    }

    const totalAmount = validLots.reduce((sum, l) => sum + Number(l.amount), 0);
    const expDates = validLots.map(l => l.dateexpire).filter(Boolean).sort();
    const nearestExp = expDates[0] || '';
    const mainLotNo = validLots[0]?.lotno || '';
    const avgCost = validLots[0]?.costprice !== undefined ? Number(validLots[0].costprice) : (Number(quickCountDrug.costprice) || 0);

    setSavingQuickCount(true);
    try {
      const res = await api.saveInitialStockCount({
        drugcode: quickCountDrug.drugcode,
        drugname: quickCountDrug.drugname,
        amount: totalAmount,
        lotno: mainLotNo,
        dateexpire: nearestExp,
        costprice: avgCost,
        lots: validLots.map(l => ({
          lotno: l.lotno || '',
          dateexpire: l.dateexpire || '',
          amount: Number(l.amount),
          costprice: l.costprice !== '' ? Number(l.costprice) : (Number(quickCountDrug.costprice) || 0)
        })),
        countDate: new Date().toISOString().slice(0, 10),
        countedBy: 'เจ้าหน้าที่ รพ.สต.',
        remark: validLots.length > 1 ? `ตรวจนับ ${validLots.length} Lots จากแดชบอร์ด` : 'บันทึกด่วนจากแดชบอร์ด'
      });

      if (res.success) {
        setQuickToast(`บันทึกยอดยกมา: ${quickCountDrug.drugname} (รวม ${totalAmount} ${quickCountDrug.drugunit || 'หน่วย'}${validLots.length > 1 ? `, ${validLots.length} Lots` : ''}) เรียบร้อย`);
        setTimeout(() => setQuickToast(''), 3500);
        setQuickCountDrug(null);
        loadData(page, pageSize);
      } else {
        alert(res.message || 'บันทึกไม่สำเร็จ');
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSavingQuickCount(false);
    }
  };

  const hasActiveColFilters = Object.values(colFilters).some(v => v && v !== 'all');

  const setPresetRange = (preset) => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');

    if (preset === 'fy_current') {
      const fy = currentFiscalYear();
      setDateRange({ startDate: fy.startDate, endDate: fy.endDate });
    } else if (preset === 'fy_prev') {
      const pfy = prevFiscalYear();
      setDateRange({ startDate: pfy.startDate, endDate: pfy.endDate });
    } else if (preset === 'this_month') {
      setDateRange({
        startDate: `${yyyy}-${mm}-01`,
        endDate: `${yyyy}-${mm}-${dd}`
      });
    } else if (preset === 'last_3_months') {
      const past = new Date();
      past.setMonth(past.getMonth() - 2);
      past.setDate(1);
      const pYear = past.getFullYear();
      const pMonth = String(past.getMonth() + 1).padStart(2, '0');
      setDateRange({
        startDate: `${pYear}-${pMonth}-01`,
        endDate: `${yyyy}-${mm}-${dd}`
      });
    } else if (preset === 'ytd') {
      setDateRange({
        startDate: `${yyyy}-01-01`,
        endDate: `${yyyy}-${mm}-${dd}`
      });
    }
  };

  // ตรวจจับชื่อ Preset ปัจจุบัน สำหรับแสดงผลใน Dropdown
  const currentPreset = (() => {
    const fy = currentFiscalYear();
    const pfy = prevFiscalYear();
    if (dateRange.startDate === fy.startDate && dateRange.endDate === fy.endDate) return 'fy_current';
    if (dateRange.startDate === pfy.startDate && dateRange.endDate === pfy.endDate) return 'fy_prev';
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    if (dateRange.startDate === `${yyyy}-${mm}-01` && dateRange.endDate === `${yyyy}-${mm}-${dd}`) return 'this_month';
    if (dateRange.startDate === `${yyyy}-01-01` && dateRange.endDate === `${yyyy}-${mm}-${dd}`) return 'ytd';
    return 'custom';
  })();

  const summary = data?.summaryCounts || {
    totalDrugs: 0,
    activeDrugs: 0,
    inactiveDrugs: 0,
    modernDrugs: 0,
    herbalDrugs: 0,
    vaccineDrugs: 0,
    antibioticDrugs: 0,
    dentalDrugs: 0,
    lowStock: 0,
    nearExpiry: 0,
    expired: 0,
    deadStock: 0,
    normal: 0
  };

  // กลุ่มเวชภัณฑ์พร้อมจำนวนนับตามสถานะที่เลือก
  const selectableCategories = ALL_JHCIS_CATEGORIES.map(cat => ({
    ...cat,
    count: summary[cat.countKey] || 0
  }));

  const toggleCategory = (id) => {
    setSelectedCategories(prev => {
      if (prev.includes(id)) {
        return prev.filter(c => c !== id);
      } else {
        return [...prev, id];
      }
    });
    setPage(1);
  };

  const handleSelectAllCategories = () => {
    setSelectedCategories(ALL_JHCIS_CATEGORIES.map(c => c.id));
    setPage(1);
  };

  const handleSelectOnlyDrugs = () => {
    setSelectedCategories(['01', '10']);
    setPage(1);
  };

  const handleClearCategories = () => {
    setSelectedCategories([]);
    setPage(1);
  };

  const categoryTriggerLabel = (() => {
    if (selectedCategories.length === 0 || selectedCategories.length === ALL_JHCIS_CATEGORIES.length) {
      return 'ทุกกลุ่มเวชภัณฑ์ (ทั้งหมด)';
    }
    if (selectedCategories.length === 1) {
      const cat = ALL_JHCIS_CATEGORIES.find(c => c.id === selectedCategories[0]);
      return cat ? cat.label : selectedCategories[0];
    }
    if (selectedCategories.length === 2) {
      const labels = selectedCategories
        .map(id => ALL_JHCIS_CATEGORIES.find(c => c.id === id)?.label)
        .filter(Boolean);
      return labels.join(', ');
    }
    const firstLabels = selectedCategories.slice(0, 2)
      .map(id => ALL_JHCIS_CATEGORIES.find(c => c.id === id)?.label)
      .filter(Boolean)
      .join(', ');
    return `เลือก ${selectedCategories.length} กลุ่ม (${firstLabels}...)`;
  })();

  const selectedCategoriesTotalCount = (() => {
    if (selectedCategories.length === 0 || selectedCategories.length === ALL_JHCIS_CATEGORIES.length) {
      return drugFlagFilter === '1' ? summary.activeDrugs : summary.totalDrugs;
    }
    return selectedCategories.reduce((sum, id) => {
      const cat = selectableCategories.find(c => c.id === id);
      return sum + (cat?.count || 0);
    }, 0);
  })();

  const filteredCategoryOptions = selectableCategories.filter(cat =>
    !categorySearchText ||
    cat.label.toLowerCase().includes(categorySearchText.toLowerCase()) ||
    cat.id.toLowerCase().includes(categorySearchText.toLowerCase())
  );

  const STATUS_SHORT_MAP = {
    NEGATIVE_STOCK: 'สต็อกติดลบ',
    EXPIRED: 'ยาหมดอายุ',
    CRITICAL_EXPIRY: 'หมดอายุ <3ด.',
    NEAR_EXPIRY: 'หมดอายุ <6ด.',
    MISSING_EXPIRY: 'ไม่ระบุวันหมด',
    LOW_STOCK: 'เสี่ยงขาด',
    REORDER_POINT: 'จุดสั่งซื้อ',
    DEAD_STOCK: 'ค้างสต็อก',
    NORMAL: 'สต็อกปกติ'
  };

  // Helper function to render sortable table headers (extraClass = responsive hide เช่น 'hidden xl:table-cell')
  const renderSortableHeader = (label, sortKey, width, align = 'text-left', title = '', extraClass = '', minWidth = null) => {
    const isSorted = sortBy === sortKey;
    return (
      <th
        className={`${currentDensity.headerPadding} bg-slate-100 whitespace-nowrap select-none cursor-pointer group hover:bg-slate-200/90 transition-colors ${align} ${extraClass}`}
        style={{ width, ...(minWidth ? { minWidth } : {}) }}
        onClick={() => handleSort(sortKey)}
        title={title || `คลิกเพื่อเรียงข้อมูลตาม ${label} (${isSorted ? (sortOrder === 'asc' ? 'น้อยไปมาก' : 'มากไปน้อย') : 'คลิกเพื่อเรียง'})`}
      >
        <div className={`flex items-center space-x-1 ${align === 'text-right' ? 'justify-end' : align === 'text-center' ? 'justify-center' : 'justify-start'}`}>
          <span className="font-bold">{label}</span>
          <span className="shrink-0">
            {isSorted ? (
              sortOrder === 'asc' ? (
                <ArrowUp className="w-3 h-3 text-emerald-600 font-bold" />
              ) : (
                <ArrowDown className="w-3 h-3 text-emerald-600 font-bold" />
              )
            ) : (
              <ArrowUpDown className="w-2.5 h-2.5 text-slate-300 opacity-40 group-hover:opacity-100 transition-opacity" />
            )}
          </span>
        </div>
      </th>
    );
  };

  return (
    <div className="w-full px-2 sm:px-4 md:px-5 lg:px-6 xl:px-8 py-3 sm:py-4 lg:py-5 space-y-3 sm:space-y-4">

      {/* คำเตือนจากระบบบัญชี (ยอดติดลบ/ยังไม่นับ) — จาก backend ไม่ใช่ข้อความตกแต่ง */}
      {Array.isArray(data?.warnings) && data.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-2.5 text-xs sm:text-sm space-y-1">
          {data.warnings.map((w, i) => (
            <div key={i} className="flex items-start space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Page Title Banner (แถบหัวข้อกล่องสีมรกตหรูหรา เต็มความกว้าง 1 บรรทัด) */}
      <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 text-white px-4 py-2.5 rounded-2xl shadow-xs border border-emerald-600/80">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="p-1 rounded-lg bg-white/20 text-white backdrop-blur-xs shrink-0 shadow-2xs">
            <Package className="w-4 h-4 text-emerald-100" />
          </div>
          <h1 className="text-base sm:text-lg font-black tracking-tight text-white whitespace-nowrap">
            ภาพรวมสต็อกและคลังยา รพ.สต.
          </h1>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/25 backdrop-blur-xs whitespace-nowrap shadow-2xs">
            JHCIS DB
          </span>
          <span className="text-xs text-emerald-100 font-normal">
            • ระบบสต็อกการ์ดคำนวณยอดยกมา รับเข้า จ่ายออกจริงจาก JHCIS (visitdrug) และตรวจสอบวันหมดอายุ (FEFO)
          </span>
        </div>
      </div>

      {/* JHCIS Classification & Filter Bar (2-Row Modern Executive Layout) */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
        
        {/* ROW 1: รอบบัญชี / ช่วงเวลา (ซ้าย) + ปุ่มปฏิบัติการคลังยา (ขวา) */}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-2.5 pb-2.5 border-b border-slate-100">
          
          {/* ซ้าย: รอบบัญชี & ช่วงเวลา */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center space-x-1.5 bg-slate-50 hover:bg-slate-100/70 px-2.5 py-1.5 rounded-xl border border-slate-200/90 shadow-2xs transition-colors">
              <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-bold text-slate-700 whitespace-nowrap">รอบบัญชี:</span>
              <select
                value={currentPreset}
                onChange={(e) => {
                  if (e.target.value !== 'custom') {
                    setPresetRange(e.target.value);
                  }
                }}
                className="text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-emerald-500 cursor-pointer shadow-2xs"
                title="เลือกรอบปีงบประมาณหรือช่วงเวลาสำหรับคำนวณยอดยกมา รับเข้า จ่ายออก และคงเหลือ"
              >
                <option value="fy_current">{currentFiscalYear().label}</option>
                <option value="fy_prev">{prevFiscalYear().label}</option>
                <option value="this_month">เดือนปัจจุบัน</option>
                <option value="last_3_months">ไตรมาสล่าสุด (3 ด.)</option>
                <option value="ytd">ทั้งปีปฏิทิน</option>
                <option value="custom">กำหนดช่วงวันที่เอง...</option>
              </select>

              <div className="hidden sm:flex items-center space-x-1 pl-1 border-l border-slate-200">
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                  className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white text-slate-800 font-semibold focus:outline-emerald-500 shadow-2xs w-[116px]"
                  title="วันที่เริ่มต้นรอบบัญชี (สำหรับคำนวณยอดยกมา)"
                />
                <span className="text-xs text-slate-400 font-medium">-</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                  className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white text-slate-800 font-semibold focus:outline-emerald-500 shadow-2xs w-[116px]"
                  title="วันที่สิ้นสุดรอบบัญชี (สำหรับคำนวณยอดคงเหลือสิ้นงวด)"
                />
              </div>
            </div>
          </div>

          {/* ขวา: Quick Action Buttons (ตรวจนับสต็อกยกมา, นำเข้า Excel รับยา, เบิกยาคลังใน QR) */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {onNavigateToCount && (
              <button
                type="button"
                onClick={onNavigateToCount}
                className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 bg-teal-50 hover:bg-teal-100/90 text-teal-900 border border-teal-200/90 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer hover:shadow-xs active:scale-95 whitespace-nowrap"
                title="ไปที่หน้าบันทึกตรวจนับสต็อกยกมาเริ่มต้นรอบใหม่"
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>ตรวจนับสต็อกยกมา</span>
                {summary?.countedDrugs > 0 && (
                  <span className="bg-teal-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                    {summary.countedDrugs}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onNavigateToImport}
              className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer hover:shadow-sm active:scale-95 whitespace-nowrap"
              title="ไปที่หน้านำเข้าใบรับยาจาก รพ.แม่ข่าย (Excel / PDF)"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
              <span>นำเข้า Excel รับยา</span>
            </button>

            {onOpenSubstockQr && (
              <button
                type="button"
                onClick={() => onOpenSubstockQr(null)}
                className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100/90 text-indigo-900 border border-indigo-200/90 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer hover:shadow-xs active:scale-95 whitespace-nowrap"
                title="สแกน QR Code เพื่อเบิกยาจากคลังยาในออกไปยังจุดจ่ายยาหน้าเคาน์เตอร์"
              >
                <QrCode className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>เบิกยาคลังใน (QR)</span>
              </button>
            )}
          </div>

        </div>

        {/* ROW 2: ตัวกรองยา JHCIS: สถานะการใช้ยา (ด้านหน้า) + กลุ่มเวชภัณฑ์ (ด้านหลัง) + Chips */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
          
          <div className="flex flex-wrap items-center gap-2.5">
            
            {/* 1. สถานะการใช้ยาใน JHCIS (ย้ายมาไว้ด้านหน้า ตามที่ผู้ใช้สั่ง) */}
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold text-slate-700 flex items-center space-x-1.5 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200 inline-block shadow-2xs"></span>
                <span>สถานะการใช้ยา:</span>
              </span>

              <div className="relative" ref={flagDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsFlagDropdownOpen(!isFlagDropdownOpen);
                    setIsCategoryDropdownOpen(false);
                  }}
                  className={`inline-flex items-center justify-between space-x-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-2xs ${
                    isFlagDropdownOpen
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-white'
                      : 'border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 text-slate-800'
                  }`}
                  title="คลิกเพื่อเลือกสถานะการใช้ยาใน JHCIS"
                >
                  <div className="inline-flex items-center space-x-2">
                    {drugFlagFilter === '1' && (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                        <span className="font-bold text-emerald-950">มีใช้ยา (1:ใช้ยา)</span>
                        <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                          {summary.activeDrugs.toLocaleString()}
                        </span>
                      </>
                    )}
                    {drugFlagFilter === '2' && (
                      <>
                        <span className="w-2 h-2 rounded-full bg-slate-400 inline-block"></span>
                        <span className="font-bold text-slate-800">ไม่ใช้ยา (2:ไม่ใช้ยา)</span>
                        <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-mono text-[10px] font-bold">
                          {summary.inactiveDrugs.toLocaleString()}
                        </span>
                      </>
                    )}
                    {drugFlagFilter === 'all' && (
                      <>
                        <Folder className="w-3.5 h-3.5 text-blue-500" />
                        <span className="font-bold text-blue-900">ทุกสถานะ</span>
                        <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 font-mono text-[10px] font-bold">
                          {summary.totalDrugs.toLocaleString()}
                        </span>
                      </>
                    )}
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 ml-1 transition-transform duration-200 ${isFlagDropdownOpen ? 'rotate-180 text-emerald-600' : ''}`} />
                </button>

                {isFlagDropdownOpen && (
                  <div className="absolute left-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-40 animate-in fade-in zoom-in-95">
                    <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      เลือกสถานะการใช้งาน
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setDrugFlagFilter('1');
                        setIsFlagDropdownOpen(false);
                        setPage(1);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-emerald-50/70 transition-colors cursor-pointer ${
                        drugFlagFilter === '1' ? 'bg-emerald-50 text-emerald-950 font-bold' : 'text-slate-700 font-medium'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-2xs"></span>
                        <div>
                          <div className="text-xs">มีใช้ยา (1:ใช้ยา)</div>
                          <div className="text-[10px] text-slate-400 font-normal">เปิดใช้งานในระบบ JHCIS</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                          {summary.activeDrugs.toLocaleString()}
                        </span>
                        {drugFlagFilter === '1' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDrugFlagFilter('2');
                        setIsFlagDropdownOpen(false);
                        setPage(1);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer ${
                        drugFlagFilter === '2' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 font-medium'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span>
                        <div>
                          <div className="text-xs">ไม่ใช้ยา (2:ไม่ใช้ยา)</div>
                          <div className="text-[10px] text-slate-400 font-normal">ยกเลิก/ไม่ใช้ยาแล้ว</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-bold">
                          {summary.inactiveDrugs.toLocaleString()}
                        </span>
                        {drugFlagFilter === '2' && <Check className="w-3.5 h-3.5 text-slate-700" />}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDrugFlagFilter('all');
                        setIsFlagDropdownOpen(false);
                        setPage(1);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-blue-50/70 transition-colors cursor-pointer ${
                        drugFlagFilter === 'all' ? 'bg-blue-50 text-blue-950 font-bold' : 'text-slate-700 font-medium'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Folder className="w-4 h-4 text-blue-500" />
                        <div>
                          <div className="text-xs">ทุกสถานะ (ทั้งหมด)</div>
                          <div className="text-[10px] text-slate-400 font-normal">รวมทุกรายการในฐานข้อมูล</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 font-bold">
                          {summary.totalDrugs.toLocaleString()}
                        </span>
                        {drugFlagFilter === 'all' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Divider between Status and Category */}
            <div className="h-4 w-px bg-slate-200 hidden sm:block" />

            {/* 2. กลุ่มเวชภัณฑ์: Multi-Select Dropdown with Checkboxes (อยู่ด้านหลังสถานะการใช้ยา) */}
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold text-slate-700 flex items-center space-x-1 whitespace-nowrap">
                <Filter className="w-3.5 h-3.5 text-emerald-600" />
                <span>กลุ่มเวชภัณฑ์:</span>
              </span>

              <div className="relative" ref={categoryDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsCategoryDropdownOpen(!isCategoryDropdownOpen);
                    setIsFlagDropdownOpen(false);
                  }}
                  className={`inline-flex items-center justify-between space-x-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-2xs ${
                    isCategoryDropdownOpen
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-white'
                      : selectedCategories.length > 0
                        ? 'border-slate-300 bg-white hover:border-emerald-400 text-slate-800'
                        : 'border-slate-200 bg-slate-50 hover:bg-white text-slate-600'
                  }`}
                  title="คลิกเพื่อเลือกกลุ่มเวชภัณฑ์ (เลือกได้หลายกลุ่มพร้อมกัน)"
                >
                  <div className="inline-flex items-center space-x-1.5 max-w-[200px] sm:max-w-xs truncate">
                    <span className="truncate font-bold text-slate-800">{categoryTriggerLabel}</span>
                    <span className="shrink-0 px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                      {selectedCategoriesTotalCount.toLocaleString()}
                    </span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 ml-1 shrink-0 transition-transform duration-200 ${isCategoryDropdownOpen ? 'rotate-180 text-emerald-600' : ''}`} />
                </button>

                {isCategoryDropdownOpen && (
                  <div className="absolute left-0 mt-1.5 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2.5 z-40 animate-in fade-in zoom-in-95">
                    
                    {/* Header: Title and Quick Action Buttons */}
                    <div className="px-3 pb-2 border-b border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center space-x-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>เลือกกลุ่มเวชภัณฑ์ (เลือกได้หลายกลุ่ม)</span>
                        </span>
                        <span className="text-[11px] font-medium text-slate-500">
                          {selectedCategories.length} / {ALL_JHCIS_CATEGORIES.length} กลุ่ม
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSelectAllCategories}
                          className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                        >
                          เลือกทั้งหมด
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectOnlyDrugs}
                          className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 transition-colors cursor-pointer"
                        >
                          เฉพาะยา (01+10)
                        </button>
                        <button
                          type="button"
                          onClick={handleClearCategories}
                          className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors cursor-pointer"
                        >
                          ล้างค่า
                        </button>
                      </div>

                      {/* Filter Search within dropdown */}
                      <div className="relative mt-2">
                        <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={categorySearchText}
                          onChange={e => setCategorySearchText(e.target.value)}
                          placeholder="ค้นหากลุ่มเวชภัณฑ์..."
                          className="w-full pl-7 pr-6 py-1 rounded-lg text-xs bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                        {categorySearchText && (
                          <button
                            type="button"
                            onClick={() => setCategorySearchText('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Scrollable Checkbox List */}
                    <div className="max-h-72 overflow-y-auto px-1.5 py-1.5 space-y-0.5">
                      {filteredCategoryOptions.map(cat => {
                        const Icon = cat.icon;
                        const isChecked = selectedCategories.includes(cat.id);
                        return (
                          <label
                            key={cat.id}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl cursor-pointer transition-all ${
                              isChecked
                                ? 'bg-emerald-50/80 hover:bg-emerald-100/70'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleCategory(cat.id)}
                                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                              />
                              <div className={`p-1.5 rounded-lg shrink-0 ${
                                isChecked ? 'bg-emerald-200/80 text-emerald-800' : 'bg-slate-100 text-slate-600'
                              }`}>
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <span className={`text-xs truncate ${
                                isChecked ? 'font-bold text-emerald-950' : 'font-medium text-slate-700'
                              }`}>
                                {cat.label}
                              </span>
                            </div>
                            <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full shrink-0 font-bold ${
                              isChecked ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {(cat.count || 0).toLocaleString()}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    {/* Footer */}
                    <div className="px-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <div className="text-[11px] text-slate-500">
                        รวม <strong className="text-slate-800 font-bold">{selectedCategoriesTotalCount.toLocaleString()}</strong> รายการ
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCategoryDropdownOpen(false)}
                        className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer"
                      >
                        ปิดหน้าต่าง
                      </button>
                    </div>

                  </div>
                )}
              </div>
            </div>

            {/* Selected Category Chips (แสดงข้างๆ กลุ่มเวชภัณฑ์อย่างเป็นระเบียบ) */}
            {selectedCategories.length > 0 && selectedCategories.length < ALL_JHCIS_CATEGORIES.length && (
              <div className="flex flex-wrap items-center gap-1.5 pl-2 sm:border-l sm:border-slate-200">
                {selectedCategories.map(catId => {
                  const cat = ALL_JHCIS_CATEGORIES.find(c => c.id === catId);
                  if (!cat) return null;
                  const Icon = cat.icon;
                  return (
                    <span
                      key={catId}
                      className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-xs font-semibold shadow-2xs"
                    >
                      <Icon className="w-3 h-3 text-emerald-600" />
                      <span>{cat.label}</span>
                      <button
                        type="button"
                        onClick={() => toggleCategory(catId)}
                        className="hover:bg-emerald-200 rounded-full p-0.5 transition-colors cursor-pointer ml-0.5"
                        title={`ลบตัวกรอง ${cat.label}`}
                      >
                        <X className="w-3 h-3 text-emerald-700" />
                      </button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSelectedCategories(['01'])}
                  className="text-[11px] text-slate-500 hover:text-emerald-700 underline ml-1 cursor-pointer font-medium"
                >
                  รีเซ็ตเป็นยาแผนปัจจุบัน
                </button>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* Stock Health Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        
        {/* Current Filtered Drugs */}
        <div 
          onClick={() => setStatusFilter('all')}
          className={`group cursor-pointer p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md active:translate-y-0 active:scale-[0.99] ${
            statusFilter === 'all'
              ? 'bg-slate-900 border-slate-900 text-white shadow-md ring-2 ring-slate-900/20'
              : 'bg-white border-slate-200 hover:border-slate-400 text-slate-800 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${statusFilter === 'all' ? 'text-slate-300' : 'text-slate-600'}`}>รายการยาที่แสดง</span>
            <Package className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${statusFilter === 'all' ? 'text-slate-300' : 'text-slate-500'}`} />
          </div>
          <div className="text-2xl sm:text-3xl font-black mt-1 font-mono tracking-tight">
            {data?.pagination?.totalCount?.toLocaleString() || 0}
          </div>
          <div className={`text-[10px] sm:text-xs mt-0.5 truncate font-medium ${statusFilter === 'all' ? 'text-slate-400' : 'text-slate-500'}`}>
            {drugFlagFilter === '1' ? 'เฉพาะที่มีใช้ยา' : 'ทุกสถานะ'}
          </div>
        </div>

        {/* Low Stock */}
        <div 
          onClick={() => setStatusFilter('low_stock')}
          className={`group cursor-pointer p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md active:translate-y-0 active:scale-[0.99] ${
            statusFilter === 'low_stock'
              ? 'bg-rose-600 border-rose-600 text-white shadow-md ring-2 ring-rose-500/20'
              : 'bg-rose-50/80 border-rose-200 hover:border-rose-400 hover:bg-rose-50 text-rose-950 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${statusFilter === 'low_stock' ? 'text-rose-100' : 'text-rose-800'}`}>ยาเหลือน้อย</span>
            <AlertOctagon className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${statusFilter === 'low_stock' ? 'text-rose-200' : 'text-rose-600'}`} />
          </div>
          <div className={`text-2xl sm:text-3xl font-black mt-1 font-mono tracking-tight ${statusFilter === 'low_stock' ? 'text-white' : 'text-rose-700'}`}>
            {summary.lowStock}
          </div>
          <div className={`text-[10px] sm:text-xs mt-0.5 truncate font-semibold ${statusFilter === 'low_stock' ? 'text-rose-200' : 'text-rose-700'}`}>
            ต่ำกว่าสำรอง
          </div>
        </div>

        {/* Near Expiry */}
        <div 
          onClick={() => setStatusFilter('near_expiry')}
          className={`group cursor-pointer p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md active:translate-y-0 active:scale-[0.99] ${
            statusFilter === 'near_expiry'
              ? 'bg-amber-500 border-amber-500 text-white shadow-md ring-2 ring-amber-500/20'
              : 'bg-amber-50/80 border-amber-200 hover:border-amber-400 hover:bg-amber-50 text-amber-950 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${statusFilter === 'near_expiry' ? 'text-amber-100' : 'text-amber-800'}`}>ใกล้หมดอายุ</span>
            <Clock className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${statusFilter === 'near_expiry' ? 'text-amber-200' : 'text-amber-600'}`} />
          </div>
          <div className={`text-2xl sm:text-3xl font-black mt-1 font-mono tracking-tight ${statusFilter === 'near_expiry' ? 'text-white' : 'text-amber-700'}`}>
            {summary.nearExpiry}
          </div>
          <div className={`text-[10px] sm:text-xs mt-0.5 truncate font-semibold ${statusFilter === 'near_expiry' ? 'text-amber-200' : 'text-amber-700'}`}>
            ใน 3-6 เดือน
          </div>
        </div>

        {/* Expired */}
        <div 
          onClick={() => setStatusFilter('expired')}
          className={`group cursor-pointer p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md active:translate-y-0 active:scale-[0.99] ${
            statusFilter === 'expired'
              ? 'bg-purple-900 border-purple-900 text-white shadow-md ring-2 ring-purple-900/20'
              : 'bg-purple-50/80 border-purple-200 hover:border-purple-400 hover:bg-purple-50 text-purple-950 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${statusFilter === 'expired' ? 'text-purple-200' : 'text-purple-800'}`}>หมดอายุ</span>
            <ShieldAlert className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${statusFilter === 'expired' ? 'text-purple-300' : 'text-purple-600'}`} />
          </div>
          <div className={`text-2xl sm:text-3xl font-black mt-1 font-mono tracking-tight ${statusFilter === 'expired' ? 'text-white' : 'text-purple-800'}`}>
            {summary.expired}
          </div>
          <div className={`text-[10px] sm:text-xs mt-0.5 truncate font-semibold ${statusFilter === 'expired' ? 'text-purple-300' : 'text-purple-700'}`}>
            ต้องตัดจำหน่าย
          </div>
        </div>

        {/* Dead Stock */}
        <div 
          onClick={() => setStatusFilter('dead_stock')}
          className={`group cursor-pointer p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md active:translate-y-0 active:scale-[0.99] ${
            statusFilter === 'dead_stock'
              ? 'bg-indigo-700 border-indigo-700 text-white shadow-md ring-2 ring-indigo-700/20'
              : 'bg-indigo-50/80 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 text-indigo-950 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${statusFilter === 'dead_stock' ? 'text-indigo-200' : 'text-indigo-800'}`}>ค้างสต็อก</span>
            <Archive className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${statusFilter === 'dead_stock' ? 'text-indigo-300' : 'text-indigo-600'}`} />
          </div>
          <div className={`text-2xl sm:text-3xl font-black mt-1 font-mono tracking-tight ${statusFilter === 'dead_stock' ? 'text-white' : 'text-indigo-700'}`}>
            {summary.deadStock}
          </div>
          <div className={`text-[10px] sm:text-xs mt-0.5 truncate font-semibold ${statusFilter === 'dead_stock' ? 'text-indigo-300' : 'text-indigo-700'}`}>
            ไม่จ่ายเกิน 90 วัน
          </div>
        </div>

        {/* Normal Stock */}
        <div 
          onClick={() => setStatusFilter('normal')}
          className={`group cursor-pointer p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md active:translate-y-0 active:scale-[0.99] ${
            statusFilter === 'normal'
              ? 'bg-emerald-600 border-emerald-600 text-white shadow-md ring-2 ring-emerald-600/20'
              : 'bg-emerald-50/80 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 text-emerald-950 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${statusFilter === 'normal' ? 'text-emerald-100' : 'text-emerald-800'}`}>สต็อกปกติ</span>
            <CheckCircle2 className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${statusFilter === 'normal' ? 'text-emerald-200' : 'text-emerald-600'}`} />
          </div>
          <div className={`text-2xl sm:text-3xl font-black mt-1 font-mono tracking-tight ${statusFilter === 'normal' ? 'text-white' : 'text-emerald-700'}`}>
            {summary.normal}
          </div>
          <div className={`text-[10px] sm:text-xs mt-0.5 truncate font-semibold ${statusFilter === 'normal' ? 'text-emerald-200' : 'text-emerald-700'}`}>
            ยอดสมดุล
          </div>
        </div>

      </div>

      {/* Filter and Search Bar (เฉพาะค้นหาและจัดการการแสดงผลตาราง สะอาดตา ไม่ล้นจอ) */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row justify-between items-center gap-2.5">
        <div className="flex flex-wrap items-center gap-2 w-full flex-1">
          {/* Global Search box */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาชื่อยา (ไทย/อังกฤษ), รหัสยา, รหัส TMT 6 หรือ 24 หลัก..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-emerald-500 text-slate-800 font-medium shadow-2xs"
            />
          </form>

          {/* Toggle Column Filters Row Button */}
          <button
            type="button"
            onClick={() => setShowColumnFilters(!showColumnFilters)}
            className={`flex items-center space-x-1 px-2.5 py-1.5 border rounded-xl text-xs font-semibold transition-colors shrink-0 cursor-pointer shadow-2xs ${
              showColumnFilters 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
            title="เปิด/ปิดแถวตัวกรองค้นหาที่หัวตาราง"
          >
            <Filter className="w-3.5 h-3.5 text-emerald-600" />
            <span>{showColumnFilters ? 'ซ่อนตัวกรองหัวตาราง' : 'ตัวกรองหัวตาราง'}</span>
          </button>

          {/* Quick Clear / Reset */}
          <button
            type="button"
            onClick={() => { 
              setSearch(''); 
              setStatusFilter('all'); 
              setSelectedCategories(['01']); 
              setDrugFlagFilter('1'); 
              setSortBy('default');
              setSortOrder('asc');
              clearAllColFilters();
              setPage(1); 
              loadData(1, pageSize); 
            }}
            className="flex items-center space-x-1 px-2.5 py-1.5 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-semibold transition-colors shrink-0 cursor-pointer shadow-2xs"
            title="รีเซ็ตตัวกรองและการจัดเรียงเป็นค่าเริ่มต้น (ยาแผนปัจจุบัน ที่มีใช้ยา)"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">รีเซ็ต</span>
          </button>

          {/* Table Density / Font Size Selector (ปรับขนาดอักษรตามขนาดจอ) */}
          <div className="flex items-center space-x-0.5 p-0.5 bg-slate-100 rounded-xl border border-slate-200 shrink-0 shadow-2xs" title="ปรับขนาดตัวอักษรของตาราง">
            <span className="text-[10px] text-slate-400 font-bold px-1.5 hidden xl:inline">ขนาดอักษร:</span>
            <button
              type="button"
              onClick={() => handleSetDensity('compact')}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                tableDensity === 'compact'
                  ? 'bg-white text-emerald-700 shadow-2xs font-extrabold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="กะทัดรัด (A-) เหมาะสำหรับจอโน้ตบุ๊ก หรือจอ 1366x768 ตัวหนังสือไม่ซ้อนทับกัน"
            >
              A- กะทัดรัด
            </button>
            <button
              type="button"
              onClick={() => handleSetDensity('normal')}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                tableDensity === 'normal'
                  ? 'bg-white text-emerald-700 shadow-2xs font-extrabold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="มาตรฐาน (A) เหมาะสำหรับหน้าจอ Full HD 1080p ทั่วไป"
            >
              A ปกติ
            </button>
            <button
              type="button"
              onClick={() => handleSetDensity('large')}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                tableDensity === 'large'
                  ? 'bg-white text-emerald-700 shadow-2xs font-extrabold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="ขยายใหญ่ (A+) สบายตา สำหรับจอขนาดใหญ่ 24-27 นิ้ว"
            >
              A+ สบายตา
            </button>
          </div>
        </div>

        {/* Active Sort Indicator (ถ้ามีการคลิกเรียงคอลัมน์) */}
        {sortBy !== 'default' && (
          <div className="flex items-center space-x-1 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-xl shrink-0 shadow-2xs">
            <span>เรียงตาม: <strong>{sortBy}</strong> ({sortOrder === 'asc' ? 'น้อยไปมาก' : 'มากไปน้อย'})</span>
            <button 
              type="button"
              onClick={() => { setSortBy('default'); setSortOrder('asc'); setPage(1); }}
              className="text-emerald-700 hover:text-rose-600 ml-1 p-0.5 rounded transition-colors cursor-pointer"
              title="ยกเลิกการเรียง"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Top Pagination Bar */}
      {data?.pagination && data.pagination.totalCount > 0 && (
        <PaginationBar
          currentPage={data.pagination.page}
          pageSize={pageSize}
          totalItems={data.pagination.totalCount}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={[10, 20, 50, 100, 'all']}
          colorTheme="emerald"
          position="top"
        />
      )}

      {/* Main Stock Table - Sortable & Column Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto table-responsive table-scroll-visible max-h-[calc(100vh-210px)] min-h-[380px] overflow-y-auto">
          <table className={`w-full text-left ${currentDensity.tableText} min-w-[1380px]`}>
            <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200 sticky top-0 z-20 shadow-xs">
              {/* Header Title Row with Sort Triggers */}
              <tr>
                {renderSortableHeader('รหัสยา JHCIS', 'drugcode', '95px', 'text-left', 'คลิกเพื่อเรียงตามรหัสยา JHCIS', '', '90px')}
                {renderSortableHeader('ชื่อยา (Tradename / ไทย)', 'drugname', 'auto', 'text-left', 'คลิกเพื่อเรียงตามชื่อยา ก-ฮ หรือ A-Z', '', '220px')}
                {renderSortableHeader('ชนิด / รหัสกลุ่มยา', 'drugtype', '130px', 'text-left', 'คลิกเพื่อเรียงตามกลุ่มเวชภัณฑ์', '', '125px')}
                {renderSortableHeader('รหัส TMT', 'tmtcode', '95px', 'text-center', 'คลิกเพื่อเรียงตามรหัส TMT 6 หลัก', '', '90px')}
                {renderSortableHeader('รหัสยา 24 หลัก', 'drugcode24', '135px', 'text-left', 'คลิกเพื่อเรียงตามรหัสมาตรฐาน 24 หลัก', '', '130px')}
                {renderSortableHeader('ยกมา', 'broughtForward', '95px', 'text-right', 'คลิกเพื่อเรียงตามยอดยกมา', '', '90px')}
                {renderSortableHeader('รับเข้า', 'totalReceived', '95px', 'text-right', 'คลิกเพื่อเรียงตามยอดรับเข้า Excel', '', '90px')}
                {renderSortableHeader('จ่ายออก', 'totalDispensed', '105px', 'text-right', 'คลิกเพื่อเรียงตามยอดจ่ายยาจริงใน JHCIS', '', '100px')}
                {renderSortableHeader('คงเหลือ', 'currentBalance', '115px', 'text-right', 'คลิกเพื่อเรียงตามยอดคงเหลือในคลัง', '', '110px')}
                {renderSortableHeader('สถานะคลัง', 'status', '130px', 'text-center', 'คลิกเพื่อเรียงตามสถานะความเร่งด่วนของยา', '', '125px')}
                <th className={`${currentDensity.headerPadding} bg-slate-100 text-center whitespace-nowrap`} style={{ width: '235px', minWidth: '235px' }}>
                  จัดการ
                </th>
              </tr>

              {/* Column Filters Row (ตัวกรองที่หัวตาราง) */}
              {showColumnFilters && (
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-600">
                  {/* Filter: drugcode */}
                  <th className="p-1 align-top bg-slate-100" style={{ width: '95px', minWidth: '90px' }}>
                    <input
                      type="text"
                      placeholder="รหัส..."
                      value={colFilters.drugcode}
                      onChange={(e) => handleColFilterChange('drugcode', e.target.value)}
                      className={`w-full ${currentDensity.filterInput} border border-slate-300 rounded bg-white text-slate-900 focus:outline-emerald-500 font-mono shadow-2xs`}
                    />
                  </th>

                  {/* Filter: drugname */}
                  <th className="p-1 align-top bg-slate-100" style={{ minWidth: '220px' }}>
                    <input
                      type="text"
                      placeholder="ชื่อยา..."
                      value={colFilters.drugname}
                      onChange={(e) => handleColFilterChange('drugname', e.target.value)}
                      className={`w-full ${currentDensity.filterInput} border border-slate-300 rounded bg-white text-slate-900 focus:outline-emerald-500 font-medium shadow-2xs`}
                    />
                  </th>

                  {/* Filter: drugtype */}
                  <th className="p-1 align-top bg-slate-100" style={{ width: '130px', minWidth: '125px' }}>
                    <input
                      type="text"
                      placeholder="กลุ่มยา..."
                      value={colFilters.drugtype}
                      onChange={(e) => handleColFilterChange('drugtype', e.target.value)}
                      className={`w-full ${currentDensity.filterInput} border border-slate-300 rounded bg-white text-slate-900 focus:outline-emerald-500 shadow-2xs`}
                    />
                  </th>

                  {/* Filter: tmtcode */}
                  <th className="p-1 align-top text-center bg-slate-100" style={{ width: '95px', minWidth: '90px' }}>
                    <input
                      type="text"
                      placeholder="TMT..."
                      value={colFilters.tmtcode}
                      onChange={(e) => handleColFilterChange('tmtcode', e.target.value)}
                      className={`w-full ${currentDensity.filterInput} border border-slate-300 rounded bg-white text-slate-900 focus:outline-emerald-500 font-mono text-center shadow-2xs`}
                    />
                  </th>

                  {/* Filter: drugcode24 */}
                  <th className="p-1 align-top bg-slate-100" style={{ width: '135px', minWidth: '130px' }}>
                    <input
                      type="text"
                      placeholder="24 หลัก..."
                      value={colFilters.drugcode24}
                      onChange={(e) => handleColFilterChange('drugcode24', e.target.value)}
                      className={`w-full ${currentDensity.filterInput} border border-slate-300 rounded bg-white text-slate-900 focus:outline-emerald-500 font-mono shadow-2xs`}
                    />
                  </th>

                  {/* Filter: Counted Status (ยกมา) */}
                  <th className="p-1 align-top bg-slate-100" style={{ width: '95px', minWidth: '90px' }}>
                    <select
                      value={colFilters.counted || 'all'}
                      onChange={(e) => handleColFilterChange('counted', e.target.value)}
                      className={`w-full ${currentDensity.filterSelect} border border-slate-300 rounded bg-white text-slate-800 focus:outline-emerald-500 font-semibold cursor-pointer shadow-2xs`}
                      title="กรองตามสถานะการตรวจนับยอดยกมา"
                    >
                      <option value="all">ทั้งหมด</option>
                      <option value="counted">นับแล้ว</option>
                      <option value="uncounted">ยังไม่นับ</option>
                    </select>
                  </th>

                  {/* Spacer for numeric stock movement column: รับเข้า */}
                  <th className="p-1 align-middle text-center text-[10px] text-slate-400 font-normal bg-slate-100" style={{ width: '95px', minWidth: '90px' }}>-</th>

                  {/* Filter: Dispensed (จ่ายออก) */}
                  <th className="p-1 align-top bg-slate-100" style={{ width: '105px', minWidth: '100px' }}>
                    <select
                      value={colFilters.dispensed}
                      onChange={(e) => handleColFilterChange('dispensed', e.target.value)}
                      className={`w-full ${currentDensity.filterSelect} border border-slate-300 rounded bg-white text-slate-800 focus:outline-emerald-500 font-semibold cursor-pointer shadow-2xs`}
                      title="กรองยาตามการจ่ายออก: ทั้งหมด / มีการจ่าย / ไม่มีการจ่าย"
                    >
                      <option value="all">ทั้งหมด</option>
                      <option value="has_dispensed">&gt; 0 มีจ่าย</option>
                      <option value="no_dispensed">= 0 ไม่จ่าย</option>
                    </select>
                  </th>

                  {/* Filter: Balance */}
                  <th className="p-1 align-top bg-slate-100" style={{ width: '115px', minWidth: '110px' }}>
                    <select
                      value={colFilters.balance}
                      onChange={(e) => handleColFilterChange('balance', e.target.value)}
                      className={`w-full ${currentDensity.filterSelect} border border-slate-300 rounded bg-white text-slate-800 focus:outline-emerald-500 font-semibold cursor-pointer shadow-2xs`}
                    >
                      <option value="all">ทั้งหมด</option>
                      <option value="in_stock">&gt; 0 มีของ</option>
                      <option value="out_of_stock">= 0 หมด</option>
                    </select>
                  </th>

                  {/* Filter: Status */}
                  <th className="p-1 align-top bg-slate-100" style={{ width: '130px', minWidth: '125px' }}>
                    <select
                      value={colFilters.status}
                      onChange={(e) => handleColFilterChange('status', e.target.value)}
                      className={`w-full ${currentDensity.filterSelect} border border-slate-300 rounded bg-white text-slate-800 focus:outline-emerald-500 font-semibold cursor-pointer shadow-2xs`}
                    >
                      <option value="all">ทุกสถานะ</option>
                      <option value="normal">[ปกติ] พร้อมใช้</option>
                      <option value="low_stock">[เสี่ยงขาด] ต่ำสำรอง</option>
                      <option value="near_expiry">[ใกล้หมด] 3-6 ด.</option>
                      <option value="expired">[หมดอายุ] ตัดทิ้ง</option>
                      <option value="dead_stock">[ค้างสต็อก] &gt; 90 วัน</option>
                    </select>
                  </th>

                  {/* Clear button */}
                  <th className="p-1 align-top text-center bg-slate-100" style={{ width: '235px', minWidth: '235px' }}>
                    {hasActiveColFilters ? (
                      <button
                        onClick={clearAllColFilters}
                        className={`w-full ${currentDensity.filterInput} bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 rounded transition-colors whitespace-nowrap shadow-2xs cursor-pointer`}
                        title="ล้างตัวกรองคอลัมน์ทั้งหมด"
                      >
                        ล้างตัวกรอง
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">-</span>
                    )}
                  </th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-14 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="w-7 h-7 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs font-semibold">กำลังเชื่อมโยงและประมวลผลข้อมูล JHCIS...</span>
                    </div>
                  </td>
                </tr>
              ) : !data || data.items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-14 text-center text-slate-400 text-xs font-semibold">
                    ไม่พบรายการยาหรือเวชภัณฑ์ที่ตรงกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              ) : (
                data.items.map((item) => {
                  const isLow = item.statuses.some(s => s.code === 'LOW_STOCK');
                  const isNearExp = item.statuses.some(s => s.code === 'CRITICAL_EXPIRY' || s.code === 'NEAR_EXPIRY');
                  const isExpired = item.statuses.some(s => s.code === 'EXPIRED');

                  return (
                    <tr 
                      key={item.drugcode} 
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isExpired ? 'bg-purple-50/30' : isLow ? 'bg-rose-50/30' : isNearExp ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      {/* 1. drugcode รหัสยา jhcis */}
                      <td className={`${currentDensity.cellPadding} align-middle overflow-hidden`} style={{ width: '95px', minWidth: '90px' }}>
                        <div 
                          className={`font-mono font-bold text-slate-900 ${currentDensity.codeText} break-all leading-tight`}
                          title={`รหัสยา JHCIS: ${item.drugcode}`}
                        >
                          {item.drugcode}
                        </div>
                        <div className="mt-0.5">
                          <span className={`px-1.5 py-0.2 rounded ${currentDensity.badge} font-bold inline-block ${
                            item.drugflag === '1'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}>
                            {item.drugflag === '1' ? '1:ใช้ยา' : '2:ไม่ใช้'}
                          </span>
                        </div>
                      </td>

                      {/* 2. drugname ชื่อยา */}
                      <td className={`${currentDensity.cellPadding} align-middle overflow-hidden`} style={{ minWidth: '220px' }}>
                        <div className={`text-slate-900 ${currentDensity.nameTitle} break-words line-clamp-2 hover:line-clamp-none`} title={item.drugname}>
                          {item.drugname}
                        </div>
                        {item.drugnamethai ? (
                          <div className={`${currentDensity.nameThai} text-slate-600 leading-tight mt-0.5 break-words line-clamp-1 hover:line-clamp-none`} title={item.drugnamethai}>
                            {item.drugnamethai}
                          </div>
                        ) : null}
                        
                        <div className={`flex flex-wrap items-center ${currentDensity.nameMeta} text-slate-400 mt-1`}>
                          {item.costprice > 0 && <span>ทุน: {item.costprice.toFixed(2)}</span>}
                          {item.sellprice > 0 && <span>• ขาย: {item.sellprice.toFixed(2)}</span>}
                          {item.unitpacking && <span>• บรรจุ: {item.unitpacking}</span>}
                          {item.chargeopdname && (
                            <span className="bg-slate-100 text-slate-600 px-1 py-0.2 rounded text-[8.5px]">
                              {item.chargeopdname}
                            </span>
                          )}
                          {item.drugcaution && (
                            <span 
                              className="inline-flex items-center space-x-0.5 text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded text-[8.5px] font-semibold cursor-help"
                              title={`คำเตือนการใช้ยา: ${item.drugcaution}`}
                            >
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-600 inline mr-0.5 shrink-0" />
                              <span>มีคำเตือน</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. drugtype ชนิด รหัสกลุ่มยา */}
                      <td className={`${currentDensity.cellPadding} align-middle overflow-hidden`} style={{ width: '130px', minWidth: '125px' }}>
                        <div className={`flex items-center space-x-1 bg-slate-100/80 border border-slate-200 px-1.5 py-0.5 rounded ${currentDensity.badge} font-semibold text-slate-800 max-w-full min-w-0`}>
                          <span className="font-mono font-bold text-emerald-700 shrink-0">[{item.drugtype || '-'}]</span>
                          <span className="truncate min-w-0 flex-1" title={item.drugtypeName}>{item.drugtypeShortName || item.drugtypeName}</span>
                        </div>
                        {item.drugtypesubName && (
                          <div className={`text-slate-500 mt-0.5 truncate max-w-full block ${currentDensity.badge}`} title={item.drugtypesubName}>
                            {item.drugtypesubName}
                          </div>
                        )}
                        <div className="flex items-center space-x-1 mt-0.5 flex-wrap">
                          {item.isAntibiotic && (
                            <span className={`font-bold px-1 bg-rose-50 text-rose-700 border border-rose-200 rounded ${currentDensity.badge}`}>
                              Anti-Bio
                            </span>
                          )}
                          {item.isDental && (
                            <span className={`font-bold px-1 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded ${currentDensity.badge}`}>
                              ทันตฯ
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. tmtcode รหัส tmtid */}
                      <td className={`${currentDensity.cellPadding} text-center align-middle whitespace-nowrap overflow-hidden`} style={{ width: '95px', minWidth: '90px' }}>
                        {item.tmtcode ? (
                          <div className={`font-mono font-black text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded inline-block ${currentDensity.codeText} tracking-tight`} title={`รหัส TMT 6 หลัก: ${item.tmtcode}`}>
                            {item.tmtcode}
                          </div>
                        ) : (
                          <span className="text-slate-300 font-mono text-xs">-</span>
                        )}
                      </td>

                      {/* 5. drugcode24 รหัสยา 24 หลัก */}
                      <td className={`${currentDensity.cellPadding} align-middle overflow-hidden`} style={{ width: '135px', minWidth: '130px' }}>
                        {(item.drugcode24 || item.didstandard) ? (
                          <div 
                            className={`font-mono ${currentDensity.badge} font-semibold text-slate-800 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded select-all break-all leading-tight hover:bg-white transition-colors`}
                            title={`รหัสมาตรฐาน 24 หลัก: ${item.drugcode24 || item.didstandard}`}
                          >
                            {item.drugcode24 || item.didstandard}
                          </div>
                        ) : (
                          <span className="text-slate-300 font-mono text-xs">-</span>
                        )}
                      </td>

                      {/* 6. ยกมา */}
                      <td className={`${currentDensity.cellPadding} text-right align-middle whitespace-nowrap overflow-hidden`} style={{ width: '95px', minWidth: '90px' }}>
                        {item.isCounted ? (
                          <div 
                            onClick={() => handleOpenQuickCount(item)}
                            className={`inline-flex items-center space-x-0.5 font-mono ${currentDensity.numText} text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shadow-2xs cursor-pointer hover:bg-emerald-100 transition-colors`}
                            title={`ตรวจนับจริงแล้ว ${item.broughtForward.toLocaleString()} ${item.drugunit}\nคลิกเพื่อแก้ไขยอดนับ`}
                          >
                            <span>{item.broughtForward.toLocaleString()}</span>
                            <Check className="w-2.5 h-2.5 text-emerald-600" />
                          </div>
                        ) : (
                          <span 
                            onClick={() => handleOpenQuickCount(item)}
                            className={`text-slate-400 font-mono ${currentDensity.numText} font-semibold cursor-pointer hover:text-emerald-700 hover:underline`}
                            title="ยอดยกมาเริ่มต้นเป็น 0 (คลิกเพื่อนับยอด)"
                          >
                            0
                          </span>
                        )}
                      </td>

                      {/* 7. รับเข้า */}
                      <td className={`${currentDensity.cellPadding} text-right font-bold text-emerald-700 font-mono ${currentDensity.numText} align-middle whitespace-nowrap overflow-hidden`} style={{ width: '95px', minWidth: '90px' }}>
                        {item.totalReceived > 0 ? `+${item.totalReceived.toLocaleString()}` : '0'}
                      </td>

                      {/* 8. จ่ายออก (คลิกดูคนไข้) */}
                      <td className={`${currentDensity.cellPadding} text-right align-middle whitespace-nowrap overflow-hidden`} style={{ width: '105px', minWidth: '100px' }}>
                        {item.totalDispensed > 0 ? (
                          <button
                            onClick={() => onOpenPatientDispense(item.drugcode, item.drugname, dateRange)}
                            className="group inline-flex items-center space-x-0.5 px-1 py-0.5 rounded bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                            title="คลิกเพื่อดูรายชื่อผู้ป่วยและรหัสโรคที่ได้รับยานี้"
                          >
                            <span className={`font-black text-rose-700 group-hover:text-rose-900 font-mono ${currentDensity.numText}`}>
                              -{item.totalDispensed.toLocaleString()}
                            </span>
                            <Eye className="w-2.5 h-2.5 text-rose-500 group-hover:text-rose-700 shrink-0" />
                          </button>
                        ) : (
                          <span className={`font-mono font-semibold text-slate-400 ${currentDensity.numText}`}>0</span>
                        )}
                      </td>

                      {/* 9. คงเหลือ (แสดงติดลบด้วยสีแดง + แยกคลังยาใน/เคาน์เตอร์ถ้ามีการเบิกย่อย) */}
                      <td 
                        className={`${currentDensity.cellPadding} text-right align-middle whitespace-nowrap overflow-hidden ${
                          item.currentBalance < 0 ? 'text-rose-700 bg-rose-50/60' : 'text-slate-900 bg-slate-50/30'
                        }`}
                        style={{ width: '115px', minWidth: '110px' }}
                        title={
                          item.conversionFactor > 1
                            ? `รวมทั้ง รพ.สต.: ${item.currentBalance.toLocaleString()} ${item.counterUnit || item.drugunit}\n📦 คลังยาใน: ${(item.mainStoreBalance || 0).toLocaleString()} ${item.mainStoreUnit || 'กระปุก'} (= ${((item.mainStoreBalance || 0) * item.conversionFactor).toLocaleString()} ${item.counterUnit || 'ตลับ'})\n🏥 หน้าเคาน์เตอร์: ${(item.counterBalance || 0).toLocaleString()} ${item.counterUnit || 'ตลับ'}`
                            : item.hasSubstockTransfers
                            ? `รวมทั้ง รพ.สต.: ${item.currentBalance.toLocaleString()} ${item.drugunit}\n📦 คลังยาใน: ${(item.mainStoreBalance || 0).toLocaleString()} ${item.drugunit}\n🏥 หน้าเคาน์เตอร์: ${(item.counterBalance || 0).toLocaleString()} ${item.drugunit}`
                            : item.currentBalance < 0
                            ? `ยอดคงเหลือติดลบ: ${item.currentBalance.toLocaleString()} ${item.drugunit}\n(จ่ายยามากกว่ายอดรับเข้า/ยอดยกมา)`
                            : `คงเหลือ: ${item.currentBalance.toLocaleString()} ${item.drugunit}`
                        }
                      >
                        <div>
                          <span className={`font-mono font-black ${currentDensity.numText} ${item.currentBalance < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                            {item.currentBalance.toLocaleString()}
                          </span>
                          <span className={`font-normal text-slate-500 ml-0.5 ${currentDensity.badge}`}>
                            {item.conversionFactor > 1 ? (item.counterUnit || item.drugunit) : item.drugunit}
                          </span>
                        </div>
                        {(item.conversionFactor > 1 || item.hasSubstockTransfers) && (
                          <div className="text-[9.5px] font-mono leading-tight mt-0.5 space-x-1">
                            <span className="text-emerald-700 font-bold" title="คงเหลือในคลังยาใน (Main Store)">
                              ใน:{(item.mainStoreBalance || 0).toLocaleString()}{item.conversionFactor > 1 ? ` ${item.mainStoreUnit || 'กระปุก'}` : ''}
                            </span>
                            <span className="text-slate-300">|</span>
                            <span className={`font-bold ${(item.counterBalance || 0) < 0 ? 'text-rose-600' : 'text-blue-700'}`} title="คงเหลือที่จุดจ่ายยาหน้าเคาน์เตอร์">
                              นอก:{(item.counterBalance || 0).toLocaleString()}{item.conversionFactor > 1 ? ` ${item.counterUnit || 'ตลับ'}` : ''}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 10. สถานะคลัง (Compact Badges — ไม่ล้นคอลัมน์) */}
                      <td className={`${currentDensity.cellPadding} text-center align-middle overflow-hidden`} style={{ width: '130px', minWidth: '125px' }}>
                        <div className="flex flex-wrap justify-center items-center gap-0.5 sm:gap-1">
                          {item.statuses.map((st, sIdx) => {
                            let badgeClass = 'bg-slate-100 text-slate-800';
                            if (st.color === 'red' || st.color === 'rose') badgeClass = 'bg-rose-100 text-rose-900 font-bold border border-rose-300';
                            else if (st.color === 'amber') badgeClass = 'bg-amber-100 text-amber-950 font-bold border border-amber-300';
                            else if (st.color === 'yellow') badgeClass = 'bg-yellow-100 text-yellow-950 font-bold border border-yellow-300';
                            else if (st.color === 'purple') badgeClass = 'bg-indigo-100 text-indigo-950 font-bold border border-indigo-300';
                            else if (st.color === 'emerald') badgeClass = 'bg-emerald-100 text-emerald-950 font-bold border border-emerald-300';

                            const shortLabel = STATUS_SHORT_MAP[st.code] || st.shortLabel || st.label;
                            return (
                              <span 
                                key={sIdx} 
                                className={`inline-block ${currentDensity.badge} font-bold ${badgeClass} shadow-2xs whitespace-nowrap`}
                                title={st.detail || st.label}
                              >
                                {shortLabel}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* 11. Actions: Stock Card & View Patients & Quick Count */}
                      <td className={`${currentDensity.cellPadding} text-center align-middle`} style={{ width: '235px', minWidth: '235px' }}>
                        <div className="flex items-center justify-center gap-1 flex-nowrap pr-1">
                          <button
                            onClick={() => handleOpenQuickCount(item)}
                            className={`inline-flex items-center space-x-0.5 ${currentDensity.actionBtn} rounded font-bold transition-all shadow-2xs whitespace-nowrap cursor-pointer shrink-0 ${
                              item.isCounted
                                ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                : 'border border-teal-300 bg-teal-50/70 text-teal-800 hover:bg-teal-100'
                            }`}
                            title="บันทึก/แก้ไข จำนวนตรวจนับยอดยกมาของยานี้"
                          >
                            <ClipboardCheck className={`${currentDensity.actionIcon} shrink-0`} />
                            <span>{item.isCounted ? (item.countedDetails?.lots?.length > 1 ? `${item.countedDetails.lots.length}L` : 'แก้นับ') : 'นับยอด'}</span>
                          </button>

                          <button
                            onClick={() => onOpenPatientDispense(item.drugcode, item.drugname, dateRange)}
                            className={`inline-flex items-center space-x-0.5 ${currentDensity.actionBtn} rounded border border-blue-300 bg-blue-50/70 hover:bg-blue-100 text-blue-800 font-bold transition-all shadow-2xs whitespace-nowrap cursor-pointer shrink-0`}
                            title="ดูรายชื่อคนไข้ที่รับยานี้ และรหัสโรคที่วินิจฉัย"
                          >
                            <Users className={`${currentDensity.actionIcon} shrink-0`} />
                            <span>คนไข้</span>
                          </button>

                          {onOpenSubstockQr && (
                            <button
                              onClick={() => onOpenSubstockQr(item.drugcode)}
                              className={`inline-flex items-center space-x-0.5 ${currentDensity.actionBtn} rounded border border-indigo-300 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-800 font-bold transition-all shadow-2xs whitespace-nowrap cursor-pointer shrink-0`}
                              title="สแกน/เบิกยานี้ออกจากคลังยาในไปไว้ที่หน้าเคาน์เตอร์ (พร้อมดู Lot/Exp และ QR Code)"
                            >
                              <QrCode className={`${currentDensity.actionIcon} text-indigo-600 shrink-0`} />
                              <span>เบิก</span>
                            </button>
                          )}

                          <button
                            onClick={() => onOpenStockCard(item.drugcode, dateRange)}
                            className={`inline-flex items-center space-x-0.5 ${currentDensity.actionBtn} rounded border border-slate-300 hover:border-emerald-400 bg-white hover:bg-emerald-50 text-slate-800 hover:text-emerald-800 font-bold transition-all shadow-2xs whitespace-nowrap cursor-pointer shrink-0`}
                            title="เปิดดูบัญชีคุมคลังยา (Stock Card)"
                          >
                            <FileText className={`${currentDensity.actionIcon} text-emerald-600 shrink-0`} />
                            <span>Card</span>
                          </button>
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
      {data?.pagination && data.pagination.totalCount > 0 && (
        <PaginationBar
          currentPage={data.pagination.page}
          pageSize={pageSize}
          totalItems={data.pagination.totalCount}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={[10, 20, 50, 100, 'all']}
          colorTheme="emerald"
          position="bottom"
        />
      )}

      {/* Quick Toast Notification */}
      {quickToast && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center space-x-2 text-sm font-semibold animate-bounce">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{quickToast}</span>
        </div>
      )}

      {/* Quick Count Modal for Single Drug (Supports Multi-Lot) */}
      {quickCountDrug && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2 text-emerald-800">
                <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-base">ตรวจนับยอดยกมา: {quickCountDrug.drugcode}</h3>
              </div>
              <button onClick={() => setQuickCountDrug(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="font-bold text-slate-900 text-sm leading-snug">{quickCountDrug.drugname}</div>
              {quickCountDrug.drugnamethai && (
                <div className="text-xs text-slate-500 mt-0.5">{quickCountDrug.drugnamethai}</div>
              )}
              <div className="text-xs text-slate-600 mt-1 flex items-center space-x-2">
                <span>หน่วยนับ: <strong className="text-slate-800">{quickCountDrug.drugunit}</strong></span>
                {quickCountDrug.unitpacking && <span>• บรรจุ: {quickCountDrug.unitpacking}</span>}
                <span>• ทุนอ้างอิง: ฿{(Number(quickCountDrug.costprice) || 0).toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handleSaveQuickCount} className="space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                    <Tag className="w-4 h-4 text-emerald-600" />
                    <span>รายการรุ่นผลิต (Lot) บนชั้นวาง</span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    * กรอกแยกแต่ละ Lot ที่พบจริง
                  </span>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto p-0.5">
                  {quickCountLots.map((lot, idx) => (
                    <div key={idx} className="bg-slate-50/70 p-3 rounded-xl border border-slate-200 space-y-2.5 relative">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-emerald-800 border border-emerald-200">
                          Lot ที่ #{idx + 1}
                        </span>
                        {quickCountLots.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveQuickLot(idx)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="ลบ Lot นี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-0.5">เลข Lot</label>
                          <input
                            type="text"
                            placeholder="เช่น LOT6901"
                            value={lot.lotno}
                            onChange={(e) => handleQuickLotChange(idx, 'lotno', e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono bg-white focus:outline-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-0.5">วันหมดอายุ</label>
                          <input
                            type="text"
                            placeholder="YYYY-MM-DD"
                            value={lot.dateexpire}
                            onChange={(e) => handleQuickLotChange(idx, 'dateexpire', e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono bg-white focus:outline-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-emerald-900 mb-0.5">
                            จำนวนที่นับได้ ({quickCountDrug.drugunit}) *
                          </label>
                          <input
                            type="number"
                            min="0"
                            required
                            placeholder="0"
                            value={lot.amount}
                            onChange={(e) => handleQuickLotChange(idx, 'amount', e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-emerald-300 rounded-lg text-xs font-mono font-bold text-right text-emerald-950 bg-white focus:outline-emerald-500 shadow-2xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleAddQuickLot}
                  className="w-full py-2 border-2 border-dashed border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5"
                >
                  <Plus className="w-4 h-4 text-emerald-600" />
                  <span>+ เพิ่ม Lot อีกรุ่นการผลิต (กรณีมียาหลายรุ่นบนชั้นวาง)</span>
                </button>
              </div>

              {/* Total auto-sum strip */}
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-emerald-800 font-bold block">ยอดตรวจนับรวมทุก Lot:</span>
                  <div className="text-xl font-black font-mono text-emerald-950 mt-0.5">
                    {quickCountLots.reduce((sum, l) => sum + (Number(l.amount) || 0), 0).toLocaleString()} <span className="text-xs font-normal text-slate-600">{quickCountDrug.drugunit}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-emerald-700 font-medium block">จำนวนรุ่นผลิต:</span>
                  <div className="text-base font-bold font-mono text-emerald-900 mt-0.5">
                    {quickCountLots.filter(l => Number(l.amount) > 0 || l.lotno).length} รุ่น
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQuickCountDrug(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingQuickCount}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center space-x-1.5"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span>{savingQuickCount ? 'กำลังบันทึก...' : 'บันทึกยอดยกมา'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
