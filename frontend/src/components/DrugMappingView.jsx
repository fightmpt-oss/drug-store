import React, { useState, useEffect } from 'react';
import { 
  Link2, 
  Plus, 
  Trash2, 
  Search, 
  CheckCircle2, 
  FileText, 
  Building2, 
  ArrowRight,
  Database
} from 'lucide-react';
import { api } from '../services/api';
import PaginationBar from './PaginationBar';

export default function DrugMappingView() {
  const [mappings, setMappings] = useState([]);
  const [allDrugs, setAllDrugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  // New Mapping Form
  const [form, setForm] = useState({
    hospitalDrugName: '',
    hosdrugcode: '',
    jhcisdrugcode: '',
    drugname: '',
    tmtid: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [mapRes, drugRes] = await Promise.all([
        api.getMappings(),
        api.getAllDrugs()
      ]);
      if (mapRes.success) setMappings(mapRes.data);
      if (drugRes.success) setAllDrugs(drugRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const cleanName = (form.hospitalDrugName || form.drugname || '').trim();
    const cleanCode = (form.hosdrugcode || '').trim();

    if (!form.jhcisdrugcode || (!cleanName && !cleanCode)) {
      alert('กรุณากรอกชื่อยาหรือรหัสยาของ รพ.แม่ข่าย และเลือกรหัสยา JHCIS');
      return;
    }

    try {
      const selectedDrug = allDrugs.find(d => d.drugcode === form.jhcisdrugcode);
      const res = await api.saveMapping({
        hospitalDrugName: cleanName,
        drugname: cleanName,
        hosdrugcode: cleanCode,
        jhcisdrugcode: form.jhcisdrugcode,
        matchedDrugName: selectedDrug ? selectedDrug.drugname : '',
        tmtid: selectedDrug ? (selectedDrug.didstandard || form.tmtid) : form.tmtid
      });
      if (res.success) {
        setShowAddModal(false);
        setForm({ hospitalDrugName: '', hosdrugcode: '', jhcisdrugcode: '', drugname: '', tmtid: '' });
        loadData();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (identifier, displayName) => {
    if (!confirm(`ต้องการลบการจับคู่ยา "${displayName || identifier}" หรือไม่?`)) return;
    try {
      await api.deleteMapping(identifier);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const filtered = mappings.filter(m => {
    const q = search.toLowerCase();
    return (
      (m.hosdrugcode && m.hosdrugcode.toLowerCase().includes(q)) ||
      (m.hospitalDrugName && m.hospitalDrugName.toLowerCase().includes(q)) ||
      (m.drugname && m.drugname.toLowerCase().includes(q)) ||
      (m.jhcisdrugcode && m.jhcisdrugcode.toLowerCase().includes(q)) ||
      (m.matchedDrugName && m.matchedDrugName.toLowerCase().includes(q)) ||
      (m.tmtid && m.tmtid.includes(q))
    );
  });

  const totalItems = filtered.length;
  const isAll = pageSize === 'all';
  const numericSize = isAll ? Math.max(1, totalItems) : Number(pageSize);
  const totalPages = isAll ? 1 : Math.ceil(totalItems / numericSize);
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const pagedItems = isAll
    ? filtered
    : filtered.slice((validCurrentPage - 1) * numericSize, validCurrentPage * numericSize);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-5 sm:py-6 space-y-5">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <span>ตารางจับคู่รหัสยา (Drug Code Mapping & Aliases)</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            บันทึกการจับคู่ระหว่างชื่อยา/รหัสยาของโรงพยาบาลแม่ข่าย (เช่น รพ.สารภี) กับรหัสยาในทะเบียน JHCIS (cdrug) จับคู่ครั้งเดียว ระบบจะจดจำสำหรับการนำเข้าครั้งถัดไปอัตโนมัติ
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>+ เพิ่มคู่รหัสยาใหม่</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อยา รพ., รหัสยา, หรือรหัส JHCIS..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-emerald-500 text-slate-800"
          />
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
          colorTheme="emerald"
          position="top"
        />
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto max-h-[580px] overflow-y-auto table-scroll-visible">
          <table className="w-full text-left text-xs min-w-[760px]">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-xs backdrop-blur-xs">
              <tr>
                <th className="py-3 px-4 bg-slate-100">ชื่อยา / รหัสยา รพ.แม่ข่าย</th>
                <th className="py-3 px-4 bg-slate-100">รหัสมาตรฐาน TMT 24 หลัก</th>
                <th className="py-3 px-4 bg-slate-100">จับคู่กับรหัสยา JHCIS</th>
                <th className="py-3 px-4 bg-slate-100">ชื่อยาใน JHCIS</th>
                <th className="py-3 px-4 bg-slate-100">วันที่บันทึกล่าสุด</th>
                <th className="py-3 px-4 text-center bg-slate-100">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    กำลังโหลดข้อมูลการจับคู่...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    {mappings.length === 0 
                      ? 'ยังไม่มีรายการจับคู่รหัสยา (ระบบจะจดจำการจับคู่อัตโนมัติเมื่อท่านเลือกยาหรือกดยืนยันนำเข้าไฟล์ Excel)'
                      : 'ไม่พบรายการที่ค้นหา'}
                  </td>
                </tr>
              ) : (
                pagedItems.map((item, idx) => {
                  const jDrug = allDrugs.find(d => d.drugcode === item.jhcisdrugcode);
                  const hospitalDisplay = item.hospitalDrugName || item.drugname || item.hosdrugcode || '-';
                  const deleteKey = item.id || item.hosdrugcode || item.hospitalDrugName || item.drugname;

                  return (
                    <tr key={item.id || idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{hospitalDisplay}</div>
                        {item.hosdrugcode && item.hospitalDrugName && (
                          <div className="font-mono text-[11px] text-slate-400 mt-0.5">รหัส รพ.: {item.hosdrugcode}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 break-all">
                        {item.tmtid || jDrug?.didstandard || '-'}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                        <span className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 break-all inline-block">
                          {item.jhcisdrugcode}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {item.matchedDrugName || (jDrug ? jDrug.drugname : item.drugname || '-')}
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {item.updatedAt ? item.updatedAt.slice(0, 10) : item.createdAt ? item.createdAt.slice(0, 10) : '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleDelete(deleteKey, hospitalDisplay)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          title="ลบการจับคู่นี้"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
          colorTheme="emerald"
          position="bottom"
        />
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Link2 className="w-5 h-5 text-emerald-600" />
              <span>ผูกรหัสยา รพ. <ArrowRight className="w-3.5 h-3.5 inline mx-1" /> JHCIS</span>
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ชื่อยาของโรงพยาบาลแม่ข่าย (จากไฟล์ Excel รพ.) *
                </label>
                <input
                  type="text"
                  placeholder="เช่น Metoprolol 100 mg tab"
                  value={form.hospitalDrugName}
                  onChange={(e) => setForm(prev => ({ ...prev, hospitalDrugName: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-emerald-500 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  รหัสยาของ รพ.แม่ข่าย (ถ้ามี หรือเว้นว่างได้)
                </label>
                <input
                  type="text"
                  placeholder="เช่น 1000142"
                  value={form.hosdrugcode}
                  onChange={(e) => setForm(prev => ({ ...prev, hosdrugcode: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono bg-slate-50 focus:bg-white focus:outline-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  เลือกรหัสยาใน JHCIS (cdrug) *
                </label>
                <select
                  required
                  value={form.jhcisdrugcode}
                  onChange={(e) => setForm(prev => ({ ...prev, jhcisdrugcode: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-emerald-500"
                >
                  <option value="">-- เลือกรหัสยาใน JHCIS --</option>
                  {allDrugs.map(d => (
                    <option key={d.drugcode} value={d.drugcode}>
                      [{d.drugcode}] {d.drugname} ({d.drugunit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
                >
                  บันทึกการจับคู่
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
