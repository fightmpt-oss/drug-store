import React, { useState, useEffect } from 'react';
import { 
  X, 
  Users, 
  Calendar, 
  Search, 
  Stethoscope, 
  FileText, 
  Clock, 
  AlertCircle, 
  Printer, 
  Pill,
  UserCheck,
  ShieldCheck,
  Eye,
  EyeOff
} from 'lucide-react';
import { api } from '../services/api';

export default function PatientDispenseModal({ drugcode, drugname, initialDateRange, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [pdpaMaskEnabled, setPdpaMaskEnabled] = useState(true); // PDPA: mask เป็นค่าเริ่มต้น (ฝั่ง server)
  const [dateRange, setDateRange] = useState(initialDateRange || (() => {
    const now = new Date();
    const y = now.getFullYear();
    return (now.getMonth() + 1) >= 10
      ? { startDate: `${y}-10-01`, endDate: `${y + 1}-09-30` }
      : { startDate: `${y - 1}-10-01`, endDate: `${y}-09-30` };
  })());

  useEffect(() => {
    loadHistory();
  }, [drugcode, dateRange.startDate, dateRange.endDate]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getDrugDispensingHistory(drugcode, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        search,
        limit: 200
      });
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

  // PDPA reveal: เปิดชื่อเต็มต้องระบุเหตุผล — server บันทึก audit trail ด้วย session ผู้ใช้จริง (ม.39)
  const handleToggleReveal = async () => {
    if (pdpaMaskEnabled) {
      const reason = window.prompt(
        'PDPA ม.39: การเปิดชื่อผู้ป่วยเต็มจะถูกบันทึกในระบบตรวจสอบย้อนหลัง (พร้อมชื่อผู้ใช้ของท่าน)\nกรุณาระบุเหตุผลการเข้าถึงข้อมูล:',
        ''
      );
      if (!reason || reason.trim().length < 3) {
        if (reason !== null) alert('ต้องระบุเหตุผลอย่างน้อย 3 ตัวอักษร');
        return;
      }
      const res = await api.getDrugDispensingHistory(drugcode, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        search,
        limit: 200,
        reveal: 1,
        reason: reason.trim()
      });
      if (res.success) {
        setData(res.data);
        setPdpaMaskEnabled(false);
      } else {
        alert(res.message || 'ไม่สามารถเปิดชื่อเต็มได้');
      }
    } else {
      // กลับไปโหมดพรางชื่อ — ดึงข้อมูล mask ใหม่จาก server
      const res = await api.getDrugDispensingHistory(drugcode, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        search,
        limit: 200
      });
      if (res.success) setData(res.data);
      setPdpaMaskEnabled(true);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadHistory();
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredItems = (data?.items || []).filter(item => {
    if (!search) return true;
    const s = search.toLowerCase();
    const currentName = pdpaMaskEnabled ? (item.maskedName || item.patientName) : item.patientName;
    return (
      (currentName && currentName.toLowerCase().includes(s)) ||
      (item.patientName && item.patientName.toLowerCase().includes(s)) ||
      String(item.pid || '').includes(s) ||
      String(item.visitno || '').includes(s) ||
      (item.diagcode && item.diagcode.toLowerCase().includes(s)) ||
      (item.diseasename && item.diseasename.toLowerCase().includes(s)) ||
      (item.diseasenamethai && item.diseasenamethai.toLowerCase().includes(s))
    );
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-5">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] sm:max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 no-print">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  รหัสยา: {drugcode}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  ช่วงวันที่ {dateRange.startDate} ถึง {dateRange.endDate}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug mt-0.5">
                ประวัติการจ่ายยาให้ผู้ป่วย: {drugname || data?.drug?.drugname}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-100 transition-colors shadow-2xs"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden xs:inline">พิมพ์รายงาน</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 sm:space-y-5">
          
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-purple-50/80 border border-purple-200 shadow-2xs">
              <div className="text-xs font-semibold text-purple-800 flex items-center space-x-1">
                <Users className="w-3.5 h-3.5 text-purple-600" />
                <span>คนไข้ที่ได้รับยานี้</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-purple-950 mt-1 font-mono">
                {data?.distinctPatients ?? (new Set((data?.items || []).map(i => i.pid)).size)} <span className="text-xs font-medium text-purple-700">คน</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 shadow-2xs">
              <div className="text-xs font-semibold text-blue-800">จำนวนครั้งที่มารับยา</div>
              <div className="text-2xl sm:text-3xl font-black text-blue-900 mt-1 font-mono">
                {data?.totalRecords || 0} <span className="text-xs font-medium text-blue-700">ครั้ง</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 shadow-2xs">
              <div className="text-xs font-semibold text-emerald-800">รวมจำนวนยาที่จ่าย</div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-900 mt-1 font-mono">
                {(data?.totalUnits || 0).toLocaleString()} <span className="text-xs font-medium text-emerald-700">{data?.drug?.drugunit || 'หน่วย'}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
              <div className="text-xs font-semibold text-slate-600">ที่มาข้อมูล</div>
              <div className="text-xs sm:text-sm font-bold text-slate-800 mt-1 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="truncate">JHCIS visitdrug</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                {dateRange.startDate} ถึง {dateRange.endDate}
              </div>
            </div>
          </div>

          {/* Search and PDPA Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs no-print">
            <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาชื่อคนไข้, PID (HN), Visit, รหัสโรค..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs sm:text-sm bg-slate-50 focus:bg-white focus:outline-blue-500"
              />
            </form>

            <div className="flex items-center space-x-2 w-full sm:w-auto justify-between sm:justify-end">
              <button
                type="button"
                onClick={handleToggleReveal}
                className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors shadow-2xs ${
                  pdpaMaskEnabled
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                }`}
                title={pdpaMaskEnabled ? 'เปิดชื่อเต็ม (ต้องระบุเหตุผล + บันทึก audit ตาม พ.ร.บ. PDPA ม.39)' : 'คลิกเพื่อพรางชื่อตาม PDPA'}
              >
                {pdpaMaskEnabled ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>พรางชื่อ PDPA (เปิดอยู่)</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-amber-600" />
                    <span>แสดงชื่อเต็ม (เวชระเบียน)</span>
                  </>
                )}
              </button>

              <span className="text-xs text-slate-500 font-medium">
                {filteredItems.length} รายการ
              </span>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="py-20 text-center text-slate-400 space-y-2">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-medium">กำลังดึงข้อมูลประวัติการจ่ายยาและข้อมูลผู้ป่วยจาก JHCIS...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-slate-100">
              <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-sm">ไม่พบประวัติการจ่ายยาตัวนี้ในช่วงเวลาที่เลือก</p>
              <p className="text-xs text-slate-400 mt-1">ลองขยายช่วงวันที่เพื่อดูประวัติย้อนหลังเพิ่มเติม</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto table-responsive">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-2.5 sm:px-3 whitespace-nowrap">วันที่ / เวลา</th>
                      <th className="py-2.5 px-2 font-mono whitespace-nowrap">Visit No.</th>
                      <th className="py-2.5 px-2.5 sm:px-3">ผู้ป่วยที่ได้รับยา (Person)</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap">จำนวนที่จ่าย</th>
                      <th className="py-2.5 px-2.5 sm:px-3">วิธีใช้ยา (Dose)</th>
                      <th className="py-2.5 px-2.5 sm:px-3">การวินิจฉัยโรค (ICD-10)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        
                        {/* Date & Time */}
                        <td className="py-2.5 px-2.5 sm:px-3 whitespace-nowrap">
                          <div className="font-bold text-slate-800 font-mono text-xs sm:text-sm">{item.dispensedate}</div>
                          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0 inline" />
                            <span>{item.dispensetime || (item.dateupdate ? String(item.dateupdate).slice(11, 19) : '')} น.</span>
                          </div>
                        </td>

                        {/* Visit No */}
                        <td className="py-2.5 px-2 font-mono font-semibold text-slate-700 whitespace-nowrap">
                          {item.visitno}
                        </td>

                        {/* Patient Info */}
                        <td className="py-2.5 px-2.5 sm:px-3">
                          <div className="font-bold text-slate-900 text-xs sm:text-sm flex items-center space-x-1.5 flex-wrap">
                            <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0 inline mr-0.5" />
                            <span>{pdpaMaskEnabled ? (item.maskedName || item.patientName) : item.patientName}</span>
                            {pdpaMaskEnabled && (
                              <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                                PDPA Masked
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 space-x-2">
                            <span>HN: <strong className="text-slate-700 font-mono">{item.pid}</strong></span>
                            {(item.maskedCid || item.cid) && (
                              <>
                                <span>•</span>
                                <span>เลขบัตร: <strong className="text-slate-600 font-mono">{pdpaMaskEnabled ? (item.maskedCid || item.cid) : (item.cid || item.maskedCid)}</strong></span>
                              </>
                            )}
                            <span>•</span>
                            <span>เพศ: {item.sex}</span>
                            {item.age !== null && (
                              <>
                                <span>•</span>
                                <span>อายุ: {item.age} ปี</span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Dispense Unit (Large & Prominent) */}
                        <td className="py-2.5 px-2 text-right whitespace-nowrap bg-rose-50/20">
                          <span className="font-black text-rose-700 font-mono text-xs sm:text-sm">
                            {item.unit.toLocaleString()}
                          </span>
                          <span className="text-xs font-medium text-slate-600 ml-1">
                            {item.drugunit || 'หน่วย'}
                          </span>
                        </td>

                        {/* Dose Instructions */}
                        <td className="py-2.5 px-2.5 sm:px-3 max-w-xs text-xs text-slate-700">
                          <span className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 block">
                            {item.dose}
                          </span>
                        </td>

                        {/* ICD-10 & Disease */}
                        <td className="py-2.5 px-2.5 sm:px-3">
                          {item.diagcode && item.diagcode !== '-' ? (
                            <div className="min-w-[180px] max-w-sm">
                              {/* รหัสโรค พร้อมความหมายของรหัสโรค (ICD-10) ไว้ข้างกัน */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-bold font-mono bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                                  {item.diagcode}
                                </span>
                                {item.diseasename && item.diseasename !== '-' ? (
                                  <span className="text-[11px] text-slate-700 font-medium leading-tight">
                                    {item.diseasename}
                                  </span>
                                ) : item.diseasenamethai && item.diseasenamethai !== '-' ? (
                                  <span className="text-xs font-semibold text-slate-900 leading-tight">
                                    {item.diseasenamethai}
                                  </span>
                                ) : null}
                              </div>

                              {/* ชื่อโรคภาษาไทยด้านล่าง */}
                              {item.diseasenamethai && item.diseasename && item.diseasenamethai !== item.diseasename && item.diseasenamethai !== '-' && (
                                <div className="text-xs font-semibold text-slate-900 leading-tight mt-0.5">
                                  {item.diseasenamethai}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">ไม่ได้ระบุรหัสโรค</span>
                          )}
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-slate-500 no-print">
          <div className="flex items-center space-x-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg w-full sm:w-auto">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) B.E. 2562:</strong> ระบบทำงานแบบ Local On-Premise 100% ห้ามส่งออกข้อมูลหรือเทรน AI โดยเด็ดขาด
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-bold text-xs sm:text-sm transition-colors shrink-0"
          >
            ปิดหน้าต่าง
          </button>
        </div>

      </div>
    </div>
  );
}
