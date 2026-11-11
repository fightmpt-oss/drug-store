import React from 'react';
import { 
  Package, 
  BarChart3, 
  FileSpreadsheet, 
  Link2, 
  Settings, 
  User, 
  LogOut, 
  Database,
  FileCheck2,
  FileText,
  ClipboardCheck,
  Menu,
  Pin,
  PinOff,
  ShieldAlert,
  Bell,
  QrCode
} from 'lucide-react';

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  user, 
  onLogout, 
  dbConfig,
  onToggleMobileMenu,
  isSidebarPinned,
  onTogglePin
}) {
  const isLive = dbConfig?.mode === 'live' && dbConfig?.isConnected;

  const tabLabels = {
    'dashboard': { label: 'แดชบอร์ด Drug Stock', icon: BarChart3 },
    'safety': { label: 'เฝ้าระวังยา (Triple Whammy)', icon: ShieldAlert },
    'initial-count': { label: 'ตรวจนับสต็อกยกมา', icon: ClipboardCheck },
    'import': { label: 'นำเข้าใบรับยา (Excel/PDF)', icon: FileSpreadsheet },
    'substock-qr': { label: 'เบิกยาคลังในไปจุดจ่ายยาเคาน์เตอร์ (QR Sub-Stock)', icon: QrCode },
    'report': { label: 'รายงานจ่ายยา (rdrug_used)', icon: FileText },
    'mapping': { label: 'ผูกรหัสยา (TMT/รพ.)', icon: Link2 },
    'catalogue': { label: 'ตรวจ Drug Catalogue', icon: FileCheck2 },
    'settings': { label: 'ตั้งค่า JHCIS', icon: Settings },
  };

  const currentTab = tabLabels[activeTab] || tabLabels['dashboard'];
  const CurrentIcon = currentTab.icon;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs w-full">
      <div className="w-full px-3 sm:px-5 lg:px-6">
        <div className="flex items-center justify-between h-14 gap-2 sm:gap-4">
          
          {/* Left Controls: Hamburger Toggle + Active Breadcrumb */}
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            {/* Mobile Menu Button (< md) */}
            <button
              type="button"
              onClick={onToggleMobileMenu}
              className="md:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              title="เปิดเมนูด้านข้าง (Sidebar)"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Desktop Pin / Unpin Quick Toggle (>= md) */}
            <button
              type="button"
              onClick={onTogglePin}
              className="hidden md:flex p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              title={isSidebarPinned ? 'เปิดโหมดซ่อนอัตโนมัติ (Auto-Hide)' : 'ปักหมุดแถบเมนูด้านข้าง'}
            >
              {isSidebarPinned ? (
                <Pin className="w-4 h-4 text-emerald-600 fill-emerald-600 rotate-45" />
              ) : (
                <Menu className="w-5 h-5 text-slate-600" />
              )}
            </button>

            {/* Brand Logo on Mobile (< md) */}
            <div 
              onClick={() => setActiveTab('dashboard')}
              className="flex md:hidden items-center space-x-1.5 cursor-pointer shrink-0"
            >
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-2xs">
                <Package className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-xs text-slate-900">Drug Stock</span>
            </div>

            <span className="hidden sm:inline text-slate-300">|</span>

            {/* Current Active Page Breadcrumb Title */}
            <div className="flex items-center space-x-1.5 min-w-0">
              <CurrentIcon className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                {currentTab.label}
              </span>
            </div>
          </div>

          {/* Right Controls: Database Badge + User Profile + Logout */}
          <div className="flex items-center space-x-1.5 sm:space-x-2.5 shrink-0 ml-auto">
            
            {/* DB status pill */}
            <div 
              onClick={() => setActiveTab('settings')}
              className={`cursor-pointer flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold border transition-all shrink-0 shadow-2xs ${
                isLive
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
              }`}
              title={isLive ? 'เชื่อมต่อฐานข้อมูล JHCIS สำเร็จ (คลิกเพื่อดูการตั้งค่า)' : 'กำลังใช้งานในโหมดจำลองข้อมูล รพ.สต. (คลิกเพื่อตั้งค่า JHCIS)'}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <Database className="w-3 h-3 shrink-0 hidden sm:inline" />
              <span className="whitespace-nowrap font-bold hidden xs:inline">{isLive ? 'JHCIS: เชื่อมต่อแล้ว' : 'โหมดจำลอง'}</span>
              <span className="whitespace-nowrap font-bold xs:hidden">{isLive ? 'JHCIS' : 'จำลอง'}</span>
            </div>

            {/* Quick Safety Alert / Toast Test Bell */}
            <button
              type="button"
              onClick={() => {
                if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                  Notification.requestPermission();
                }
                window.dispatchEvent(new CustomEvent('jhcis:test-safety-toast'));
              }}
              title="ทดสอบเด้งแจ้งเตือนมุมจอแบบ Facebook / Windows Toast"
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
            >
              <Bell className="w-4 h-4 text-slate-600 hover:text-rose-600" />
            </button>

            {/* User profile & Logout Button (ALWAYS 100% VISIBLE) */}
            {user ? (
              <div className="flex items-center space-x-1.5 sm:space-x-2 pl-1.5 sm:pl-2 border-l border-slate-200 shrink-0">
                
                {/* User avatar */}
                <div 
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs"
                  title={`ผู้ใช้งาน: ${user.officername || user.username} (${user.role || 'เจ้าหน้าที่ JHCIS'})`}
                >
                  <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-700" />
                </div>

                {/* User name & role text */}
                <div className="hidden sm:block text-left min-w-0 max-w-[90px] md:max-w-[120px] lg:max-w-[150px] xl:max-w-[180px]">
                  <div 
                    className="text-xs font-bold text-slate-800 truncate leading-tight" 
                    title={user.officername || user.username}
                  >
                    {user.officername || user.username}
                  </div>
                  <div 
                    className="text-[10px] text-slate-500 truncate leading-tight mt-0.5" 
                    title={user.role || 'เจ้าหน้าที่ JHCIS'}
                  >
                    {user.role || 'เจ้าหน้าที่ JHCIS'}
                  </div>
                </div>

                {/* LOGOUT BUTTON - Prominent, high-contrast, guaranteed visible */}
                <button
                  type="button"
                  onClick={onLogout}
                  title="ออกจากระบบ (Logout)"
                  className="flex items-center space-x-1 px-2 sm:px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 hover:text-rose-900 border border-rose-200 hover:border-rose-300 rounded-lg text-xs font-bold transition-all shadow-2xs shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                  <span className="hidden sm:inline">ออกจากระบบ</span>
                  <span className="sm:hidden">ออก</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
