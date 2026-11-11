import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  Bell, 
  BellRing, 
  Volume2, 
  VolumeX, 
  X, 
  ExternalLink, 
  Zap, 
  ArrowRight, 
  Clock,
  CheckCircle2
} from 'lucide-react';
import { api } from '../services/api';

/**
 * Web Audio API synthesized alert chime
 * สร้างเสียงเตือน 2-Tone ทางการแพทย์ (Medical Alert Chime) โดยไม่ต้องพึ่งพาไฟล์เสียงภายนอก
 */
function playAudioChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;

    // Tone 1: 880 Hz (A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Tone 2: 587.33 Hz (D5) - warning harmonic
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(587.33, now + 0.15);
    gain2.gain.setValueAtTime(0.25, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.45);
  } catch (err) {
    console.warn('Audio chime playback ignored:', err);
  }
}

/**
 * Native Windows Desktop Notification (HTML5 Web Notifications API)
 * เด้งมุมจอด้านล่างขวาของ Windows แม้ผู้ใช้กำลังเปิดหน้าต่าง JHCIS Desktop อยู่
 */
function triggerDesktopNotification(alert, onClick) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    let title = '🚨 แจ้งเตือนความปลอดภัยด้านยา (JHCIS Drug Alert)';
    if (alert.isTripleWhammy) {
      title = '🚨 ตรวจพบภาวะ Triple Whammy (เสี่ยงไตวายฉุกเฉิน AKI)';
    } else if (alert.hasConflictPairs) {
      title = '⚠️ ตรวจพบยาที่ไม่ควรจ่ายร่วมกัน (Drug Conflict)';
    }

    let bodyText = `ผู้สั่งยา: ${alert.username || '-'}\nผู้ป่วย: ${alert.patientNameMasked || 'ผู้รับบริการ'} (HN: ${alert.hn || alert.pid || '-'})\n`;
    if (alert.conflictPairs && alert.conflictPairs.length > 0) {
      const p = alert.conflictPairs[0];
      bodyText += `ยาตีกัน: ${p.drugA?.drugname || ''} ⚡ ${p.drugB?.drugname || ''}`;
    } else if (alert.isTripleWhammy) {
      bodyText += `จ่าย 3 กลุ่มพร้อมกัน: NSAID + Diuretic + ACEi/ARB`;
    }

    const n = new Notification(title, {
      body: bodyText,
      icon: '/vite.svg',
      tag: `jhcis-alert-${alert.visitno}-${Date.now()}`,
      requireInteraction: true // บน Windows จะค้างอยู่มุมจอจนกว่าผู้ใช้จะกดหรือปิด
    });

    n.onclick = () => {
      window.focus();
      if (typeof onClick === 'function') onClick();
      n.close();
    };
  } catch (e) {
    console.warn('Desktop notification error:', e);
  }
}

