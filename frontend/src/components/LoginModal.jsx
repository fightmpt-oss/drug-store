import React, { useState, useEffect } from 'react';
import {
  Package,
  Lock,
  User,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Database,
  CheckCircle2,
  Settings,
  Server,
  RefreshCw,
  ArrowLeft,
  Key,
  HardDrive,
  Smartphone,
  Copy,
  Check,
  ChevronDown,
  HelpCircle,
  QrCode
} from 'lucide-react';
import { api } from '../services/api';

export default function LoginModal({ onLoginSuccess, isLive, pcucode, onConnectionChanged }) {
  // Current Step: 'db_setup' (ขั้นที่ 1: เชื่อมต่อฐานข้อมูล) | 'login' (ขั้นที่ 2: เลือกผู้ใช้ & รหัสผ่าน) | 'mfa' (ขั้นที่ 3: 2FA OTP)
  const [currentStep, setCurrentStep] = useState('db_setup');

  // Step 1: Database Setup State
  const [setupStatus, setSetupStatus] = useState(null);
  const [checkingDb, setCheckingDb] = useState(true);
  const [setupForm, setSetupForm] = useState({
    host: 'localhost',
    port: 3333,
    user: 'root',
    password: '',
    database: 'jhcisdb',
    charset: 'tis620'
  });
  const [setupTesting, setSetupTesting] = useState(false);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupTestResult, setSetupTestResult] = useState(null);
  const [setupSaveResult, setSetupSaveResult] = useState(null);

  // Step 2: Login Form State (User Dropdown & Password)
  const [usersList, setUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [password, setPassword] = useState('');
  const [forceResetMfaCheck, setForceResetMfaCheck] = useState(false);
  const [loadingStep1, setLoadingStep1] = useState(false);
  const [loginError, setLoginError] = useState(null);

  // Step 3: MFA / 2FA State (Google Authenticator / Microsoft Authenticator)
  const [mfaData, setMfaData] = useState(null);
  const [otp, setOtp] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState(null);
  const [requestingNewQr, setRequestingNewQr] = useState(false);
  const [newQrSuccessMessage, setNewQrSuccessMessage] = useState(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedRecovery, setCopiedRecovery] = useState(false);

  // Recovery Code State (มือถือหายหรือเปลี่ยนเครื่อง)
  const [showRecoveryAccordion, setShowRecoveryAccordion] = useState(false);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [verifyingRecovery, setVerifyingRecovery] = useState(false);
  const [recoveryError, setRecoveryError] = useState(null);

  // ตรวจสอบการเชื่อมต่อฐานข้อมูลก่อนเสมอเมื่อเปิดระบบ
  useEffect(() => {
    checkInitialConnection();
  }, []);

  const checkInitialConnection = async () => {
    setCheckingDb(true);
    try {
      const res = await api.getSetupStatus();
      if (res && res.success) {
        setSetupStatus(res);
        if (res.config) {
          setSetupForm(prev => ({
            ...prev,
            host: res.config.host || prev.host,
            port: res.config.port || prev.port,
            user: res.config.user || prev.user,
            database: res.config.database || prev.database,
            charset: res.config.charset || prev.charset
          }));
        }

        // ถ้าเชื่อมต่อฐานข้อมูลสำเร็จแล้ว -> โหลดรายชื่อผู้ใช้และเปิดหน้า Login (Step 2) ได้ทันที
        if (res.isConnected) {
          await loadUsersList();
          setCurrentStep('login');
        } else {
          // ถ้ายังไม่ได้เชื่อมต่อ -> บังคับให้ตั้งค่าเชื่อมต่อฐานข้อมูลก่อนเสมอ (Step 1)
          setCurrentStep('db_setup');
        }
      } else {
        setCurrentStep('db_setup');
      }
    } catch (e) {
      console.warn('Cannot fetch setup status:', e.message);
      setCurrentStep('db_setup');
    } finally {
      setCheckingDb(false);
    }
  };

  // ดึงรายชื่อผู้ใช้จากฐานข้อมูล JHCIS ที่เชื่อมต่อแล้ว
  const loadUsersList = async () => {
    try {
      setLoadingUsers(true);
      const res = await api.getAuthUsers();
      if (res && res.success && Array.isArray(res.users)) {
        setUsersList(res.users);
        if (res.users.length > 0) {
          // ถ้ามีผู้ใช้ที่เป็นของ PCU นี้ ให้เลือกเป็นค่าเริ่มต้น
          const defaultUser = res.users.find(u => u.isPcuUser) || res.users[0];
          setSelectedUsername(defaultUser.username);
        }
      }
    } catch (err) {
      console.warn('Failed to load users list:', err.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  // -------------------------------------------------------------
  // HANDLERS: STEP 1 (DATABASE SETUP & CONNECTION TEST)
  // -------------------------------------------------------------
  const handleTestSetup = async () => {
    try {
      setSetupTesting(true);
      setSetupTestResult(null);
      const res = await api.testSetupConnection(setupForm);
      setSetupTestResult(res);
    } catch (err) {
      setSetupTestResult({ success: false, message: err.message });
    } finally {
      setSetupTesting(false);
    }
  };

  const handleCompleteSetup = async (e) => {
    e.preventDefault();
    try {
      setSetupSaving(true);
      setSetupSaveResult(null);
      const res = await api.completeSetup(setupForm);
      if (res.success) {
        setSetupSaveResult({ success: true, message: res.message });
        if (onConnectionChanged) {
          await onConnectionChanged();
        }
        // อัปเดตสถานะและโหลดผู้ใช้จากฐานข้อมูลที่เพิ่งเชื่อมต่อสำเร็จ
        const statusRes = await api.getSetupStatus();
        if (statusRes && statusRes.success) {
          setSetupStatus(statusRes);
        }
        await loadUsersList();
        
        // ไปขั้นตอนที่ 2 (เลือกผู้ใช้งาน)
        setTimeout(() => {
          setCurrentStep('login');
          setSetupSaveResult(null);
          setSetupTestResult(null);
        }, 800);
      } else {
        setSetupSaveResult({ success: false, message: res.message });
      }
    } catch (err) {
      setSetupSaveResult({ success: false, message: err.message });
    } finally {
      setSetupSaving(false);
    }
  };

  // -------------------------------------------------------------
  // HANDLERS: STEP 2 (LOGIN WITH DROPDOWN & PASSWORD)
  // -------------------------------------------------------------
  const handleLoginStep1Submit = async (e) => {
    e.preventDefault();
    if (!selectedUsername) {
      setLoginError('กรุณาเลือกชื่อผู้ใช้งาน');
      return;
    }
    if (!password) {
      setLoginError('กรุณากรอกรหัสผ่าน JHCIS');
      return;
    }

    try {
      setLoadingStep1(true);
      setLoginError(null);
      setNewQrSuccessMessage(null);

      // ส่ง forceResetMfaCheck หากผู้ใช้เลือกต้องการสแกน QR Code ผูกเครื่องใหม่
      const res = await api.loginStep1(selectedUsername, password, forceResetMfaCheck);
      if (res.success && res.mfaRequired) {
        setMfaData(res);
        setOtp('');
        setOtpError(null);
        setShowRecoveryAccordion(false);
        setRecoveryError(null);
        if (forceResetMfaCheck) {
          setNewQrSuccessMessage('สร้าง QR Code สำหรับผูกเครื่องใหม่เรียบร้อยแล้ว กรุณาสแกนด้วย Google Authenticator หรือ Microsoft Authenticator');
        }
        setCurrentStep('mfa');
      } else if (res.success && res.token) {
        onLoginSuccess(res.user);
      } else {
        setLoginError(res.message || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
      }
    } catch (err) {
      setLoginError(err.message || 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์');
    } finally {
      setLoadingStep1(false);
    }
  };

  // -------------------------------------------------------------
  // HANDLERS: STEP 3 (REQUEST NEW QR CODE & VERIFY OTP)
  // -------------------------------------------------------------
  // ขอสร้าง QR Code ชุดใหม่เพื่อสแกนผูกเครื่องใหม่ (เช่น เปลี่ยนมือถือ หรือแอปหาย)
  const handleRequestNewQrCode = async () => {
    try {
      setRequestingNewQr(true);
      setOtpError(null);
      setNewQrSuccessMessage(null);

      // เรียก loginStep1 อีกครั้งโดยส่ง forceResetMfa = true เพื่อสร้าง Secret และ QR Code ใหม่
      const res = await api.loginStep1(selectedUsername, password, true);
      if (res.success && res.qrCode) {
        setMfaData(res);
        setOtp('');
        setNewQrSuccessMessage('สร้าง QR Code ชุดใหม่สำเร็จ! กรุณาเปิดแอป Google Authenticator หรือ Microsoft Authenticator แล้วสแกนเพื่อผูกเครื่องใหม่');
      } else {
        setOtpError(res.message || 'ไม่สามารถสร้าง QR Code ใหม่ได้');
      }
    } catch (err) {
      setOtpError(err.message || 'เกิดข้อผิดพลาดในการสร้าง QR Code');
    } finally {
      setRequestingNewQr(false);
    }
  };

  const handleVerifyOtpSubmit = async (e) => {
    e.preventDefault();
    const cleanOtp = otp.replace(/[\s-]/g, '').trim();
    if (cleanOtp.length !== 6) {
      setOtpError('กรุณากรอกรหัส OTP ตัวเลข 6 หลัก');
      return;
    }

    try {
      setVerifyingOtp(true);
      setOtpError(null);

      const res = await api.verifyOtp(mfaData.tempToken, cleanOtp);
      if (res.success && res.token) {
        onLoginSuccess(res.user);
      } else {
        setOtpError(res.message || 'รหัส OTP ไม่ถูกต้อง กรุณาดูรหัส 6 หลักล่าสุดจากแอป Authenticator');
      }
    } catch (err) {
      setOtpError(err.message || 'เกิดข้อผิดพลาดในการยืนยัน OTP');
    } finally {
      setVerifyingOtp(false);
    }
  };

  // ยืนยันด้วยรหัสกู้คืนฉุกเฉิน (Emergency Recovery Code)
  const handleVerifyRecoverySubmit = async (e) => {
    e.preventDefault();
    if (!recoveryCodeInput.trim()) {
      setRecoveryError('กรุณากรอกรหัสกู้คืน');
      return;
    }

    try {
      setVerifyingRecovery(true);
      setRecoveryError(null);

      const res = await api.verifyRecoveryCode(mfaData.tempToken, recoveryCodeInput.trim());
      if (res.success && res.token) {
        onLoginSuccess(res.user);
      } else {
        setRecoveryError(res.message || 'รหัสกู้คืนไม่ถูกต้อง หรือถูกใช้งานไปแล้ว');
      }
    } catch (err) {
      setRecoveryError(err.message || 'เกิดข้อผิดพลาดในการใช้รหัสกู้คืน');
    } finally {
      setVerifyingRecovery(false);
    }
  };

  const handleCopySecret = () => {
    if (!mfaData?.secret) return;
    navigator.clipboard.writeText(mfaData.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleCopyRecoveryCodes = () => {
    if (!mfaData?.recoveryCodes) return;
    navigator.clipboard.writeText(mfaData.recoveryCodes.join('\n'));
    setCopiedRecovery(true);
    setTimeout(() => setCopiedRecovery(false), 2000);
  };

  // ข้อมูลผู้ใช้ที่เลือกอยู่
  const activeUserObj = usersList.find(u => u.username === selectedUsername);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 flex flex-col items-center justify-center p-4 overflow-y-auto min-h-screen text-slate-800 selection:bg-emerald-200">

      {/* Header Bar ด้านบนสุด */}
      <div className="text-center text-white mb-5 space-y-2 max-w-lg">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/40">
          <Package className="w-8 h-8" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight drop-shadow-sm">
          ระบบบริหารคลังยา รพ.สต.
        </h1>
        <div className="text-xs sm:text-sm text-emerald-200/90 font-medium tracking-wide">
          JHCIS Drug Store & Drug Stock • โรงพยาบาลส่งเสริมสุขภาพตำบล
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-emerald-100 text-xs font-semibold backdrop-blur-xs border border-white/15">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>ความปลอดภัย 2 ชั้น (Google Authenticator / Microsoft Authenticator)</span>
        </div>
      </div>

      {/* Main Container Card */}
      <div className={`bg-white rounded-3xl shadow-2xl w-full border border-teal-100/50 transition-all duration-300 p-6 sm:p-8 ${
        currentStep === 'mfa' ? 'max-w-lg' : currentStep === 'db_setup' ? 'max-w-lg' : 'max-w-md'
      }`}>

        {/* 3-Step Breadcrumb Progress Indicator */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 text-xs mb-5">
          <div className={`flex items-center space-x-1.5 ${currentStep === 'db_setup' ? 'text-teal-700 font-bold' : setupStatus?.isConnected ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              currentStep === 'db_setup' ? 'bg-teal-700 text-white' : setupStatus?.isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {setupStatus?.isConnected && currentStep !== 'db_setup' ? '✓' : '1'}
            </span>
            <span>1. เชื่อมต่อฐานข้อมูล</span>
          </div>
          <span className="text-slate-300 text-[10px]">➔</span>
          <div className={`flex items-center space-x-1.5 ${currentStep === 'login' ? 'text-teal-700 font-bold' : 'text-slate-400 font-medium'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              currentStep === 'login' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-500'
            }`}>
              2
            </span>
            <span>2. เลือกผู้ใช้ JHCIS</span>
          </div>
          <span className="text-slate-300 text-[10px]">➔</span>
          <div className={`flex items-center space-x-1.5 ${currentStep === 'mfa' ? 'text-teal-700 font-bold' : 'text-slate-400 font-medium'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              currentStep === 'mfa' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-500'
            }`}>
              3
            </span>
            <span>3. ยืนยัน 2FA</span>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* STEP 1: DATABASE SETUP & CONNECTION TEST                             */}
        {/* ==================================================================== */}
        {currentStep === 'db_setup' && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
                <Database className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                ขั้นตอนที่ 1: กำหนดค่าและเชื่อมต่อฐานข้อมูล JHCIS
              </h2>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                ระบบต้องเชื่อมต่อฐานข้อมูล MySQL ของ JHCIS ให้สำเร็จก่อน เพื่อดึงรายชื่อผู้ใช้และทะเบียนยาเข้าสู่ระบบ
              </p>
            </div>

            {/* Test Result Banner */}
            {setupTestResult && (
              <div className={`p-3 rounded-xl text-xs flex items-start space-x-2 border ${
                setupTestResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                {setupTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 font-medium">{setupTestResult.message}</div>
              </div>
            )}

            {/* Save Result Banner */}
            {setupSaveResult && (
              <div className={`p-3 rounded-xl text-xs flex items-start space-x-2 border ${
                setupSaveResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                {setupSaveResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 font-medium">{setupSaveResult.message}</div>
              </div>
            )}

            <form onSubmit={handleCompleteSetup} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    IP Address หรือ Host JHCIS
                  </label>
                  <div className="relative">
                    <Server className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={setupForm.host}
                      onChange={(e) => setSetupForm({ ...setupForm, host: e.target.value })}
                      placeholder="เช่น localhost หรือ 192.168.1.253"
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-teal-600 text-slate-800 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Port MySQL
                  </label>
                  <input
                    type="number"
                    required
                    value={setupForm.port}
                    onChange={(e) => setSetupForm({ ...setupForm, port: Number(e.target.value) })}
                    placeholder="3333"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-teal-600 text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ชื่อฐานข้อมูล (Database)
                </label>
                <div className="relative">
                  <HardDrive className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={setupForm.database}
                    onChange={(e) => setSetupForm({ ...setupForm, database: e.target.value })}
                    placeholder="เช่น jhcisdb หรือ jhcisdb_06020"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-teal-600 text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ผู้ใช้ MySQL (User)
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={setupForm.user}
                      onChange={(e) => setSetupForm({ ...setupForm, user: e.target.value })}
                      placeholder="root"
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-teal-600 text-slate-800 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    รหัสผ่าน MySQL
                  </label>
                  <div className="relative">
                    <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      value={setupForm.password}
                      onChange={(e) => setSetupForm({ ...setupForm, password: e.target.value })}
                      placeholder="เช่น 123456 (เว้นว่างได้)"
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-teal-600 text-slate-800 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={handleTestSetup}
                  disabled={setupTesting || setupSaving}
                  className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  {setupTesting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังทดสอบ...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>ทดสอบเชื่อมต่อ</span>
                    </>
                  )}
                </button>

                <button
                  type="submit"
                  disabled={setupTesting || setupSaving}
                  className="flex-1 py-2.5 px-3 bg-[#235850] hover:bg-[#1a443e] text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  {setupSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <>
                      <span>เชื่อมต่อและไปต่อ</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>

              {setupStatus?.isConnected && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setCurrentStep('login')}
                    className="text-xs text-slate-500 hover:text-slate-800 underline font-semibold cursor-pointer"
                  >
                    ข้ามไปหน้าเลือกผู้ใช้ (ใช้ฐานข้อมูลเดิมที่เชื่อมต่ออยู่แล้ว)
                  </button>
                </div>
              )}
            </form>
          </div>
        )}

        {/* ==================================================================== */}
        {/* STEP 2: LOGIN VIEW (USER DROPDOWN + PASSWORD)                       */}
        {/* ==================================================================== */}
        {currentStep === 'login' && (
          <div className="space-y-4">
            
            {/* Database Connection Status Bar */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 text-xs">
              <div className="flex items-center space-x-1.5 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="font-semibold text-slate-700 truncate" title={`PCU: ${setupStatus?.pcucode || pcucode || ''} ${setupStatus?.pcuname || ''}`}>
                  JHCIS: <strong>{setupStatus?.pcucode || pcucode || 'เชื่อมต่อแล้ว'}</strong> {setupStatus?.pcuname ? `(${setupStatus.pcuname})` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCurrentStep('db_setup')}
                className="text-[11px] font-bold text-teal-700 hover:text-teal-900 hover:underline flex items-center gap-1 cursor-pointer shrink-0 ml-2"
                title="คลิกเพื่อเปลี่ยน IP Server หรือสลับฐานข้อมูล JHCIS"
              >
                <Settings className="w-3 h-3" />
                <span>เปลี่ยนฐานข้อมูล</span>
              </button>
            </div>

            <div className="text-center space-y-0.5">
              <h2 className="text-base font-bold text-slate-900">
                ขั้นตอนที่ 2: เลือกผู้ใช้งาน JHCIS และระบุรหัสผ่าน
              </h2>
              <p className="text-xs text-slate-500">
                รายชื่อบุคลากรดึงจากฐานข้อมูล JHCIS ที่เชื่อมต่อเรียบร้อยแล้ว
              </p>
            </div>

            {/* Form Error Banner */}
            {loginError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs space-y-1">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="flex-1 font-medium">{loginError}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleLoginStep1Submit} className="space-y-4">
              
              {/* Field: ชื่อผู้ใช้ (Dropdown) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    ชื่อผู้ใช้งาน JHCIS
                  </label>
                  {loadingUsers && (
                    <span className="text-[10px] text-teal-600 flex items-center gap-1">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      กำลังโหลดรายชื่อ...
                    </span>
                  )}
                </div>

                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    value={selectedUsername}
                    onChange={(e) => setSelectedUsername(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 border border-slate-200 rounded-xl text-xs sm:text-sm bg-slate-50 focus:bg-white focus:outline-teal-600 text-slate-900 font-medium appearance-none cursor-pointer shadow-2xs"
                  >
                    <option value="">-- กรุณาเลือกชื่อผู้ใช้งาน JHCIS --</option>
                    {usersList.map((u) => (
                      <option key={u.username} value={u.username}>
                        {u.displayName} ({u.username}) {u.position ? `— ${u.position}` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>

                {/* Badge แสดงข้อมูลผู้ใช้ที่กำลังเลือก */}
                {activeUserObj && (
                  <div className="mt-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200/80 rounded-lg text-[11px] text-slate-600 flex items-center justify-between">
                    <span className="truncate">
                      ตำแหน่ง: <strong className="text-slate-800">{activeUserObj.position || 'เจ้าหน้าที่ JHCIS'}</strong>
                    </span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 font-bold border border-teal-200">
                      {activeUserObj.has2fa ? '🔒 เปิด 2FA แล้ว' : '✨ ผูก 2FA ครั้งแรก'}
                    </span>
                  </div>
                )}
              </div>

              {/* Field: รหัสผ่าน */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  รหัสผ่าน JHCIS
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="กรอกรหัสผ่านเข้าใช้งาน JHCIS"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-xs sm:text-sm bg-slate-50 focus:bg-white focus:outline-teal-600 text-slate-900 shadow-2xs"
                  />
                </div>
              </div>

              {/* Option: ต้องการสแกน QR Code ผูก 2FA ใหม่ */}
              <div className="flex items-center space-x-2 pt-0.5">
                <input
                  type="checkbox"
                  id="forceResetCheckbox"
                  checked={forceResetMfaCheck}
                  onChange={(e) => setForceResetMfaCheck(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600 cursor-pointer"
                />
                <label htmlFor="forceResetCheckbox" className="text-[11px] text-slate-600 cursor-pointer select-none">
                  เปลี่ยนโทรศัพท์มือถือ / ต้องการสแกน QR Code ผูก 2FA ใหม่
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loadingStep1 || !selectedUsername}
                className="w-full py-3 bg-[#235850] hover:bg-[#1a443e] active:scale-[0.99] text-white rounded-xl text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2 cursor-pointer mt-2"
              >
                {loadingStep1 ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>กำลังตรวจสอบรหัสผ่าน JHCIS...</span>
                  </>
                ) : (
                  <>
                    <span>ถัดไป: ยืนยัน OTP (2FA)</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 text-center text-slate-400 text-[11px]">
              🔒 ยืนยันรหัสผ่านตรงกับฐานข้อมูล JHCIS โดยตรง ไม่มีการเก็บรหัสผ่านในระบบ
            </div>

          </div>
        )}

        {/* ==================================================================== */}
        {/* STEP 3: 2FA MFA VIEW (GOOGLE AUTHENTICATOR & MICROSOFT AUTHENTICATOR) */}
        {/* ==================================================================== */}
        {currentStep === 'mfa' && mfaData && (
          <div className="space-y-4">
            
            {/* Header: ยืนยัน 2 ขั้นตอน (2FA) */}
            <div className="space-y-1 pb-3 border-b border-slate-100">
              <h2 className="text-xl font-black text-[#235850] tracking-tight">
                ขั้นตอนที่ 3: ยืนยันความปลอดภัย 2 ขั้นตอน (2FA)
              </h2>
              <div className="text-xs sm:text-sm font-semibold text-slate-700">
                {mfaData.user?.displayName || mfaData.user?.username}{(mfaData.user?.pcucode || pcucode) ? ` • ${mfaData.user?.pcucode || pcucode}` : ''}
              </div>
              <p className="text-xs text-slate-500 pt-0.5">
                กรอกรหัส 6 หลักจากแอป <strong>Google Authenticator</strong> หรือ <strong>Microsoft Authenticator</strong> บนมือถือ
              </p>
            </div>

            {/* Notification Banner when new QR Code is generated */}
            {newQrSuccessMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="flex-1 font-medium">{newQrSuccessMessage}</span>
              </div>
            )}

            {/* QR Code Setup Section (กรณีตั้งค่าครั้งแรก หรือกดขอสร้าง QR Code ใหม่) */}
            {mfaData.qrCode ? (
              <div className="bg-teal-50/80 border border-teal-200 rounded-2xl p-4 text-center space-y-3">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-teal-900">
                  <Smartphone className="w-4 h-4 text-teal-600" />
                  <span>สแกน QR Code ด้วย Google Authenticator หรือ Microsoft Authenticator</span>
                </div>

                <div className="bg-white p-2.5 rounded-xl inline-block shadow-md border border-teal-100">
                  <img
                    src={mfaData.qrCode}
                    alt="Authenticator QR Code"
                    className="w-40 h-40 mx-auto object-contain"
                  />
                </div>

                <div className="text-[11px] text-slate-600 space-y-1">
                  <p>หากกล้องสแกนไม่ได้ สามารถพิมพ์รหัส Secret Key นี้ลงในแอปได้:</p>
                  <div className="flex items-center justify-center gap-1.5">
                    <code className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono text-[10px] text-teal-900 select-all font-bold">
                      {mfaData.secret}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className="p-1 rounded hover:bg-teal-100 text-teal-700 transition-colors cursor-pointer"
                      title="คัดลอกรหัส Secret"
                    >
                      {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Emergency Recovery Codes Box */}
                {mfaData.recoveryCodes && (
                  <div className="pt-2 border-t border-teal-200/80 text-left">
                    <div className="flex items-center justify-between text-[11px] font-bold text-teal-950 mb-1">
                      <span className="flex items-center gap-1">
                        <Key className="w-3.5 h-3.5 text-amber-600" />
                        รหัสกู้คืนฉุกเฉิน 5 ชุด (จดบันทึกไว้เผื่อมือถือหาย):
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyRecoveryCodes}
                        className="text-[10px] text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {copiedRecovery ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedRecovery ? 'คัดลอกแล้ว' : 'คัดลอกทั้งหมด'}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-[10px] font-mono">
                      {mfaData.recoveryCodes.map((code, idx) => (
                        <div key={idx} className="bg-white px-1.5 py-0.5 rounded border border-teal-100 text-slate-700 text-center font-bold">
                          {code}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* กล่องตัวเลือกสำหรับผู้ใช้เดิมที่เคยผูกแล้ว แต่ต้องการสแกน QR Code ใหม่เพื่อผูกเครื่องใหม่ */
              <div className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-2xl text-xs space-y-2">
                <div className="flex items-center justify-between text-teal-900 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-teal-600" />
                    <span>เปลี่ยนโทรศัพท์มือถือ หรือต้องการสแกน QR Code ใหม่?</span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  หากท่านเปลี่ยนเครื่องใหม่ หรือยังไม่มีบัญชีนี้ใน Google/Microsoft Authenticator สามารถกดปุ่มด้านล่างเพื่อสร้าง QR Code ชุดใหม่และสแกนผูกเครื่องได้ทันที
                </p>
                <button
                  type="button"
                  onClick={handleRequestNewQrCode}
                  disabled={requestingNewQr}
                  className="w-full py-2 px-3 bg-white hover:bg-teal-50 text-teal-800 border border-teal-300 rounded-xl font-bold text-xs shadow-2xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  {requestingNewQr ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังสร้าง QR Code ใหม่...</span>
                    </>
                  ) : (
                    <>
                      <QrCode className="w-3.5 h-3.5 text-teal-600" />
                      <span>กดที่นี่เพื่อสร้างและแสดง QR Code สำหรับสแกนใหม่</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Error Banner */}
            {otpError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="flex-1 font-medium">{otpError}</span>
              </div>
            )}

            {/* OTP Form */}
            <form onSubmit={handleVerifyOtpSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  รหัส OTP 6 หลัก
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="รหัส 6 หลัก"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-center text-lg font-mono font-bold tracking-widest bg-slate-50 focus:bg-white focus:outline-teal-600 text-slate-900 shadow-2xs"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={verifyingOtp || otp.length !== 6}
                className="w-full py-3 bg-[#235850] hover:bg-[#1a443e] active:scale-[0.99] disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                {verifyingOtp ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>กำลังตรวจสอบรหัส OTP...</span>
                  </>
                ) : (
                  <span>ยืนยันและเข้าใช้งานระบบ</span>
                )}
              </button>
            </form>

            {/* Accordion: มือถือหายหรือเปลี่ยนเครื่อง */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRecoveryAccordion(prev => !prev)}
                className="w-full flex items-center justify-between text-left text-xs font-bold text-slate-700 hover:text-teal-800 py-1.5 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px]">{showRecoveryAccordion ? '▲' : '▼'}</span>
                  <span>มือถือหายหรือเปลี่ยนเครื่อง (ใช้รหัสกู้คืนฉุกเฉิน)</span>
                </span>
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showRecoveryAccordion && (
                <div className="mt-2 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 text-xs animate-in fade-in duration-200">
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    ใช้รหัสกู้คืนฉุกเฉินชุดใดชุดหนึ่ง แล้วเข้าไปตั้งค่า Authenticator บนมือถือเครื่องใหม่หลังเข้าใช้งาน
                  </p>

                  {recoveryError && (
                    <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-[11px]">
                      {recoveryError}
                    </div>
                  )}

                  <form onSubmit={handleVerifyRecoverySubmit} className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        รหัสกู้คืนฉุกเฉิน
                      </label>
                      <input
                        type="text"
                        value={recoveryCodeInput}
                        onChange={(e) => setRecoveryCodeInput(e.target.value)}
                        placeholder="เช่น A3B9-9F21"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-teal-600 font-mono uppercase"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={verifyingRecovery || !recoveryCodeInput.trim()}
                      className="w-full py-2 bg-[#235850] hover:bg-[#1a443e] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      {verifyingRecovery ? 'กำลังตรวจสอบ...' : 'ใช้รหัสกู้คืน'}
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Back button to re-select user */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setCurrentStep('login');
                  setOtp('');
                  setOtpError(null);
                  setNewQrSuccessMessage(null);
                }}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 hover:underline font-semibold cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>เปลี่ยนชื่อผู้ใช้งาน</span>
              </button>
            </div>

          </div>
        )}

      </div>

      {/* Footer ด้านล่างสุด */}
      <footer className="mt-6 text-center text-emerald-100/70 text-xs space-y-1">
        <p className="font-medium text-white/90">
          ระบบบริหารคลังยาและ Drug Stock สำหรับโรงพยาบาลส่งเสริมสุขภาพตำบล (รพ.สต.)
        </p>
        <p className="text-[11px] text-emerald-200/60">
          เชื่อมต่อฐานข้อมูล JHCIS • ปลอดภัยด้วยการยืนยันตัวตน 2 ขั้นตอน (2FA Google / Microsoft Authenticator)
        </p>
      </footer>

    </div>
  );
}
