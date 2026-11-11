import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  RefreshCw,
  Download,
  Copy,
  Check,
  Sparkles,
  Database,
  Leaf,
  Layers,
  ArrowRight,
  ExternalLink,
  ShieldAlert,
  Info,
  SlidersHorizontal,
  FileCode2,
  CheckCheck,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { api } from '../services/api';
import PaginationBar from './PaginationBar';

export default function DtamHerbalAuditTab({ fs = {}, onSwitchToSqlTab }) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [statusInfo, setStatusInfo] = useState(null);
  const [auditData, setAuditData] = useState(null);
  const [onlyActive, setOnlyActive] = useState(true); // เฉพาะยาที่ตั้งค่าว่า "มีใช้" (drugflag = '1')
  const [filter, setFilter] = useState('all'); // 'all', 'matched', 'issues', 'revoked', 'unregistered'
  const [search, setSearch] = useState('');

  // Pagination states
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  // Search Modal state
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [selectedTargetDrug, setSelectedTargetDrug] = useState(null);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [modalSearchResults, setModalSearchResults] = useState([]);
  const [modalSearching, setModalSearching] = useState(false);

  // Direct Update / Apply state
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applying, setApplying] = useState(false);
  const [itemsToUpdate, setItemsToUpdate] = useState([]);

  // SQL quick copy
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    loadDtamData(true);
  }, []);

  const loadDtamData = async (checkOnline = false, activeFilter = onlyActive) => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, auditRes] = await Promise.all([
        api.getDtamStatus(checkOnline),
        api.getDtamHerbsAudit(activeFilter)
      ]);

      if (statusRes.success) {
        setStatusInfo(statusRes.data);
        if (statusRes.data?.autoSynced) {
          setSuccessMsg(
            `ระบบตรวจพบไฟล์ Excel งวดใหม่บนเว็บไซต์ DTAM และซิงค์ข้อมูลอัตโนมัติเรียบร้อยแล้ว! (${statusRes.data.previousVersion} → ${statusRes.data.currentVersion} รวม ${statusRes.data.stats?.totalActive?.toLocaleString()} รายการ)`
          );
          // Re-run audit with newly synced registry
          const refreshedAudit = await api.getDtamHerbsAudit(activeFilter);
          if (refreshedAudit.success) setAuditData(refreshedAudit.data);
          return;
        }
      }
      if (auditRes.success) setAuditData(auditRes.data);
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูลทะเบียนยาสมุนไพร DTAM');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = (val) => {
    setOnlyActive(val);
    loadDtamData(false, val);
  };

  const handleSyncOnline = async () => {
    if (!window.confirm('คุณต้องการซิงค์ฐานข้อมูลยาสมุนไพรฉบับล่าสุดจากเว็บไซต์ กรมการแพทย์แผนไทยและการแพทย์ทางเลือก (dtam.moph.go.th) ใช่หรือไม่? ระบบจะดาวน์โหลดและประมวลผลให้อัตโนมัติ')) {
      return;
    }

    setSyncing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.syncDtamOnline();
      if (res.success) {
        setSuccessMsg(`ซิงค์ข้อมูลยาสมุนไพรฉบับล่าสุดสำเร็จ! (${res.data.version} รวม ${res.data.stats?.totalActive?.toLocaleString() || 44541} รายการ)`);
        await loadDtamData(false);
      } else {
        setError(res.message || 'ไม่สามารถซิงค์ข้อมูลจาก DTAM ได้');
      }
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการดาวน์โหลดและซิงค์ข้อมูลจาก DTAM');
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenSearchModal = (item) => {
    setSelectedTargetDrug(item);
    setModalSearchQuery(item.drugname.replace(/[\[\(\*].*?[\]\)\*]/g, '').trim());
    setSearchModalOpen(true);
    performModalSearch(item.drugname.replace(/[\[\(\*].*?[\]\)\*]/g, '').trim());
  };

  const performModalSearch = async (q) => {
    if (!q || q.trim().length < 2) {
      setModalSearchResults([]);
      return;
    }
    setModalSearching(true);
    try {
      const res = await api.searchDtamRegistry(q.trim(), 20);
      if (res.success) {
        setModalSearchResults(res.items || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setModalSearching(false);
    }
  };

  const handleAssignDtamCode = (candidate) => {
    if (!selectedTargetDrug || !auditData) return;
    
    // Update local state item
    const updatedItems = auditData.items.map(item => {
      if (item.drugcode === selectedTargetDrug.drugcode) {
        return {
          ...item,
          suggestedCode24: candidate.code24,
          suggestedTmt: candidate.tmtid,
          dtamRef: candidate,
          status: 'manually_matched',
          statusLabel: 'กำหนดรหัสแล้ว (รอปรับปรุง)',
          severity: 'info',
          message: `กำหนดรหัสคู่กับ: ${candidate.tradeName || candidate.name} (${candidate.manufacturer})`
        };
      }
      return item;
    });

    setAuditData({
      ...auditData,
      items: updatedItems
    });

    setSearchModalOpen(false);
    setSelectedTargetDrug(null);
  };

  const handlePrepareUpdates = () => {
    if (!auditData?.items) return;
    const candidates = auditData.items.filter(item => 
      (item.status === 'tmt_mismatch' || 
       item.status === 'code24_mismatch' || 
       item.status === 'manually_matched' || 
       (item.status === 'unregistered' && item.suggestedCode24)) &&
      (item.suggestedCode24 || item.suggestedTmt)
    );
    setItemsToUpdate(candidates);
    setShowApplyModal(true);
  };

  const handleExecuteUpdates = async () => {
    if (itemsToUpdate.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      const payload = itemsToUpdate.map(item => ({
        drugcode: item.drugcode,
        code24: item.suggestedCode24 || item.currentCode24,
        tmt: item.suggestedTmt || item.currentTmt
      }));

      const res = await api.applyDtamUpdates(payload);
      if (res.success) {
        setSuccessMsg(res.data.message || `อัปเดตลงฐานข้อมูล JHCIS เรียบร้อยแล้ว ${res.data.updatedCount} รายการ`);
        setShowApplyModal(false);
        await loadDtamData(false);
      } else {
        setError(res.message || 'เกิดข้อผิดพลาดในการอัปเดตฐานข้อมูล');
      }
    } catch (err) {
      setError(err.message || 'ไม่สามารถบันทึกการแก้ไขลงฐาน JHCIS ได้');
    } finally {
      setApplying(false);
    }
  };

  const handleCopyHerbsSql = async () => {
    if (!auditData?.items) return;
    const candidates = auditData.items.filter(item => 
      item.status !== 'matched' && (item.suggestedCode24 || item.suggestedTmt)
    );
    try {
      const res = await api.generateDtamSql(candidates);
      if (res.success && res.data?.sql) {
        await navigator.clipboard.writeText(res.data.sql);
        setCopiedSql(true);
        setTimeout(() => setCopiedSql(false), 2500);
      }
    } catch (e) {
      alert('เกิดข้อผิดพลาดในการสร้าง SQL: ' + e.message);
    }
  };

  // Filter logic
  const filteredItems = (auditData?.items || []).filter(item => {
    if (filter === 'matched' && item.status !== 'matched') return false;
    if (filter === 'issues' && !['tmt_mismatch', 'code24_mismatch', 'revoked'].includes(item.status)) return false;
    if (filter === 'revoked' && item.status !== 'revoked') return false;
    if (filter === 'unregistered' && item.status !== 'unregistered' && item.status !== 'manually_matched') return false;

    if (search) {
      const s = search.toLowerCase();
      const code = String(item.drugcode || '').toLowerCase();
      const name = String(item.drugname || '').toLowerCase();
      const c24 = String(item.currentCode24 || '').toLowerCase();
      const tmt = String(item.currentTmt || '').toLowerCase();
      const mfg = String(item.dtamRef?.manufacturer || '').toLowerCase();
      return code.includes(s) || name.includes(s) || c24.includes(s) || tmt.includes(s) || mfg.includes(s);
    }
    return true;
  });

  const [sortConfig, setSortConfig] = useState({ key: 'drugname', direction: 'asc' });
  const tableContainerRef = useRef(null);
  const [scrollInfo, setScrollInfo] = useState({ hasOverflow: false, canScrollLeft: false, canScrollRight: false });

  const updateScrollState = () => {
    const el = tableContainerRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 5;
    const canScrollLeft = el.scrollLeft > 10;
    const canScrollRight = el.scrollLeft < (el.scrollWidth - el.clientWidth - 10);
    setScrollInfo({ hasOverflow, canScrollLeft, canScrollRight });
  };

  useEffect(() => {
    updateScrollState();
    window.addEventListener('resize', updateScrollState);
    const timer = setTimeout(updateScrollState, 200);
    return () => {
      window.removeEventListener('resize', updateScrollState);
      clearTimeout(timer);
    };
  }, [filteredItems.length, filter]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedItems = [...filteredItems].sort((a, b) => {
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    switch (sortConfig.key) {
      case 'drugname':
        return String(a.drugname || '').localeCompare(String(b.drugname || ''), 'th') * dir;
      case 'drugcode': {
        const numA = Number(a.drugcode);
        const numB = Number(b.drugcode);
        if (!isNaN(numA) && !isNaN(numB)) return (numA - numB) * dir;
        return String(a.drugcode || '').localeCompare(String(b.drugcode || ''), 'th') * dir;
      }
      case 'currentCode24':
        return String(a.currentCode24 || '').localeCompare(String(b.currentCode24 || '')) * dir;
      case 'currentTmt':
        return String(a.currentTmt || '').localeCompare(String(b.currentTmt || '')) * dir;
      case 'status':
        return String(a.status || '').localeCompare(String(b.status || '')) * dir;
      default:
        return 0;
    }
  });

  // Reset page when filter, search or onlyActive changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search, onlyActive]);

  // Pagination calculations
  const numericSize = pageSize === 'all' ? Math.max(1, sortedItems.length) : (Number(pageSize) || 20);
  const totalPages = pageSize === 'all' || sortedItems.length === 0 ? 1 : Math.ceil(sortedItems.length / numericSize);
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = pageSize === 'all' ? 0 : (validCurrentPage - 1) * numericSize;
  const endIndex = pageSize === 'all' ? sortedItems.length : Math.min(startIndex + numericSize, sortedItems.length);
  const paginatedItems = sortedItems.slice(startIndex, endIndex);

  const renderSortableHeader = (label, sortKey, align = 'left', extraClass = '') => {
    const isActive = sortConfig.key === sortKey;
    return (
      <th
        onClick={() => handleSort(sortKey)}
        className={`${fs.tableTh || 'py-2.5 px-3 text-xs font-bold'} ${extraClass} cursor-pointer select-none hover:bg-slate-100 transition-colors group`}
        title={`คลิกเพื่อเรียงลำดับตาม ${label}`}
      >
        <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
          <span>{label}</span>
          <span className="text-slate-400 group-hover:text-slate-700 transition-colors shrink-0">
            {isActive ? (
              sortConfig.direction === 'asc' ? (
                <ArrowUp className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
              )
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-40 group-hover:opacity-100" />
            )}
          </span>
        </div>
      </th>
    );
  };

  const summary = auditData?.summary || { total: 0, matched: 0, tmtMismatch: 0, code24Mismatch: 0, revoked: 0, unregistered: 0 };

  return (
    <div className="space-y-4 sm:space-y-6">
      
      {/* 1. Header Banner & Status */}
      <div className="bg-linear-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-3xl p-5 sm:p-7 shadow-xl border border-emerald-700/40 relative overflow-hidden">
        {/* Subtle decorative circles */}
        <div className="absolute -right-12 -top-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs sm:text-sm font-bold border border-emerald-400/30">
                <Leaf className="w-4 h-4 text-emerald-400" />
                กรมการแพทย์แผนไทยและการแพทย์ทางเลือก (DTAM)
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-slate-200 text-xs sm:text-sm font-mono font-semibold">
                รหัสยาแผนไทย 24 หลัก &amp; TMT
              </span>
              {statusInfo?.currentVersion && (
                <span className="px-3 py-1 rounded-full bg-amber-400 text-slate-950 text-xs sm:text-sm font-black tracking-wide shadow-xs">
                  {statusInfo.currentVersion}
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <span>ตรวจสอบรหัสยาสมุนไพรในฐาน JHCIS เทียบทะเบียน DTAM</span>
            </h2>

            <p className="text-xs sm:text-sm lg:text-base text-emerald-100/90 leading-relaxed">
              เปรียบเทียบข้อมูลยาสมุนไพรในตาราง <code className="bg-emerald-950/80 px-1.5 py-0.5 rounded text-emerald-300 font-mono font-bold">cdrug</code> ของหน่วยบริการ {onlyActive ? 'เฉพาะรายการที่ตั้งค่าว่า "มีใช้" ใน JHCIS (drugflag = 1)' : 'ทุกรายการ'} กับบัญชียาแผนไทยที่ได้รับการขึ้นทะเบียนมาตรฐาน 44,541 รายการจาก DTAM (ตัดยาที่ไม่ใช้/ไม่ได้ปรับปรุงออกเพื่อให้ตรงตามความเป็นจริง)
            </p>

            {statusInfo?.builtAt && (
              <p className="text-[11px] sm:text-xs text-emerald-300/80 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                <span>ฐานข้อมูลในระบบอัปเดตเมื่อ: {new Date(statusInfo.builtAt).toLocaleString('th-TH')}</span>
                <span>• มีทั้งหมด {statusInfo.stats?.totalActive?.toLocaleString()} รายการ (ยกเลิก {statusInfo.stats?.revokedCount?.toLocaleString()} รายการ)</span>
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-stretch lg:self-auto justify-end">
            <button
              type="button"
              onClick={handleSyncOnline}
              disabled={syncing || loading}
              className="flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm transition-all shadow-lg hover:shadow-emerald-500/25 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'กำลังซิงค์จากเว็บ DTAM...' : '🔄 ซิงค์รหัสล่าสุดจากเว็บ DTAM'}</span>
            </button>

            <button
              type="button"
              onClick={() => loadDtamData(true)}
              disabled={loading || syncing}
              className="flex items-center gap-1.5 px-3.5 py-2.5 sm:py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs sm:text-sm transition-colors border border-white/15 cursor-pointer"
            >
              <ExternalLink className="w-4 h-4 text-emerald-300" />
              <span>ตรวจงวดใหม่</span>
            </button>
          </div>
        </div>

        {/* Online update alert banner */}
        {statusInfo?.hasUpdate && (
          <div className="mt-4 p-3.5 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs sm:text-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
              <span>
                ตรวจพบไฟล์งวดใหม่บนหน้าเว็บกรมการแพทย์แผนไทยฯ: <strong>{statusInfo.online?.version}</strong> (กดปุ่ม "ซิงค์รหัสล่าสุด" เพื่ออัปเกรดอัตโนมัติ)
              </span>
            </div>
            <button
              type="button"
              onClick={handleSyncOnline}
              className="px-3 py-1 bg-amber-400 text-slate-950 rounded-xl font-bold text-xs shrink-0 cursor-pointer"
            >
              ซิงค์ทันที
            </button>
          </div>
        )}
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}

      {/* Active / In-Use Scope Filter Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 sm:p-4 shadow-2xs">
        <div className="flex items-center gap-2.5 text-xs sm:text-sm text-emerald-950">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
          <span className="font-extrabold">ขอบเขตการดึงยา:</span>
          <span className="text-slate-600 hidden sm:inline">
            {onlyActive 
              ? 'ดึงเฉพาะรายการที่เปิดสวิตช์ "มีใช้" ใน JHCIS (cdrug.drugflag = 1) เพื่อตัดยาเก่าที่ไม่ใช้งานออก' 
              : 'ดึงยาสมุนไพรทุกรายการในฐานข้อมูล (รวมยาที่ยกเลิก/ระงับใช้)'}
          </span>
        </div>
        
        <div className="flex items-center bg-white p-1 rounded-xl border border-emerald-300 shadow-2xs shrink-0">
          <button
            type="button"
            onClick={() => handleToggleActive(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              onlyActive 
                ? 'bg-emerald-600 text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>เฉพาะยาที่ "มีใช้" ใน รพ.สต. (แนะนำ)</span>
          </button>

          <button
            type="button"
            onClick={() => handleToggleActive(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              !onlyActive 
                ? 'bg-slate-800 text-white shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>ดึงยาทั้งหมด (รวมที่ไม่ใช้)</span>
          </button>
        </div>
      </div>

      {/* 2. Metric KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total */}
        <div 
          onClick={() => setFilter('all')}
          className={`group p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md cursor-pointer active:translate-y-0 active:scale-[0.99] ${
            filter === 'all' 
              ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/20' 
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-400'
          }`}
        >
          <div className="text-[11px] sm:text-xs font-bold opacity-80 flex items-center gap-1">
            <Leaf className="w-3.5 h-3.5 text-emerald-500 transition-transform duration-200 group-hover:scale-110" />
            <span>{onlyActive ? 'สมุนไพรที่มีใช้' : 'สมุนไพรทั้งหมด'}</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono mt-1 tracking-tight">
            {summary.total}
          </div>
          <div className="text-[10px] sm:text-[11px] opacity-70 mt-0.5">
            {onlyActive ? 'cdrug (drugflag = 1)' : 'รวมยาที่ไม่ใช้'}
          </div>
        </div>

        {/* Matched */}
        <div 
          onClick={() => setFilter('matched')}
          className={`group p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md cursor-pointer active:translate-y-0 active:scale-[0.99] ${
            filter === 'matched' 
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/20' 
              : 'bg-emerald-50/60 text-emerald-950 border-emerald-200 hover:border-emerald-400'
          }`}
        >
          <div className="text-[11px] sm:text-xs font-bold text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 transition-transform duration-200 group-hover:scale-110" />
            <span>ตรงกันสมบูรณ์</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-700 mt-1 tracking-tight">
            {summary.matched}
          </div>
          <div className="text-[10px] sm:text-[11px] text-emerald-600/80 mt-0.5 font-medium">24 หลัก &amp; TMT ถูกต้อง</div>
        </div>

        {/* TMT Mismatch */}
        <div 
          onClick={() => setFilter('issues')}
          className={`group p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md cursor-pointer active:translate-y-0 active:scale-[0.99] ${
            filter === 'issues' 
              ? 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-500/20' 
              : 'bg-amber-50/60 text-amber-950 border-amber-200 hover:border-amber-400'
          }`}
        >
          <div className="text-[11px] sm:text-xs font-bold text-amber-700 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 transition-transform duration-200 group-hover:scale-110" />
            <span>TMT ไม่ตรง / ขาด</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-amber-700 mt-1 tracking-tight">
            {summary.tmtMismatch}
          </div>
          <div className="text-[10px] sm:text-[11px] text-amber-600/80 mt-0.5 font-medium">รหัส 24 หลักตรง</div>
        </div>

        {/* Code 24 Mismatch */}
        <div 
          onClick={() => setFilter('issues')}
          className="group p-3.5 sm:p-4 rounded-2xl border bg-orange-50/60 text-orange-950 border-orange-200 hover:border-orange-400 transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md cursor-pointer active:translate-y-0 active:scale-[0.99]"
        >
          <div className="text-[11px] sm:text-xs font-bold text-orange-700 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-600 transition-transform duration-200 group-hover:scale-110" />
            <span>24 หลักไม่ตรง</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-orange-700 mt-1 tracking-tight">
            {summary.code24Mismatch}
          </div>
          <div className="text-[10px] sm:text-[11px] text-orange-600/80 mt-0.5 font-medium">TMT ตรงแต่ 24 หลักผิด</div>
        </div>

        {/* Revoked */}
        <div 
          onClick={() => setFilter('revoked')}
          className={`group p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md cursor-pointer active:translate-y-0 active:scale-[0.99] ${
            filter === 'revoked' 
              ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/20 animate-pulse' 
              : 'bg-rose-50/80 text-rose-950 border-rose-300 hover:border-rose-500'
          }`}
        >
          <div className="text-[11px] sm:text-xs font-extrabold text-rose-700 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600 transition-transform duration-200 group-hover:scale-110" />
            <span>รหัสถูกยกเลิก!</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-rose-700 mt-1 tracking-tight">
            {summary.revoked}
          </div>
          <div className="text-[10px] sm:text-[11px] text-rose-600/90 font-bold mt-0.5">ห้ามใช้เบิกชดเชย</div>
        </div>

        {/* Unregistered / Placeholder */}
        <div 
          onClick={() => setFilter('unregistered')}
          className={`group p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 transform hover:-translate-y-1 hover:shadow-md cursor-pointer active:translate-y-0 active:scale-[0.99] ${
            filter === 'unregistered' 
              ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-500/20' 
              : 'bg-purple-50/60 text-purple-950 border-purple-200 hover:border-purple-400'
          }`}
        >
          <div className="text-[11px] sm:text-xs font-bold text-purple-700 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-purple-600 transition-transform duration-200 group-hover:scale-110" />
            <span>ยังไม่มีรหัสมาตรฐาน</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-purple-700 mt-1 tracking-tight">
            {summary.unregistered}
          </div>
          <div className="text-[10px] sm:text-[11px] text-purple-600/80 mt-0.5 font-medium">รหัสท้องถิ่น / ขาดรหัส</div>
        </div>
      </div>

      {/* 3. Filter Bar & Search */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              filter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            ทั้งหมด ({summary.total})
          </button>

          <button
            type="button"
            onClick={() => setFilter('matched')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              filter === 'matched'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            ตรงสมบูรณ์ ({summary.matched})
          </button>

          <button
            type="button"
            onClick={() => setFilter('issues')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              filter === 'issues'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            มีข้อผิดพลาด ({summary.tmtMismatch + summary.code24Mismatch + summary.revoked})
          </button>

          <button
            type="button"
            onClick={() => setFilter('revoked')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              filter === 'revoked'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
            }`}
          >
            ถูกยกเลิก ({summary.revoked})
          </button>

          <button
            type="button"
            onClick={() => setFilter('unregistered')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              filter === 'unregistered'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
            }`}
          >
            ยังไม่มีรหัส ({summary.unregistered})
          </button>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64 lg:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อยา, รหัส 24 หลัก, TMT..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Action: Apply Updates */}
          <button
            type="button"
            onClick={handlePrepareUpdates}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>ปรับปรุงฐาน JHCIS</span>
          </button>

          {/* Quick Action: Copy SQL */}
          <button
            type="button"
            onClick={handleCopyHerbsSql}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs sm:text-sm font-bold transition-colors shrink-0 cursor-pointer"
            title="คัดลอกคำสั่ง SQL สำหรับแก้ไขตาราง cdrug"
          >
            {copiedSql ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copiedSql ? 'คัดลอกแล้ว!' : 'SQL'}</span>
          </button>
        </div>
      </div>

      {/* Scroll Hint & Quick Scroll Controls */}
      {scrollInfo.hasOverflow && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-emerald-50/90 border border-emerald-200/90 rounded-xl text-xs text-emerald-950 shadow-2xs mb-2">
          <div className="flex items-center gap-2 font-medium">
            <span className="text-base animate-pulse">👉</span>
            <span>
              ตารางทะเบียนสมุนไพรกว้างกว่าจอแสดงผล: <strong>เลื่อนตารางไปทางขวา</strong> เพื่อดูข้อมูลเพิ่มเติม
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={!scrollInfo.canScrollLeft}
              onClick={() => tableContainerRef.current?.scrollBy({ left: -260, behavior: 'smooth' })}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all ${
                scrollInfo.canScrollLeft
                  ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-2xs cursor-pointer'
                  : 'opacity-40 cursor-not-allowed text-slate-400 border-transparent'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>ซ้าย</span>
            </button>
            <button
              type="button"
              disabled={!scrollInfo.canScrollRight}
              onClick={() => tableContainerRef.current?.scrollBy({ left: 260, behavior: 'smooth' })}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all ${
                scrollInfo.canScrollRight
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-2xs cursor-pointer'
                  : 'opacity-40 cursor-not-allowed text-slate-400 border-transparent'
              }`}
            >
              <span>ขวา</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Top Pagination Bar */}
      <PaginationBar
        currentPage={validCurrentPage}
        pageSize={pageSize}
        totalItems={sortedItems.length}
        onPageChange={setCurrentPage}
        onPageSizeChange={(sz) => { setPageSize(sz); setCurrentPage(1); }}
        colorTheme="teal"
        position="top"
      />

      {/* 4. Table of Audited Herbal Drugs */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div 
          ref={tableContainerRef} 
          onScroll={updateScrollState}
          className="overflow-x-auto table-responsive table-scroll-visible max-h-[calc(100vh-220px)] overflow-y-auto"
        >
          <table className={`w-full text-left border-collapse ${fs.table}`}>
            <thead className="sticky top-0 z-10 bg-slate-100/95 shadow-xs backdrop-blur-xs">
              <tr className="bg-slate-100/95 border-b border-slate-200 text-slate-700">
                <th className={`${fs.tableTh} w-10 text-center`}>#</th>
                {renderSortableHeader('ชื่อยาใน JHCIS / รหัสยา', 'drugname', 'left', 'min-w-[170px] max-w-[260px]')}
                {renderSortableHeader('รหัสยา 24 หลัก', 'currentCode24', 'left', 'min-w-[160px] whitespace-nowrap')}
                {renderSortableHeader('รหัส TMT', 'currentTmt', 'left', 'w-28 whitespace-nowrap')}
                {renderSortableHeader('ข้อมูลอ้างอิง DTAM', 'drugname', 'left', 'min-w-[170px] max-w-[260px]')}
                {renderSortableHeader('สถานะตรวจสอบ', 'status', 'center', 'w-36 whitespace-nowrap')}
                <th className={`${fs.tableTh} w-32 text-center`}>การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin mx-auto mb-2" />
                    <p className="text-sm font-bold">กำลังตรวจสอบรายการยาสมุนไพรในฐาน JHCIS...</p>
                  </td>
                </tr>
              ) : sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Leaf className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-600">ไม่พบรายการยาสมุนไพรตามเงื่อนไขที่เลือก</p>
                    <p className="text-xs text-slate-400 mt-1">ลองเปลี่ยนคำค้นหา หรือกดเลือกตัวกรอง "ทั้งหมด"</p>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item, idx) => {
                  const isRevoked = item.status === 'revoked';
                  const isMatched = item.status === 'matched';
                  const isTmtMismatch = item.status === 'tmt_mismatch';
                  const isCode24Mismatch = item.status === 'code24_mismatch';
                  const isUnregistered = item.status === 'unregistered';
                  const isManual = item.status === 'manually_matched';

                  return (
                    <tr 
                      key={item.drugcode || idx}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isRevoked ? 'bg-rose-50/40' : ''
                      }`}
                    >
                      {/* # */}
                      <td className={`${fs.tableTd} text-center font-mono text-slate-400 text-xs`}>
                        {startIndex + idx + 1}
                      </td>

                      {/* Name & JHCIS Drug Code */}
                      <td className={fs.tableTd}>
                        <div className={fs.tradeName}>{item.drugname}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200">
                            {item.drugcode}
                          </span>
                          {item.drugflag === '2' && (
                            <span 
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200"
                              title="ตั้งค่าใน JHCIS เป็น 'ไม่ใช้' (cdrug.drugflag = 2)"
                            >
                              ไม่ใช้ (drugflag=2)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 24-digit Code */}
                      <td className={fs.tableTd}>
                        {item.currentCode24 ? (
                          <div className={`font-mono text-xs sm:text-sm font-bold ${
                            isRevoked ? 'text-rose-700 line-through' :
                            isCode24Mismatch ? 'text-amber-700 line-through' :
                            'text-slate-800'
                          }`}>
                            {item.currentCode24}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">ไม่มีรหัสใน JHCIS</span>
                        )}

                        {/* Suggested Code24 if different */}
                        {item.suggestedCode24 && item.suggestedCode24 !== item.currentCode24 && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono font-bold border border-emerald-200">
                            <ArrowRight className="w-3 h-3 shrink-0" />
                            <span>{item.suggestedCode24}</span>
                          </div>
                        )}
                      </td>

                      {/* TMT ID */}
                      <td className={fs.tableTd}>
                        {item.currentTmt ? (
                          <div className={`font-mono text-xs sm:text-sm font-bold ${
                            isTmtMismatch ? 'text-amber-700 line-through' : 'text-slate-800'
                          }`}>
                            {item.currentTmt}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">ไม่มี TMT</span>
                        )}

                        {/* Suggested TMT if different */}
                        {item.suggestedTmt && item.suggestedTmt !== item.currentTmt && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono font-bold border border-emerald-200">
                            <ArrowRight className="w-3 h-3 shrink-0" />
                            <span>{item.suggestedTmt}</span>
                          </div>
                        )}
                      </td>

                      {/* DTAM Reference Info */}
                      <td className={fs.tableTd}>
                        {item.dtamRef ? (
                          <div className="space-y-0.5 text-xs text-slate-600">
                            <div className="font-bold text-slate-800">
                              {item.dtamRef.tradeName || item.dtamRef.name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {item.dtamRef.form} {item.dtamRef.strength ? `• ${item.dtamRef.strength}` : ''}
                            </div>
                            <div className="text-[11px] text-emerald-800 font-medium">
                              ผู้ผลิต: {item.dtamRef.manufacturer || '-'}
                            </div>
                            {item.dtamRef.regNo && (
                              <div className="text-[10px] text-slate-400">
                                ทะเบียน: {item.dtamRef.regNo}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">ไม่มีข้อมูลจับคู่</span>
                        )}
                      </td>

                      {/* Audit Status Badge */}
                      <td className={`${fs.tableTd} text-center`}>
                        {isRevoked && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-black border border-rose-200 shadow-2xs">
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                            <span>ถูกยกเลิกแล้ว</span>
                          </span>
                        )}
                        {isMatched && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>ตรงสมบูรณ์</span>
                          </span>
                        )}
                        {isTmtMismatch && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200 shadow-2xs">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>TMT ไม่ตรง</span>
                          </span>
                        )}
                        {isCode24Mismatch && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-bold border border-orange-200 shadow-2xs">
                            <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
                            <span>24 หลักไม่ตรง</span>
                          </span>
                        )}
                        {isManual && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold border border-blue-200 shadow-2xs">
                            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                            <span>กำหนดรหัสแล้ว</span>
                          </span>
                        )}
                        {isUnregistered && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 text-xs font-bold border border-purple-200 shadow-2xs">
                            <Info className="w-3.5 h-3.5 text-purple-600" />
                            <span>ยังไม่มีรหัส</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className={`${fs.tableTd} text-center`}>
                        <button
                          type="button"
                          onClick={() => handleOpenSearchModal(item)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 font-bold text-xs transition-colors border border-slate-200 hover:border-emerald-300 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Search className="w-3.5 h-3.5" />
                          <span>ค้นหา DTAM</span>
                        </button>
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
      <PaginationBar
        currentPage={validCurrentPage}
        pageSize={pageSize}
        totalItems={sortedItems.length}
        onPageChange={setCurrentPage}
        onPageSizeChange={(sz) => { setPageSize(sz); setCurrentPage(1); }}
        colorTheme="teal"
        position="bottom"
      />

      {/* 5. MODAL: Search & Assign DTAM Drug */}
      {searchModalOpen && selectedTargetDrug && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-7 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start">
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                  ค้นหาบัญชียาสมุนไพร DTAM (44,541 รายการ)
                </span>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 mt-1">
                  จับคู่รหัสมาตรฐานให้: {selectedTargetDrug.drugname}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  รหัสใน JHCIS: {selectedTargetDrug.drugcode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSearchModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={modalSearchQuery}
                onChange={(e) => {
                  setModalSearchQuery(e.target.value);
                  performModalSearch(e.target.value);
                }}
                placeholder="พิมพ์ชื่อสมุนไพร เช่น ฟ้าทะลายโจร, ขมิ้นชัน, ยาหอมเทพจิตร..."
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-semibold"
              />
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
              {modalSearching ? (
                <div className="py-8 text-center text-slate-400 text-xs font-bold flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>กำลังค้นหาในทะเบียน 44,541 รายการ...</span>
                </div>
              ) : modalSearchResults.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  ไม่พบรายการที่ตรงกับ "{modalSearchQuery}"
                </div>
              ) : (
                modalSearchResults.map((cand, i) => (
                  <div key={cand.code24 || i} className="pt-2 pb-2 flex justify-between items-center gap-3 hover:bg-slate-50 px-2 rounded-xl transition-colors">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900 text-xs sm:text-sm">
                        {cand.tradeName || cand.name}
                        {cand.tradeName && cand.name !== cand.tradeName ? ` (${cand.name})` : ''}
                      </div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap gap-2">
                        <span>{cand.form}</span>
                        {cand.strength && <span>• {cand.strength}</span>}
                        <span className="text-emerald-700 font-medium">• {cand.manufacturer}</span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-600 flex gap-3">
                        <span>24 หลัก: <strong className="text-slate-900">{cand.code24}</strong></span>
                        {cand.tmtid && <span>TMT: <strong className="text-emerald-700">{cand.tmtid}</strong></span>}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAssignDtamCode(cand)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-xs"
                    >
                      เลือกรหัสนี้
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSearchModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: Direct Update Confirmation */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-7 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900">
                  ยืนยันการปรับปรุงฐานข้อมูล JHCIS
                </h3>
                <p className="text-xs text-slate-500">
                  ระบบจะทำการอัปเดตฟิลด์ <code className="font-mono font-bold text-blue-700">drugcode24</code> และ <code className="font-mono font-bold text-blue-700">tmtcode</code> ในตาราง <code className="font-mono font-bold text-blue-700">cdrug</code>
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2 max-h-56 overflow-y-auto">
              <div className="font-bold text-slate-900">รายการที่จะได้รับการอัปเดต ({itemsToUpdate.length} รายการ):</div>
              {itemsToUpdate.map((it, idx) => (
                <div key={idx} className="flex justify-between items-center text-[11px] py-1 border-b border-slate-200/60 last:border-0">
                  <span className="font-medium text-slate-800">{it.drugname}</span>
                  <span className="font-mono text-emerald-700 font-bold">
                    TMT: {it.suggestedTmt || it.currentTmt || '-'}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowApplyModal(false)}
                disabled={applying}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleExecuteUpdates}
                disabled={applying}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer flex items-center gap-1.5"
              >
                {applying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                <span>{applying ? 'กำลังบันทึก...' : 'ยืนยันบันทึกลงฐาน JHCIS'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
