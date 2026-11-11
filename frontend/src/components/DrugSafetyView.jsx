import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  Activity, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  FileSpreadsheet, 
  Calendar, 
  Search, 
  CheckCircle2, 
  Info, 
  ArrowRight, 
  SlidersHorizontal,
  Flame,
  HeartPulse,
  Droplets,
  Stethoscope,
  Copy,
  Check,
  Plus,
  Trash2,
  AlertOctagon,
  Layers,
  X,
  Bell
} from 'lucide-react';
import { api } from '../services/api';
import PaginationBar from './PaginationBar';

// Web Audio API generator สำหรับเสียงแจ้งเตือนที่ไม่ต้องพึ่งไฟล์ภายนอก
function playAlertChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // Tone 1 (High)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
    gain1.gain.setValueAtTime(0.15, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.4);

    // Tone 2 (Lower alert)
    setTimeout(() => {
      try {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        gain2.gain.setValueAtTime(0.2, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.5);
      } catch (e) {}
    }, 180);
  } catch (e) {}
}

export default function DrugSafetyView({ dbConfig, onLiveCountChange }) {
  const [subTab, setSubTab] = useState('live'); // 'live' | 'history' | 'conflicts' | 'drugs' | 'mechanism'
  const [liveData, setLiveData] = useState(null);
  const [loadingLive, setLoadingLive] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // History states
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [historyFilter, setHistoryFilter] = useState('all'); // 'all' | 'triple' | 'conflict' | 'double'
  const [historyData, setHistoryData] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 2-Drug Conflict Registry states (คู่ยาที่ไม่ควรจ่ายร่วมกัน)
  const [conflictData, setConflictData] = useState(null);
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const [showAddConflictModal, setShowAddConflictModal] = useState(false);
  const [newPairDrugA, setNewPairDrugA] = useState('');
  const [newPairDrugB, setNewPairDrugB] = useState('');
  const [newPairReason, setNewPairReason] = useState('');
  const [submittingPair, setSubmittingPair] = useState(false);
  const [conflictPage, setConflictPage] = useState(1);
  const [conflictPageSize, setConflictPageSize] = useState(20);

  // Drug catalog registry states
  const [drugsList, setDrugsList] = useState([]);
  const [loadingDrugs, setLoadingDrugs] = useState(false);
  const [drugSearch, setDrugSearch] = useState('');
  const [drugFilterCategory, setDrugFilterCategory] = useState('all'); // 'all' | 'nsaid' | 'diuretic' | 'acei_arb' | 'statin' | 'fibrate'
  const [drugPage, setDrugPage] = useState(1);
  const [drugPageSize, setDrugPageSize] = useState(20);

  useEffect(() => {
    setDrugPage(1);
  }, [drugSearch, drugFilterCategory]);

  // Settings states
  const [safetySettings, setSafetySettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Notification / Copied
  const [copiedId, setCopiedId] = useState(null);
  const prevCriticalCountRef = useRef(0);

  // 1. โหลดข้อมูล Live ตรวจจับสด
  const loadLiveData = async () => {
    try {
      setLoadingLive(true);
      const res = await api.getLiveSafetyAlerts();
      if (res.success && res.data) {
        setLiveData(res.data);
        const criticalTotal = (res.data.tripleCount || 0) + (res.data.conflictPairCount || 0);
        if (onLiveCountChange) {
          onLiveCountChange(criticalTotal);
        }

        // เล่นเสียงเตือนถ้ามีเคสวิกฤตใหม่เข้ามา
        if (soundEnabled && criticalTotal > prevCriticalCountRef.current && prevCriticalCountRef.current !== 0) {
          playAlertChime();
        }
        prevCriticalCountRef.current = criticalTotal;
      }
    } catch (err) {
      console.error('Failed to load live safety alerts:', err);
    } finally {
      setLoadingLive(false);
    }
  };

  useEffect(() => {
    loadLiveData();
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      loadLiveData();
    }, 20000); // ทุก 20 วินาที
    return () => clearInterval(timer);
  }, [autoRefresh, soundEnabled]);

  // 2. โหลดประวัติย้อนหลัง
  const loadHistoryData = async () => {
    try {
      setLoadingHistory(true);
      const res = await api.getHistoricalSafetyAlerts(startDate, endDate, historyFilter);
      if (res.success) {
        setHistoryData(res.data);
      }
    } catch (err) {
      console.error('Failed to load history safety alerts:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (subTab === 'history' && !historyData) {
      loadHistoryData();
    }
  }, [subTab]);

  // 3. โหลดทะเบียนยา 3 กลุ่ม
  const loadDrugsList = async () => {
    try {
      setLoadingDrugs(true);
      const res = await api.getSafetyDrugClassifications();
      if (res.success) {
        setDrugsList(res.data || []);
      }
    } catch (err) {
      console.error('Failed to load drugs list:', err);
    } finally {
      setLoadingDrugs(false);
    }
  };

  useEffect(() => {
    if (subTab === 'drugs' && drugsList.length === 0) {
      loadDrugsList();
    }
  }, [subTab]);

  // 4. โหลดทะเบียนคู่ยาที่ไม่ควรจ่ายร่วมกัน (2-Drug Conflict Registry)
  const loadConflictData = async () => {
    try {
      setLoadingConflicts(true);
      const res = await api.getSafetyConflictRegistry();
      if (res.success) {
        setConflictData(res.data);
      }
    } catch (err) {
      console.error('Failed to load conflict registry:', err);
    } finally {
      setLoadingConflicts(false);
    }
  };

  useEffect(() => {
    if (subTab === 'conflicts') {
      loadConflictData();
      if (drugsList.length === 0) loadDrugsList();
    }
  }, [subTab]);

  // 5. บันทึกเพิ่มคู่ยาที่ไม่ควรจ่ายร่วมกัน
  const handleAddConflictPair = async (e) => {
    e.preventDefault();
    if (!newPairDrugA || !newPairDrugB || newPairDrugA === newPairDrugB) {
      alert('กรุณาเลือกยาทั้งสองตัว และต้องไม่เป็นยาตัวเดียวกัน');
      return;
    }
    try {
      setSubmittingPair(true);
      const res = await api.addSafetyConflictPair({
        drugcode_a: newPairDrugA,
        drugcode_b: newPairDrugB,
        reason: newPairReason
      });
      if (res.success) {
        setConflictData(res.data);
        setShowAddConflictModal(false);
        setNewPairDrugA('');
        setNewPairDrugB('');
        setNewPairReason('');
        loadLiveData(); // อัปเดตการตรวจจับสดทันที
      } else {
        alert(res.message || 'ไม่สามารถเพิ่มคู่ยาได้');
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmittingPair(false);
    }
  };

  // 6. ลบคู่ยาที่ไม่ควรจ่ายร่วมกัน
  const handleDeleteConflictPair = async (codeA, codeB, nameA, nameB) => {
    if (!window.confirm(`ยืนยันการลบคู่ยา:\n"${nameA || codeA}"\nกับ\n"${nameB || codeB}"\nออกจากรายการยาที่ไม่ควรจ่ายร่วมกัน?`)) return;
    try {
      const res = await api.deleteSafetyConflictPair({ drugcode_a: codeA, drugcode_b: codeB });
      if (res.success) {
        setConflictData(res.data);
        loadLiveData();
      } else {
        alert(res.message || 'ไม่สามารถลบคู่ยาได้');
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการลบ: ' + err.message);
    }
  };

  // คัดลอกแจ้งเตือนเข้า Clipboard
  const handleCopyAlert = (alert) => {
    const text = `🚨 [แจ้งเตือนความปลอดภัยด้านยา]\nVisit: ${alert.visitno} วันที่: ${alert.visitdate} ${alert.dispensetime}\nผู้ป่วย: ${alert.patientNameMasked} (HN: ${alert.hn || alert.pid})\nประเภท: ${alert.title}\nคำแนะนำ: ${alert.clinicalAdvice}\nผู้สั่ง: ${alert.username}`;
    navigator.clipboard.writeText(text);
    setCopiedId(alert.visitno);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // กรองรายการยาในทะเบียน
  const filteredDrugs = drugsList.filter(d => {
    const searchMatch = !drugSearch || 
      d.drugname?.toLowerCase().includes(drugSearch.toLowerCase()) ||
      d.druggenericname?.toLowerCase().includes(drugSearch.toLowerCase()) ||
      d.drugcode?.toLowerCase().includes(drugSearch.toLowerCase());

    if (!searchMatch) return false;

    if (drugFilterCategory === 'nsaid') return d.isNsaid;
    if (drugFilterCategory === 'diuretic') return d.isDiuretic;
    if (drugFilterCategory === 'acei_arb') return d.isAceiArb;
    if (drugFilterCategory === 'statin') return d.isStatin;
    if (drugFilterCategory === 'fibrate') return d.isFibrate;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* ========================================================= */}
      {/* 1. TOP HEADER & EMERGENCY BADGES */}
      {/* ========================================================= */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                Clinical Decision Support
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-slate-200">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                Live JHCIS Scanner
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              เรดาร์เฝ้าระวังยา & แจ้งเตือนยาที่ไม่ควรจ่ายร่วมกัน
            </h1>
            <p className="text-sm sm:text-base text-slate-300 mt-2 max-w-2xl leading-relaxed">
              ตรวจจับทั้งภาวะ <strong>Triple Whammy (NSAIDs + Diuretics + ACEi/ARBs)</strong> ป้องกันไตวายเฉียบพลัน (AKI) 
              และ <strong>คู่ยาที่ไม่ควรจ่ายร่วมในคราวเดียวกัน (2-Drug Conflicts)</strong> ซิงค์ตรงกับฐานข้อมูล JHCIS
            </p>
          </div>

          {/* Quick Counter Badges */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Triple Whammy */}
            <div className={`group p-4 rounded-2xl border flex items-center gap-3.5 transition-all duration-200 transform hover:-translate-y-1 hover:shadow-lg ${
              (liveData?.tripleCount || 0) > 0 
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-200 shadow-lg shadow-rose-950/50 animate-pulse hover:border-rose-400' 
                : 'bg-white/5 border-white/10 hover:border-white/25 text-slate-300'
            }`}>
              <div className={`p-2.5 rounded-xl transition-transform duration-200 group-hover:scale-110 ${
                (liveData?.tripleCount || 0) > 0 ? 'bg-rose-600 text-white' : 'bg-white/10 text-slate-400'
              }`}>
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight">
                  {liveData?.tripleCount ?? 0}
                </div>
                <div className="text-xs text-slate-300 font-medium">Triple Whammy วันนี้</div>
              </div>
            </div>

            {/* 2-Drug Conflict Pairs */}
            <div className={`group p-4 rounded-2xl border flex items-center gap-3.5 transition-all duration-200 transform hover:-translate-y-1 hover:shadow-lg ${
              (liveData?.conflictPairCount || 0) > 0
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-200 shadow-lg shadow-amber-950/50 hover:border-amber-400'
                : 'bg-white/5 border-white/10 hover:border-white/25 text-slate-300'
            }`}>
              <div className={`p-2.5 rounded-xl transition-transform duration-200 group-hover:scale-110 ${
                (liveData?.conflictPairCount || 0) > 0 ? 'bg-amber-600 text-white' : 'bg-white/10 text-slate-400'
              }`}>
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight">
                  {liveData?.conflictPairCount ?? 0}
                </div>
                <div className="text-xs text-slate-300 font-medium">คู่ยาห้ามจ่ายร่วม วันนี้</div>
              </div>
            </div>

            {/* Double Whammy */}
            <div className="group p-4 rounded-2xl border bg-white/5 border-white/10 hover:border-sky-400/50 text-slate-300 flex items-center gap-3.5 transition-all duration-200 transform hover:-translate-y-1 hover:shadow-lg">
              <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-300 transition-transform duration-200 group-hover:scale-110">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white">
                  {liveData?.doubleCount ?? 0}
                </div>
                <div className="text-xs text-slate-300 font-medium">Double Whammy วันนี้</div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Control Bar */}
        <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-300">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setAutoRefresh(prev => !prev)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                autoRefresh 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                  : 'bg-white/10 text-slate-400 border border-transparent'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }} />
              Auto Scan (20s): {autoRefresh ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={() => setSoundEnabled(prev => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                soundEnabled 
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' 
                  : 'bg-white/10 text-slate-400 border border-transparent'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              เสียงเตือน: {soundEnabled ? 'เปิด' : 'ปิด'}
            </button>

            <button
              onClick={() => {
                if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                  Notification.requestPermission();
                }
                window.dispatchEvent(new CustomEvent('jhcis:test-safety-toast'));
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition-all cursor-pointer"
              title="ทดสอบเด้งแจ้งเตือนมุมจอแบบ Facebook & Windows Toast พร้อมเสียงสัญญาณ"
            >
              <Bell className="w-3.5 h-3.5 text-rose-400" />
              <span>ทดสอบเตือนมุมจอ (Toast)</span>
            </button>

            <span className="text-slate-400 hidden sm:inline">
              สแกน Visit ประจำวัน: <span className="text-white font-mono">{liveData?.totalVisitsToday ?? 0}</span> รายการ
            </span>
          </div>

          <button
            onClick={loadLiveData}
            disabled={loadingLive}
            className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingLive ? 'animate-spin' : ''}`} />
            กดสแกนทันที
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. SUB-NAVIGATION TABS */}
      {/* ========================================================= */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setSubTab('live')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            subTab === 'live'
              ? 'border-rose-600 text-rose-600 bg-rose-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>ตรวจจับเคสสดวันนี้</span>
          {((liveData?.tripleCount || 0) + (liveData?.conflictPairCount || 0)) > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-600 text-white animate-pulse">
              {(liveData?.tripleCount || 0) + (liveData?.conflictPairCount || 0)}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubTab('conflicts')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            subTab === 'conflicts'
              ? 'border-amber-600 text-amber-700 bg-amber-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertOctagon className="w-4 h-4 text-amber-600" />
          <span>คู่ยาที่ไม่ควรจ่ายร่วมกัน (2 ตัว - ตามรูป JHCIS)</span>
          {conflictData?.totalPairs > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
              {conflictData.totalPairs}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubTab('history')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            subTab === 'history'
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>ประวัติย้อนหลัง & รายงาน Excel</span>
        </button>

        <button
          onClick={() => setSubTab('drugs')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            subTab === 'drugs'
              ? 'border-slate-800 text-slate-900 bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>ทะเบียนยาและหมวดหมู่</span>
        </button>

        <button
          onClick={() => setSubTab('mechanism')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            subTab === 'mechanism'
              ? 'border-slate-800 text-slate-900 bg-slate-50'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Info className="w-4 h-4" />
          <span>กลไกการเกิดโรค (Mechanism)</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: LIVE TODAY DETECTIONS */}
      {/* ========================================================= */}
      {subTab === 'live' && (
        <div className="space-y-4">
          {loadingLive && !liveData && (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="w-8 h-8 animate-spin text-slate-400 mx-auto mb-3" />
              <div className="text-sm font-medium text-slate-600">กำลังสแกนการสั่งยาประจำวันจาก JHCIS...</div>
            </div>
          )}

          {!loadingLive && (!liveData?.alerts || liveData.alerts.length === 0) && (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">ไม่พบความเสี่ยง Triple Whammy หรือคู่ยาที่ชนกันในวันนี้</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                การสั่งยาในวันนี้ทั้ง {liveData?.totalVisitsToday || 0} รายการ ไม่พบการสั่งใช้ยาซ้ำซ้อนในกลุ่มเสี่ยงสูง ระบบกำลังเฝ้าระวังอัตโนมัติต่อเนื่อง
              </p>
            </div>
          )}

          {liveData?.alerts && liveData.alerts.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 px-1">
                <span>พบรายการเตือนความเสี่ยงวันนี้ ({liveData.alerts.length} เคส)</span>
                <span>เรียงตามเวลาล่าสุด</span>
              </div>

              {liveData.alerts.map((alert, idx) => (
                <AlertCard key={alert.visitno || idx} alert={alert} onCopy={() => handleCopyAlert(alert)} isCopied={copiedId === alert.visitno} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: CONFLICT REGISTRY (คู่ยาที่ไม่ควรจ่ายร่วมกันตามรูป JHCIS) */}
      {/* ========================================================= */}
      {subTab === 'conflicts' && (
        <div className="space-y-6">
          {/* Header Box Matching User's JHCIS Window */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <AlertOctagon className="w-5 h-5 text-rose-600" />
                  <span>... รายการยาฯ ที่ไม่ควรจ่ายร่วมในคราวเดียวกัน ...</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  ฐานข้อมูลจับคู่ยาที่ไม่ควรจ่ายร่วมกัน ซิงค์ตรงกับตาราง <code className="text-slate-800 font-bold bg-slate-200 px-1 py-0.5 rounded">cdrugconflictdrug</code> ใน JHCIS
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs sm:text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl">
                  จำนวนทั้งสิ้น:= {conflictData?.totalPairs ?? 0} รายการ
                </span>
                <button
                  onClick={() => setShowAddConflictModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มคู่ยาใหม่
                </button>
              </div>
            </div>

            {/* Top Pagination Bar for Conflict Pairs */}
            {(() => {
              const allPairs = conflictData?.jhcisPairs || [];
              const totalPairs = allPairs.length;
              const isAll = conflictPageSize === 'all';
              const numSize = isAll ? Math.max(1, totalPairs) : Number(conflictPageSize);
              const totalPages = isAll ? 1 : Math.ceil(totalPairs / numSize);
              const validPage = Math.min(Math.max(1, conflictPage), totalPages);
              const pagedPairs = isAll ? allPairs : allPairs.slice((validPage - 1) * numSize, validPage * numSize);
              const startIndex = isAll ? 0 : (validPage - 1) * numSize;

              return (
                <div className="space-y-3">
                  {totalPairs > 0 && (
                    <PaginationBar
                      currentPage={validPage}
                      pageSize={conflictPageSize}
                      totalItems={totalPairs}
                      onPageChange={setConflictPage}
                      onPageSizeChange={(sz) => { setConflictPageSize(sz); setConflictPage(1); }}
                      pageSizeOptions={[10, 20, 50, 100, 'all']}
                      colorTheme="emerald"
                      position="top"
                    />
                  )}

                  {/* Table of Conflict Pairs */}
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto table-scroll-visible border border-slate-200 rounded-xl shadow-2xs">
                    <table className="w-full text-left text-xs text-slate-700 min-w-[750px]">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[11px] border-b border-slate-200 sticky top-0 z-10 shadow-xs backdrop-blur-xs">
                        <tr>
                          <th className="px-4 py-3 w-14 text-center bg-slate-100">ลำดับ</th>
                          <th className="px-4 py-3 min-w-[220px] bg-slate-100">ยาฯ (1)</th>
                          <th className="px-4 py-3 min-w-[240px] bg-slate-100">ยาฯ (2) ที่ไม่ควรจ่ายร่วมกับยา (1)</th>
                          <th className="px-4 py-3 min-w-[140px] text-center bg-slate-100">ประวัติจ่ายร่วม</th>
                          <th className="px-4 py-3 min-w-[200px] bg-slate-100">ข้อสังเกต / กลไกความเสี่ยง</th>
                          <th className="px-4 py-3 text-center w-20 bg-slate-100">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loadingConflicts && (
                          <tr>
                            <td colSpan="6" className="py-8 text-center text-slate-400">กำลังโหลดรายการคู่ยา...</td>
                          </tr>
                        )}

                        {!loadingConflicts && (!allPairs || allPairs.length === 0) && (
                          <tr>
                            <td colSpan="6" className="py-8 text-center text-slate-400">ไม่พบคู่ยาที่ระบุใน JHCIS</td>
                          </tr>
                        )}

                        {pagedPairs.map((pair, idx) => (
                          <tr key={`${pair.drugcode_a}-${pair.drugcode_b}-${idx}`} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-center text-slate-400 font-mono">{startIndex + idx + 1}</td>
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-900">{pair.name_a}</div>
                              <div className="text-[10px] text-slate-400 font-mono">รหัสยา: {pair.drugcode_a}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-900">{pair.name_b}</div>
                              <div className="text-[10px] text-slate-400 font-mono">รหัสยา: {pair.drugcode_b}</div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                                pair.dispensedCount > 0 ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {pair.dispensedCount > 0 ? `พบ ${pair.dispensedCount} ครั้ง` : '0 ครั้ง'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600 leading-relaxed">
                              {pair.name_a?.toLowerCase().includes('diclofenac') && pair.name_b?.toLowerCase().includes('ibuprofen')
                                ? 'ยาแก้ปวด NSAIDs ซ้ำซ้อน 2 ขนาน (เสี่ยงเลือดออกทางเดินอาหารและไตวาย)'
                                : pair.name_a?.toLowerCase().includes('gemfibrozil') && pair.name_b?.toLowerCase().includes('simvastatin')
                                ? 'Statin + Gemfibrozil (เสี่ยงกล้ามเนื้อลายสลาย Rhabdomyolysis)'
                                : pair.name_a?.toLowerCase().includes('losartan') && pair.name_b?.toLowerCase().includes('enalapril')
                                ? 'Dual RAAS Blockade: ACEi + ARB (เสี่ยงโพแทสเซียมในเลือดสูงวิกฤต)'
                                : 'ระบุในตาราง cdrugconflictdrug ของ JHCIS'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteConflictPair(pair.drugcode_a, pair.drugcode_b, pair.name_a, pair.name_b)}
                                className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-300 hover:border-rose-600 rounded-md transition-all cursor-pointer shadow-2xs"
                                title="ลบคู่ยานี้ออกจาก JHCIS"
                              >
                                ลบ
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Bottom Pagination Bar for Conflict Pairs */}
                  {totalPairs > 0 && (
                    <PaginationBar
                      currentPage={validPage}
                      pageSize={conflictPageSize}
                      totalItems={totalPairs}
                      onPageChange={setConflictPage}
                      onPageSizeChange={(sz) => { setConflictPageSize(sz); setConflictPage(1); }}
                      pageSizeOptions={[10, 20, 50, 100, 'all']}
                      colorTheme="emerald"
                      position="bottom"
                    />
                  )}
                </div>
              );
            })()}
          </div>

          {/* Clinical DDI Rule Explanation Cards */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-600" />
              <span>เกณฑ์ทางเภสัชวิทยาคลินิกมาตรฐาน (Class-based Drug Interactions ที่ระบบตรวจจับอัตโนมัติ)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {conflictData?.clinicalRules?.map((rule) => (
                <div key={rule.ruleId} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                      {rule.category}
                    </span>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      rule.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {rule.severity}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">{rule.name}</h4>
                  <div className="text-xs text-slate-500 font-mono mt-1">ตัวอย่าง: {rule.examples}</div>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">{rule.reason}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Add Conflict Pair Modal */}
          {showAddConflictModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-scaleIn">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <div className="font-bold text-base text-slate-900 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-emerald-600" />
                    <span>เพิ่มคู่ยาที่ไม่ควรจ่ายร่วมกัน (บันทึกเข้า JHCIS)</span>
                  </div>
                  <button
                    onClick={() => setShowAddConflictModal(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleAddConflictPair} className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">ยาตัวที่ 1 (ยาหลัก)</label>
                    <select
                      value={newPairDrugA}
                      onChange={(e) => setNewPairDrugA(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
                    >
                      <option value="">-- เลือกยาตัวที่ 1 --</option>
                      {drugsList.map(d => (
                        <option key={d.drugcode} value={d.drugcode}>
                          [{d.drugcode}] {d.drugname} ({d.druggenericname || '-'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">ยาตัวที่ 2 (ที่ไม่ควรจ่ายร่วมกับตัวที่ 1)</label>
                    <select
                      value={newPairDrugB}
                      onChange={(e) => setNewPairDrugB(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
                    >
                      <option value="">-- เลือกยาตัวที่ 2 --</option>
                      {drugsList.map(d => (
                        <option key={d.drugcode} value={d.drugcode}>
                          [{d.drugcode}] {d.drugname} ({d.druggenericname || '-'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">เหตุผล / ข้อสังเกตความเสี่ยง (ไม่บังคับ)</label>
                    <textarea
                      value={newPairReason}
                      onChange={(e) => setNewPairReason(e.target.value)}
                      placeholder="เช่น เพิ่มความเสี่ยงต่อภาวะกล้ามเนื้อลายสลาย หรือทำให้ระดับยาในเลือดสูงขึ้น"
                      rows={3}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowAddConflictModal(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={submittingPair}
                      className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      {submittingPair ? 'กำลังบันทึก...' : 'บันทึกลงระบบ'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: HISTORICAL AUDIT & REPORT */}
      {/* ========================================================= */}
      {subTab === 'history' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">วันที่เริ่มต้น</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">ถึงวันที่</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">ประเภทความเสี่ยง</label>
                <select
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="all">ทั้งหมด (ทุกความเสี่ยง)</option>
                  <option value="triple">เฉพาะ Triple Whammy (วิกฤต)</option>
                  <option value="conflict">เฉพาะคู่ยาที่ไม่ควรจ่ายร่วมกัน (2 ตัว)</option>
                  <option value="double">เฉพาะ Double Whammy (เสี่ยงสูง)</option>
                </select>
              </div>

              <button
                onClick={loadHistoryData}
                disabled={loadingHistory}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
              >
                <Search className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
                ค้นหาประวัติ
              </button>
            </div>

            {/* Export Excel Button */}
            <a
              href={api.getSafetyExportUrl(startDate, endDate)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
              ส่งออก Excel (รายงานความปลอดภัย)
            </a>
          </div>

          {/* Historical Summary Cards */}
          {historyData && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="group p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform">
                <div className="text-xs text-slate-500 font-bold">Visit ที่สแกนทั้งหมด</div>
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-slate-800 mt-1">
                  {historyData.totalVisitsScanned?.toLocaleString() || 0}
                </div>
              </div>

              <div className="group p-4 sm:p-5 rounded-2xl bg-rose-50 border border-rose-200 hover:border-rose-400 text-rose-900 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform">
                <div className="text-xs text-rose-600 font-bold">Triple Whammy (วิกฤต)</div>
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-rose-700 mt-1">
                  {historyData.tripleCount || 0}
                </div>
              </div>

              <div className="group p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200 hover:border-amber-400 text-amber-900 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform">
                <div className="text-xs text-amber-700 font-bold">คู่ยาห้ามจ่ายร่วม (2 ตัว)</div>
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-amber-700 mt-1">
                  {historyData.conflictPairCount || 0}
                </div>
              </div>

              <div className="group p-4 sm:p-5 rounded-2xl bg-sky-50 border border-sky-200 hover:border-sky-400 text-sky-900 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform">
                <div className="text-xs text-sky-600 font-bold">Double Whammy (เสี่ยงสูง)</div>
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-sky-700 mt-1">
                  {historyData.doubleCount || 0}
                </div>
              </div>
            </div>
          )}

          {/* Historical Results List */}
          {loadingHistory && (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="w-8 h-8 animate-spin text-slate-400 mx-auto mb-3" />
              <div className="text-sm font-medium text-slate-600">กำลังค้นหาประวัติการจ่ายยาเสี่ยงจาก JHCIS...</div>
            </div>
          )}

          {!loadingHistory && historyData && historyData.alerts?.length === 0 && (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <div className="text-base font-bold text-slate-800">ไม่พบเคสความเสี่ยงในช่วงเวลาดังกล่าว</div>
              <p className="text-xs text-slate-400 mt-1">ไม่มีประวัติการจ่ายยาที่ตรงกับเกณฑ์การกรองที่ระบุ</p>
            </div>
          )}

          {!loadingHistory && historyData && historyData.alerts?.length > 0 && (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-slate-500 uppercase px-1">
                ผลการค้นหา {historyData.alerts.length} รายการ
              </div>
              {historyData.alerts.map((alert, idx) => (
                <AlertCard key={alert.visitno || idx} alert={alert} onCopy={() => handleCopyAlert(alert)} isCopied={copiedId === alert.visitno} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: DRUG CATALOG REGISTRY */}
      {/* ========================================================= */}
      {subTab === 'drugs' && (
        <div className="space-y-6">
          {/* Drug Search and Filter */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อยา, ชื่อสามัญ, หรือรหัสยา..."
                  value={drugSearch}
                  onChange={(e) => setDrugSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={drugFilterCategory}
                onChange={(e) => setDrugFilterCategory(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="all">ทุกกลุ่มยา ({drugsList.length})</option>
                <option value="nsaid">เฉพาะ NSAIDs ({drugsList.filter(d => d.isNsaid).length})</option>
                <option value="diuretic">เฉพาะ ยาขับปัสสาวะ ({drugsList.filter(d => d.isDiuretic).length})</option>
                <option value="acei_arb">เฉพาะ ACEi/ARBs ({drugsList.filter(d => d.isAceiArb).length})</option>
                <option value="statin">เฉพาะ Statins ({drugsList.filter(d => d.isStatin).length})</option>
                <option value="fibrate">เฉพาะ Fibrates ({drugsList.filter(d => d.isFibrate).length})</option>
              </select>
            </div>

            <div className="text-xs text-slate-500">
              พบ {filteredDrugs.length} รายการ
            </div>
          </div>

          {/* Drugs Table */}
          {(() => {
            const totalDrugItems = filteredDrugs.length;
            const isDrugAll = drugPageSize === 'all';
            const numDrugSize = isDrugAll ? Math.max(1, totalDrugItems) : Number(drugPageSize);
            const totalDrugPages = isDrugAll ? 1 : Math.ceil(totalDrugItems / numDrugSize);
            const validDrugPage = Math.min(Math.max(1, drugPage), totalDrugPages);
            const pagedDrugs = isDrugAll ? filteredDrugs : filteredDrugs.slice((validDrugPage - 1) * numDrugSize, validDrugPage * numDrugSize);

            return (
              <div className="space-y-3">
                {totalDrugItems > 0 && (
                  <PaginationBar
                    currentPage={validDrugPage}
                    pageSize={drugPageSize}
                    totalItems={totalDrugItems}
                    onPageChange={setDrugPage}
                    onPageSizeChange={(sz) => { setDrugPageSize(sz); setDrugPage(1); }}
                    pageSizeOptions={[10, 20, 50, 100, 'all']}
                    colorTheme="emerald"
                    position="top"
                  />
                )}

                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="overflow-x-auto max-h-[580px] overflow-y-auto table-scroll-visible">
                    <table className="w-full text-left text-xs text-slate-700 min-w-[700px]">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[11px] border-b border-slate-200 sticky top-0 z-10 shadow-xs backdrop-blur-xs">
                        <tr>
                          <th className="px-4 py-3 w-16 bg-slate-100">รหัสยา</th>
                          <th className="px-4 py-3 min-w-[220px] bg-slate-100">ชื่อยาใน JHCIS (cdrug)</th>
                          <th className="px-4 py-3 min-w-[200px] bg-slate-100">ชื่อสามัญ (Generic Name)</th>
                          <th className="px-4 py-3 text-center bg-slate-100">กลุ่ม Triple Whammy</th>
                          <th className="px-4 py-3 text-center bg-slate-100">กลุ่ม Lipid / อื่นๆ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loadingDrugs && (
                          <tr>
                            <td colSpan="5" className="py-8 text-center text-slate-400">กำลังโหลดรายการยาจากฐานข้อมูล...</td>
                          </tr>
                        )}

                        {!loadingDrugs && pagedDrugs.map((d) => (
                          <tr key={d.drugcode} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-mono font-bold text-slate-800">{d.drugcode}</td>
                            <td className="px-4 py-3 font-medium text-slate-900">{d.drugname}</td>
                            <td className="px-4 py-3 text-slate-600">{d.druggenericname || '-'}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                {d.isNsaid && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                    NSAID (กิน/ฉีด)
                                  </span>
                                )}
                                {d.isNsaidTopical && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                                    NSAID (ยาทาภายนอก)
                                  </span>
                                )}
                                {d.isDiuretic && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300">
                                    Diuretic
                                  </span>
                                )}
                                {d.isAceiArb && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                                    ACEi / ARB
                                  </span>
                                )}
                                {!d.isNsaid && !d.isNsaidTopical && !d.isDiuretic && !d.isAceiArb && (
                                  <span className="text-slate-400 text-[11px]">-</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                {d.isStatin && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                    Statin
                                  </span>
                                )}
                                {d.isFibrate && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-300">
                                    Fibrate
                                  </span>
                                )}
                                {d.isWarfarin && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">
                                    Warfarin
                                  </span>
                                )}
                                {!d.isStatin && !d.isFibrate && !d.isWarfarin && (
                                  <span className="text-slate-400 text-[11px]">-</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bottom Pagination Bar for Drugs Catalog */}
                {totalDrugItems > 0 && (
                  <PaginationBar
                    currentPage={validDrugPage}
                    pageSize={drugPageSize}
                    totalItems={totalDrugItems}
                    onPageChange={setDrugPage}
                    onPageSizeChange={(sz) => { setDrugPageSize(sz); setDrugPage(1); }}
                    pageSizeOptions={[10, 20, 50, 100, 'all']}
                    colorTheme="emerald"
                    position="bottom"
                  />
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: MECHANISM & CLINICAL FLOW */}
      {/* ========================================================= */}
      {subTab === 'mechanism' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-8">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              กลไกการทำลายไตในปรากฏการณ์ Triple Whammy (Hemodynamic Mechanism)
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
              ปกติไตจะรักษาอัตราการกรองของเสีย (GFR) ให้คงที่ผ่านแรงดันเลือดภายในหน่วยไต (Glomerulus) 
              การสั่งใช้ยาสามตัวนี้พร้อมกันจะขัดขวางระบบปรับแรงดันเลือดพร้อมกัน 3 จุดอย่างรุนแรง
            </p>
          </div>

          {/* 3 Step Hemodynamic Process */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-xl border border-rose-200 bg-rose-50/50">
              <div className="w-10 h-10 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold mb-3">
                1
              </div>
              <h3 className="font-bold text-slate-900 text-base">NSAIDs (ยาแก้ปวดอักเสบ)</h3>
              <div className="text-xs text-rose-700 font-semibold mt-1">ยับยั้ง Prostaglandins</div>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                ปกติ Prostaglandins จะช่วย <strong>ขยายหลอดเลือดนำเลือดเข้าหน่วยไต (Afferent arteriole)</strong> เมื่อถูกยับยั้ง หลอดเลือดทางเข้าจะหดเกร็ง เลือดจึงไหลเข้าสู่หน่วยไตน้อยลงอย่างมาก
              </p>
            </div>

            <div className="p-5 rounded-xl border border-sky-200 bg-sky-50/50">
              <div className="w-10 h-10 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold mb-3">
                2
              </div>
              <h3 className="font-bold text-slate-900 text-base">Diuretics (ยาขับปัสสาวะ)</h3>
              <div className="text-xs text-sky-700 font-semibold mt-1">ลด Intravascular Volume</div>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                ยาขับปัสสาวะทำให้ปริมาตรน้ำในหลอดเลือดลดลง เลือดที่ไหลเวียนไปเลี้ยงไตโดยรวม (Renal blood flow) จึงลดลง ยิ่งหากผู้ป่วยดื่มน้ำน้อยหรือมีภาวะขาดน้ำ ไตจะขาดเลือดรุนแรงขึ้น
              </p>
            </div>

            <div className="p-5 rounded-xl border border-purple-200 bg-purple-50/50">
              <div className="w-10 h-10 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold mb-3">
                3
              </div>
              <h3 className="font-bold text-slate-900 text-base">ACEi / ARBs (ยาลดความดัน)</h3>
              <div className="text-xs text-purple-700 font-semibold mt-1">ยับยั้ง Angiotensin II</div>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                ปกติ Angiotensin II จะช่วย <strong>หดหลอดเลือดนำเลือดออกจากหน่วยไต (Efferent arteriole)</strong> เพื่อสร้างแรงต้านให้เกิดแรงดันกรอง เมื่อถูกยับยั้ง หลอดเลือดทางออกจะคลายตัว ทำให้แรงดันการกรองภายในหน่วยไตตกดิ่งลงทันที
              </p>
            </div>
          </div>

          {/* Outcome Alert */}
          <div className="p-5 rounded-xl bg-gradient-to-r from-rose-900 to-slate-900 text-white">
            <h4 className="font-bold text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              ผลลัพธ์: แรงดันการกรองในหน่วยไต (Intraglomerular Pressure) พังทลาย
            </h4>
            <p className="text-sm text-slate-200 mt-2 leading-relaxed">
              เมื่อเลือดเข้าลดลง (NSAID) + ทางออกเปิดกว้างไม่มีแรงต้าน (ACEi/ARB) + ปริมาตรเลือดรวมลดลง (Diuretic) ไตจะสูญเสียความสามารถในการกรองของเสียฉับพลัน เกิด <strong>ไตวายฉุกเฉิน (Acute Kidney Injury: AKI)</strong>, ภาวะโพแทสเซียมในเลือดสูงคุกคามหัวใจ (Hyperkalemia) และภาวะน้ำคั่ง/น้ำท่วมปอด
            </p>
            <div className="mt-4 pt-4 border-t border-white/10 text-xs text-slate-300 flex flex-wrap gap-4">
              <span><strong>กลุ่มเสี่ยงสูงสุด:</strong> ผู้สูงอายุ, ผู้ป่วยโรคไตเรื้อรัง (CKD), เบาหวาน, ผู้มีภาวะขาดน้ำ</span>
              <span><strong>การจัดการ:</strong> หลีกเลี่ยง NSAIDs เปลี่ยนเป็น Paracetamol 500mg, ยาทาภายนอก หรือ Tramadol</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-component: Alert Card
function AlertCard({ alert, onCopy, isCopied }) {
  const isCritical = alert.severity === 'CRITICAL';

  return (
    <div className={`p-5 rounded-2xl border transition-all ${
      isCritical 
        ? 'bg-rose-50/40 border-rose-200 shadow-xs hover:border-rose-300' 
        : 'bg-amber-50/40 border-amber-200 shadow-xs hover:border-amber-300'
    }`}>
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          {alert.isTripleWhammy && (
            <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-rose-600 text-white flex items-center gap-1 shadow-2xs">
              <Flame className="w-3.5 h-3.5" />
              TRIPLE WHAMMY (วิกฤต)
            </span>
          )}

          {alert.hasConflictPairs && (
            <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-rose-700 text-white flex items-center gap-1 shadow-2xs">
              <AlertOctagon className="w-3.5 h-3.5" />
              คู่ยาห้ามจ่ายร่วมกัน (2 ตัว)
            </span>
          )}

          {!alert.isTripleWhammy && !alert.hasConflictPairs && (
            <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-amber-600 text-white flex items-center gap-1 shadow-2xs">
              <AlertTriangle className="w-3.5 h-3.5" />
              DOUBLE WHAMMY (เสี่ยงสูง)
            </span>
          )}

          <span className="text-xs text-slate-500 font-mono">
            Visit: <strong className="text-slate-800">{alert.visitno}</strong> ({alert.visitdate} {alert.dispensetime})
          </span>
          <span className="text-xs text-slate-500 font-mono">
            ผู้สั่ง: <strong className="text-slate-800">{alert.username}</strong>
          </span>
        </div>

        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
        >
          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          {isCopied ? 'คัดลอกแล้ว' : 'คัดลอกแจ้งเตือน'}
        </button>
      </div>

      {/* Patient info */}
      <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-800 mb-4 pb-3 border-b border-slate-200/80">
        <Stethoscope className="w-4 h-4 text-indigo-600" />
        <span>ผู้ป่วย: <strong className="text-slate-900">{alert.patientNameMasked}</strong></span>
        <span className="text-xs font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
          HN: {alert.hn || alert.pid}
        </span>
        <span className="text-xs font-mono text-slate-500">CID: {alert.cidMasked}</span>
      </div>

      {/* 2-Drug Conflict Pairs Section (ถ้ามีคู่ยาที่ชนกัน) */}
      {alert.conflictPairs && alert.conflictPairs.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="text-xs font-extrabold text-rose-800 flex items-center gap-1.5">
            <AlertOctagon className="w-4 h-4 text-rose-600" />
            <span>ตรวจพบยาที่ไม่ควรจ่ายร่วมกัน ({alert.conflictPairs.length} คู่):</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {alert.conflictPairs.map((cp, cIdx) => (
              <div key={cIdx} className="p-3 rounded-xl bg-white border-2 border-rose-300 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="font-bold text-xs sm:text-sm text-slate-900 flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200">
                      {cp.drugA.drugname}
                    </span>
                    <span className="text-rose-600 font-extrabold text-xs">
                      ⚡ ไม่ควรจ่ายร่วมกับ ⚡
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200">
                      {cp.drugB.drugname}
                    </span>
                  </div>

                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                    {cp.source === 'JHCIS' ? 'ระบุใน JHCIS' : 'เกณฑ์ทางเภสัชกรรม'}
                  </span>
                </div>

                <div className="text-xs text-rose-950 font-medium leading-relaxed mt-1">
                  {cp.reason}
                </div>
                {cp.clinicalAdvice && (
                  <div className="text-[11px] text-slate-600 mt-1">
                    <strong>ข้อเสนอแนะ:</strong> {cp.clinicalAdvice}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3 Drug Groups Pills */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {/* NSAIDs */}
        <div className="p-3 rounded-xl bg-white border border-rose-200 shadow-2xs">
          <div className="text-xs font-bold text-rose-700 flex items-center gap-1 mb-1.5">
            <Flame className="w-3.5 h-3.5" />
            1. ยาแก้ปวดอักเสบ (NSAIDs)
          </div>
          {alert.nsaids?.length === 0 ? (
            <div className="text-xs text-slate-400 italic">ไม่มียากลุ่มนี้</div>
          ) : (
            alert.nsaids?.map(d => (
              <div key={d.drugcode} className="text-xs font-medium text-slate-800">
                • {d.drugname} <span className="text-rose-600 font-mono">({d.unit} หน่วย)</span>
                {d.dose && <div className="text-[11px] text-slate-500 pl-2">{d.dose}</div>}
              </div>
            ))
          )}
        </div>

        {/* Diuretics */}
        <div className="p-3 rounded-xl bg-white border border-sky-200 shadow-2xs">
          <div className="text-xs font-bold text-sky-700 flex items-center gap-1 mb-1.5">
            <Droplets className="w-3.5 h-3.5" />
            2. ยาขับปัสสาวะ (Diuretics)
          </div>
          {alert.diuretics?.length === 0 ? (
            <div className="text-xs text-slate-400 italic">ไม่มียากลุ่มนี้</div>
          ) : (
            alert.diuretics?.map(d => (
              <div key={d.drugcode} className="text-xs font-medium text-slate-800">
                • {d.drugname} <span className="text-sky-600 font-mono">({d.unit} หน่วย)</span>
                {d.dose && <div className="text-[11px] text-slate-500 pl-2">{d.dose}</div>}
              </div>
            ))
          )}
        </div>

        {/* ACEi / ARBs */}
        <div className="p-3 rounded-xl bg-white border border-purple-200 shadow-2xs">
          <div className="text-xs font-bold text-purple-700 flex items-center gap-1 mb-1.5">
            <HeartPulse className="w-3.5 h-3.5" />
            3. ยาลดความดัน (ACEi / ARBs)
          </div>
          {alert.aceiArbs?.length === 0 ? (
            <div className="text-xs text-slate-400 italic">ไม่มียากลุ่มนี้</div>
          ) : (
            alert.aceiArbs?.map(d => (
              <div key={d.drugcode} className="text-xs font-medium text-slate-800">
                • {d.drugname} <span className="text-purple-600 font-mono">({d.unit} หน่วย)</span>
                {d.dose && <div className="text-[11px] text-slate-500 pl-2">{d.dose}</div>}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Clinical Advice */}
      <div className="p-3 rounded-xl bg-amber-100/70 border border-amber-300 text-amber-950 text-xs leading-relaxed flex items-start gap-2">
        <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <strong>คำแนะนำทางเภสัชกรรม:</strong> {alert.clinicalAdvice}
        </div>
      </div>
    </div>
  );
}
