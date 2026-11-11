import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Calendar, 
  Printer, 
  Download, 
  Search, 
  Filter, 
  TrendingUp, 
  DollarSign, 
  Package, 
  Sparkles,
  RefreshCw,
  Building,
  CheckCircle2
} from 'lucide-react';
import { api } from '../services/api';
import { currentFiscalYear, prevFiscalYear, thaiYearShort } from '../utils/fiscalYear';
import PaginationBar from './PaginationBar';

export default function DrugUsageReportView({ dbConfig }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);

  // Date filters - default matching JHCIS screenshot (1 ก.ย. 2569 - 31 ต.ค. 2569 or current month)
  // ช่วงเริ่มต้น = ปีงบประมาณปัจจุบัน (คำนวณจากวันจริง — ไม่ hardcode ปี)
  const fyNow = currentFiscalYear();
  const fyPrev = prevFiscalYear();
  // ปุ่ม "ข้ามปีงบ" (ก.ย.–ต.ค.): ปิดปีงบเก่า ก.ย. + เปิดปีงบใหม่ ต.ค. — ใช้ตรวจสอบการส่งมอบระหว่างปี
  const handover = {
    startDate: `${fyNow.endDate.slice(0, 4)}-09-01`,
    endDate: `${Number(fyNow.startDate.slice(0, 4)) + 1}-10-31`
  };
  const [startDate, setStartDate] = useState(fyNow.startDate);
  const [endDate, setEndDate] = useState(fyNow.endDate);
  const [activeCategory, setActiveCategory] = useState('all'); // 'all', 'herbals', 'modernDrugs', 'services'
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getDrugUsageReport({ startDate, endDate });
      if (res.success) {
        setReportData(res.data);
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (!reportData) return;

    let rows = [
      ['หมวดหมู่', 'ลำดับ', 'รหัสยา', 'ชื่อยา-เวชภัณฑ์', 'จำนวนจ่าย', 'หน่วยนับ', 'มูลค่าจ่าย (ทุน)', 'มูลค่าจ่าย (ขาย)']
    ];

    const addRows = (categoryName, list) => {
      list.forEach((item, idx) => {
        rows.push([
          categoryName,
          idx + 1,
          item.drugcode,
          `"${item.drugname}"`,
          item.units,
          item.drugunit,
          item.cost.toFixed(2),
          item.sell.toFixed(2)
        ]);
      });
    };

    if (activeCategory === 'all' || activeCategory === 'herbals') addRows('ยาสมุนไพร', reportData.herbals || []);
    if (activeCategory === 'all' || activeCategory === 'modernDrugs') addRows('ยาแผนปัจจุบัน', reportData.modernDrugs || []);
    if (activeCategory === 'all' || activeCategory === 'services') addRows('ค่าบริการฯ', reportData.services || []);

    const csvContent = '\uFEFF' + rows.map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `rdrug_used_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const pcuCode = dbConfig?.pcucode || '';
  const pcuName = dbConfig?.pcuname || 'สถานบริการ (ตั้งชื่อหน่วยที่เมนูตั้งค่า)';
  const pcuAddress = dbConfig?.pcuAddress || '';

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-5 sm:py-6 space-y-6">
      
      {/* Header Banner - Screen Only */}
      <div className="print:hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
              <FileText className="w-6 h-6 text-emerald-600" />
              <span>รายงานการจ่ายยาและเวชภัณฑ์ ฯ</span>
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium font-mono">
              rdrug_used
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            รายงานสถิติการจ่ายยาจริงจากระบบ JHCIS (visitdrug) แยกตามหมวดยาสมุนไพร, ยาแผนปัจจุบัน และค่าบริการ พร้อมคำนวณมูลค่าราคาทุนและราคาขาย
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-2xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>รีเฟรช</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>ส่งออก CSV</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-xs transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>พิมพ์รายงาน (Print)</span>
          </button>
        </div>
      </div>

      {/* Printable Report Header - Appears in Print Mode */}
      <div className="hidden print:block text-center space-y-1 mb-6 border-b pb-4">
        <h2 className="text-xl font-bold text-slate-900">รายงานการจ่ายยาและเวชภัณฑ์ ฯ</h2>
        <p className="text-sm text-slate-700">{pcuName}{pcuCode ? ` (${pcuCode})` : ''}{pcuAddress ? ` • ${pcuAddress}` : ''}</p>
        <p className="text-xs text-slate-500">
          วันที่ตัดยอดระหว่างวันที่ ( {startDate} ถึง {endDate} )
        </p>
      </div>

      {/* Filter Card - Screen Only */}
      <div className="print:hidden bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-600">ตั้งแต่วันที่:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-emerald-500 bg-slate-50"
              />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-medium text-slate-600">ถึงวันที่:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-emerald-500 bg-slate-50"
              />
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => { setStartDate(handover.startDate); setEndDate(handover.endDate); }}
                className="px-2.5 py-1 text-[11px] rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                title={`ช่วงปิดปีงบเก่าและเปิดปีงบใหม่ (${handover.startDate} - ${handover.endDate})`}
              >
                ก.ย. - ต.ค. {thaiYearShort(handover.startDate)}
              </button>
              <button
                onClick={() => { setStartDate(fyNow.startDate); setEndDate(fyNow.endDate); }}
                className={`px-2.5 py-1 text-[11px] rounded font-medium ${
                  startDate === fyNow.startDate && endDate === fyNow.endDate
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                }`}
              >
                {fyNow.label}
              </button>
              <button
                onClick={() => { setStartDate(fyPrev.startDate); setEndDate(fyPrev.endDate); }}
                className={`px-2.5 py-1 text-[11px] rounded ${
                  startDate === fyPrev.startDate && endDate === fyPrev.endDate
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {fyPrev.label}
              </button>
            </div>
          </div>

          {/* Quick Search */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="ค้นหาชื่อยา/รหัสยา..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-emerald-500"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex space-x-2 pt-2 border-t border-slate-100 overflow-x-auto">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeCategory === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            ทั้งหมด ({reportData?.totals?.grand?.count || 0})
          </button>
          <button
            onClick={() => setActiveCategory('herbals')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeCategory === 'herbals'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>(ยาสมุนไพร) ({reportData?.totals?.herbals?.count || 0})</span>
          </button>
          <button
            onClick={() => setActiveCategory('modernDrugs')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeCategory === 'modernDrugs'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
            }`}
          >
            (ยาแผนปัจจุบัน) ({reportData?.totals?.modernDrugs?.count || 0})
          </button>
          <button
            onClick={() => setActiveCategory('services')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeCategory === 'services'
                ? 'bg-purple-600 text-white shadow-2xs'
                : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
            }`}
          >
            (ค่าบริการฯ) ({reportData?.totals?.services?.count || 0})
          </button>
        </div>
      </div>

      {/* KPI Cards - Screen Only */}
      {reportData && (
        <div className="print:hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-slate-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform">
            <span className="text-xs text-slate-500 font-bold">ยอดจ่ายรวมทั้งหมด</span>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-slate-900 mt-1">
              {reportData.totals.grand.units.toLocaleString()} <span className="text-xs font-semibold text-slate-500">หน่วย</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium mt-1 block">
              {reportData.totals.grand.count} รายการยาและบริการ
            </span>
          </div>

          <div className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-amber-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform">
            <span className="text-xs text-slate-500 font-bold">มูลค่าจ่ายรวม (ราคาทุน)</span>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-amber-700 mt-1">
              ฿{reportData.totals.grand.cost.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400 font-medium mt-1 block">
              ต้นทุนยาที่ รพ.สต. เบิกใช้จริง
            </span>
          </div>

          <div className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-emerald-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform">
            <span className="text-xs text-slate-500 font-bold">มูลค่าจ่ายรวม (ราคาขาย)</span>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-600 mt-1">
              ฿{reportData.totals.grand.sell.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400 font-medium mt-1 block">
              มูลค่าเรียกเก็บ/บันทึกเบิก สปสช.
            </span>
          </div>

          <div className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-teal-400 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 transform">
            <span className="text-xs text-slate-500 font-bold">เฉพาะยาสมุนไพร</span>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-teal-700 mt-1">
              {reportData.totals.herbals.units.toLocaleString()} <span className="text-xs font-semibold text-slate-500">หน่วย</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium mt-1 block">
              มูลค่าขาย: ฿{reportData.totals.herbals.sell.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ({reportData.totals.herbals.count} รายการ)
            </span>
          </div>
        </div>
      )}

      {/* Main Tables (Formatted exactly as JHCIS rdrug_used report) */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-2xs">
          <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-3" />
          <h3 className="font-semibold text-slate-800">กำลังประมวลผลรายงานการจ่ายยา (rdrug_used)...</h3>
          <p className="text-xs text-slate-500 mt-1">กำลังรวบรวมข้อมูลการจ่ายยาจากตาราง visitdrug และคำนวณมูลค่า</p>
        </div>
      ) : reportData ? (
        <div className="space-y-6">
          
          {/* Section 1: ยาสมุนไพร */}
          {(activeCategory === 'all' || activeCategory === 'herbals') && (
            <CategoryTable 
              title="(ยาสมุนไพร)" 
              badgeColor="bg-emerald-100 text-emerald-800"
              items={filterItems(reportData.herbals, searchTerm)} 
              subtotal={reportData.totals.herbals} 
            />
          )}

          {/* Section 2: ยาแผนปัจจุบัน */}
          {(activeCategory === 'all' || activeCategory === 'modernDrugs') && (
            <CategoryTable 
              title="(ยาฯ - ยาแผนปัจจุบัน)" 
              badgeColor="bg-blue-100 text-blue-800"
              items={filterItems(reportData.modernDrugs, searchTerm)} 
              subtotal={reportData.totals.modernDrugs} 
            />
          )}

          {/* Section 3: ค่าบริการฯ */}
          {(activeCategory === 'all' || activeCategory === 'services') && (
            <CategoryTable 
              title="(ค่าบริการฯ / หัตถการ)" 
              badgeColor="bg-purple-100 text-purple-800"
              items={filterItems(reportData.services, searchTerm)} 
              subtotal={reportData.totals.services} 
            />
          )}

          {/* Grand Total Footer Card */}
          <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-base font-bold flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>รวมทั้งสิ้น ทุกหมวดหมู่ (Grand Total)</span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                รวมยอดการจ่ายและมูลค่าจากทุกรายการยาและค่าบริการในงวดที่เลือก
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-6 text-right">
              <div>
                <span className="text-[11px] text-slate-400 block">จำนวนจ่ายรวม</span>
                <span className="text-lg font-bold font-mono text-white">
                  {reportData.totals.grand.units.toLocaleString()} หน่วย
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">มูลค่าจ่าย (ทุน)</span>
                <span className="text-lg font-bold font-mono text-amber-400">
                  ฿{reportData.totals.grand.cost.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">มูลค่าจ่าย (ขาย)</span>
                <span className="text-xl font-bold font-mono text-emerald-400">
                  ฿{reportData.totals.grand.sell.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

        </div>
      ) : null}

    </div>
  );
}

// Sub-table component matching JHCIS rdrug_used table style with Sticky Header and Top/Bottom Pagination
function CategoryTable({ title, badgeColor, items, subtotal, colorTheme = 'emerald' }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  if (!items || items.length === 0) return null;

  const totalItems = items.length;
  const isAll = pageSize === 'all';
  const numericSize = isAll ? Math.max(1, totalItems) : Number(pageSize);
  const totalPages = isAll ? 1 : Math.ceil(totalItems / numericSize);
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const pagedItems = isAll
    ? items
    : items.slice((validCurrentPage - 1) * numericSize, validCurrentPage * numericSize);
  const startIndex = isAll ? 0 : (validCurrentPage - 1) * numericSize;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs space-y-2 p-3">
      <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div className="flex items-center space-x-2">
          <h2 className="font-bold text-slate-800 text-sm">{title}</h2>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${badgeColor}`}>
            {totalItems} รายการ
          </span>
        </div>
        <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3">
          <span>ยอดจ่าย: <strong className="font-mono text-slate-900">{subtotal.units.toLocaleString()}</strong></span>
          <span>ทุน: <strong className="font-mono text-amber-700">฿{subtotal.cost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong></span>
          <span>ขาย: <strong className="font-mono text-emerald-700">฿{subtotal.sell.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong></span>
        </div>
      </div>

      {/* Top Pagination Bar */}
      {totalItems > 0 && (
        <PaginationBar
          currentPage={validCurrentPage}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={setCurrentPage}
          onPageSizeChange={(sz) => { setPageSize(sz); setCurrentPage(1); }}
          pageSizeOptions={[10, 20, 50, 100, 'all']}
          colorTheme={colorTheme}
          position="top"
        />
      )}

      <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[520px] overflow-y-auto table-scroll-visible">
        <table className="w-full text-left text-xs border-collapse min-w-[750px]">
          <thead className="sticky top-0 z-10 bg-slate-100 shadow-xs border-b border-slate-200">
            <tr className="text-slate-700 font-bold">
              <th className="py-2.5 px-4 w-12 text-center bg-slate-100">#</th>
              <th className="py-2.5 px-4 bg-slate-100 min-w-[220px]">ชื่อยา-เวชภัณฑ์</th>
              <th className="py-2.5 px-3 w-28 bg-slate-100">รหัสยา</th>
              <th className="py-2.5 px-4 text-right w-24 bg-slate-100">จ่าย</th>
              <th className="py-2.5 px-3 text-center w-20 bg-slate-100">หน่วย</th>
              <th className="py-2.5 px-4 text-right w-32 bg-slate-100">มูลค่าจ่าย (ทุน)</th>
              <th className="py-2.5 px-4 text-right w-32 bg-slate-100">มูลค่าจ่าย (ขาย)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagedItems.map((item, idx) => (
              <tr key={item.drugcode} className="hover:bg-slate-50/70 transition-colors">
                <td className="py-2 px-4 text-center text-slate-400 font-mono text-[11px]">{startIndex + idx + 1}</td>
                <td className="py-2 px-4 font-medium text-slate-800">{item.drugname}</td>
                <td className="py-2 px-3 font-mono text-slate-500 text-[11px]">{item.drugcode}</td>
                <td className="py-2 px-4 text-right font-mono font-semibold text-slate-900">{item.units.toLocaleString()}</td>
                <td className="py-2 px-3 text-center text-slate-500">{item.drugunit || 'หน่วย'}</td>
                <td className="py-2 px-4 text-right font-mono text-amber-700">฿{item.cost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                <td className="py-2 px-4 text-right font-mono text-emerald-700 font-semibold">฿{item.sell.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold text-slate-900 border-t-2 border-slate-200">
              <td colSpan={3} className="py-2.5 px-4 text-right">รวมเฉพาะ : {title}</td>
              <td className="py-2.5 px-4 text-right font-mono">{subtotal.units.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-center">-</td>
              <td className="py-2.5 px-4 text-right font-mono text-amber-700">฿{subtotal.cost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
              <td className="py-2.5 px-4 text-right font-mono text-emerald-700">฿{subtotal.sell.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Bottom Pagination Bar */}
      {totalItems > 0 && (
        <PaginationBar
          currentPage={validCurrentPage}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={setCurrentPage}
          onPageSizeChange={(sz) => { setPageSize(sz); setCurrentPage(1); }}
          pageSizeOptions={[10, 20, 50, 100, 'all']}
          colorTheme={colorTheme}
          position="bottom"
        />
      )}
    </div>
  );
}

function filterItems(items = [], term = '') {
  if (!term) return items;
  const q = term.toLowerCase().trim();
  return items.filter(i => 
    i.drugname.toLowerCase().includes(q) || 
    i.drugcode.toLowerCase().includes(q)
  );
}
