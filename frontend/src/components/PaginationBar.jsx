import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

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
      activeSizeBtn: 'bg-blue-600 text-white shadow-xs font-bold border-blue-600',
      activePageBtn: 'bg-blue-600 text-white font-bold border-blue-600 shadow-xs',
      hoverBtn: 'hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300',
      badge: 'text-blue-900 bg-blue-50 border-blue-200'
    },
    emerald: {
      activeSizeBtn: 'bg-emerald-600 text-white shadow-xs font-bold border-emerald-600',
      activePageBtn: 'bg-emerald-600 text-white font-bold border-emerald-600 shadow-xs',
      hoverBtn: 'hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300',
      badge: 'text-emerald-900 bg-emerald-50 border-emerald-200'
    },
    teal: {
      activeSizeBtn: 'bg-teal-600 text-white shadow-xs font-bold border-teal-600',
      activePageBtn: 'bg-teal-600 text-white font-bold border-teal-600 shadow-xs',
      hoverBtn: 'hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300',
      badge: 'text-teal-900 bg-teal-50 border-teal-200'
    },
    slate: {
      activeSizeBtn: 'bg-slate-800 text-white shadow-xs font-bold border-slate-800',
      activePageBtn: 'bg-slate-800 text-white font-bold border-slate-800 shadow-xs',
      hoverBtn: 'hover:bg-slate-100 hover:text-slate-800 hover:border-slate-300',
      badge: 'text-slate-900 bg-slate-100 border-slate-200'
    }
  }[colorTheme] || {
    activeSizeBtn: 'bg-blue-600 text-white shadow-xs font-bold border-blue-600',
    activePageBtn: 'bg-blue-600 text-white font-bold border-blue-600 shadow-xs',
    hoverBtn: 'hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300',
    badge: 'text-blue-900 bg-blue-50 border-blue-200'
  };

  // Generate page numbers with ellipsis (...)
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

  return (
    <div
      className={`flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 px-3.5 py-2.5 bg-slate-50/95 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 select-none shadow-2xs ${className}`}
    >
      {/* ฝั่งซ้าย: ตัวเลือกจำนวนรายการต่อหน้า (10, 20, 50, 100, all) และข้อมูลช่วงที่แสดง */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        <div className="flex items-center space-x-1.5 shrink-0">
          <span className="text-slate-500 font-medium text-xs">แสดงต่อหน้า:</span>
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
            {pageSizeOptions.map((opt) => {
              const active = pageSize === opt;
              const label = opt === 'all' ? 'All (ทั้งหมด)' : opt;
              return (
                <button
                  key={String(opt)}
                  type="button"
                  onClick={() => handleSizeClick(opt)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-all cursor-pointer ${
                    active
                      ? themeClasses.activeSizeBtn
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                  }`}
                  title={`แสดง ${label} รายการต่อหน้า`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ยอดสรุปรายการที่กำลังแสดง */}
        <div className="text-xs text-slate-500 font-medium whitespace-nowrap pl-1 border-l border-slate-200">
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
              : `bg-white border-slate-200 text-slate-700 ${themeClasses.hoverBtn} cursor-pointer shadow-2xs`
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
              : `bg-white border-slate-200 text-slate-700 ${themeClasses.hoverBtn} cursor-pointer shadow-2xs`
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
              : `bg-white border-slate-200 text-slate-700 ${themeClasses.hoverBtn} cursor-pointer shadow-2xs`
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
              : `bg-white border-slate-200 text-slate-700 ${themeClasses.hoverBtn} cursor-pointer shadow-2xs`
          }`}
          title="หน้าสุดท้าย"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
