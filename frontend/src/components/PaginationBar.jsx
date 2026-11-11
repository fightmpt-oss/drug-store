import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown } from 'lucide-react';

export default function PaginationBar({
  currentPage = 1,
  pageSize = 20,
  totalItems = 0,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100, 'all'],
  colorTheme = 'blue', // 'blue', 'emerald', 'teal', 'slate'
  position = 'top',
  className = ''
}) {
  const isAll = pageSize === 'all';
  const numericSize = isAll ? Math.max(1, totalItems) : (Number(pageSize) || 20);
  const totalPages = isAll || totalItems === 0 ? 1 : Math.ceil(totalItems / numericSize);
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (validCurrentPage - 1) * numericSize + 1;
  const endItem = isAll ? totalItems : Math.min(validCurrentPage * numericSize, totalItems);

  // Theme styling definitions
  const themeClasses = {
    blue: {
      activePageBtn: 'bg-blue-600 text-white font-bold border-blue-600 shadow-xs',
      hoverBtn: 'hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300',
      badge: 'text-blue-900 bg-blue-50 border-blue-200',
      focusRing: 'focus:ring-blue-500/30 focus:border-blue-500'
    },
    emerald: {
      activePageBtn: 'bg-emerald-600 text-white font-bold border-emerald-600 shadow-xs',
      hoverBtn: 'hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300',
      badge: 'text-emerald-900 bg-emerald-50 border-emerald-200',
      focusRing: 'focus:ring-emerald-500/30 focus:border-emerald-500'
    },
    teal: {
      activePageBtn: 'bg-teal-600 text-white font-bold border-teal-600 shadow-xs',
      hoverBtn: 'hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300',
      badge: 'text-teal-900 bg-teal-50 border-teal-200',
      focusRing: 'focus:ring-teal-500/30 focus:border-teal-500'
    },
    slate: {
      activePageBtn: 'bg-slate-800 text-white font-bold border-slate-800 shadow-xs',
      hoverBtn: 'hover:bg-slate-100 hover:text-slate-800 hover:border-slate-300',
      badge: 'text-slate-900 bg-slate-100 border-slate-200',
      focusRing: 'focus:ring-slate-500/30 focus:border-slate-500'
    }
  }[colorTheme] || {
    activePageBtn: 'bg-blue-600 text-white font-bold border-blue-600 shadow-xs',
    hoverBtn: 'hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300',
    badge: 'text-blue-900 bg-blue-50 border-blue-200',
    focusRing: 'focus:ring-blue-500/30 focus:border-blue-500'
  };

  // Generate page numbers with ellipsis (...) for top bar
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = [];
    if (validCurrentPage <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('...');
      pages.push(totalPages);
    } else if (validCurrentPage >= totalPages - 3) {
      pages.push(1);
      pages.push('...');
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push('...');
      for (let i = validCurrentPage - 1; i <= validCurrentPage + 1; i++) pages.push(i);
      pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const handleSizeClick = (opt) => {
    if (onPageSizeChange) {
      onPageSizeChange(opt);
    }
  };

  const handlePageClick = (page) => {
    if (typeof page === 'number' && page >= 1 && page <= totalPages && page !== validCurrentPage) {
      if (onPageChange) {
        onPageChange(page);
      }
    }
  };

  const isBottom = position === 'bottom';

  // Bottom Pagination: Only "ก่อนหน้า", "ถัดไป", and Page Indicator. NO page size selector!
  if (isBottom) {
    return (
      <div
        className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-3.5 py-2.5 bg-slate-50/95 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 select-none shadow-2xs ${className}`}
      >
        {/* ฝั่งซ้าย: ยอดสรุปรายการที่กำลังแสดง */}
        <div className="text-xs text-slate-500 font-medium whitespace-nowrap">
          {totalItems === 0 ? (
            <span>ไม่มีรายการ</span>
          ) : isAll ? (
            <span>
              แสดงทั้งหมด <strong className="text-slate-900 font-bold font-mono">{totalItems.toLocaleString()}</strong> รายการ
            </span>
          ) : (
            <span>
              แสดงรายการที่ <strong className="text-slate-900 font-bold font-mono">{startItem} - {endItem}</strong> จาก{' '}
              <strong className="text-slate-900 font-bold font-mono">{totalItems.toLocaleString()}</strong> รายการ
            </span>
          )}
        </div>

        {/* ฝั่งขวา: มีแค่ปุ่ม "ก่อนหน้า" และ "ถัดไป" เท่านั้น */}
        <div className="flex items-center gap-2 shrink-0">
          {/* ก่อนหน้า (Previous) */}
          <button
            type="button"
            disabled={validCurrentPage <= 1 || isAll || totalItems === 0}
            onClick={() => handlePageClick(validCurrentPage - 1)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              validCurrentPage <= 1 || isAll || totalItems === 0
                ? 'opacity-40 cursor-not-allowed text-slate-400 border-slate-200 bg-white'
                : `bg-white border-slate-200 text-slate-700 ${themeClasses.hoverBtn} cursor-pointer shadow-2xs active:scale-95`
            }`}
            title="หน้าก่อนหน้า"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>ก่อนหน้า</span>
          </button>

          {/* ป้ายบอกหน้าปัจจุบัน */}
          <div className="px-3 py-1 text-xs font-bold text-slate-700 bg-white rounded-lg border border-slate-200 font-mono shadow-2xs">
            หน้า {validCurrentPage} / {totalPages}
          </div>

          {/* ถัดไป (Next) */}
          <button
            type="button"
            disabled={validCurrentPage >= totalPages || isAll || totalItems === 0}
            onClick={() => handlePageClick(validCurrentPage + 1)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              validCurrentPage >= totalPages || isAll || totalItems === 0
                ? 'opacity-40 cursor-not-allowed text-slate-400 border-slate-200 bg-white'
                : `bg-white border-slate-200 text-slate-700 ${themeClasses.hoverBtn} cursor-pointer shadow-2xs active:scale-95`
            }`}
            title="หน้าถัดไป"
          >
            <span>ถัดไป</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Top Pagination: Dropdown for page size, Summary range, and Navigation controls
  return (
    <div
      className={`flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 px-3.5 py-2.5 bg-slate-50/95 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 select-none shadow-2xs ${className}`}
    >
      {/* ฝั่งซ้าย: Dropdown เลือกจำนวนรายการต่อหน้า และข้อมูลช่วงที่แสดง */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        <div className="flex items-center space-x-2 shrink-0">
          <label className="text-slate-600 font-semibold text-xs whitespace-nowrap">
            แสดงต่อหน้า:
          </label>
          <div className="relative inline-flex items-center">
            <select
              value={pageSize}
              onChange={(e) => {
                const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                handleSizeClick(val);
              }}
              className={`appearance-none bg-white text-slate-800 font-semibold text-xs pl-3 pr-7 py-1.5 rounded-lg border border-slate-300 shadow-2xs hover:border-slate-400 focus:outline-hidden focus:ring-2 ${themeClasses.focusRing} cursor-pointer transition-colors`}
              title="เลือกจำนวนรายการที่แสดงต่อหน้า"
            >
              {pageSizeOptions.map((opt) => {
                const label = opt === 'all' ? 'ทั้งหมด (All)' : `${opt} รายการ`;
                return (
                  <option key={String(opt)} value={opt}>
                    {label}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 pointer-events-none" />
          </div>
        </div>

        {/* ยอดสรุปรายการที่กำลังแสดง */}
        <div className="text-xs text-slate-500 font-medium whitespace-nowrap pl-2 border-l border-slate-200">
          {totalItems === 0 ? (
            <span>ไม่มีรายการ</span>
          ) : isAll ? (
            <span>
              แสดงทั้งหมด <strong className="text-slate-900 font-bold font-mono">{totalItems.toLocaleString()}</strong> รายการ
            </span>
          ) : (
            <span>
              แสดง <strong className="text-slate-900 font-bold font-mono">{startItem} - {endItem}</strong> จาก{' '}
              <strong className="text-slate-900 font-bold font-mono">{totalItems.toLocaleString()}</strong> รายการ
            </span>
          )}
        </div>
      </div>

      {/* ฝั่งขวา: ปุ่มเปลี่ยนหน้า (หน้าแรก, ก่อนหน้า, เลขหน้า, ถัดไป, หน้าสุดท้าย) */}
      <div className="flex items-center justify-between md:justify-end gap-1.5 shrink-0">
        {/* หน้าแรก (First) */}
        <button
          type="button"
          disabled={validCurrentPage <= 1 || isAll || totalItems === 0}
          onClick={() => handlePageClick(1)}
          className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center transition-all ${
            validCurrentPage <= 1 || isAll || totalItems === 0
              ? 'opacity-40 cursor-not-allowed text-slate-400 border-slate-200 bg-white'
              : `bg-white border-slate-200 text-slate-700 ${themeClasses.hoverBtn} cursor-pointer shadow-2xs active:scale-95`
          }`}
          title="หน้าแรกสุด"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        {/* ก่อนหน้า (Previous) */}
        <button
          type="button"
          disabled={validCurrentPage <= 1 || isAll || totalItems === 0}
          onClick={() => handlePageClick(validCurrentPage - 1)}
          className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
            validCurrentPage <= 1 || isAll || totalItems === 0
              ? 'opacity-40 cursor-not-allowed text-slate-400 border-slate-200 bg-white'
              : `bg-white border-slate-200 text-slate-700 ${themeClasses.hoverBtn} cursor-pointer shadow-2xs active:scale-95`
          }`}
          title="หน้าก่อนหน้า"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>ก่อนหน้า</span>
        </button>

        {/* ปุ่มหมายเลขหน้า (สำหรับจอขนาด md ขึ้นไป) */}
        {!isAll && totalPages > 1 && (
          <div className="hidden sm:flex items-center gap-1">
            {getPageNumbers().map((p, idx) => {
              if (p === '...') {
                return (
                  <span key={`dots-${idx}`} className="px-1 text-slate-400 font-bold select-none">
                    ...
                  </span>
                );
              }
              const isCurrent = p === validCurrentPage;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePageClick(p)}
                  className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg border text-xs transition-all cursor-pointer ${
                    isCurrent
                      ? themeClasses.activePageBtn
                      : `bg-white border-slate-200 text-slate-700 ${themeClasses.hoverBtn} shadow-2xs`
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        )}

        {/* ป้ายหน้าปัจจุบัน (สำหรับจอมือถือ หรือกรณีหน้าเยอะ) */}
        <div className="sm:hidden px-2 py-1 text-xs font-bold text-slate-700 bg-white rounded-lg border border-slate-200 font-mono">
          {validCurrentPage} / {totalPages}
        </div>

        {/* ถัดไป (Next) */}
        <button
          type="button"
          disabled={validCurrentPage >= totalPages || isAll || totalItems === 0}
          onClick={() => handlePageClick(validCurrentPage + 1)}
          className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
            validCurrentPage >= totalPages || isAll || totalItems === 0
              ? 'opacity-40 cursor-not-allowed text-slate-400 border-slate-200 bg-white'
              : `bg-white border-slate-200 text-slate-700 ${themeClasses.hoverBtn} cursor-pointer shadow-2xs active:scale-95`
          }`}
          title="หน้าถัดไป"
        >
          <span>ถัดไป</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* หน้าสุดท้าย (Last) */}
        <button
          type="button"
          disabled={validCurrentPage >= totalPages || isAll || totalItems === 0}
          onClick={() => handlePageClick(totalPages)}
          className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center transition-all ${
            validCurrentPage >= totalPages || isAll || totalItems === 0
              ? 'opacity-40 cursor-not-allowed text-slate-400 border-slate-200 bg-white'
              : `bg-white border-slate-200 text-slate-700 ${themeClasses.hoverBtn} cursor-pointer shadow-2xs active:scale-95`
          }`}
          title="หน้าสุดท้าย"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
