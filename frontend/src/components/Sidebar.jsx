import React, { useState, useEffect } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Pin,
  PinOff,
  X,
  Sparkles,
  ShieldAlert,
  QrCode
} from 'lucide-react';

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  isPinned, 
  setIsPinned, 
  mobileOpen, 
  setMobileOpen, 
  user, 
  onLogout, 
  dbConfig,
  safetyAlertCount = 0
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isLive = dbConfig?.mode === 'live' && dbConfig?.isConnected;

  // Sidebar expands if it's pinned OR hovered (Auto-Hide on mouse leave)
  const isExpanded = isPinned || isHovered;

  const navItems = [
    { 
      id: 'dashboard', 
      label: 'แดชบอร์ด Drug Stock', 
      tag: null,
      shortLabel: 'แดชบอร์ด', 
      icon: BarChart3,
      desc: 'ภาพรวมสต็อก & ตรวจสอบสถานะยา'
    },
    { 
      id: 'safety', 
      label: 'เฝ้าระวังยา', 
      tag: 'Triple Whammy',
      shortLabel: 'เฝ้าระวังยา', 
      icon: ShieldAlert,
      desc: 'เตือนความเสี่ยง AKI ร่วมกัน 3 กลุ่ม',
      badge: safetyAlertCount > 0 ? safetyAlertCount : null
    },
    { 
      id: 'initial-count', 
      label: 'ตรวจนับสต็อกยกมา', 
      tag: null,
      shortLabel: 'นับสต็อก', 
      icon: ClipboardCheck,
      desc: 'บันทึกยอดยกมาเริ่มต้นรอบบัญชี'
    },
    { 
      id: 'import', 
      label: 'นำเข้าใบรับยา', 
      tag: 'Excel / PDF',
      shortLabel: 'นำเข้าใบรับยา', 
      icon: FileSpreadsheet,
      desc: 'นำเข้าใบรับยาจาก รพ.แม่ข่าย'
    },
    { 
      id: 'substock-qr', 
      label: 'เบิกยาคลังใน', 
      tag: 'สแกน QR',
      shortLabel: 'เบิกคลังใน (QR)', 
      icon: QrCode,
      desc: 'สแกน QR ตัดคลังยาในไปเคาน์เตอร์'
    },
    { 
      id: 'report', 
      label: 'รายงานจ่ายยา', 
      tag: 'rdrug_used',
      shortLabel: 'รายงานจ่ายยา', 
      icon: FileText,
      desc: 'ประวัติจ่ายยาตามคนไข้และรหัสโรค'
    },
    { 
      id: 'mapping', 
      label: 'ผูกรหัสยา', 
      tag: 'TMT / รพ.',
      shortLabel: 'ผูกรหัสยา', 
      icon: Link2,
      desc: 'จับคู่รหัสยา รพ. กับ cdrug JHCIS'
    },
    { 
      id: 'catalogue', 
      label: 'ตรวจ Drug Catalogue', 
      tag: 'สปสช.',
      shortLabel: 'Drug Catalogue', 
      icon: FileCheck2,
      desc: 'ตรวจสอบรหัสมาตรฐาน สปสช.'
    },
    { 
      id: 'settings', 
      label: 'ตั้งค่า JHCIS', 
      tag: null,
      shortLabel: 'ตั้งค่า', 
      icon: Settings,
      desc: 'การเชื่อมต่อฐานข้อมูล MySQL'
    },
  ];

  const handleTogglePin = (e) => {
    e.stopPropagation();
    const nextPinned = !isPinned;
    setIsPinned(nextPinned);
    try {
      localStorage.setItem('jhcis_sidebar_pinned', String(nextPinned));
    } catch (err) {}
  };

  return (
    <>
      {/* ========================================================= */}
      {/* 1. DESKTOP & LAPTOP SIDEBAR (Auto-Hide on Hover / Pinned) */}
      {/* ========================================================= */}
      <aside
        onMouseEnter={() => !isPinned && setIsHovered(true)}
        onMouseLeave={() => !isPinned && setIsHovered(false)}
        className={`hidden md:flex flex-col fixed top-0 left-0 h-screen bg-slate-50/70 backdrop-blur-xs border-r border-slate-200 z-40 transition-all duration-300 ease-in-out ${
          isExpanded 
            ? 'w-[268px] lg:w-[288px] shadow-2xl ring-1 ring-slate-900/5' 
            : 'w-16 shadow-xs'
        }`}
        style={{ willChange: 'width' }}
      >
        {/* Header / Brand Area */}
        <div className="h-16 border-b border-slate-200/80 bg-white flex items-center px-3.5 justify-between shrink-0">
          <div 
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center space-x-2.5 cursor-pointer min-w-0"
            title="กลับสู่แดชบอร์ดหลัก"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-sm shrink-0">
              <Package className="w-5 h-5" />
            </div>
            {isExpanded && (
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="font-black text-sm sm:text-base text-slate-900 tracking-tight whitespace-nowrap">
                    คลังยา รพ.สต.
                  </span>
                  <span className="text-[10px] sm:text-xs px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    Stock
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate">ระบบบริหารคลังยา JHCIS</p>
              </div>
            )}
          </div>

          {/* Pin / Auto-Hide Toggle Button (Visible when expanded) */}
          {isExpanded && (
            <button
              type="button"
              onClick={handleTogglePin}
              className={`p-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                isPinned 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 shadow-2xs' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
              }`}
              title={isPinned ? 'ยกเลิกการปักหมุด (เปิดโหมดซ่อนอัตโนมัติ Auto-Hide เพื่อเพิ่มพื้นที่หน้าจอ)' : 'ปักหมุดแถบข้าง (แสดงตลอดเวลา)'}
            >
              {isPinned ? (
                <Pin className="w-4 h-4 text-emerald-600 fill-emerald-600 rotate-45" />
              ) : (
                <PinOff className="w-4 h-4 text-slate-400" />
              )}
            </button>
          )}
        </div>

        {/* Navigation Items List (Styled as Box Strips / Cards with rich hover highlight) */}
        <div className="flex-1 py-2.5 px-2.5 space-y-1.5 overflow-y-auto no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center rounded-xl transition-all duration-200 cursor-pointer group relative ${
                  isExpanded ? 'p-2 space-x-2.5' : 'justify-center p-2.5 my-1'
                } ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-md shadow-emerald-700/20 border border-emerald-500/80 ring-1 ring-emerald-500/30'
                    : 'bg-white hover:bg-emerald-50/70 border border-slate-200/90 hover:border-emerald-300 text-slate-700 hover:text-emerald-950 font-medium shadow-2xs hover:shadow-xs hover:translate-x-0.5'
                }`}
                title={!isExpanded ? item.label : undefined}
              >
                {/* Collapsed left active bar indicator */}
                {isActive && !isExpanded && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-emerald-600 rounded-r-full" />
                )}

                <div className={`shrink-0 rounded-lg p-1.5 transition-colors ${
                  isActive 
                    ? 'bg-white/20 text-white' 
                    : 'bg-slate-100 group-hover:bg-emerald-100 text-slate-500 group-hover:text-emerald-700'
                }`}>
                  <Icon className={`${isExpanded ? 'w-4 h-4 sm:w-4.5 sm:h-4.5' : 'w-5 h-5'}`} />
                </div>

                {/* Text Label & Tag (Shown when expanded) */}
                {isExpanded && (
                  <div className="text-left min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs sm:text-[13px] leading-snug font-extrabold ${
                        isActive ? 'text-white' : 'text-slate-800 group-hover:text-emerald-950'
                      }`}>
                        {item.label}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {item.tag && (
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold whitespace-nowrap ${
                            isActive 
                              ? 'bg-emerald-700/80 text-emerald-100 border border-emerald-400/40' 
                              : 'bg-slate-100 group-hover:bg-emerald-100 text-slate-600 group-hover:text-emerald-800 border border-slate-200 group-hover:border-emerald-200'
                          }`}>
                            {item.tag}
                          </span>
                        )}
                        {item.badge && (
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                            isActive ? 'bg-white text-emerald-800' : 'bg-rose-500 text-white animate-pulse'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`text-[10px] sm:text-[11px] leading-tight truncate mt-0.5 ${
                      isActive ? 'text-emerald-100/90' : 'text-slate-400 group-hover:text-emerald-700/80'
                    }`}>
                      {item.desc}
                    </div>
                  </div>
                )}

                {/* Collapsed Badge Indicator Dot */}
                {!isExpanded && item.badge && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-white animate-ping" />
                )}

                {/* Floating Tooltip Hover popup when collapsed */}
                {!isExpanded && (
                  <div className="hidden group-hover:flex flex-col absolute left-full ml-3 px-3.5 py-2 bg-slate-900 text-white text-xs rounded-xl shadow-2xl whitespace-nowrap z-50 pointer-events-none">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-sm">{item.label}</span>
                      {item.tag && (
                        <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded text-slate-300">
                          {item.tag}
                        </span>
                      )}
                      {item.badge && (
                        <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-300 font-normal mt-0.5">{item.desc}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer Area: Auto-Hide status indicator & Quick Settings */}
        <div className="border-t border-slate-100 p-2.5 bg-slate-50/50 shrink-0">
          {isExpanded ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                <span className="flex items-center space-x-1 font-semibold">
                  <span className={`w-2 h-2 rounded-full ${isPinned ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span>{isPinned ? 'ปักหมุดแถบข้างอยู่' : 'โหมดซ่อนอัตโนมัติ'}</span>
                </span>
                <button
                  type="button"
                  onClick={handleTogglePin}
                  className="text-emerald-700 hover:underline font-bold text-[10px] cursor-pointer"
                >
                  {isPinned ? 'เปิด Auto-Hide' : 'ปักหมุด'}
                </button>
              </div>

              {/* DB Status Badge inside Sidebar footer */}
              <div 
                onClick={() => setActiveTab('settings')}
                className={`cursor-pointer flex items-center justify-between p-2 rounded-lg text-xs font-semibold border transition-all ${
                  isLive
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                    : 'bg-amber-50/80 border-amber-200 text-amber-800 hover:bg-amber-100'
                }`}
                title="คลิกเพื่อตรวจสอบการตั้งค่าฐานข้อมูล JHCIS"
              >
                <div className="flex items-center space-x-1.5 truncate">
                  <Database className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
                  <span className="truncate">{isLive ? 'JHCIS: เชื่อมต่อแล้ว' : 'โหมดจำลองข้อมูล'}</span>
                </div>
                <span className={`w-2 h-2 rounded-full shrink-0 ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-2">
              <div 
                onClick={() => setActiveTab('settings')}
                className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer border transition-colors ${
                  isLive ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                }`}
                title={isLive ? 'JHCIS: เชื่อมต่อแล้ว (คลิกเพื่อดูการตั้งค่า)' : 'โหมดจำลองข้อมูล (คลิกเพื่อตั้งค่า)'}
              >
                <Database className="w-4 h-4" />
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ========================================================= */}
      {/* 2. MOBILE / TABLET DRAWER OVERLAY (< md)                   */}
      {/* ========================================================= */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop Overlay */}
          <div 
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
          />

          {/* Drawer Menu */}
          <div className="relative w-72 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col z-10 animate-slideRight">
            {/* Drawer Header */}
            <div className="h-16 border-b border-slate-100 flex items-center justify-between px-4">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-sm shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-sm text-slate-900">คลังยา รพ.สต.</div>
                  <div className="text-[10px] text-slate-400">ระบบคุมคลังยา JHCIS</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                title="ปิดเมนู"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Nav Items */}
            <div className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileOpen(false); // Auto-hide on mobile click!
                    }}
                    className={`w-full flex items-center space-x-3 p-3 rounded-xl transition-all text-left cursor-pointer ${
                      isActive 
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-md shadow-emerald-700/20 border border-emerald-500' 
                        : 'bg-white hover:bg-emerald-50/70 border border-slate-200/80 text-slate-700 hover:text-emerald-950 font-medium'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg shrink-0 ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-extrabold leading-tight">{item.label}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.tag && (
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                              isActive ? 'bg-emerald-700/80 text-emerald-100' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {item.tag}
                            </span>
                          )}
                          {item.badge && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              isActive ? 'bg-white text-emerald-800' : 'bg-rose-500 text-white animate-pulse'
                            }`}>
                              {item.badge}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={`text-xs mt-0.5 ${isActive ? 'text-emerald-100' : 'text-slate-400'}`}>
                        {item.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Drawer Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50 space-y-2">
              {user && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                  <div className="flex items-center space-x-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                      <User className="w-3.5 h-3.5 text-emerald-700" />
                    </div>
                    <div className="truncate text-xs">
                      <div className="font-bold text-slate-800 truncate">{user.officername || user.username}</div>
                      <div className="text-[10px] text-slate-400 truncate">{user.role || 'เจ้าหน้าที่ JHCIS'}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      onLogout();
                    }}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md"
                    title="ออกจากระบบ"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
