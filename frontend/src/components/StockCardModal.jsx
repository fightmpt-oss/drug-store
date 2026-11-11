import React, { useState, useEffect } from 'react';
import { 
  X, 
  Printer, 
  Download, 
  Calendar, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  Package, 
  Layers, 
  ArrowDownLeft, 
  ArrowUpRight,
  TrendingDown,
  QrCode
} from 'lucide-react';
import { api } from '../services/api';

export default function StockCardModal({ drugcode, onClose, initialDateRange, onOpenSubstockQr }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // โหมดบัญชีคุมยา: 'main_store' (คลังยาใน - ตัดตอนสแกนเบิกไปเคาน์เตอร์) | 'total_pcu' (รวมทั้ง รพ.สต. - ตัดตอนจ่าย JHCIS)
  const [cardMode, setCardMode] = useState('main_store');
  // ค่าเริ่มต้น = ปีงบประมาณปัจจุบัน (คำนวณจากวันจริง ไม่ hardcode)
  const [dateRange, setDateRange] = useState(initialDateRange || (() => {
    const now = new Date();
    const y = now.getFullYear();
    const fy = (now.getMonth() + 1) >= 10
      ? { startDate: `${y}-10-01`, endDate: `${y + 1}-09-30` }
      : { startDate: `${y - 1}-10-01`, endDate: `${y}-09-30` };
    return fy;
  })());

  useEffect(() => {
    loadCard();
  }, [drugcode, dateRange.startDate, dateRange.endDate]);

  const loadCard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getStockCard(drugcode, dateRange);
      if (res.success) {
        setData(res.data);
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

  const activeTransactions = data
    ? (cardMode === 'main_store' ? (data.mainStoreTransactions || data.transactions) : (data.totalPcuTransactions || data.transactions))
    : [];
  const activeLotsSummary = data
    ? (cardMode === 'main_store' ? (data.mainStoreLotsSummary || data.lotsSummary) : (data.totalPcuLotsSummary || data.lotsSummary))
    : [];
  const activeBalance = data
    ? (cardMode === 'main_store'
        ? (data.hybridSummary?.mainStoreBalance ?? data.currentBalance)
        : (data.hybridSummary?.totalPcuBalance ?? data.currentBalance))
    : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-5">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 no-print">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                บัญชีคุมคลังยา (Stock Card)
              </h2>
              <p className="text-[10px] sm:text-xs text-slate-500 hidden sm:block">
                ประวัติการรับ-จ่ายยา และตรวจสอบยาล็อตคงเหลือ (FEFO)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onOpenSubstockQr && (
              <button
                onClick={() => {
                  onClose();
                  onOpenSubstockQr(drugcode);
                }}
                className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                title="สแกน QR หรือตัดเบิกยานี้จากคลังยาในออกวางเคาน์เตอร์"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>เบิกคลังในไปเคาน์เตอร์</span>
              </button>
            )}
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">พิมพ์บัตรคุมยา</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mode Switcher Bar (สลับโหมดใบ Stock Card: คลังยาใน vs รวมทั้ง รพ.สต.) */}
        <div className="px-4 sm:px-6 py-2.5 bg-emerald-50/70 border-b border-emerald-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 no-print">
          <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
            <span>มุมมองใบ Stock Card:</span>
            <span className="font-normal text-emerald-800 hidden md:inline">
              {cardMode === 'main_store'
                ? '(แสดงเฉพาะการรับเข้าคลังใน และตัดเมื่อสแกน QR เบิกออกวางเคาน์เตอร์)'
                : '(แสดงภาพรวมทั้ง รพ.สต. หักตามยอดจ่ายผู้ป่วยรายวันใน JHCIS)'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-emerald-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setCardMode('main_store')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                cardMode === 'main_store'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📦 1. Stock Card คลังยาใน (ตัดเมื่อเบิกไปเคาน์เตอร์)
            </button>
            <button
              type="button"
              onClick={() => setCardMode('total_pcu')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                cardMode === 'total_pcu'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏥 2. Stock Card รวมทั้ง รพ.สต. (ตัดจ่าย JHCIS)
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto flex-1 space-y-4 sm:space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs sm:text-sm">กำลังโหลดข้อมูลการ์ดสต็อก...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs sm:text-sm flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : data ? (() => {
            const factor = Number(data.drug.conversionFactor || data.hybridSummary?.conversionFactor) || 1;
            const isRepackaged = factor > 1;
            const isFloorStock = Boolean(data.drug.isFloorStock || data.hybridSummary?.isFloorStock || data.drug.drugcode === '317' || (data.drug.drugname || '').toLowerCase().includes('lidocaine'));
            const mainUnit = data.drug.mainStoreUnit || data.hybridSummary?.mainStoreUnit || (isRepackaged ? 'กระปุก' : data.drug.drugunit);
            const counterUnit = data.drug.counterUnit || data.hybridSummary?.counterUnit || data.drug.drugunit;
            const currentDisplayUnit = cardMode === 'main_store' ? mainUnit : counterUnit;

            return (
              <div className="space-y-4 sm:space-y-6">

              {/* คำเตือนความถูกต้องของงวด (จาก backend) */}
              {Array.isArray(data.warnings) && data.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-2.5 text-xs space-y-1">
                  {data.warnings.map((w, i) => (
                    <div key={i} className="flex items-start space-x-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>{w.message || w}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Official Document Header (Adaptive Stack on Mobile) */}
              <div className="border border-slate-200 rounded-xl p-4 sm:p-5 bg-gradient-to-br from-slate-50 to-white">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-200 gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                        รหัสยา: {data.drug.drugcode}
                      </span>
                      {data.drug.hosdrugcode && (
                        <span className="text-[10px] sm:text-xs font-bold font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                          รหัส รพ.: {data.drug.hosdrugcode}
                        </span>
                      )}
                      {data.drug.tmtcode && (
                        <span className="text-[10px] sm:text-xs font-bold font-mono text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded" title="รหัส TMT 6 หลัก">
                          TMT: {data.drug.tmtcode}
                        </span>
                      )}
                      <span className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded ${
                        data.drug.drugflag === '1' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {data.drug.drugflag === '1' ? '1:ใช้ยา' : '2:ไม่ใช้ยา'}
                      </span>
                    </div>

                    <h1 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                      {data.drug.drugname}
                    </h1>
                    {data.drug.drugnamethai && (
                      <div className="text-xs sm:text-sm font-medium text-slate-600 mt-0.5">
                        {data.drug.drugnamethai}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2 text-[11px] sm:text-xs text-slate-600">
                      <span>รหัส 24 หลัก: <strong className="text-slate-800 font-mono">{data.drug.drugcode24 || data.drug.didstandard || 'ไม่ระบุ'}</strong></span>
                      <span>•</span>
                      <span>หน่วยนับ JHCIS: <strong className="text-slate-800">{data.drug.drugunit}</strong></span>
                      {isRepackaged && (
                        <>
                          <span>•</span>
                          <span className="text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-300 font-bold">
                            1 {mainUnit} (500g) = {factor} {counterUnit} (10g)
                          </span>
                        </>
                      )}
                      {data.drug.unitpacking && (
                        <>
                          <span>•</span>
                          <span>บรรจุ: <strong className="text-slate-800">{data.drug.unitpacking}</strong></span>
                        </>
                      )}
                      {data.drug.chargeopdname && (
                        <>
                          <span>•</span>
                          <span>หมวด: <strong className="text-slate-800">{data.drug.chargeopdname}</strong></span>
                        </>
                      )}
                      {isFloorStock && (
                        <>
                          <span>•</span>
                          <span className="text-sky-900 bg-sky-50 px-2 py-0.5 rounded border border-sky-300 font-bold">
                            💉 ยาใช้ในห้องทำแผล (Floor Stock)
                          </span>
                        </>
                      )}
                    </div>

                    {isFloorStock && (
                      <div className="mt-2.5 bg-sky-50 border border-sky-200 text-sky-950 rounded-xl p-3 text-xs space-y-1">
                        <div className="font-bold flex items-center space-x-1.5 text-sky-900">
                          <span>💡 ยาหัตถการใช้ประจำห้องทำแผล/ฉุกเฉิน (Floor Stock)</span>
                        </div>
                        <p className="text-sky-800 leading-relaxed text-[11px]">
                          ยาตัวนี้เบิกออกจากคลังยาในเป็น <strong>ขวด/ไวอัล (20 ml)</strong> เพื่อนำมาใช้ฉีดยาชาเฉพาะที่ในห้องทำแผล (เย็บแผล, ถอดเล็บ, ผ่าฝี) ดูดฉีด 3-5 ml ต่อเคส ไม่ได้จ่ายให้ผู้ป่วยกลับบ้าน 
                          <strong className="text-sky-950"> บัญชีคุมคลังยาในจะตัดสต็อกตามจำนวนขวดที่สแกนเบิกจริงจากคลัง</strong> เพื่อไม่ให้ยอดคลาดเคลื่อนจากการบันทึกจ่ายรายเคสใน JHCIS
                        </p>
                      </div>
                    )}

                    {data.drug.drugcaution && (
                      <div className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1 rounded-lg flex items-center space-x-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <div><strong>คำเตือนการใช้ยา:</strong> {data.drug.drugcaution}</div>
                      </div>
                    )}
                  </div>

                  <div className="sm:text-right w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-[11px] sm:text-xs font-bold text-slate-600">
                      {cardMode === 'main_store' ? '📦 คงเหลือในคลังยาใน' : '🏥 คงเหลือสุทธิรวมทั้ง รพ.สต.'}
                    </div>
                    <div className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                      activeBalance < 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      {activeBalance.toLocaleString()} <span className="text-xs sm:text-sm font-normal text-slate-600">{currentDisplayUnit}</span>
                    </div>
                    {isRepackaged && cardMode === 'main_store' && (
                      <div className="text-[11px] font-bold text-emerald-700 font-mono mt-0.5">
                        (= {(activeBalance * factor).toLocaleString()} {counterUnit})
                      </div>
                    )}
                    {activeBalance < 0 && (
                      <div className="text-[10px] sm:text-xs font-bold text-rose-600">ยอดติดลบ — ควรตรวจสอบการรับเข้า/นับสต็อก</div>
                    )}
                  </div>
                </div>

                {/* Hybrid 3-Tier Summary Strip */}
                {data.hybridSummary && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3.5">
                    <div className={`p-2.5 rounded-xl border ${cardMode === 'main_store' ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400' : 'bg-white border-slate-200'}`}>
                      <div className="text-[11px] font-bold text-emerald-800">📦 1. คงเหลือคลังยาใน (Main Store)</div>
                      <div className="text-base sm:text-lg font-black text-emerald-900 font-mono mt-0.5">
                        {Number(data.hybridSummary.mainStoreBalance || 0).toLocaleString()} <span className="text-xs font-normal">{mainUnit}</span>
                      </div>
                      {isRepackaged && (
                        <div className="text-[10px] font-bold text-emerald-800 font-mono mt-0.5">
                          (= {((data.hybridSummary.mainStoreBalance || 0) * factor).toLocaleString()} {counterUnit})
                        </div>
                      )}
                      <div className="text-[10px] text-slate-500">
                        รับเข้า {(Number(data.hybridSummary.broughtForward || 0) + Number(data.hybridSummary.totalReceived || 0)).toLocaleString()} − เบิกไปเคาน์เตอร์ {Number(data.hybridSummary.totalTransferredToCounter || 0).toLocaleString()} {mainUnit}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl border bg-blue-50/60 border-blue-200">
                      <div className="text-[11px] font-bold text-blue-800">💊 2. คงเหลือที่เคาน์เตอร์จ่ายยา</div>
                      <div className={`text-base sm:text-lg font-black font-mono mt-0.5 ${Number(data.hybridSummary.counterBalance || 0) < 0 ? 'text-rose-600' : 'text-blue-900'}`}>
                        {Number(data.hybridSummary.counterBalance || 0).toLocaleString()} <span className="text-xs font-normal">{counterUnit}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        เบิกมาเคาน์เตอร์ {Number(data.hybridSummary.totalTransferredToCounter || 0).toLocaleString()} {mainUnit}{isRepackaged ? ` (= ${(data.hybridSummary.totalTransferredToCounter * factor).toLocaleString()} ${counterUnit})` : ''} − จ่าย JHCIS {Number(data.hybridSummary.totalDispensed || 0).toLocaleString()} {counterUnit}
                      </div>
                    </div>

                    <div className={`p-2.5 rounded-xl border ${cardMode === 'total_pcu' ? 'bg-slate-100 border-slate-400 ring-1 ring-slate-400' : 'bg-white border-slate-200'}`}>
                      <div className="text-[11px] font-bold text-slate-700">🏥 3. คงเหลือรวมทั้ง รพ.สต.</div>
                      <div className="text-base sm:text-lg font-black text-slate-900 font-mono mt-0.5">
                        {Number(data.hybridSummary.totalPcuBalance || 0).toLocaleString()} <span className="text-xs font-normal">{counterUnit}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        คลังยาใน ({Number(data.hybridSummary.mainStoreBalance || 0).toLocaleString()} {mainUnit}) + เคาน์เตอร์ ({Number(data.hybridSummary.counterBalance || 0).toLocaleString()} {counterUnit})
                      </div>
                    </div>
                  </div>
                )}
              </div>

                {/* Lots Breakdown (FEFO Table) — แสดง "ยอดคงเหลือราย Lot" ตามโหมดที่เลือก */}
                <div className="border border-slate-200 rounded-xl p-3.5 sm:p-4 bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-1">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <h3 className="text-xs sm:text-sm font-bold text-slate-800">
                        {cardMode === 'main_store'
                          ? 'ยาล็อตคงเหลือในคลังยาใน (หักเฉพาะยอดที่สแกนเบิกออกวางเคาน์เตอร์)'
                          : 'ยาล็อตคงเหลือรวมทั้ง รพ.สต. (ตัดยอดจ่าย JHCIS ตามหลัก FEFO)'}
                      </h3>
                    </div>
                    <span className="text-[10px] sm:text-xs text-slate-500">
                      *หลัก FEFO: ยาหมดอายุก่อน ต้องจ่ายก่อน (First-Expired, First-Out)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                    {activeLotsSummary.map((lot, idx) => {
                      const remaining = Number(lot.remaining ?? lot.amount) || 0;
                      const today = new Date().toISOString().slice(0, 10);
                      const daysLeft = lot.dateexpire && lot.dateexpire !== 'ไม่ระบุ'
                        ? Math.ceil((new Date(lot.dateexpire) - new Date(today)) / (1000 * 60 * 60 * 24))
                        : null;
                      const isExp = daysLeft !== null && daysLeft <= 0;
                      const isNear = daysLeft !== null && daysLeft > 0 && daysLeft <= 90;
                      const isWarn = daysLeft !== null && daysLeft > 90 && daysLeft <= 180;

                      return (
                        <div
                          key={idx}
                          className={`p-2.5 sm:p-3 rounded-lg border text-xs flex flex-col justify-between ${
                            remaining <= 0 ? 'bg-slate-100/60 border-slate-200 text-slate-500'
                            : isExp ? 'bg-rose-50 border-rose-300 text-rose-900'
                            : isNear ? 'bg-amber-50 border-amber-300 text-amber-900'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <span className="font-mono font-bold">{lot.lotno}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              remaining <= 0 ? 'bg-slate-200 text-slate-600'
                              : isExp ? 'bg-rose-200 text-rose-800'
                              : isNear ? 'bg-amber-200 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {remaining <= 0 ? 'หมด (เบิก/จ่ายครบแล้ว)'
                                : isExp ? 'หมดอายุแล้ว'
                                : isNear ? 'ใกล้หมดอายุ < 3 เดือน'
                                : isWarn ? 'ใกล้หมดอายุ < 6 เดือน'
                                : 'ปกติ'}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1">
                            <div className="flex justify-between text-slate-600">
                              <span>วันหมดอายุ:</span>
                              <span className="font-semibold text-slate-900">{lot.dateexpire || 'ไม่ระบุ'}</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                              <span>รับเข้า:</span>
                              <span className="font-semibold text-slate-900">{Number(lot.amount).toLocaleString()} {currentDisplayUnit}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-semibold">{cardMode === 'main_store' ? 'เหลือในคลังใน:' : 'คงเหลือ (FEFO):'}</span>
                              <span className={`font-black ${remaining <= 0 ? 'text-slate-500' : 'text-emerald-700'}`}>{remaining.toLocaleString()} {currentDisplayUnit}</span>
                            </div>
                            <div className="flex justify-between text-slate-500 text-[11px]">
                              <span>สถานะวัน:</span>
                              <span>{daysLeft === null ? 'ไม่ระบุวันหมดอายุ' : (isExp ? `เลยวันหมดอายุมา ${Math.abs(daysLeft)} วัน` : `เหลืออีก ${daysLeft} วัน`)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              {/* Transactions Ledger Table (Adaptive Overflow) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs sm:text-sm font-bold text-slate-800">
                      {cardMode === 'main_store'
                        ? 'ตารางบัญชีคุมยาคลังใน (ตัดยอดเมื่อสแกนเบิกออกวางเคาน์เตอร์)'
                        : 'ตารางรายการเคลื่อนไหวรับ-จ่ายยารวมทั้ง รพ.สต. (ตัดตาม JHCIS)'}
                    </h3>
                  </div>
                  <span className="text-[11px] sm:text-xs text-slate-500 font-mono">
                    ช่วงวันที่ {dateRange.startDate} ถึง {dateRange.endDate}
                  </span>
                </div>

                <div className="overflow-x-auto table-responsive">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-2 sm:px-2.5 whitespace-nowrap">วัน/เดือน/ปี</th>
                        <th className="py-2 px-2 sm:px-2.5 whitespace-nowrap">ประเภท</th>
                        <th className="py-2 px-2 sm:px-2.5">เอกสาร / อ้างอิง</th>
                        <th className="py-2 px-2 sm:px-2.5 whitespace-nowrap">Lot No.</th>
                        <th className="py-2 px-2 sm:px-2.5 whitespace-nowrap">วันหมดอายุ</th>
                        <th className="py-2 px-2 text-right text-emerald-700 whitespace-nowrap">รับ (+)</th>
                        <th className="py-2 px-2 text-right text-rose-700 whitespace-nowrap">
                          {cardMode === 'main_store' ? 'เบิกออก (-)' : 'จ่าย (-)'}
                        </th>
                        <th className="py-2 px-2 text-right font-bold text-slate-900 whitespace-nowrap">คงเหลือ (=)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeTransactions.map((tx, idx) => {
                        const isReceive = tx.type === 'RECEIVE';
                        const isDispense = tx.type === 'DISPENSE';
                        const isSubstock = tx.type === 'SUBSTOCK_OUT';
                        const isBf = tx.type === 'BROUGHT_FORWARD';
                        const isAdj = tx.type === 'ADJUSTMENT';
                        const isAdjIn = isAdj && tx.in > 0;

                        return (
                          <tr key={idx} className={`hover:bg-slate-50/80 transition-colors ${tx.negative ? 'bg-rose-50/70' : ''}`}>
                            <td className="py-2 px-2 sm:px-2.5 text-slate-600 whitespace-nowrap font-mono">{tx.date}</td>
                            <td className="py-2 px-2 sm:px-2.5 whitespace-nowrap">
                              <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] sm:text-[11px] font-medium ${
                                isBf ? 'bg-slate-100 text-slate-700' :
                                isReceive ? 'bg-emerald-50 text-emerald-700 font-semibold' :
                                isSubstock ? 'bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold' :
                                isAdj ? (isAdjIn ? 'bg-blue-50 text-blue-700 font-semibold' : 'bg-orange-50 text-orange-800 font-semibold') :
                                'bg-rose-50 text-rose-700 font-semibold'
                              }`}>
                                {isReceive && <ArrowDownLeft className="w-3 h-3 mr-1" />}
                                {(isDispense || isSubstock) && <ArrowUpRight className="w-3 h-3 mr-1" />}
                                {tx.typeLabel}
                              </span>
                            </td>
                            <td className="py-2 px-2 sm:px-2.5 text-slate-700">
                              <div className="font-medium text-xs">{tx.docNo}</div>
                              <div className="text-[10px] text-slate-400">{tx.description}</div>
                            </td>
                            <td className="py-2 px-2 sm:px-2.5 text-slate-700 font-mono whitespace-nowrap">{tx.lotno}</td>
                            <td className="py-2 px-2 sm:px-2.5 text-slate-700 font-mono whitespace-nowrap">{tx.dateexpire}</td>
                            <td className="py-2 px-2 text-right font-semibold text-emerald-700 whitespace-nowrap">
                              {tx.in > 0 ? `+${tx.in.toLocaleString()}` : '-'}
                            </td>
                            <td className="py-2 px-2 text-right font-semibold text-rose-700 whitespace-nowrap">
                              {tx.out > 0 ? `-${tx.out.toLocaleString()}` : '-'}
                            </td>
                            <td className={`py-2 px-2 text-right font-bold whitespace-nowrap ${tx.balance < 0 ? 'text-rose-700 bg-rose-100/60' : 'text-slate-900 bg-slate-50/50'}`}>
                              {tx.balance.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
            );
          })() : null}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-center text-[11px] sm:text-xs text-slate-500 no-print gap-2">
          <div>
            * การจ่ายออกอ้างอิงจาก JHCIS (ตาราง <code className="text-emerald-700 font-mono">visitdrug</code> — อ่านอย่างเดียว) • การรับเข้าและปรับปรุงยอดเก็บในฐานข้อมูลของระบบ (backend/src/data/localdb)
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-1.5 sm:py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-medium transition-colors"
          >
            ปิดหน้าต่าง
          </button>
        </div>

      </div>
    </div>
  );
}
