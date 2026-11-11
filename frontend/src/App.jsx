import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import ExcelImportView from './components/ExcelImportView';
import DrugMappingView from './components/DrugMappingView';
import DrugCatalogueView from './components/DrugCatalogueView';
import DrugUsageReportView from './components/DrugUsageReportView';
import InitialStockCountView from './components/InitialStockCountView';
import SettingsView from './components/SettingsView';
import DrugSafetyView from './components/DrugSafetyView';
import SubstockQrView from './components/SubstockQrView';
import MobileSubstockView from './components/MobileSubstockView';
import StockCardModal from './components/StockCardModal';
import PatientDispenseModal from './components/PatientDispenseModal';
import LoginModal from './components/LoginModal';
import SafetyToastNotifier from './components/SafetyToastNotifier';
import { api } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [dbConfig, setDbConfig] = useState(null);
  const [activeStockCardCode, setActiveStockCardCode] = useState(null);
  const [stockCardDateRange, setStockCardDateRange] = useState(null);
  const [substockDrugCode, setSubstockDrugCode] = useState(null);
  const [safetyAlertCount, setSafetyAlertCount] = useState(0);
  const [exitMobileDirectMode, setExitMobileDirectMode] = useState(false);

  // ตรวจจับว่าเปิดมาด้วยการสแกน QR Code ประจำตัวยาโดยตรงหรือไม่ (/m/:drugcode หรือ ?scan=:drugcode)
  const directScanDrugCode = (() => {
    try {
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      const mMatch = pathname.match(/^\/(?:m|substock)\/([^/?#]+)/i);
      if (mMatch && mMatch[1]) return decodeURIComponent(mMatch[1]);
      const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      const q = searchParams.get('scan') || searchParams.get('drug');
      if (q) return q;
    } catch (e) {}
    return null;
  })();

  // ตรวจจับโหมดมือถือสแกนเบิกยาคลังใน (Mobile Kiosk Mode — ไม่แสดงเมนูอื่นใด)
  const [isMobileMode, setIsMobileMode] = useState(() => {
    try {
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      if (pathname.startsWith('/m') || pathname.startsWith('/substock/m')) return true;
      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      if (
        params.get('mobile_token') ||
        params.get('mobile') === '1' ||
        params.get('scan') ||
        params.get('drug') ||
        params.get('tab') === 'substock-mobile' ||
        (params.get('tab') === 'substock-qr' && params.has('mobile_token'))
      ) {
        return true;
      }
      return localStorage.getItem('jhcis_mobile_mode') === 'true';
    } catch (e) {
      return false;
    }
  });

  // Sidebar Pinned & Mobile Open States
  const [isSidebarPinned, setIsSidebarPinned] = useState(() => {
    try {
      return localStorage.getItem('jhcis_sidebar_pinned') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Patient Dispense History State
  const [patientDispenseState, setPatientDispenseState] = useState(null);

  // Route guard: ถ้าไม่มี user (session) — แสดงหน้า login อย่างเดียว ไม่เรนเดอร์เนื้อหา
  useEffect(() => {
    (async () => {
      // ตรวจสอบพารามิเตอร์จาก QR Code เชื่อมต่อมือถือ (?mobile_token=...&tab=substock-qr&scan=...)
      let detectedMobile = false;
      try {
        const params = new URLSearchParams(window.location.search);
        const mobileToken = params.get('mobile_token');
        const tabParam = params.get('tab');
        const scanParam = params.get('scan') || params.get('drug');
        const isMobileParam = params.get('mobile') === '1';

        if (mobileToken || isMobileParam || scanParam || (tabParam === 'substock-qr' && mobileToken)) {
          detectedMobile = true;
          setIsMobileMode(true);
          localStorage.setItem('jhcis_mobile_mode', 'true');
        }

        if (mobileToken) {
          localStorage.setItem('jhcis_token', mobileToken);
        }
        if (tabParam) {
          setActiveTab(tabParam);
        } else if (scanParam) {
          setActiveTab('substock-qr');
        }
        if (scanParam) {
          setSubstockDrugCode(scanParam);
        }
        if (mobileToken || tabParam || scanParam || isMobileParam) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {}

      // หากเข้ามาในโหมดมือถือ แต่ยังไม่มี session ในเครื่องมือถือ ให้ดึง Mobile Kiosk Session ทันที
      if ((isMobileMode || detectedMobile || directScanDrugCode) && !localStorage.getItem('jhcis_token')) {
        try {
          const res = await fetch('/api/auth/mobile-kiosk-session');
          const data = await res.json();
          if (data.success && data.token) {
            localStorage.setItem('jhcis_token', data.token);
            setUser(data.user);
          }
        } catch (e) {}
      }

      // สถานะสาธารณะก่อน login (/api/health ไม่ต้องยืนยันตัวตน — ไม่เปิดเผยข้อมูลละเอียดอ่อนไหว)
      await loadPublicStatus();

      const token = localStorage.getItem('jhcis_token');
      if (token) {
        const me = await api.getMe();
        if (me.success) {
          const saved = (() => { try { return JSON.parse(localStorage.getItem('jhcis_user') || 'null'); } catch (e) { return null; } })();
          setUser(saved || me.user);
        } else {
          setUser(null);
        }
      }
    })();

    const onAuthExpired = () => setUser(null);
    window.addEventListener('jhcis:auth-expired', onAuthExpired);
    return () => window.removeEventListener('jhcis:auth-expired', onAuthExpired);
  }, []);

  // สถานะก่อน login: รู้แค่โหมด + รหัสหน่วย (public) เพียงพอสำหรับหน้า login/ตั้งค่าเริ่มต้น
  const loadPublicStatus = async () => {
    try {
      const res = await fetch('/api/health');
      const h = await res.json();
      if (h && h.status === 'ok') {
        setDbConfig(prev => ({
          ...(prev || {}),
          pcucode: h.pcucode || prev?.pcucode,
          mode: h.configuredMode,
          isConnected: h.isConnected,
          _mode: h.mode // 'live' | 'live_unavailable' | 'demo'
        }));
      }
    } catch (e) {}
  };

  const loadSettings = async () => {
    try {
      const res = await api.getSettings();
      if (res.success) {
        setDbConfig({ ...res.data, _mode: res.mode, _schema: res.schema });
        if (res.data.isConnected) {
          // Live mode: refresh ชื่อจริงจาก JHCIS (session จะ refresh อัตโนมัติทุก 12 ชม.)
          try {
            const me = await api.getMe();
            if (me.success) {
              setUser(prev => prev ? { ...prev, ...me.user } : me.user);
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  };

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    localStorage.setItem('jhcis_user', JSON.stringify(userData));
    loadSettings();
  };

  const handleLogout = async () => {
    try { await api.logout(); } catch (e) {}
    setUser(null);
    localStorage.removeItem('jhcis_user');
    setSafetyAlertCount(0);
  };

  // Live polling สำหรับเตือน Triple Whammy ทันทีที่เมนูด้านข้าง
  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const fetchSafetyBadge = async () => {
      try {
        const res = await api.getLiveSafetyAlerts();
        if (isMounted && res.success && res.data) {
          setSafetyAlertCount(res.data.tripleCount || 0);
        }
      } catch (e) {}
    };
    fetchSafetyBadge();
    const interval = setInterval(fetchSafetyBadge, 30000); // อัปเดตทุก 30 วินาที
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user]);

  const handleOpenStockCard = (drugcode, dateRange) => {
    setActiveStockCardCode(drugcode);
    setStockCardDateRange(dateRange);
  };

  const handleCloseStockCard = () => {
    setActiveStockCardCode(null);
  };

  const handleOpenSubstockQr = (drugcode = null) => {
    setSubstockDrugCode(drugcode || null);
    setActiveStockCardCode(null);
    setActiveTab('substock-qr');
  };

  const handleOpenPatientDispense = (drugcode, drugname, dateRange) => {
    setPatientDispenseState({ drugcode, drugname, dateRange });
  };

  const handleClosePatientDispense = () => {
    setPatientDispenseState(null);
  };

  const handleImportSuccess = () => {
    setActiveTab('dashboard');
  };

  const handleRequireRelogin = () => {
    handleLogout();
    loadSettings();
  };

  const isLive = dbConfig?._mode === 'live';
  const isDemo = dbConfig?._mode === 'demo';
  const dbDown = dbConfig?._mode === 'live_unavailable';

  // ===== 1. Dedicated Mobile Kiosk Mode: แสดงเฉพาะหน้าจอสแกนเบิกยาคลังใน ไม่แสดงเมนูอื่นใด =====
  if (isMobileMode && !exitMobileDirectMode) {
    return (
      <MobileSubstockView
        initialDrugCode={directScanDrugCode || substockDrugCode}
      />
    );
  }

  // ===== 2. Login Gate: แสดงเฉพาะหน้า login จนกว่าจะมี session =====
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <LoginModal
          onLoginSuccess={handleLoginSuccess}
          isLive={isLive}
          pcucode={dbConfig?.pcucode}
          onConnectionChanged={loadPublicStatus}
        />
        <footer className="py-4 text-center text-xs text-slate-400">
          ระบบบริหารคลังยาและ Drug Stock สำหรับโรงพยาบาลส่งเสริมสุขภาพตำบล (รพ.สต.)
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex selection:bg-emerald-100 selection:text-emerald-900">

      {/* Left Auto-Hide Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isPinned={isSidebarPinned}
        setIsPinned={setIsSidebarPinned}
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
        user={user}
        onLogout={handleLogout}
        dbConfig={dbConfig}
        safetyAlertCount={safetyAlertCount}
      />

      {/* Right Content Area (Adaptive padding: md:pl-16 when auto-hide, md:pl-[268px] / lg:pl-[288px] when pinned) */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
        isSidebarPinned ? 'md:pl-[268px] lg:pl-[288px]' : 'md:pl-16'
      }`}>

        {/* Top Slim Navbar */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          user={user}
          onLogout={handleLogout}
          dbConfig={dbConfig}
          onToggleMobileMenu={() => setMobileMenuOpen(prev => !prev)}
          isSidebarPinned={isSidebarPinned}
          onTogglePin={() => {
            const next = !isSidebarPinned;
            setIsSidebarPinned(next);
            try { localStorage.setItem('jhcis_sidebar_pinned', String(next)); } catch (e) {}
          }}
        />

        {/* คำเตือนโหมดจำลอง / DB หลุด — แสดงตลอดเพื่อไม่ให้เข้าใจผิดว่าเป็นข้อมูลจริง */}
        {(isDemo || dbDown) && (
          <div className={`px-4 sm:px-8 py-2.5 text-xs sm:text-sm font-semibold text-center border-b no-print ${
            dbDown ? 'bg-rose-600 text-white border-rose-700' : 'bg-amber-100 text-amber-900 border-amber-300'
          }`}>
            {dbDown
              ? '⚠️ เชื่อมต่อฐานข้อมูล JHCIS ไม่สำเร็จ — ข้อมูลสต็อก/ประวัติจ่ายยาไม่พร้อมใช้งาน (ระบบไม่สลับไปข้อมูลจำลองอัตโนมัติ) กรุณาแจ้งผู้ดูแลระบบ'
              : '🧪 โหมดจำลองข้อมูล (DEMO) — ทุกตัวเลขบนหน้าจอเป็นข้อมูลตัวอย่าง ไม่ใช่สต็อกจริงของหน่วยงาน'}
          </div>
        )}

        {/* Main View Area */}
        <main className="flex-1 pb-16">
          {activeTab === 'dashboard' && (
            <DashboardView
              user={user}
              onLogout={handleLogout}
              onOpenStockCard={handleOpenStockCard}
              onOpenPatientDispense={handleOpenPatientDispense}
              onNavigateToImport={() => setActiveTab('import')}
              onNavigateToCount={() => setActiveTab('initial-count')}
              onOpenSubstockQr={handleOpenSubstockQr}
              isSidebarPinned={isSidebarPinned}
            />
          )}

          {activeTab === 'substock-qr' && (
            <SubstockQrView
              initialDrugCode={substockDrugCode}
              onOpenStockCard={handleOpenStockCard}
              user={user}
            />
          )}

          {activeTab === 'safety' && (
            <DrugSafetyView
              dbConfig={dbConfig}
              onLiveCountChange={(count) => setSafetyAlertCount(count)}
            />
          )}

          {activeTab === 'initial-count' && (
            <InitialStockCountView
              user={user}
              onCountUpdated={() => {}}
            />
          )}

          {activeTab === 'import' && (
            <ExcelImportView
              onImportSuccess={handleImportSuccess}
            />
          )}

          {activeTab === 'report' && (
            <DrugUsageReportView dbConfig={dbConfig} />
          )}

          {activeTab === 'mapping' && (
            <DrugMappingView />
          )}

          {activeTab === 'catalogue' && (
            <DrugCatalogueView />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              onConfigUpdated={(cfg) => setDbConfig(cfg)}
              onRequireRelogin={handleRequireRelogin}
            />
          )}
        </main>

        {/* System Footer */}
        <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400 no-print">
          <span>
            ระบบบริหารคลังยาและ Drug Stock สำหรับโรงพยาบาลส่งเสริมสุขภาพตำบล (รพ.สต.) •
            {isLive ? ' เชื่อมต่อฐานข้อมูล JHCIS (โหมดอ่านอย่างเดียว — ข้อมูลบันทึกของระบบเก็บในเครื่องนี้)' : isDemo ? ' โหมดจำลองข้อมูล รพ.สต.' : ' ไม่พร้อมใช้งาน (ฐานข้อมูล JHCIS หลุด)'}
          </span>
        </footer>

      </div>

      {/* Stock Card Drill-down Modal */}
      {activeStockCardCode && (
        <StockCardModal
          drugcode={activeStockCardCode}
          initialDateRange={stockCardDateRange}
          onClose={handleCloseStockCard}
          onOpenSubstock={handleOpenSubstockQr}
        />
      )}

      {/* Patient Dispensing History Modal */}
      {patientDispenseState && (
        <PatientDispenseModal
          drugcode={patientDispenseState.drugcode}
          drugname={patientDispenseState.drugname}
          initialDateRange={patientDispenseState.dateRange}
          onClose={handleClosePatientDispense}
        />
      )}

      {/* Real-time Safety Toast Notifier (Facebook style corner toast + Windows desktop notification) */}
      <SafetyToastNotifier
        user={user}
        onNavigateSafety={() => setActiveTab('safety')}
        onCountChange={(count) => setSafetyAlertCount(count)}
      />

    </div>
  );
}
