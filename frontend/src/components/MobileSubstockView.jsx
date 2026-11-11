import React, { useState, useEffect, useRef, useMemo } from 'react';
import jsQR from 'jsqr';
import {
  Package,
  QrCode,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ArrowRight,
  RefreshCw,
  X,
  Check,
  ChevronRight,
  Pill,
  Sparkles,
  Search,
  Smartphone,
  ScanLine
} from 'lucide-react';
import { api } from '../services/api';

export default function MobileSubstockView({ initialDrugCode }) {
  const [currentDrugCode, setCurrentDrugCode] = useState(initialDrugCode || '');
  const [drugInfo, setDrugInfo] = useState(null);
  const [loading, setLoading] = useState(Boolean(initialDrugCode));
  const [error, setError] = useState(null);
  const [successData, setSuccessData] = useState(null);

  // Search State
  const [allDrugs, setAllDrugs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [selectedLot, setSelectedLot] = useState('');
  const [selectedExp, setSelectedExp] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDate, setWithdrawDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [withdrawNote, setWithdrawNote] = useState('เบิกยาจากคลังในไปวางหน้าเคาน์เตอร์');
  const [submitting, setSubmitting] = useState(false);

  // Camera & Photo Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState(null);
  const [decodingPhoto, setDecodingPhoto] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const scanTimerRef = useRef(null);

  useEffect(() => {
    loadAllDrugs();
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (currentDrugCode) {
      loadDrug(currentDrugCode);
    }
  }, [currentDrugCode]);

  const loadAllDrugs = async () => {
    try {
      const res = await api.getAllDrugs();
      if (res.success && Array.isArray(res.data)) {
        setAllDrugs(res.data);
      }
    } catch (e) {}
  };

  const filteredDrugs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 1) return [];
    return allDrugs.filter(d => 
      (d.drugcode && d.drugcode.toLowerCase().includes(q)) ||
      (d.drugname && d.drugname.toLowerCase().includes(q)) ||
      (d.drugnamethai && d.drugnamethai.toLowerCase().includes(q)) ||
      (d.hosdrugcode && d.hosdrugcode.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [allDrugs, searchQuery]);

  const handleClearDrug = () => {
    setDrugInfo(null);
    setCurrentDrugCode('');
    setError(null);
    setSuccessData(null);
    setWithdrawAmount('');
    setSearchQuery('');
  };

  const parseDrugCodeFromUrlOrText = (raw) => {
    if (!raw) return '';
    let code = raw.trim();
    if (code.startsWith('JHCIS-DRUG:')) {
      code = code.replace('JHCIS-DRUG:', '').trim();
    } else if (code.includes('/m/')) {
      code = code.split('/m/')[1]?.split('?')[0] || code;
    } else if (code.includes('scan=')) {
      try {
        const u = new URL(code);
        code = u.searchParams.get('scan') || code;
      } catch (e) {}
    } else if (code.includes('drug=')) {
      try {
        const u = new URL(code);
        code = u.searchParams.get('drug') || code;
      } catch (e) {}
    }
    return code;
  };

  const loadDrug = async (code) => {
    try {
      setLoading(true);
      setError(null);
      setSuccessData(null);
      const res = await api.getSubstockDrug(code);
      if (res.success && res.data) {
        setDrugInfo(res.data);
        const lots = res.data.mainStoreLots || [];
        const firstAvail = lots.find(l => Number(l.remaining) > 0) || lots[0];
        if (firstAvail) {
          setSelectedLot(firstAvail.lotno || 'N/A');
          setSelectedExp(firstAvail.dateexpire && firstAvail.dateexpire !== 'ไม่ระบุ' ? firstAvail.dateexpire : '');
        } else {
          setSelectedLot('N/A');
          setSelectedExp('');
        }
        setWithdrawAmount('');
      } else {
        setError(res.message || `ไม่พบข้อมูลยาสำหรับรหัส "${code}"`);
      }
    } catch (err) {
      setError(err.message || 'ไม่สามารถโหลดข้อมูลยาได้');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (e) => {
    e?.preventDefault();
    if (!drugInfo || !drugInfo.drug) return;
    const qty = Number(withdrawAmount);
    if (!qty || qty <= 0) {
      setError('กรุณาระบุจำนวนยาที่ต้องการเบิก (มากกว่า 0)');
      return;
    }

    const factor = Number(drugInfo.drug.conversionFactor || drugInfo.hybridSummary?.conversionFactor) || 1;
    const isRepackaged = factor > 1;
    const mainUnit = drugInfo.drug.mainStoreUnit || drugInfo.hybridSummary?.mainStoreUnit || (isRepackaged ? 'กระปุก' : drugInfo.drug.drugunit);
    const counterUnit = drugInfo.drug.counterUnit || drugInfo.hybridSummary?.counterUnit || drugInfo.drug.drugunit;

    try {
      setSubmitting(true);
      setError(null);
      const res = await api.saveSubstockTransfer({
        drugcode: drugInfo.drug.drugcode,
        drugname: drugInfo.drug.drugname,
        hosdrugcode: drugInfo.drug.hosdrugcode || '',
        hospitalDrugName: drugInfo.drug.hospitalDrugName || '',
        lotno: selectedLot || 'N/A',
        dateexpire: selectedExp || null,
        amount: qty,
        conversionFactor: factor,
        counterYield: qty * factor,
        mainStoreUnit,
        counterUnit,
        date: withdrawDate,
        note: withdrawNote
      });

      if (res.success) {
        setSuccessData({
          drugname: drugInfo.drug.drugname,
          amount: qty,
          unit: drugInfo.drug.drugunit,
          mainUnit,
          counterUnit,
          factor,
          counterYield: qty * factor,
          lotno: selectedLot,
          newMainStore: res.data?.hybridSummary?.mainStoreBalance ?? 0,
          newCounter: res.data?.hybridSummary?.counterBalance ?? 0
        });
        setDrugInfo(res.data);
        setWithdrawAmount('');
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
      } else {
        setError(res.message || 'บันทึกการเบิกไม่สำเร็จ');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================
  // Camera & QR Decoder Engine
  // ==========================================
  const startCamera = async () => {
    setScannerError(null);

    // หากเบราว์เซอร์บล็อก getUserMedia (เช่น Safari บน HTTP) ให้สลับไปเปิดกล้องถ่ายรูป Native ทันที
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      fileInputRef.current?.click();
      return;
    }

    setShowScanner(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // ตรวจสอบ Native BarcodeDetector (มีใน Android Chrome)
      const nativeDetector = ('BarcodeDetector' in window)
        ? new window.BarcodeDetector({ formats: ['qr_code'] })
        : null;

      scanTimerRef.current = setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) return;

        // วิธีที่ 1: Native BarcodeDetector (ความเร็วระดับฮาร์ดแวร์ 5ms)
        if (nativeDetector) {
          try {
            const barcodes = await nativeDetector.detect(video);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              const code = parseDrugCodeFromUrlOrText(barcodes[0].rawValue);
              if (code) {
                stopCamera();
                setCurrentDrugCode(code);
                return;
              }
            }
          } catch (e) {}
        }

        // วิธีที่ 2: jsQR Fallback
        const canvas = canvasRef.current || document.createElement('canvas');
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        if (vw > 0 && vh > 0) {
          canvas.width = vw;
          canvas.height = vh;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, vw, vh);
          const imageData = ctx.getImageData(0, 0, vw, vh);
          const result = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
          });
          if (result && result.data) {
            const code = parseDrugCodeFromUrlOrText(result.data);
            if (code) {
              stopCamera();
              setCurrentDrugCode(code);
            }
          }
        }
      }, 200);
    } catch (err) {
      stopCamera();
      fileInputRef.current?.click();
    }
  };

  const stopCamera = () => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setShowScanner(false);
  };

  // ระบบถอดรหัสภาพถ่ายขั้นสูง (Multi-Engine: BarcodeDetector + Multi-scale jsQR + Center Crop)
  // แก้ปัญหาถ่ายรูปแล้วอ่าน QR Code ไม่ได้ 100% ทั้งบน iPhone และ Android
  const handlePhotoScan = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDecodingPhoto(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        try {
          let decodedRaw = null;

          // ขั้นที่ 1: ใช้ Native BarcodeDetector ของเครื่อง (Android Chrome / iOS Safari รุ่นใหม่)
          if ('BarcodeDetector' in window) {
            try {
              const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
              const barcodes = await detector.detect(img);
              if (barcodes.length > 0 && barcodes[0].rawValue) {
                decodedRaw = barcodes[0].rawValue;
              }
            } catch (e) {}
          }

          // ขั้นที่ 2: Multi-scale jsQR (ทดสอบหลายขนาดความละเอียด: 1000px, 640px, 1400px)
          if (!decodedRaw) {
            const testSizes = [1000, 640, 1400];
            for (const maxDim of testSizes) {
              let w = img.width;
              let h = img.height;
              if (w > maxDim || h > maxDim) {
                if (w > h) {
                  h = Math.round((h * maxDim) / w);
                  w = maxDim;
                } else {
                  w = Math.round((w * maxDim) / h);
                  h = maxDim;
                }
              }
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              ctx.drawImage(img, 0, 0, w, h);
              const imgData = ctx.getImageData(0, 0, w, h);
              const res = jsQR(imgData.data, imgData.width, imgData.height, {
                inversionAttempts: 'attemptBoth'
              });
              if (res && res.data) {
                decodedRaw = res.data;
                break;
              }
            }
          }

          // ขั้นที่ 3: Center Crop 70% (กรณีผู้ใช้ถ่ายติดขอบโต๊ะหรือระยะห่าง)
          if (!decodedRaw && img.width > 300 && img.height > 300) {
            try {
              const canvas = document.createElement('canvas');
              const cropW = Math.round(img.width * 0.7);
              const cropH = Math.round(img.height * 0.7);
              const cropX = Math.round((img.width - cropW) / 2);
              const cropY = Math.round((img.height - cropH) / 2);
              canvas.width = 700;
              canvas.height = 700;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, 700, 700);
              const imgData = ctx.getImageData(0, 0, 700, 700);
              const res = jsQR(imgData.data, imgData.width, imgData.height, {
                inversionAttempts: 'attemptBoth'
              });
              if (res && res.data) {
                decodedRaw = res.data;
              }
            } catch (e) {}
          }

          if (decodedRaw) {
            stopCamera();
            const nextCode = parseDrugCodeFromUrlOrText(decodedRaw);
            if (nextCode) {
              setCurrentDrugCode(nextCode);
            } else {
              setError(`QR Code ที่สแกนได้ (${decodedRaw}) ไม่ใช่รูปแบบรหัสยา`);
            }
          } else {
            setError('อ่าน QR Code จากภาพไม่สำเร็จ กรุณาถ่ายป้าย QR Code ให้เห็นเต็มกรอบและชัดเจนอีกครั้งครับ');
          }
        } catch (err) {
          setError('เกิดข้อผิดพลาดในการประมวลผลรูปภาพ');
        } finally {
          setDecodingPhoto(false);
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const currentSelectedLotObj = drugInfo?.mainStoreLots?.find(l => l.lotno === selectedLot);

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full bg-slate-100 flex flex-col justify-between text-slate-900 overflow-hidden select-none font-['Noto_Sans_Thai',sans-serif] noto-sans-thai">
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoScan}
        className="hidden"
      />

      {/* Top Mobile App Bar (Compact, Fixed Height ~48px) */}
      <header className="bg-emerald-700 text-white px-3 sm:px-4 py-2.5 shrink-0 shadow-sm z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center font-bold">
              <Pill className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-extrabold text-sm sm:text-base leading-tight flex items-center gap-1.5">
                <span>เบิกยาคลังใน</span>
                <span className="text-[11px] bg-emerald-500 text-white px-1.5 py-0.2 rounded font-bold">รพ.สต.</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            {drugInfo && drugInfo.drug ? (
              <button
                type="button"
                onClick={handleClearDrug}
                className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer active:scale-95 transition-transform"
                title="สลับไปสแกนยาตัวอื่น"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>สแกนยาอื่น</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={startCamera}
                className="px-2.5 py-1 bg-white text-emerald-800 rounded-lg text-xs font-bold flex items-center space-x-1 shadow-xs cursor-pointer active:scale-95 transition-transform"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>สแกน</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area (Strictly Fits Viewport Height - Zero Scroll) */}
      <main className="flex-1 p-2.5 sm:p-3.5 max-w-lg mx-auto w-full flex flex-col justify-between overflow-hidden min-h-0">
        
        {/* Error Alert */}
        {error && (
          <div className="p-2.5 mb-1.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs sm:text-sm font-bold flex items-center justify-between shadow-2xs shrink-0">
            <div className="flex items-center space-x-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-rose-500 p-1 shrink-0"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Loading Spinner for Photo Decode */}
        {decodingPhoto && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-bold flex items-center justify-center space-x-2 shrink-0 animate-pulse">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
            <span>กำลังอ่าน QR Code จากภาพถ่ายอย่างละเอียด...</span>
          </div>
        )}

        {/* 1. Success Screen (Overlays nicely in 100dvh without scrolling) */}
        {successData ? (
          <div className="p-4 bg-emerald-600 text-white rounded-2xl shadow-lg space-y-3 animate-fade-in my-auto shrink-0">
            <div className="flex items-center space-x-2.5">
              <CheckCircle2 className="w-8 h-8 text-emerald-200 shrink-0" />
              <div>
                <h3 className="font-black text-lg sm:text-xl leading-tight">บันทึกเบิกยาสำเร็จ!</h3>
                <p className="text-xs sm:text-sm text-emerald-100 mt-0.5">
                  ตัดคลังในแล้ว {successData.amount.toLocaleString()} {successData.mainUnit || successData.unit}
                  {successData.factor > 1 && (
                    <span className="font-bold text-amber-200">
                      {' '}(แบ่งบรรจุได้ +{successData.counterYield.toLocaleString()} {successData.counterUnit} วางเคาน์เตอร์)
                    </span>
                  )}
                  {' '}(Lot: {successData.lotno})
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-emerald-800/60 p-3 rounded-xl text-center">
              <div>
                <div className="text-xs text-emerald-200 font-medium">📦 คงเหลือคลังยาใน:</div>
                <div className="font-mono text-lg sm:text-xl font-black text-white mt-0.5">
                  {successData.newMainStore.toLocaleString()} {successData.mainUnit || successData.unit}
                </div>
              </div>
              <div>
                <div className="text-xs text-emerald-200 font-medium">💊 พร้อมจ่ายเคาน์เตอร์:</div>
                <div className="font-mono text-lg sm:text-xl font-black text-white mt-0.5">
                  {successData.newCounter.toLocaleString()} {successData.counterUnit || successData.unit}
                </div>
              </div>
            </div>

            {/* Clear Next Step Guidance for Both iPhone & Android */}
            <div className="bg-emerald-800/80 p-2.5 rounded-xl text-center space-y-1">
              <div className="text-xs font-extrabold text-amber-200 flex items-center justify-center gap-1.5">
                <Smartphone className="w-4 h-4 text-amber-300" />
                <span>ต้องการเบิกยาตัวต่อไป:</span>
              </div>
              <div className="text-[11px] sm:text-xs text-emerald-100 font-medium">
                ใช้แอพกล้องของ iPhone/Android ส่องป้าย QR ที่ชั้นยา หรือกดปุ่มสแกนด้านล่าง
              </div>
            </div>

            <div className="pt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSuccessData(null);
                  handleClearDrug();
                  startCamera();
                }}
                className="flex-1 py-3 bg-white text-emerald-950 font-black text-sm rounded-xl shadow-md active:scale-95 transition-transform flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-emerald-600" />
                <span>📸 สแกนยาตัวต่อไป</span>
              </button>

              <button
                type="button"
                onClick={() => setSuccessData(null)}
                className="px-3.5 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-xl active:scale-95 transition-transform cursor-pointer"
              >
                เบิกเพิ่ม
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-2xl p-8 text-center space-y-3 shadow-xs my-auto">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="text-sm font-bold text-slate-600">กำลังดึงข้อมูลยาและ Lot คงเหลือ...</div>
          </div>
        ) : drugInfo && drugInfo.drug ? (() => {
          const factor = Number(drugInfo.drug?.conversionFactor || drugInfo.hybridSummary?.conversionFactor) || 1;
          const isRepackaged = factor > 1;
          const isFloorStock = Boolean(drugInfo.drug?.isFloorStock || drugInfo.drug?.drugcode === '317' || (drugInfo.drug?.drugname || '').toLowerCase().includes('lido'));
          const mainUnit = drugInfo.drug?.mainStoreUnit || drugInfo.hybridSummary?.mainStoreUnit || (isRepackaged ? 'กระปุก' : (isFloorStock ? 'ไวอัล' : drugInfo.drug?.drugunit || 'หน่วย'));
          const counterUnit = drugInfo.drug?.counterUnit || drugInfo.hybridSummary?.counterUnit || drugInfo.drug?.drugunit || 'หน่วย';
          const presetVals = (isRepackaged || isFloorStock) ? [1, 2, 3, 5] : [10, 50, 100, 250, 500];

          return (
          /* 2. Drug Requisition Screen (Strictly Fits in Viewport - Zero Scroll) */
          <div className="flex-1 flex flex-col justify-between gap-2 sm:gap-2.5 min-h-0">
            
            {/* Card 1: Drug Info & Dual Balances */}
            <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200 shadow-2xs space-y-2 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-xs sm:text-sm font-black px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800">
                    JHCIS: {drugInfo.drug.drugcode}
                  </span>
                  {drugInfo.drug.hosdrugcode && (
                    <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200">
                      รพ: {drugInfo.drug.hosdrugcode}
                    </span>
                  )}
                  {isRepackaged && (
                    <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300">
                      1 {mainUnit} = {factor} {counterUnit}
                    </span>
                  )}
                  {isFloorStock && (
                    <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded-lg bg-sky-100 text-sky-900 border border-sky-300">
                      💉 ยาห้องทำแผล (Floor Stock)
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleClearDrug}
                  className="text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-lg font-bold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <RefreshCw className="w-3 h-3 text-slate-500" />
                  <span>สแกนยาอื่น</span>
                </button>
              </div>

              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight line-clamp-2">
                  {drugInfo.drug.drugname}
                </h2>
                {drugInfo.drug.drugnamethai && (
                  <p className="text-xs sm:text-sm text-slate-500 font-medium truncate mt-0.5">
                    {drugInfo.drug.drugnamethai}
                  </p>
                )}
              </div>

              {/* 2 Big Stock Comparison Boxes */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <div className="p-2 rounded-xl bg-emerald-50 border-2 border-emerald-300 text-center">
                  <div className="text-xs font-bold text-emerald-800">📦 คลังใน (เหลือเบิก)</div>
                  <div className="text-lg sm:text-xl font-black text-emerald-950 font-mono mt-0.5">
                    {(drugInfo.hybridSummary?.mainStoreBalance ?? 0).toLocaleString()} <span className="text-xs font-semibold text-emerald-700">{mainUnit}</span>
                  </div>
                  {isRepackaged && (
                    <div className="text-[10px] font-bold text-emerald-700 font-mono mt-0.5">
                      (= {((drugInfo.hybridSummary?.mainStoreBalance ?? 0) * factor).toLocaleString()} {counterUnit})
                    </div>
                  )}
                </div>

                <div className="p-2 rounded-xl bg-blue-50 border-2 border-blue-300 text-center">
                  <div className="text-xs font-bold text-blue-800">💊 เคาน์เตอร์พร้อมจ่าย</div>
                  <div className="text-lg sm:text-xl font-black text-blue-950 font-mono mt-0.5">
                    {(drugInfo.hybridSummary?.counterBalance ?? 0).toLocaleString()} <span className="text-xs font-semibold text-blue-700">{counterUnit}</span>
                  </div>
                  {isRepackaged && (
                    <div className="text-[10px] font-bold text-blue-700 font-mono mt-0.5">
                      รวม รพ.สต.: {(drugInfo.hybridSummary?.totalPcuBalance ?? 0).toLocaleString()} {counterUnit}
                    </div>
                  )}
                </div>
              </div>

              {isRepackaged && (
                <div className="p-2 bg-amber-50/90 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start space-x-2">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="leading-snug">
                    <span className="font-extrabold text-amber-950">📦 ยาบรรจุคลังในเป็น {mainUnit} 500g: </span>
                    เบิกเป็น {mainUnit} เพื่อนำมาแบ่งบรรจุใส่{counterUnit} 10g ที่หน้าเคาน์เตอร์ (<span className="font-mono font-bold text-amber-950">1 {mainUnit} = {factor} {counterUnit}</span>)
                  </div>
                </div>
              )}

              {isFloorStock && (
                <div className="p-2 bg-sky-50/90 border border-sky-300 rounded-xl text-xs text-sky-950 flex items-start space-x-2">
                  <span className="text-base shrink-0">💉</span>
                  <div className="leading-snug">
                    <span className="font-extrabold text-sky-950">ยาหัตถการใช้ในห้องทำแผล (Floor Stock): </span>
                    เบิกออกไปเป็น{mainUnit} (20 ml) เพื่อดูดฉีด 3-5 ml/เคส ไม่ได้จ่ายกลับบ้าน ยอดคลังในตัดตามจำนวน{mainUnit}ที่เบิก
                  </div>
                </div>
              )}
            </div>

            {/* Card 2: Lot & Amount Form */}
            <form onSubmit={handleWithdraw} className="bg-white rounded-2xl p-3 sm:p-3.5 border-2 border-emerald-500/70 shadow-sm flex flex-col justify-between gap-2.5 flex-1 min-h-0">
              
              {/* Lot Selector (Native Dropdown — Compact, avoids scrolling) */}
              <div className="space-y-1 shrink-0">
                <div className="flex justify-between items-center text-xs font-extrabold text-slate-800">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-emerald-600" />
                    <span>เลือก Lot ที่เบิกจากคลังใน *</span>
                  </span>
                  <span className="text-emerald-700 font-bold text-[11px]">เรียงตาม FEFO</span>
                </div>

                {(!drugInfo.mainStoreLots || drugInfo.mainStoreLots.length === 0) ? (
                  <input
                    type="text"
                    value={selectedLot}
                    onChange={(e) => setSelectedLot(e.target.value)}
                    placeholder="ระบุเลข Lot..."
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                  />
                ) : drugInfo.mainStoreLots.length === 1 ? (
                  <div className="p-2 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
                    <div className="font-mono font-extrabold text-slate-900">
                      Lot: {drugInfo.mainStoreLots[0].lotno} <span className="text-slate-500 font-normal">(exp: {drugInfo.mainStoreLots[0].dateexpire || 'ไม่ระบุ'})</span>
                    </div>
                    <div className="font-mono font-black text-emerald-700">
                      เหลือ {Number(drugInfo.mainStoreLots[0].remaining || 0).toLocaleString()} {mainUnit}
                    </div>
                  </div>
                ) : (
                  <select
                    value={selectedLot}
                    onChange={(e) => {
                      const lot = drugInfo.mainStoreLots.find(l => l.lotno === e.target.value);
                      if (lot) {
                        setSelectedLot(lot.lotno || 'N/A');
                        setSelectedExp(lot.dateexpire && lot.dateexpire !== 'ไม่ระบุ' ? lot.dateexpire : '');
                      }
                    }}
                    className="w-full py-2 px-3 bg-slate-50 border border-emerald-300 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {drugInfo.mainStoreLots.map((l, i) => (
                      <option key={i} value={l.lotno}>
                        Lot {l.lotno} (เหลือ {Number(l.remaining || 0).toLocaleString()} {mainUnit} - exp: {l.dateexpire || 'ไม่ระบุ'})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Amount Input & Preset Pills */}
              <div className="space-y-1.5 shrink-0">
                <div className="flex justify-between items-center text-xs font-extrabold text-slate-800">
                  <span>ระบุจำนวนที่เบิก ({mainUnit}) *</span>
                  {currentSelectedLotObj && (
                    <span className="font-bold text-emerald-700 text-[11px]">
                      Lot นี้มี {Number(currentSelectedLotObj.remaining || 0).toLocaleString()} {mainUnit}
                    </span>
                  )}
                </div>

                {/* Preset Pills */}
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {presetVals.map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setWithdrawAmount(String(val))}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                        Number(withdrawAmount) === val
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                      }`}
                    >
                      +{val} {(isRepackaged || isFloorStock) ? mainUnit : ''}
                    </button>
                  ))}
                  {currentSelectedLotObj && Number(currentSelectedLotObj.remaining) > 0 && (
                    <button
                      type="button"
                      onClick={() => setWithdrawAmount(String(currentSelectedLotObj.remaining))}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 cursor-pointer"
                    >
                      ยก Lot ({Number(currentSelectedLotObj.remaining).toLocaleString()})
                    </button>
                  )}
                </div>

                {/* Big Input Number */}
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  required
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder={`ระบุจำนวน (${mainUnit})...`}
                  className="w-full px-3 py-2 border-2 border-emerald-500 rounded-xl text-2xl sm:text-3xl font-mono font-black text-emerald-950 bg-emerald-50/20 focus:bg-white focus:outline-none text-center"
                />

                {isRepackaged && (
                  <div className="p-1.5 bg-emerald-50 rounded-xl border border-emerald-300 text-xs text-center text-emerald-950 shadow-2xs">
                    👉 เบิก <span className="font-mono font-black">{withdrawAmount || 0}</span> {mainUnit} → จะได้รับ <span className="font-mono font-black text-emerald-700 text-sm">{(Number(withdrawAmount || 0) * factor).toLocaleString()}</span> {counterUnit} วางพร้อมจ่ายที่เคาน์เตอร์
                  </div>
                )}
              </div>

              {/* Action Button: Single Clear Confirm Button */}
              <div className="pt-1 shrink-0">
                <button
                  type="submit"
                  disabled={submitting || !withdrawAmount}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl font-extrabold text-base shadow-md active:scale-98 transition-all cursor-pointer flex items-center justify-center space-x-2"
                >
                  <Check className="w-5 h-5" />
                  <span>
                    {submitting ? 'กำลังบันทึกตัดคลังยาใน...' : `ยืนยันเบิกออกไปเคาน์เตอร์ (ตัดคลังใน ${withdrawAmount ? `${withdrawAmount} ${mainUnit}` : ''})`}
                  </span>
                </button>
              </div>
            </form>
          </div>
          );
        })() : (
          
          /* 3. Initial Scan Screen (Works smoothly on both iPhone & Android) */
          <div className="flex-1 flex flex-col justify-between gap-2.5 min-h-0">
            {/* Guide Card */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm text-center space-y-3 shrink-0">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border-2 border-emerald-500/40 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
                <QrCode className="w-7 h-7" />
              </div>

              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  สแกน QR Code เบิกยาคลังใน
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 max-w-xs mx-auto mt-0.5">
                  ส่องกล้องหรือถ่ายภาพป้าย QR บนชั้นยา เพื่อเปิดหน้าเบิกและตัดสต็อก
                </p>
              </div>

              {/* 2 Primary Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={startCamera}
                  className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl font-black text-sm sm:text-base flex items-center justify-center space-x-2 shadow-md shadow-emerald-600/20 cursor-pointer transition-all"
                >
                  <Camera className="w-5 h-5" />
                  <span>📸 เปิดกล้องสแกน QR Code</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 active:scale-98 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center space-x-2 cursor-pointer transition-all"
                >
                  <Camera className="w-4 h-4 text-emerald-400" />
                  <span>📷 ถ่ายรูปป้ายยา (iPhone & Android)</span>
                </button>
              </div>
            </div>

            {/* Quick Search Card (Fallback for typing) */}
            <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-2xs space-y-1.5 relative shrink-0">
              <div className="text-xs sm:text-sm font-extrabold text-slate-700 flex items-center space-x-1.5">
                <Search className="w-3.5 h-3.5 text-emerald-600" />
                <span>หรือค้นหาชื่อยาเพื่อเบิก:</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="พิมพ์ชื่อยา เช่น paracetamol, amox..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {filteredDrugs.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-xl border border-slate-200 shadow-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {filteredDrugs.map(d => (
                    <button
                      key={d.drugcode}
                      type="button"
                      onClick={() => {
                        setCurrentDrugCode(d.drugcode);
                        setSearchQuery('');
                      }}
                      className="w-full text-left p-2.5 hover:bg-emerald-50 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">{d.drugname}</div>
                        <div className="text-[11px] text-slate-500">
                          รหัส: <strong className="font-mono text-slate-700">{d.drugcode}</strong> {d.hosdrugcode && `(รพ: ${d.hosdrugcode})`}
                        </div>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg shrink-0">
                        เลือกเบิก &rarr;
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-2.5 rounded-xl bg-emerald-50/90 border border-emerald-200 text-xs text-emerald-900 shrink-0 text-center font-bold">
              💡 สามารถเปิดแอพกล้องปกติของ iPhone หรือ Android ส่องป้าย QR ที่ชั้นยาได้โดยตรง
            </div>
          </div>
        )}

      </main>

      {/* Camera Scanner Modal Overlay */}
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-4 animate-fade-in overflow-hidden select-none">
          <div className="flex items-center justify-between text-white pt-2">
            <div className="flex items-center space-x-2">
              <ScanLine className="w-5 h-5 text-emerald-400 animate-pulse" />
              <span className="font-extrabold text-sm sm:text-base">ส่องกล้องที่ป้าย QR Code ยา...</span>
            </div>
            <button
              type="button"
              onClick={stopCamera}
              className="p-2 rounded-full bg-white/20 text-white hover:bg-white/30 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative my-auto flex items-center justify-center">
            <video
              ref={videoRef}
              className="w-full max-w-sm rounded-2xl border-2 border-emerald-400 shadow-2xl aspect-square object-cover bg-black"
              playsInline
              muted
            />
            {/* Target Reticle */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-dashed border-emerald-300 rounded-xl" />
            </div>
          </div>

          <div className="text-center space-y-2 pb-4">
            {scannerError ? (
              <div className="text-xs text-amber-300 bg-amber-950/80 p-2.5 rounded-xl max-w-xs mx-auto">
                {scannerError}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs sm:text-sm font-bold inline-flex items-center space-x-1.5 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>หรือเลือกถ่ายรูปสแกน</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