export default function SafetyToastNotifier({ user, onNavigateSafety, onCountChange }) {
  const [toasts, setToasts] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem('jhcis_safety_sound') !== 'false';
    } catch (e) {
      return true;
    }
  });
  const [desktopPermission, setDesktopPermission] = useState(() => {
    return typeof Notification !== 'undefined' ? Notification.permission : 'default';
  });

  // เก็บ visitno และ signature ที่เคยแจ้งเตือนแล้วเพื่อป้องกันการแจ้งซ้ำ
  const seenVisitsRef = useRef(new Map());
  const isFirstRunRef = useRef(true);

  // ขอสิทธิ์แสดง Native Desktop Notification ของระบบ Windows
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนมุมจอ Windows');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setDesktopPermission(perm);
      if (perm === 'granted') {
        new Notification('🔔 เปิดการแจ้งเตือนมุมจอสำเร็จ', {
          body: 'ระบบจะเด้งเตือนมุมขวาล่างของ Windows ทันทีที่คีย์ยาอันตรายหรือ Triple Whammy ใน JHCIS',
          icon: '/vite.svg'
        });
      }
    } catch (err) {
      console.warn('Permission request error:', err);
    }
  };

  // สลับเปิด/ปิดเสียงเตือน
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      localStorage.setItem('jhcis_safety_sound', String(next));
    } catch (e) {}
    if (next) {
      playAudioChime();
    }
  };

  // ลบ toast ตาม id
  const dismissToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // ลบ toast ทั้งหมด
  const dismissAllToasts = () => {
    setToasts([]);
  };

  // ฟังก์ชันยิง Toast แจ้งเตือนใหม่
  const triggerAlertToast = (alert, isTest = false) => {
    const toastId = `${alert.visitno || 'test'}_${Date.now()}_${Math.random()}`;
    const newToast = {
      id: toastId,
      alert,
      isTest,
      timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      remainingSeconds: 15
    };

    setToasts(prev => [newToast, ...prev].slice(0, 3)); // แสดงพร้อมกันได้สูงสุด 3 ใบ

    // เล่นเสียงเตือน
    if (soundEnabled) {
      playAudioChime();
    }

    // ยิง Windows Toast Notification
    if (desktopPermission === 'granted') {
      triggerDesktopNotification(alert, () => {
        if (onNavigateSafety) onNavigateSafety();
      });
    }
  };

  // Fast Poller ตรวจจับการคีย์ยาใน JHCIS ทุก 4 วินาที
  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const pollSafety = async () => {
      try {
        const res = await api.getLiveSafetyAlerts();
        if (!isMounted || !res.success || !res.data) return;

        const alerts = res.data.alerts || [];
        const criticalTotal = (res.data.tripleCount || 0) + (res.data.conflictPairCount || 0);

        if (onCountChange) {
          onCountChange(criticalTotal);
        }

        if (isFirstRunRef.current) {
          // โหลดครั้งแรก: บันทึกเคสที่มีอยู่แล้วลงใน Set เพื่อไม่ให้เด้งรบกวนย้อนหลัง
          alerts.forEach(a => {
            const sig = `${a.visitno}_${a.totalPrescribed || 0}_${a.conflictPairs?.length || 0}_${a.isTripleWhammy ? '1' : '0'}`;
            seenVisitsRef.current.set(String(a.visitno), sig);
          });
          isFirstRunRef.current = false;
          return;
        }

        // ตรวจหา Visit ที่เพิ่งคีย์ใหม่ หรือมีการสั่งยาเพิ่มขึ้น
        alerts.forEach(a => {
          const vKey = String(a.visitno);
          const sig = `${a.visitno}_${a.totalPrescribed || 0}_${a.conflictPairs?.length || 0}_${a.isTripleWhammy ? '1' : '0'}`;
          const prevSig = seenVisitsRef.current.get(vKey);

          if (!prevSig || prevSig !== sig) {
            seenVisitsRef.current.set(vKey, sig);
            // ตรวจพบเคสสั่งยาใหม่ที่ติดเงื่อนไขความปลอดภัย!
            triggerAlertToast(a, false);
          }
        });
      } catch (err) {
        // เงียบไว้ใน polling เพื่อไม่ให้ขัดจังหวะการทำงาน
      }
    };

    // รันทันทีและวนลูปทุก 4 วินาที
    pollSafety();
    const interval = setInterval(pollSafety, 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user, soundEnabled, desktopPermission]);

  // รับ Event ทดสอบการแจ้งเตือนจากหน้าอื่น (เช่น เมนูตั้งค่า หรือหน้า Drug Safety)
  useEffect(() => {
    const handleTestEvent = (e) => {
      const mockAlert = e.detail || {
        visitno: '99010045',
        patientNameMasked: 'นาย สมนึก ใจดี',
        pid: '1024',
        hn: '1024',
        pidMasked: '1024',
        username: user?.username || '1Palawat',
        severity: 'CRITICAL',
        isTripleWhammy: false,
        hasConflictPairs: true,
        title: '⚠️ ตรวจพบยาที่ไม่ควรจ่ายร่วมกัน (2-Drug Conflict)',
        conflictPairs: [
          {
            drugA: { drugcode: '0639', drugname: 'DICLOFENAC TAB 25 mg.' },
            drugB: { drugcode: '0023', drugname: 'IBUPROFEN TAB 400 MG' },
            reason: 'ซ้ำซ้อนกลุ่ม NSAIDs เสี่ยงแผลในกระเพาะอาหาร เลือดออก และไตวายเฉียบพลัน (Acute Kidney Injury: AKI)'
          }
        ]
      };
      triggerAlertToast(mockAlert, true);
    };

    window.addEventListener('jhcis:test-safety-toast', handleTestEvent);
    return () => window.removeEventListener('jhcis:test-safety-toast', handleTestEvent);
  }, [user, soundEnabled, desktopPermission]);

  // นับเวลาถอยหลัง 15 วินาทีเพื่อปิด Toast อัตโนมัติ
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setInterval(() => {
      setToasts(prev => 
        prev
          .map(t => ({ ...t, remainingSeconds: t.remainingSeconds - 1 }))
          .filter(t => t.remainingSeconds > 0)
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [toasts.length]);

  return (
    <>
      {/* แถบ Banner ขอสิทธิ์ Desktop Notification (แสดงเฉพาะเมื่อสิทธิ์ยังเป็น default และผู้ใช้ล็อกอินแล้ว) */}
      {desktopPermission === 'default' && (
        <div className="fixed top-14 right-4 z-40 max-w-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white p-3 rounded-xl shadow-xl border border-amber-300 flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 min-w-0">
            <BellRing className="w-4 h-4 shrink-0 animate-bounce" />
            <span>เปิดแจ้งเตือนมุมจอ Windows ให้เด้งเตือนทันทีขณะคีย์ยาใน JHCIS หรือไม่?</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={requestNotificationPermission}
              className="bg-white text-amber-900 font-bold px-2 py-1 rounded-lg hover:bg-amber-50 text-[11px] shadow-xs cursor-pointer"
            >
              เปิดใช้งาน
            </button>
            <button
              type="button"
              onClick={() => setDesktopPermission('dismissed')}
              className="text-white/80 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Facebook-Style Toast Notifications Container (Fixed Bottom-Right Corner) */}
      <div 
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-3 max-w-sm sm:max-w-md w-[calc(100vw-2.5rem)] pointer-events-none"
        aria-live="assertive"
      >
        {toasts.map((toast) => {
          const { id, alert, isTest, timestamp, remainingSeconds } = toast;
          const isCritical = alert.severity === 'CRITICAL' || alert.isTripleWhammy;
          const conflict = alert.conflictPairs && alert.conflictPairs[0];

          return (
            <div
              key={id}
              className={`pointer-events-auto rounded-2xl bg-white/95 backdrop-blur-md shadow-2xl border-2 transition-all duration-300 ease-out overflow-hidden transform hover:scale-[1.01] ${
                isCritical 
                  ? 'border-rose-500 shadow-rose-950/20' 
                  : 'border-amber-500 shadow-amber-950/20'
              }`}
            >
              {/* Top Header Strip */}
              <div className={`px-4 py-2.5 flex items-center justify-between text-white ${
                isCritical 
                  ? 'bg-gradient-to-r from-rose-600 to-red-600' 
                  : 'bg-gradient-to-r from-amber-600 to-orange-600'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                  </span>
                  <div className="font-extrabold text-xs sm:text-sm tracking-wide flex items-center gap-1.5 truncate">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>
                      {alert.isTripleWhammy 
                        ? '🚨 ตรวจพบภาวะ Triple Whammy!' 
                        : alert.hasConflictPairs 
                        ? '⚠️ ตรวจพบยาที่ไม่ควรจ่ายร่วมกัน' 
                        : '⚠️ คำเตือนความปลอดภัยด้านยา'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Sound Toggle */}
                  <button
                    type="button"
                    onClick={toggleSound}
                    className="p-1 rounded-md hover:bg-white/20 text-white/90 hover:text-white transition-colors cursor-pointer"
                    title={soundEnabled ? 'ปิดเสียงเตือน' : 'เปิดเสียงเตือน'}
                  >
                    {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-rose-200" />}
                  </button>
                  {/* Close Button */}
                  <button
                    type="button"
                    onClick={() => dismissToast(id)}
                    className="p-1 rounded-md hover:bg-white/20 text-white/90 hover:text-white transition-colors cursor-pointer"
                    title="ปิดการแจ้งเตือนนี้"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Toast Body Content */}
              <div className="p-3.5 sm:p-4 text-slate-800 space-y-2.5 text-xs sm:text-sm">
                
                {/* Prescriber & Patient Metadata Bar */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-1 font-semibold text-slate-700 truncate">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[10px]">
                      ผู้สั่ง: {alert.username || '-'}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="truncate">
                      ผู้ป่วย: <strong className="text-slate-900">{alert.patientNameMasked || 'ผู้รับบริการ'}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 text-slate-400 font-mono text-[10px]">
                    <Clock className="w-3 h-3" />
                    <span>{timestamp}</span>
                    {isTest && <span className="bg-emerald-100 text-emerald-800 px-1 rounded text-[9px] font-bold">TEST</span>}
                  </div>
                </div>

                {/* Conflicting Drugs Highlight Box (Facebook Style Callout) */}
                {conflict ? (
                  <div className="bg-rose-50/80 border border-rose-200/80 rounded-xl p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-rose-800">
                      <span className="flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-rose-600 fill-rose-600 animate-pulse" />
                        คู่ยาที่ขัดแย้ง (ตรวจพบในใบสั่งยาเดียวกัน):
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 font-semibold text-xs">
                      <span className="px-2 py-1 bg-white rounded-lg border border-rose-300 text-rose-900 shadow-2xs font-mono">
                        💊 {conflict.drugA?.drugname || conflict.drugA?.drugcode}
                      </span>
                      <span className="text-rose-600 font-black text-sm">⚡</span>
                      <span className="px-2 py-1 bg-white rounded-lg border border-rose-300 text-rose-900 shadow-2xs font-mono">
                        💊 {conflict.drugB?.drugname || conflict.drugB?.drugcode}
                      </span>
                    </div>

                    <p className="text-[11px] text-rose-700 leading-relaxed font-normal">
                      <strong>ผลกระทบ:</strong> {conflict.reason}
                    </p>
                  </div>
                ) : alert.isTripleWhammy ? (
                  <div className="bg-rose-50/80 border border-rose-200/80 rounded-xl p-2.5 space-y-1.5">
                    <div className="text-[11px] font-bold text-rose-900 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      การสั่งใช้ยา 3 กลุ่มเสี่ยงไตวายฉุกเฉิน (AKI):
                    </div>
                    <div className="grid grid-cols-1 gap-1 text-[11px]">
                      {alert.nsaids && alert.nsaids.length > 0 && (
                        <div className="text-slate-700 flex items-center">
                          <span className="w-2 h-2 rounded-full bg-rose-500 mr-1.5 shrink-0" />
                          <span><strong>NSAID:</strong> {alert.nsaids.map(d => d.drugname).join(', ')}</span>
                        </div>
                      )}
                      {alert.diuretics && alert.diuretics.length > 0 && (
                        <div className="text-slate-700 flex items-center">
                          <span className="w-2 h-2 rounded-full bg-sky-500 mr-1.5 shrink-0" />
                          <span><strong>Diuretic:</strong> {alert.diuretics.map(d => d.drugname).join(', ')}</span>
                        </div>
                      )}
                      {alert.aceiArbs && alert.aceiArbs.length > 0 && (
                        <div className="text-slate-700 flex items-center">
                          <span className="w-2 h-2 rounded-full bg-purple-500 mr-1.5 shrink-0" />
                          <span><strong>ACEi/ARB:</strong> {alert.aceiArbs.map(d => d.drugname).join(', ')}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-rose-700 leading-relaxed">
                      กลไก: เลือดเข้าไตลดลง + แรงดันต้านออกหายไป + ปริมาตรเลือดรวมลดลง ทำให้แรงดันการกรองตกดิ่งฉับพลัน
                    </p>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900">
                    {alert.title || 'พบความเสี่ยงจากการสั่งใช้ยาร่วมกัน'}
                  </div>
                )}

                {/* Action Buttons Bar */}
                <div className="flex items-center justify-between pt-1 gap-2">
                  <span className="text-[10px] text-slate-400">
                    ปิดอัตโนมัติใน {remainingSeconds} วิ
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => dismissToast(id)}
                      className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      รับทราบ
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dismissToast(id);
                        if (onNavigateSafety) onNavigateSafety();
                      }}
                      className={`flex items-center gap-1 px-3 py-1 text-white rounded-lg text-xs font-bold shadow-xs transition-transform active:scale-95 cursor-pointer ${
                        isCritical 
                          ? 'bg-rose-600 hover:bg-rose-700' 
                          : 'bg-amber-600 hover:bg-amber-700'
                      }`}
                    >
                      <span>ดูรายละเอียด</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>

              {/* Progress Countdown Bar */}
              <div className="h-1 bg-slate-100 w-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ease-linear ${
                    isCritical ? 'bg-rose-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${(remainingSeconds / 15) * 100}%` }}
                />
              </div>

            </div>
          );
        })}

        {/* ปุ่มลบทั้งหมด (แสดงเมื่อมีตั้งแต่ 2 ใบขึ้นไป) */}
        {toasts.length > 1 && (
          <div className="flex justify-end pointer-events-auto">
            <button
              type="button"
              onClick={dismissAllToasts}
              className="px-3 py-1 bg-slate-800/80 hover:bg-slate-900 text-white text-[11px] font-bold rounded-full shadow-lg backdrop-blur-xs transition-colors cursor-pointer"
            >
              ปิดการแจ้งเตือนทั้งหมด ({toasts.length})
            </button>
          </div>
        )}
      </div>
    </>
  );
}
