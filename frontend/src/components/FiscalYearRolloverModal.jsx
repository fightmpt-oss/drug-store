import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Calendar,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Package,
  Layers,
  ShieldCheck,
  Search,
  RefreshCw,
  Archive
} from 'lucide-react';
import { api } from '../services/api';

function formatThaiDateShort(isoStr) {
  if (!isoStr || isoStr === 'ไม่ระบุ') return 'ไม่ระบุ';
  const parts = String(isoStr).slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return isoStr;
  const [y, m, d] = parts;
  const months = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d} ${months[m] || m} ${y + 543}`;
}

export default function FiscalYearRolloverModal({ isOpen, onClose, user, fiscalInfo, onCompleted, onSelectFiscalYear }) {
  const isAdmin = user?.systemRole === 'admin';
  const defaultTargetFy = useMemo(() => {
    if (fiscalInfo?.nextRecommendedFy) return Number(fiscalInfo.nextRecommendedFy);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    return (m >= 10 ? y + 1 : y) + 543 + 1;
  }, [fiscalInfo]);

  const [targetFy, setTargetFy] = useState(defaultTargetFy);
  const [excludeExpired, setExcludeExpired] = useState(false);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setTargetFy(defaultTargetFy);
      setError(null);
    }
  }, [isOpen, defaultTargetFy]);

  useEffect(() => {
    if (!isOpen || !targetFy) return;
    let cancelled = false;
    const loadPreview = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.previewFiscalYearRollover({
          targetFy,
          excludeExpired: excludeExpired ? '1' : '0'
        });
        if (!cancelled && res.success) {
          setPreview(res.data);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'ไม่สามารถคำนวณยอดยกข้ามปีงบประมาณได้');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadPreview();
    return () => { cancelled = true; };
  }, [isOpen, targetFy, excludeExpired]);

  const targetOptions = useMemo(() => {
    const base = defaultTargetFy;
    const set = new Set([base - 2, base - 1, base, base + 1, base + 2]);
    (fiscalInfo?.years || []).forEach(y => set.add(Number(y.fy)));
    return Array.from(set).filter(y => y >= 2568 && y <= 2585).sort((a, b) => a - b);
  }, [defaultTargetFy, fiscalInfo]);

  const filteredItems = useMemo(() => {
    if (!preview?.items) return [];
    const q = search.trim().toLowerCase();
    if (!q) return preview.items;
    return preview.items.filter(it =>
      String(it.drugcode).toLowerCase().includes(q) ||
      String(it.drugname || '').toLowerCase().includes(q) ||
      (it.lots || []).some(l => String(l.lotno || '').toLowerCase().includes(q))
    );
  }, [preview, search]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!isAdmin) return;
    const msg = `ยืนยันการเริ่มต้นปีงบประมาณ ${targetFy} (วันที่ ${formatThaiDateShort(preview?.newStartDate)})?\n\n` +
      `• ระบบจะสำรองข้อมูลทั้งหมด (Full Backup Snapshot) อัตโนมัติก่อนทำรายการ\n` +
      `• เก็บยอดปีงบประมาณ ${preview?.prevFy} ไว้ดูย้อนหลังได้ตลอด\n` +
      `• ยกยอดคงเหลือคลังยาใน ณ ${formatThaiDateShort(preview?.sourceAsOfDate)} จำนวน ${preview?.summary?.drugCount || 0} รายการ (${preview?.summary?.totalLots || 0} Lot) ไปเป็นยอดยกมาวันที่ ${formatThaiDateShort(preview?.newStartDate)}`;
    if (!window.confirm(msg)) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await api.executeFiscalYearRollover({
        targetFy,
        excludeExpired,
        note: note.trim()
      });
      if (res.success) {
        onCompleted?.(res);
      } else {
        setError(res.message || 'เปิดปีงบประมาณใหม่ไม่สำเร็จ');
      }
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเริ่มต้นปีงบประมาณใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-white/15 border border-white/25">
              <Calendar className="w-5 h-5 text-emerald-100" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                จัดการรอบปีงบประมาณ &amp; เริ่มต้นปีงบประมาณใหม่
              </h2>
              <p className="text-xs text-emerald-100">
                ยกยอดคงเหลือคลังยาใน ณ วันที่ 30 ก.ย. ไปเป็นยอดยกมาเริ่มต้นวันที่ 1 ต.ค. ของปีงบประมาณถัดไป (พร้อมเก็บประวัติปีเดิมครบ)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Existing Fiscal Years Strip */}
          {fiscalInfo?.years && fiscalInfo.years.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <Archive className="w-3.5 h-3.5 text-slate-500" />
                <span>ปีงบประมาณในระบบ (คลิกเพื่อสลับดูข้อมูลงวดนั้นบนแดชบอร์ด):</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {fiscalInfo.years.map(y => (
                  <button
                    key={y.fy}
                    type="button"
                    onClick={() => {
                      onSelectFiscalYear?.(y);
                      onClose();
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      y.isActive
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : y.status === 'closed'
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span>{y.shortLabel}</span>
                    <span className="opacity-80 font-normal">({y.thaiRangeLabel})</span>
                    {y.isActive && <span className="px-1.5 py-0.2 rounded bg-white/25 text-[10px]">ใช้งานอยู่</span>}
                    {y.status === 'closed' && <span className="px-1.5 py-0.2 rounded bg-amber-200 text-amber-950 text-[10px]">ปิดงวดแล้ว</span>}
                    {y.openingDrugCount > 0 && (
                      <span className="font-mono text-[10px] opacity-90">[{y.openingDrugCount} รายการ]</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Target Selection & Options */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5">
            <div className="md:col-span-5">
              <label className="block text-xs font-bold text-emerald-950 mb-1">
                เลือกปีงบประมาณใหม่ที่ต้องการเริ่มต้น *
              </label>
              <select
                value={targetFy}
                onChange={(e) => setTargetFy(Number(e.target.value))}
                className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-xs sm:text-sm font-bold text-slate-900 bg-white focus:outline-emerald-500"
              >
                {targetOptions.map(fy => {
                  const endAD = fy - 543;
                  const startBE = fy - 1;
                  return (
                    <option key={fy} value={fy}>
                      ปีงบประมาณ {fy} (1 ต.ค. {startBE} – 30 ก.ย. {fy}) [{endAD - 1}-10-01]
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="md:col-span-4">
              <label className="block text-xs font-bold text-emerald-950 mb-1">
                หมายเหตุการยกยอด (ไม่บังคับ)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={`เช่น ยกยอดสิ้นปีงบ ${targetFy - 1}`}
                className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-xs bg-white focus:outline-emerald-500"
              />
            </div>

            <div className="md:col-span-3 flex items-end pb-1.5">
              <label className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={excludeExpired}
                  onChange={(e) => setExcludeExpired(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>ไม่ยกยอด Lot ที่หมดอายุแล้ว</span>
              </label>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center space-y-2">
              <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin mx-auto" />
              <div className="text-xs font-semibold text-slate-600">กำลังคำนวณยอดคงเหลือคลังยาใน ณ วันที่ 30 ก.ย....</div>
            </div>
          ) : preview && (
            <>
              {/* Source -> Target Summary Banner */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 text-white text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-700 font-bold">
                    คงเหลือคลังยาใน ณ {formatThaiDateShort(preview.sourceAsOfDate)} (ปีงบ {preview.prevFy})
                  </span>
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                  <span className="px-2 py-0.5 rounded bg-emerald-600 font-bold">
                    ยอดยกมาเริ่มต้น {formatThaiDateShort(preview.newStartDate)} (ปีงบ {preview.targetFy})
                  </span>
                </div>
                {preview.alreadyRolledOver && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-200 font-bold">
                    ปีงบ {preview.targetFy} เคยเปิดยอดแล้ว — ยืนยันซ้ำจะอัปเดตยอดยกมาล่าสุดแทน
                  </span>
                )}
              </div>

              {/* 4 KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" />
                    <span>รายการยาที่จะยกยอด</span>
                  </div>
                  <div className="text-xl font-black font-mono text-emerald-950 mt-0.5">
                    {(preview.summary?.drugCount || 0).toLocaleString()} <span className="text-xs font-semibold">รายการ</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="text-[11px] font-bold text-blue-800 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5" />
                    <span>จำนวน Lot คงเหลือ</span>
                  </div>
                  <div className="text-xl font-black font-mono text-blue-950 mt-0.5">
                    {(preview.summary?.totalLots || 0).toLocaleString()} <span className="text-xs font-semibold">Lot</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-700">รวมจำนวนคงเหลือ</div>
                  <div className="text-xl font-black font-mono text-slate-900 mt-0.5">
                    {(preview.summary?.totalUnits || 0).toLocaleString()}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-teal-50 border border-teal-200">
                  <div className="text-[11px] font-bold text-teal-800">มูลค่ารวมยกยอด</div>
                  <div className="text-xl font-black font-mono text-teal-950 mt-0.5">
                    {(preview.summary?.totalValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-semibold">฿</span>
                  </div>
                </div>
              </div>

              {preview.summary?.expiredLotsCount > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-center justify-between gap-2">
                  <span>
                    ⚠️ พบ Lot ที่หมดอายุก่อน {formatThaiDateShort(preview.newStartDate)} จำนวน <strong>{preview.summary.expiredLotsCount}</strong> Lot ({(preview.summary.expiredUnitsCount || 0).toLocaleString()} หน่วย)
                    {excludeExpired ? ` — ระบบจะตัดออกอัตโนมัติตามที่เลือก (${preview.summary.excludedExpiredLotsCount} Lot)` : ' — หากต้องการตัดออก ให้ติ๊กช่อง "ไม่ยกยอด Lot ที่หมดอายุแล้ว" ด้านบน'}
                  </span>
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700">
                    ตัวอย่างรายการยาและ Lot ที่จะยกยอดเข้าวันที่ {formatThaiDateShort(preview.newStartDate)} ({filteredItems.length} รายการ)
                  </span>
                  <div className="relative w-64 max-w-full">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="ค้นหารหัสยา / ชื่อยา / Lot..."
                      className="w-full pl-7 pr-2 py-1 text-xs border border-slate-300 rounded-lg bg-white focus:outline-emerald-500"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 font-bold">รหัสยา</th>
                        <th className="px-3 py-2 font-bold">ชื่อยา</th>
                        <th className="px-3 py-2 font-bold">Lot / วันหมดอายุที่จะยกไป</th>
                        <th className="px-3 py-2 font-bold text-right">คงเหลือ ณ 30 ก.ย.</th>
                        <th className="px-3 py-2 font-bold text-right">มูลค่า (บาท)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                            ไม่พบรายการยาคงเหลือสำหรับยกยอดเข้าปีงบประมาณนี้
                          </td>
                        </tr>
                      ) : filteredItems.map(item => (
                        <tr key={item.drugcode} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono font-bold text-slate-800 whitespace-nowrap">{item.drugcode}</td>
                          <td className="px-3 py-2 font-semibold text-slate-900">
                            {item.drugname}
                            {item.isDualUnit && (
                              <span className="ml-1.5 px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                                1 {item.mainStoreUnit} = {item.conversionFactor} {item.counterUnit}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {item.lots.map((l, idx) => (
                                <span
                                  key={`${l.lotno}_${idx}`}
                                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] border ${
                                    l.isExpired
                                      ? 'bg-rose-50 text-rose-800 border-rose-300'
                                      : 'bg-slate-100 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {l.lotno}: {l.amount.toLocaleString()} {l.dateexpire ? `(Exp ${formatThaiDateShort(l.dateexpire)})` : ''}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                            {item.totalAmount.toLocaleString()} {item.drugunit}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                            {item.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Safety Policy Notice */}
          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <strong>ความปลอดภัยของข้อมูล:</strong> ก่อนเริ่มปีงบประมาณใหม่ ระบบจะสร้างไฟล์สำรองข้อมูลครบชุด (<code>backup/full_snapshot_*.json</code>) ให้อัตโนมัติ และบันทึกยอดปีงบประมาณเดิมเก็บไว้เป็นประวัติแยกปี สามารถสลับกลับมาดูหรือออกรายงานปีเก่าได้ตลอดเวลา โดยไม่แตะฐาน JHCIS
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            {!isAdmin && <span className="text-rose-600 font-bold">เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่กดเริ่มต้นปีงบประมาณใหม่ได้</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
            >
              ยกเลิก / ปิด
            </button>
            <button
              type="button"
              disabled={!isAdmin || loading || submitting || !preview || (preview.summary?.drugCount || 0) === 0}
              onClick={handleConfirm}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-xs sm:text-sm font-extrabold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'กำลังยกยอดและเปิดปีงบประมาณใหม่...' : `ยืนยันเริ่มต้นปีงบประมาณ ${targetFy}`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
