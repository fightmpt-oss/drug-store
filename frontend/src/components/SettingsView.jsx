import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  Server,
  Key,
  Save,
  Activity,
  LogOut,
  Sparkles,
  Building,
  ShieldAlert,
  Archive,
  FolderCheck,
  Download,
  RefreshCw,
  FileText,
  RotateCcw,
  HardDrive,
  Layers,
  FileSpreadsheet
} from 'lucide-react';
import { api } from '../services/api';

export default function SettingsView({ onConfigUpdated, onRequireRelogin }) {
  const [config, setConfig] = useState({
    host: '192.168.1.253',
    port: 3333,
    user: 'root',
    password: '',
    database: 'jhcisdb',
    charset: 'tis620',
    mode: 'live',
    autoFallbackToDemo: false,
    pcucode: '',
    pcuname: '',
    pcuAddress: '',
    motherHospital: '',
    receiptSource: 'local',
    schema: null
  });

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saveResult, setSaveResult] = useState(null);

  // State สำหรับระบบสำรองข้อมูล (Auto-Backup)
  const [backupData, setBackupData] = useState({ backupDir: '', totalFiles: 0, files: [] });
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupActionLoading, setBackupActionLoading] = useState(false);
  const [backupFilter, setBackupFilter] = useState('all');
  const [backupNotice, setBackupNotice] = useState(null);

  useEffect(() => {
    loadSettings();
    loadBackups();
  }, []);

  const loadBackups = async () => {
    try {
      setBackupLoading(true);
      const res = await api.getBackups();
      if (res && res.success) {
        setBackupData({
          backupDir: res.backupDir || '',
          totalFiles: res.totalFiles || 0,
          files: res.files || []
        });
      }
    } catch (e) {
      console.error('loadBackups error:', e);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleCreateSnapshot = async () => {
    try {
      setBackupActionLoading(true);
      setBackupNotice(null);
      const res = await api.createBackupSnapshot('สำรองข้อมูลด่วนโดยผู้ใช้ผ่านหน้าตั้งค่า');
      if (res && res.success) {
        setBackupNotice({ type: 'success', message: 'สร้างไฟล์ภาพรวมสำรองข้อมูลครบวงจร (Full Snapshot) สำเร็จเรียบร้อย!' });
        await loadBackups();
      } else {
        setBackupNotice({ type: 'error', message: res?.message || 'ไม่สามารถสำรองข้อมูลได้' });
      }
    } catch (e) {
      setBackupNotice({ type: 'error', message: e.message || 'เกิดข้อผิดพลาดในการสำรองข้อมูล' });
    } finally {
      setBackupActionLoading(false);
    }
  };

  const handleRestore = async (file) => {
    const isConfirmed = window.confirm(`คุณต้องการกู้คืนข้อมูลจากไฟล์ "${file.filename}" ใช่หรือไม่?\n\n⚠️ คำเตือน: ข้อมูลการตั้งค่าปัจจุบันจะถูกแทนที่ด้วยข้อมูลจากไฟล์สำรองนี้`);
    if (!isConfirmed) return;

    try {
      setBackupActionLoading(true);
      setBackupNotice(null);
      const res = await api.restoreBackup(file.filename);
      if (res && res.success) {
        setBackupNotice({ type: 'success', message: res.message || 'กู้คืนข้อมูลสำเร็จเรียบร้อย!' });
        await loadSettings();
        await loadBackups();
      } else {
        setBackupNotice({ type: 'error', message: res?.message || 'ไม่สามารถกู้คืนข้อมูลได้' });
      }
    } catch (e) {
      setBackupNotice({ type: 'error', message: e.message || 'เกิดข้อผิดพลาดในการกู้คืน' });
    } finally {
      setBackupActionLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDateTime = (isoStr) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (e) {
      return isoStr;
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'full_snapshot':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">ภาพรวมระบบ (Snapshot)</span>;
      case 'config':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">ตั้งค่าระบบ (Config)</span>;
      case 'mappings':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">การจับคู่ยา (Mappings)</span>;
      case 'stock_counts':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">ตรวจนับสต็อก (Counts)</span>;
      case 'drug_settings':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">ค่ายาเฉพาะ (Settings)</span>;
      case 'receipts':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">ใบรับยา (Receipts)</span>;
      case 'catalogue':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">Drug Catalogue</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">{type}</span>;
    }
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await api.getSettings();
      if (res.success) {
        setConfig(prev => ({ ...prev, ...res.data, _mode: res.mode, _schema: res.schema }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const res = await api.testConnection(config);
      setTestResult(res);
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setSaveResult(null);
      const res = await api.saveSettings(config);
      if (res.success) {
        const isLiveNow = res.data.isConnected;
        setSaveResult({
          success: true,
          message: res.message || (isLiveNow ? 'บันทึกสำเร็จ!' : 'บันทึกเรียบร้อย')
        });
        if (onConfigUpdated) onConfigUpdated(res.data);

        // บังคับ re-login เฉพาะเมื่อมีการแก้ "การเชื่อมต่อฐานข้อมูล" จริง (บันทึกข้อมูลหน่วยบริการต้องไม่เด้งออก)
        if (res.connectionChanged && isLiveNow && onRequireRelogin) {
          setTimeout(() => {
            onRequireRelogin();
          }, 1200);
        }
      } else {
        // แสดงข้อผิดพลาดเสมอ (เดิมเงียบ — ผู้ใช้ไม่รู้ว่าบันทึกไม่ได้)
        setSaveResult({ success: false, message: res.message || `บันทึกไม่สำเร็จ (HTTP error)` });
      }
    } catch (err) {
      setSaveResult({ success: false, message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-5 sm:py-6 space-y-5">

      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
          <span>ตั้งค่าระบบ — การเชื่อมต่อ JHCIS และข้อมูลหน่วยบริการ</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          เชื่อมต่อ MySQL/MariaDB ของ JHCIS เพื่อ<b>อ่านข้อมูลอย่างเดียว</b> (ระบบไม่เขียนลง jhcisdb — ข้อมูลที่บันทึกทั้งหมดอยู่ในเครื่องนี้)
        </p>
      </div>

      {/* สถานะ Schema JHCIS — ตารางที่ขาดจะทำให้บางฟีเจอร์ใช้ไม่ได้ */}
      {config._schema && (config._schema.requiredMissing?.length > 0 || config._schema.optionalMissing?.length > 0) && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-xs text-amber-900 space-y-1">
          <div className="font-bold flex items-center space-x-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>ตรวจพบโครงสร้างฐานข้อมูล JHCIS ที่ไม่ครบ</span>
          </div>
          {config._schema.requiredMissing?.length > 0 && (
            <p>ตารางที่จำเป็นขาด: <b>{config._schema.requiredMissing.join(', ')}</b> — ฟีเจอร์ที่เกี่ยวข้องจะใช้งานไม่ได้</p>
          )}
          {config._schema.optionalMissing?.length > 0 && (
            <p>ตารางเสริมที่ไม่พบ: {config._schema.optionalMissing.join(', ')} — ระบบใช้ใบรับยาของตัวเองแทน/ซ่อนฟีเจอร์ที่เกี่ยวข้อง</p>
          )}
        </div>
      )}

      {/* ข้อมูลหน่วยบริการ — ใช้บนรายงานและหัวเอกสาร (ตั้งต่อหน่วย ไม่ hardcode) */}
      <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-5">
        <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2 pb-3 border-b border-slate-200">
          <Building className="w-4 h-4 text-emerald-600" />
          <span>ข้อมูลหน่วยบริการ (แสดงบนรายงานและเอกสาร)</span>
        </h3>
        <p className="text-[11px] text-slate-500 -mt-2">
          เจ้าหน้าที่ทุกบัญชีบันทึกส่วนนี้ได้ • ส่วน "การเชื่อมต่อ JHCIS/โหมดระบบ" ด้านล่างต้องใช้บัญชีผู้ดูแลระบบ (admin — ดูรายชื่อที่ backend/config.json)
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">รหัสหน่วยบริการ (PCU Code)</label>
            <input
              type="text"
              value={config.pcucode || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, pcucode: e.target.value }))}
              placeholder="เว้นว่าง = ตรวจจับจากฐานข้อมูล JHCIS"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono bg-slate-50 focus:bg-white focus:outline-emerald-500"
            />
            <span className="text-[10px] text-slate-400">ตรวจจับอัตโนมัติ: {config.detectedPcucode || 'ยังไม่พบ'}</span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">ชื่อสถานบริการ</label>
            <input
              type="text"
              value={config.pcuname || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, pcuname: e.target.value }))}
              placeholder="เช่น รพ.สต.ตัวอย่าง"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-emerald-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">ที่ตั้ง (ตำบล/อำเภอ/จังหวัด)</label>
            <input
              type="text"
              value={config.pcuAddress || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, pcuAddress: e.target.value }))}
              placeholder="เช่น ต.ตัวอย่าง อ.ตัวอย่าง จ.ตัวอย่าง"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-emerald-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">รพ.แม่ข่าย (ใช้เป็นผู้ส่งมอบเริ่มต้น)</label>
            <input
              type="text"
              value={config.motherHospital || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, motherHospital: e.target.value }))}
              placeholder="เช่น โรงพยาบาลแม่ข่ายของหน่วย"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-emerald-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">แหล่งข้อมูลรับเข้า (Receipt Source)</label>
            <select
              value={config.receiptSource || 'local'}
              onChange={(e) => setConfig(prev => ({ ...prev, receiptSource: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-emerald-500"
            >
              <option value="local">ใบรับยาของระบบ (แนะนำ — ป้องกันนับซ้ำ)</option>
              <option value="jhcis">ตาราง drugstorereceive ของ JHCIS (ถ้าหน่วยบันทึกใน JHCIS อยู่แล้ว)</option>
              <option value="both">รวมทั้งสองแหล่ง (ระวัง: อาจนับซ้ำ)</option>
            </select>
          </div>
        </div>

        {/* สวิตช์ fallback */}
        <div className="flex items-start space-x-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
          <input
            type="checkbox"
            id="autoFallback"
            checked={Boolean(config.autoFallbackToDemo)}
            onChange={(e) => setConfig(prev => ({ ...prev, autoFallbackToDemo: e.target.checked }))}
            className="mt-0.5"
          />
          <label htmlFor="autoFallback" className="text-xs text-slate-700">
            <span className="font-semibold flex items-center space-x-1">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              <span>อนุญาตให้สลับไปโหมดจำลองอัตโนมัติเมื่อต่อ JHCIS ไม่ได้ (ไม่แนะนำ)</span>
            </span>
            <span className="text-slate-500 block mt-0.5">
              ปิดไว้ = ถ้าเชื่อมต่อไม่ได้ ระบบจะบล็อกการใช้งานและแจ้งเตือนชัดเจน (ป้องกันการใช้ข้อมูลจำลองไปตัดสินใจเบิก-จ่ายจริง)
            </span>
          </label>
        </div>

        <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2 pb-3 pt-3 border-b border-slate-200">
          <Database className="w-4 h-4 text-emerald-600" />
          <span>พารามิเตอร์การเชื่อมต่อ JHCIS MySQL (อ่านอย่างเดียว)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              IP Address เครื่อง Server JHCIS
            </label>
            <input
              type="text"
              value={config.host}
              onChange={(e) => setConfig(prev => ({ ...prev, host: e.target.value }))}
              placeholder="192.168.1.xxx หรือ 127.0.0.1"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono bg-slate-50 focus:bg-white focus:outline-emerald-500"
            />
            <span className="text-[10px] text-slate-400">ไอพีเครื่องแม่ข่าย JHCIS ใน รพ.สต.</span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Port
            </label>
            <input
              type="number"
              value={config.port}
              onChange={(e) => setConfig(prev => ({ ...prev, port: Number(e.target.value) }))}
              placeholder="3333"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono bg-slate-50 focus:bg-white focus:outline-emerald-500"
            />
            <span className="text-[10px] text-slate-400">JHCIS ค่าเริ่มต้นคือพอร์ต 3333 (หรือ 3306)</span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              ชื่อฐานข้อมูล (Database Name)
            </label>
            <input
              type="text"
              value={config.database}
              onChange={(e) => setConfig(prev => ({ ...prev, database: e.target.value }))}
              placeholder="jhcisdb"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono bg-slate-50 focus:bg-white focus:outline-emerald-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              รหัสภาษา (Charset)
            </label>
            <select
              value={config.charset}
              onChange={(e) => setConfig(prev => ({ ...prev, charset: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono bg-slate-50 focus:bg-white focus:outline-emerald-500"
            >
              <option value="tis620">tis620 (JHCIS ดั้งเดิมภาษาไทย)</option>
              <option value="utf8mb4">utf8mb4 / utf8 (JHCIS แปลง UTF-8)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Database Username
            </label>
            <input
              type="text"
              value={config.user}
              onChange={(e) => setConfig(prev => ({ ...prev, user: e.target.value }))}
              placeholder="root"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono bg-slate-50 focus:bg-white focus:outline-emerald-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Database Password
            </label>
            <input
              type="password"
              value={config.password}
              onChange={(e) => setConfig(prev => ({ ...prev, password: e.target.value }))}
              placeholder="รหัสผ่านฐานข้อมูล MySQL"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono bg-slate-50 focus:bg-white focus:outline-emerald-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              โหมดการทำงาน
            </label>
            <select
              value={config.mode || 'live'}
              onChange={(e) => setConfig(prev => ({ ...prev, mode: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-emerald-500"
            >
              <option value="live">Live — เชื่อมต่อ JHCIS จริง (อ่านอย่างเดียว)</option>
              <option value="demo">Demo — ข้อมูลจำลอง (สำหรับฝึกใช้/สาธิต)</option>
            </select>
            <span className="text-[10px] text-slate-400">สถานะปัจจุบัน: {config._mode === 'live' ? 'เชื่อมต่อจริงสำเร็จ' : config._mode === 'demo' ? 'จำลอง' : 'live แต่เชื่อมต่อไม่ได้'}</span>
          </div>

          <div className="sm:col-span-2 pt-1">
            <label className="block font-semibold text-slate-700 mb-1">
              รายชื่อผู้ดูแลระบบเพิ่มเติม (Admin Usernames)
            </label>
            <input
              type="text"
              value={Array.isArray(config.admins) ? config.admins.join(', ') : (config.admins || '')}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                admins: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
              }))}
              placeholder="เช่น 1Palawat, pharmacy_head, it_admin (คั่นด้วยเครื่องหมายจุลภาค ,)"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono bg-slate-50 focus:bg-white focus:outline-emerald-500"
            />
            <span className="text-[11px] text-slate-500 block mt-1">
              💡 <b>หมายเหตุ:</b> ผู้ใช้ใน JHCIS ที่มีระดับสิทธิ์ผู้ดูแลระบบ (grouplevel = 1) จะได้รับสิทธิ์ Admin โดยอัตโนมัติอยู่แล้ว หรือสามารถระบุ Username อื่นๆ เพิ่มเติมในช่องนี้ได้
            </span>
          </div>
        </div>

        {/* Test Result Message */}
        {testResult && (
          <div className={`p-4 rounded-xl text-xs flex items-center space-x-2 border ${
            testResult.success 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}

        {/* Save Result Message */}
        {saveResult && (
          <div className={`p-4 rounded-xl text-xs border flex items-center justify-between ${
            saveResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <div className="flex items-center space-x-2">
              {saveResult.success
                ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
              <span className="font-semibold">{saveResult.message}</span>
            </div>
            {saveResult.success && config.mode === 'live' && (
              <button
                type="button"
                onClick={onRequireRelogin}
                className="flex items-center space-x-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-bold"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>เข้าสู่ระบบด้วย User JHCIS ตอนนี้</span>
              </button>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="flex items-center space-x-1.5 px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Activity className="w-4 h-4 text-emerald-600" />
            <span>{testing ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ JHCIS'}</span>
          </button>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center space-x-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>{loading ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า & เริ่มใช้งาน JHCIS'}</span>
          </button>
        </div>

      </form>

      {/* ------------------------------------------------------------- */}
      {/* ระบบสำรองข้อมูลอัตโนมัติ (Auto-Backup & Multi-Unit Migration) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-emerald-50/50 via-teal-50/30 to-white">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-xs">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <span>ระบบสำรองข้อมูลอัตโนมัติ (Auto-Backup & Multi-Unit Migration)</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                  Active Auto-Backup
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                สำรองไฟล์ config, การจับคู่ยา, ยอดยกมา, และใบรับยาลงโฟลเดอร์ <code className="bg-slate-100 px-1.5 py-0.5 rounded text-emerald-700 font-mono font-bold">backup/</code> อัตโนมัติทุกครั้งที่มีการบันทึกข้อมูล
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={loadBackups}
              disabled={backupLoading}
              className="p-2 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center space-x-1 shadow-xs transition-colors"
              title="รีเฟรชรายการสำรองข้อมูล"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${backupLoading ? 'animate-spin text-emerald-600' : ''}`} />
              <span className="hidden sm:inline">รีเฟรช</span>
            </button>

            <button
              type="button"
              onClick={handleCreateSnapshot}
              disabled={backupActionLoading}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors"
            >
              <Sparkles className="w-4 h-4 text-emerald-200" />
              <span>{backupActionLoading ? 'กำลังสำรองข้อมูล...' : 'สำรองข้อมูลทั้งหมดเดี๋ยวนี้ (Snapshot)'}</span>
            </button>
          </div>
        </div>

        {/* Directory & Status Info Banner */}
        <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between text-xs gap-3">
          <div className="flex items-center space-x-2 text-slate-600">
            <HardDrive className="w-4 h-4 text-slate-400 shrink-0" />
            <span>ตำแหน่งโฟลเดอร์สำรองข้อมูล:</span>
            <span className="font-mono text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 select-all font-semibold">
              {backupData.backupDir || 'C:\\Drug Store\\backup'}
            </span>
          </div>

          <div className="flex items-center space-x-3 text-slate-500">
            <span>จำนวนไฟล์สำรอง: <b className="text-slate-800">{backupData.totalFiles || backupData.files.length}</b> ไฟล์</span>
            <span>•</span>
            <span className="text-emerald-700 font-medium">หมุนเวียนตัดไฟล์เก่าอัตโนมัติ (ปลอดภัย ไม่กินพื้นที่ดิสก์)</span>
          </div>
        </div>

        {/* Notice Message */}
        {backupNotice && (
          <div className={`mx-5 mt-4 p-3 rounded-xl text-xs flex items-center justify-between border ${
            backupNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <div className="flex items-center space-x-2">
              {backupNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="font-medium">{backupNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setBackupNotice(null)}
              className="text-slate-400 hover:text-slate-600 text-xs px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="px-5 pt-4 flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
          {[
            { id: 'all', label: 'ทั้งหมด' },
            { id: 'full_snapshot', label: 'ภาพรวมระบบ (Snapshot)' },
            { id: 'config', label: 'การตั้งค่า (Config)' },
            { id: 'mappings', label: 'การจับคู่ยา (Mappings)' },
            { id: 'stock_counts', label: 'ตรวจนับสต็อก (Counts)' },
            { id: 'drug_settings', label: 'ค่ายาเฉพาะ (Settings)' },
            { id: 'receipts', label: 'ใบรับยา (Receipts)' },
            { id: 'catalogue', label: 'Drug Catalogue' }
          ].map(f => {
            const count = f.id === 'all'
              ? backupData.files.length
              : backupData.files.filter(file => file.type === f.id).length;
            const active = backupFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setBackupFilter(f.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1 ${
                  active
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{f.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  active ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Backups Table */}
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs text-slate-600 border-collapse">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100 sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-4">ประเภท</th>
                <th className="py-2.5 px-4">ชื่อไฟล์ / รายละเอียด</th>
                <th className="py-2.5 px-4">เหตุผล / การกระทำ</th>
                <th className="py-2.5 px-4">ขนาด</th>
                <th className="py-2.5 px-4">เวลาสำรอง</th>
                <th className="py-2.5 px-4 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {backupData.files
                .filter(f => backupFilter === 'all' || f.type === backupFilter)
                .map((file, idx) => (
                  <tr key={file.filename || idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-4 whitespace-nowrap">
                      {getTypeBadge(file.type)}
                      {file.isLatest && (
                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Latest
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4">
                      <div className="font-mono text-slate-800 font-semibold text-[11px]">{file.filename}</div>
                      {file.label && file.label !== file.filename && (
                        <div className="text-[11px] text-slate-500 mt-0.5">{file.label}</div>
                      )}
                    </td>
                    <td className="py-2 px-4 text-slate-600">
                      <span>{file.reason || '-'}</span>
                      {file.actor && (
                        <span className="text-[10px] text-slate-400 block">โดย: {file.actor}</span>
                      )}
                    </td>
                    <td className="py-2 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td className="py-2 px-4 whitespace-nowrap text-slate-500">
                      {formatDateTime(file.modifiedAt)}
                    </td>
                    <td className="py-2 px-4 whitespace-nowrap text-center">
                      <div className="inline-flex items-center space-x-1.5">
                        <a
                          href={api.getBackupDownloadUrl(file.filename)}
                          download={file.filename}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-slate-200 transition-colors"
                          title="ดาวน์โหลดไฟล์สำรองข้อมูลลงเครื่อง"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>

                        {['config', 'mappings', 'stock_counts'].includes(file.type) && !file.isLatest && (
                          <button
                            type="button"
                            onClick={() => handleRestore(file)}
                            disabled={backupActionLoading}
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg border border-slate-200 transition-colors"
                            title="กู้คืนข้อมูลจากไฟล์นี้"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

              {backupData.files.filter(f => backupFilter === 'all' || f.type === backupFilter).length === 0 && (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    <FolderCheck className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <div>ยังไม่มีประวัติการสำรองข้อมูลในหมวดหมู่นี้</div>
                    <div className="text-[11px] text-slate-400 mt-1">กดปุ่ม "สำรองข้อมูลทั้งหมดเดี๋ยวนี้" เพื่อสร้าง Snapshot แรก</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
