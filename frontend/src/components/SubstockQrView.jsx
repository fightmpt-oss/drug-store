import React, { useState, useEffect, useRef, useMemo } from 'react';
import jsQR from 'jsqr';
import {
  QrCode,
  Camera,
  Search,
  Package,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  History,
  Trash2,
  FileText,
  RefreshCw,
  Layers,
  Sparkles,
  X,
  Check,
  ScanLine,
  Smartphone,
  Wifi,
  Copy,
  ExternalLink,
  Image as ImageIcon
} from 'lucide-react';
import { api } from '../services/api';

export default function SubstockQrView({ initialDrugCode, onOpenStockCard, user }) {
  const [activeSubTab, setActiveSubTab] = useState('scan'); // 'scan' | 'labels' | 'history'
  const [scanInput, setScanInput] = useState('');
  const [allDrugs, setAllDrugs] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Scanned drug state
  const [drugInfo, setDrugInfo] = useState(null);
  const [loadingDrug, setLoadingDrug] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Withdrawal form state
  const [selectedLot, setSelectedLot] = useState('');
  const [selectedExp, setSelectedExp] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDate, setWithdrawDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [withdrawNote, setWithdrawNote] = useState('เบิกยาจากคลังในไปวางจุดจ่ายยาหน้าเคาน์เตอร์');
  const [submitting, setSubmitting] = useState(false);

  // Camera Scanner State (Universal jsQR + BarcodeDetector + Photo Capture Fallback)
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const scanTimerRef = useRef(null);
  const inputRef = useRef(null);

  // Mobile Bridge State (LAN Wi-Fi วงแลนเดียวกัน)
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [mobileBridge, setMobileBridge] = useState(null);
  const [loadingBridge, setLoadingBridge] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // QR Labels state
  const [qrList, setQrList] = useState([]);
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrSearch, setQrSearch] = useState('');
  const [onlyWithStock, setOnlyWithStock] = useState(false);
  const [qrFormat, setQrFormat] = useState('lan_url'); // 'lan_url' | 'standard'

  // Transfer History state
  const [transfers, setTransfers] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => {
    loadDrugList();
    loadTransferHistory();
    loadMobileBridge();
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (initialDrugCode) {
      setActiveSubTab('scan');
      handleLookupDrug(initialDrugCode);
    }
  }, [initialDrugCode]);

  useEffect(() => {
    if (activeSubTab === 'labels') {
      loadQrCodes(qrSearch, qrFormat);
    } else if (activeSubTab === 'history') {
      loadTransferHistory();
    }
  }, [activeSubTab, qrFormat]);

  const loadMobileBridge = async (drugcode = null) => {
    try {
      setLoadingBridge(true);
      const res = await api.getMobileBridge(drugcode ? { drugcode } : {});
      if (res.success && res.data) {
        setMobileBridge(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBridge(false);
    }
  };

  const handleCopyUrl = (url) => {
    if (!url) return;
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const loadDrugList = async () => {
    try {
      const res = await api.getAllDrugs();
      if (res.success && Array.isArray(res.data)) {
        setAllDrugs(res.data);
      }
    } catch (e) {}
  };

  const loadQrCodes = async (searchVal = qrSearch, formatVal = qrFormat) => {
    try {
      setLoadingQr(true);
      const res = await api.getSubstockQrCodes({ search: searchVal, limit: 300, qrFormat: formatVal });
      if (res.success) {
        setQrList(res.data || []);
        if (res.bridge) setMobileBridge(prev => ({ ...(prev || {}), ...res.bridge }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingQr(false);
    }
  };

  const loadTransferHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await api.getSubstockTransfers({ limit: 200 });
      if (res.success) {
        setTransfers(res.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleLookupDrug = async (codeToLookup) => {
    const clean = String(codeToLookup || scanInput || '').trim();
    if (!clean) return;
    try {
      setLoadingDrug(true);
      setError(null);
      setSuccessMsg(null);
      setShowDropdown(false);
      const res = await api.getSubstockDrug(clean);
      if (res.success && res.data) {
        setDrugInfo(res.data);
        setScanInput('');
        // เลือก Lot ที่มียอดคงเหลือ > 0 และหมดอายุเร็วที่สุด (FEFO) อัตโนมัติ
        const lots = res.data.mainStoreLots || [];
        const firstAvailable = lots.find(l => Number(l.remaining) > 0) || lots[0];
        if (firstAvailable) {
          setSelectedLot(firstAvailable.lotno || 'N/A');
          setSelectedExp(firstAvailable.dateexpire && firstAvailable.dateexpire !== 'ไม่ระบุ' ? firstAvailable.dateexpire : '');
        } else {
          setSelectedLot('N/A');
          setSelectedExp('');
        }
        setWithdrawAmount('');
      } else {
        setError(res.message || `ไม่พบรหัสยา "${clean}"`);
      }
    } catch (err) {
      setError(err.message || 'เกิดข้อผิดพลาดในการค้นหายา');
    } finally {
      setLoadingDrug(false);
    }
  };

  // Universal Camera QR Scanner (jsQR + BarcodeDetector)
  const startCamera = async () => {
    setCameraError(null);

    // บน Safari iOS เมื่อต่อผ่าน HTTP วงแลน navigator.mediaDevices จะถูกบล็อกตามนโยบายความปลอดภัย
    // สลับไปเปิดกล้องถ่ายรูป Native ของมือถือให้อัตโนมัติทันที
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      } else {
        setCameraError(
          'เบราว์เซอร์บล็อกการเปิดกล้องสด — กรุณากดปุ่ม "📸 ถ่ายรูปสแกนป้าย QR" หรือใช้แอพกล้องของมือถือสแกนแทนครับ'
        );
      }
      return;
    }

    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const nativeDetector = 'BarcodeDetector' in window
        ? new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] })
        : null;

      scanTimerRef.current = setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) return;

        // 1. ใช้ jsQR ถอดรหัสจากเฟรมวิดีโอ (รองรับ iPhone Safari / Android Chrome / PC 100%)
        try {
          const canvas = canvasRef.current || document.createElement('canvas');
          const vw = video.videoWidth || 640;
          const vh = video.videoHeight || 480;
          if (vw > 0 && vh > 0) {
            canvas.width = vw;
            canvas.height = vh;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(video, 0, 0, vw, vh);
            const imageData = ctx.getImageData(0, 0, vw, vh);
            const qrResult = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert'
            });
            if (qrResult && qrResult.data) {
              const rawVal = qrResult.data.trim();
              if (rawVal) {
                stopCamera();
                handleLookupDrug(rawVal);
                return;
              }
            }
          }
        } catch (e) {}

        // 2. Fallback ด้วย BarcodeDetector สำหรับบาร์โค้ด 1D/2D
        if (nativeDetector) {
          try {
            const barcodes = await nativeDetector.detect(video);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              const rawVal = barcodes[0].rawValue;
              stopCamera();
              handleLookupDrug(rawVal);
            }
          } catch (e) {}
        }
      }, 250);
    } catch (err) {
      stopCamera();
      // หากถูกบล็อก ให้เด้งกล้องถ่ายรูปของมือถือแทนทันที
      if (fileInputRef.current) {
        fileInputRef.current.click();
      } else {
        setCameraError(
          'ไม่สามารถเปิดกล้องสดได้ — กรุณากดปุ่ม "📸 ถ่ายรูปสแกนป้าย QR" แทนครับ'
        );
      }
    }
  };

  const stopCamera = () => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // สแกน QR Code จากภาพถ่ายกล้องมือถือ (ทำงานได้ 100% แม้เปิดผ่าน HTTP LAN ธรรมดา!)
  const handlePhotoCaptureScan = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // ย่อขนาดภาพถ้ารูปจากกล้องมือถือใหญ่เกินไปเพื่อให้ถอดรหัสไวและแม่นยำ
        const maxDim = 1200;
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
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth'
        });
        if (code && code.data) {
          stopCamera();
          handleLookupDrug(code.data.trim());
        } else {
          setError('ไม่พบ QR Code ในภาพที่ถ่าย กรุณาถ่ายให้เห็นกรอบ QR Code ชัดเจนอีกครั้ง');
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    if (!drugInfo || !drugInfo.drug) return;
    const qty = Number(withdrawAmount);
    if (!qty || qty <= 0) {
      setError('กรุณาระบุจำนวนยาที่ต้องการเบิกออกวางเคาน์เตอร์ (มากกว่า 0)');
      return;
    }

    const factor = Number(drugInfo.drug?.conversionFactor || drugInfo.hybridSummary?.conversionFactor) || 1;
    const isRepackaged = factor > 1;
    const mainUnit = drugInfo.drug?.mainStoreUnit || drugInfo.hybridSummary?.mainStoreUnit || (isRepackaged ? 'กระปุก' : drugInfo.drug?.drugunit || 'หน่วย');
    const counterUnit = drugInfo.drug?.counterUnit || drugInfo.hybridSummary?.counterUnit || drugInfo.drug?.drugunit || 'หน่วย';

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
        setSuccessMsg(res.message);
        setDrugInfo(res.data);
        setWithdrawAmount('');
        // อัปเดต Lot อัตโนมัติหาก Lot เดิมหมด
        const lots = res.data?.mainStoreLots || [];
        const stillHasSelected = lots.find(l => l.lotno === selectedLot && Number(l.remaining) > 0);
        if (!stillHasSelected) {
          const nextLot = lots.find(l => Number(l.remaining) > 0) || lots[0];
          if (nextLot) {
            setSelectedLot(nextLot.lotno || 'N/A');
            setSelectedExp(nextLot.dateexpire && nextLot.dateexpire !== 'ไม่ระบุ' ? nextLot.dateexpire : '');
          }
        }
        loadTransferHistory();
      } else {
        setError(res.message || 'บันทึกการเบิกไม่สำเร็จ');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTransfer = async (transfer) => {
    if (!confirm(`ต้องการยกเลิกรายการเบิก "${transfer.drugname}" จำนวน ${transfer.amount.toLocaleString()} (Lot: ${transfer.lotno}) เพื่อคืนยอดกลับเข้าคลังยาในหรือไม่?`)) {
      return;
    }
    try {
      const res = await api.deleteSubstockTransfer(transfer.id);
      if (res.success) {
        loadTransferHistory();
        if (drugInfo?.drug?.drugcode === transfer.drugcode) {
          handleLookupDrug(transfer.drugcode);
        }
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredSearchDrugs = useMemo(() => {
    const q = scanInput.trim().toLowerCase();
    if (!q) return allDrugs.slice(0, 25);
    return allDrugs.filter(d =>
      d.drugcode.toLowerCase().includes(q) ||
      (d.drugname && d.drugname.toLowerCase().includes(q)) ||
      (d.drugnamethai && d.drugnamethai.toLowerCase().includes(q))
    ).slice(0, 30);
  }, [allDrugs, scanInput]);

  const filteredQrList = useMemo(() => {
    return qrList.filter(item => {
      if (onlyWithStock && Number(item.mainStoreBalance) <= 0) return false;
      if (!qrSearch.trim()) return true;
      const q = qrSearch.trim().toLowerCase();
      return (
        item.drugcode.toLowerCase().includes(q) ||
        (item.drugname && item.drugname.toLowerCase().includes(q)) ||
        (item.drugnamethai && item.drugnamethai.toLowerCase().includes(q)) ||
        (item.hosdrugcode && item.hosdrugcode.toLowerCase().includes(q)) ||
        (item.hospitalDrugName && item.hospitalDrugName.toLowerCase().includes(q))
      );
    });
  }, [qrList, qrSearch, onlyWithStock]);

  const filteredTransfers = useMemo(() => {
    if (!historySearch.trim()) return transfers;
    const q = historySearch.trim().toLowerCase();
    return transfers.filter(t =>
      (t.drugcode && t.drugcode.toLowerCase().includes(q)) ||
      (t.drugname && t.drugname.toLowerCase().includes(q)) ||
      (t.lotno && t.lotno.toLowerCase().includes(q)) ||
      (t.transferNo && t.transferNo.toLowerCase().includes(q))
    );
  }, [transfers, historySearch]);

  const currentSelectedLotObj = useMemo(() => {
    if (!drugInfo?.mainStoreLots) return null;
    return drugInfo.mainStoreLots.find(l => l.lotno === selectedLot) || null;
  }, [drugInfo, selectedLot]);

  return (
    <div className="w-full px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
      {/* Hidden Canvas & Photo Capture Input for Universal Mobile Scanning */}
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoCaptureScan}
        className="hidden"
      />

      {/* Header & Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 no-print">
        <div>
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold mb-1.5">
            <QrCode className="w-3.5 h-3.5 text-emerald-600" />
            <span>ระบบคลังยา 2 ระดับ (Hybrid: คลังยาใน + จุดจ่ายยาหน้าเคาน์เตอร์)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            สแกน QR Code เบิกยาออกจากคลังยาใน (Sub-Stock Requisition)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            รองรับการสแกนด้วยมือถือผ่าน Wi-Fi วงแลน รพ.สต. หรือเครื่องยิงบาร์โค้ด 2D &rarr; เลือก Lot และจำนวนที่เบิกออกวางเคาน์เตอร์ &rarr; ตัดยอดคลังในทันที
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          {/* ปุ่มเชื่อมต่อมือถือ (Wi-Fi วงแลน รพ.สต.) */}
          <button
            type="button"
            onClick={() => {
              setShowMobileModal(true);
              loadMobileBridge(drugInfo?.drug?.drugcode || null);
            }}
            className="flex items-center space-x-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-extrabold shadow-sm cursor-pointer transition-all"
          >
            <Smartphone className="w-4 h-4" />
            <span>📱 เชื่อมต่อมือถือ (Wi-Fi วงแลน รพ.สต.)</span>
          </button>

          {/* Sub-Tabs */}
          <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-2xs shrink-0">
            <button
              type="button"
              onClick={() => setActiveSubTab('scan')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'scan'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <ScanLine className="w-4 h-4" />
              <span>1. สแกน QR เบิกยา</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('labels')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'labels'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>2. พิมพ์ป้าย QR ติดชั้นยา</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('history')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'history'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <History className="w-4 h-4" />
              <span>3. ประวัติเบิก ({transfers.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: สแกน QR Code และตัดเบิกยาจากคลังยาในไปเคาน์เตอร์                 */}
      {/* ===================================================================== */}
      {activeSubTab === 'scan' && (
        <div className="space-y-5">

          {/* Scan & Search Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
            <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
              <div className="relative flex-1">
                <QrCode className="w-5 h-5 text-emerald-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={inputRef}
                  type="text"
                  value={scanInput}
                  onFocus={() => setShowDropdown(true)}
                  onChange={(e) => {
                    setScanInput(e.target.value);
                    setShowDropdown(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleLookupDrug(scanInput);
                    }
                  }}
                  placeholder="ยิงสแกน QR Code ที่นี่ หรือพิมพ์รหัสยา JHCIS / ชื่อยา (เช่น Paracetamol)..."
                  className="w-full pl-11 pr-24 py-3 border-2 border-emerald-500/70 focus:border-emerald-600 rounded-xl text-sm font-semibold text-slate-900 bg-emerald-50/20 focus:bg-white focus:outline-none transition-all"
                />
                {scanInput && (
                  <button
                    type="button"
                    onClick={() => setScanInput('')}
                    className="absolute right-20 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleLookupDrug(scanInput)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
                >
                  ค้นหา
                </button>

                {/* Quick Drug Dropdown */}
                {showDropdown && filteredSearchDrugs.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto z-30 divide-y divide-slate-100">
                    <div className="px-3 py-1.5 bg-slate-50 flex justify-between items-center text-[11px] font-bold text-slate-500">
                      <span>คลิกเลือกยาเพื่อดูสต็อกคลังในและตัดเบิก</span>
                      <button type="button" onClick={() => setShowDropdown(false)} className="text-slate-400 hover:text-slate-700">ปิด</button>
                    </div>
                    {filteredSearchDrugs.map(d => (
                      <button
                        key={d.drugcode}
                        type="button"
                        onClick={() => handleLookupDrug(d.drugcode)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-emerald-50 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              [{d.drugcode}]
                            </span>
                            <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">{d.drugname}</span>
                          </div>
                          {d.drugnamethai && (
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">{d.drugnamethai}</div>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 font-medium shrink-0">{d.drugunit}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Live Camera Toggle Button */}
                {!cameraActive ? (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="flex-1 sm:flex-initial flex items-center justify-center space-x-2 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs cursor-pointer transition-colors"
                  >
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <span>เปิดกล้องสดสแกน QR</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="flex-1 sm:flex-initial flex items-center justify-center space-x-2 px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs cursor-pointer transition-colors"
                  >
                    <X className="w-4 h-4" />
                    <span>ปิดกล้อง</span>
                  </button>
                )}

                {/* Photo Capture Scan Button (Works even on non-HTTPS HTTP LAN!) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-3.5 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs sm:text-sm font-bold cursor-pointer transition-colors"
                  title="ถ่ายภาพป้าย QR Code ด้วยกล้องมือถือ (ใช้ได้แม้เปิดผ่าน HTTP วงแลน)"
                >
                  <ImageIcon className="w-4 h-4 text-emerald-700" />
                  <span>ถ่ายรูปสแกน QR</span>
                </button>
              </div>
            </div>

            {/* Camera Video Preview */}
            {cameraActive && (
              <div className="mt-4 p-3 bg-slate-900 rounded-xl text-center space-y-2.5">
                <div className="text-xs font-semibold text-emerald-400 flex items-center justify-center gap-1.5">
                  <ScanLine className="w-4 h-4 animate-pulse" />
                  <span>ส่องกล้องไปยังป้าย QR Code ของยาที่ชั้นวางคลังยาใน...</span>
                </div>
                <video
                  ref={videoRef}
                  className="w-full max-w-md mx-auto rounded-lg border-2 border-emerald-500/60 bg-black aspect-video object-cover"
                  playsInline
                  muted
                />
                {cameraError && (
                  <div className="text-xs text-amber-200 bg-amber-950/80 border border-amber-700 rounded-lg p-3 max-w-lg mx-auto space-y-2">
                    <div>{cameraError}</div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs cursor-pointer"
                    >
                      📸 กดที่นี่เพื่อถ่ายรูปสแกนป้าย QR ทันที
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Alerts */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs sm:text-sm font-semibold flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700"><X className="w-4 h-4" /></button>
            </div>
          )}

          {successMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs sm:text-sm font-bold flex items-center justify-between shadow-2xs">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
              <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Scanned Drug Details & Lot Requisition Panel */}
          {loadingDrug ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="text-sm font-semibold text-slate-600">กำลังดึงข้อมูลสต็อกคลังยาในและรายการ Lot...</div>
            </div>
          ) : drugInfo && drugInfo.drug ? (() => {
            const factor = Number(drugInfo.drug?.conversionFactor || drugInfo.hybridSummary?.conversionFactor) || 1;
            const isRepackaged = factor > 1;
            const isFloorStock = Boolean(drugInfo.drug?.isFloorStock || drugInfo.drug?.drugcode === '317' || (drugInfo.drug?.drugname || '').toLowerCase().includes('lido'));
            const mainUnit = drugInfo.drug?.mainStoreUnit || drugInfo.hybridSummary?.mainStoreUnit || (isRepackaged ? 'กระปุก' : (isFloorStock ? 'ไวอัล' : drugInfo.drug?.drugunit || 'หน่วย'));
            const counterUnit = drugInfo.drug?.counterUnit || drugInfo.hybridSummary?.counterUnit || drugInfo.drug?.drugunit || 'หน่วย';
            const presetValues = (isRepackaged || isFloorStock) ? [1, 2, 3, 5] : [50, 100, 250, 500, 1000];

            return (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

              {/* Left Column: Drug Info, 3-Tier Balance & Available Lots in Main Store */}
              <div className="lg:col-span-7 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-xs font-extrabold">
                          รหัส JHCIS: {drugInfo.drug.drugcode}
                        </span>
                        {(drugInfo.drug.hosdrugcode || drugInfo.drug.hospitalDrugName) && (
                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono text-xs font-bold">
                            รพ.แม่ข่าย: {drugInfo.drug.hosdrugcode ? `[${drugInfo.drug.hosdrugcode}] ` : ''}{drugInfo.drug.hospitalDrugName || ''}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                          หน่วยนับ JHCIS: {drugInfo.drug.drugunit}
                        </span>
                        {isRepackaged && (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold">
                            1 {mainUnit} = {factor} {counterUnit}
                          </span>
                        )}
                        {isFloorStock && (
                          <span className="px-2.5 py-0.5 rounded-lg bg-sky-100 text-sky-900 border border-sky-300 font-bold text-xs">
                            💉 ยาใช้ในห้องทำแผล (Floor Stock)
                          </span>
                        )}
                      </div>
                      <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
                        {drugInfo.drug.drugname}
                      </h2>
                      {drugInfo.drug.drugnamethai && (
                        <p className="text-xs sm:text-sm text-slate-500 font-medium">{drugInfo.drug.drugnamethai}</p>
                      )}
                    </div>

                    {drugInfo.qrDataUrl && (
                      <div className="text-center shrink-0 bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <img src={drugInfo.qrDataUrl} alt="QR Code" className="w-16 h-16 mx-auto" />
                        <span className="text-[10px] font-mono text-slate-500 block mt-0.5">{drugInfo.qrPayload}</span>
                      </div>
                    )}
                  </div>

                  {/* 3-Box Hybrid Inventory Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Box 1: Main Store */}
                    <div className="p-3.5 rounded-xl bg-emerald-50/90 border-2 border-emerald-400">
                      <div className="text-xs font-bold text-emerald-800 flex items-center justify-between">
                        <span>📦 1. คงเหลือคลังยาใน</span>
                        <span className="text-[10px] bg-emerald-200/80 text-emerald-900 px-1.5 py-0.5 rounded">Stock Card คลังใน</span>
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-emerald-900 mt-1 font-mono">
                        {(drugInfo.hybridSummary?.mainStoreBalance ?? 0).toLocaleString()}
                        <span className="text-xs font-semibold text-emerald-700 ml-1">{mainUnit}</span>
                      </div>
                      {isRepackaged && (
                        <div className="text-xs font-bold text-emerald-800 font-mono mt-0.5">
                          (= {((drugInfo.hybridSummary?.mainStoreBalance ?? 0) * factor).toLocaleString()} {counterUnit})
                        </div>
                      )}
                      <div className="text-[11px] text-emerald-700 mt-1">
                        รับเข้า {(drugInfo.hybridSummary?.broughtForward + drugInfo.hybridSummary?.totalReceived).toLocaleString()} − เบิกออก {(drugInfo.hybridSummary?.totalTransferredToCounter ?? 0).toLocaleString()} {mainUnit}
                      </div>
                    </div>

                    {/* Box 2: Counter Stock */}
                    <div className="p-3.5 rounded-xl bg-blue-50/90 border border-blue-300">
                      <div className="text-xs font-bold text-blue-800 flex items-center justify-between">
                        <span>💊 2. หน้าเคาน์เตอร์จ่ายยา</span>
                        <span className="text-[10px] bg-blue-200/80 text-blue-900 px-1.5 py-0.5 rounded">ตัดจ่าย JHCIS</span>
                      </div>
                      <div className={`text-2xl sm:text-3xl font-black mt-1 font-mono ${
                        (drugInfo.hybridSummary?.counterBalance ?? 0) < 0 ? 'text-rose-600' : 'text-blue-900'
                      }`}>
                        {(drugInfo.hybridSummary?.counterBalance ?? 0).toLocaleString()}
                        <span className="text-xs font-semibold text-blue-700 ml-1">{counterUnit}</span>
                      </div>
                      <div className="text-[11px] text-blue-700 mt-1">
                        เบิกมาเคาน์เตอร์ {(drugInfo.hybridSummary?.totalTransferredToCounter ?? 0).toLocaleString()} {mainUnit}{isRepackaged ? ` (= ${(drugInfo.hybridSummary?.totalTransferredToCounter * factor).toLocaleString()} ${counterUnit})` : ''} − จ่าย JHCIS {(drugInfo.hybridSummary?.totalDispensed ?? 0).toLocaleString()} {counterUnit}
                      </div>
                    </div>

                    {/* Box 3: Total PCU */}
                    <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-300">
                      <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>🏥 3. รวมทั้ง รพ.สต.</span>
                        <span className="text-[10px] bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded">คลังใน + เคาน์เตอร์</span>
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1 font-mono">
                        {(drugInfo.hybridSummary?.totalPcuBalance ?? 0).toLocaleString()}
                        <span className="text-xs font-semibold text-slate-600 ml-1">{counterUnit}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1">
                        ยอดรวมคงเหลือจริงทั้งหน่วยงาน
                      </div>
                    </div>
                  </div>

                  {isRepackaged && (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start space-x-2">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-extrabold text-amber-950">📦 ยาบรรจุในคลังยาในเป็น {mainUnit} 500g</div>
                        <div className="text-slate-700 mt-0.5">
                          ระบบบันทึกสต็อกคลังในเป็น <strong>{mainUnit}</strong> เมื่อเบิก 1 {mainUnit} จะนำมาแบ่งบรรจุใส่{counterUnit} 10g ที่เคาน์เตอร์ได้ <strong className="font-mono text-amber-900">{factor}</strong> {counterUnit} สำหรับตัดจ่ายคนไข้ใน JHCIS
                        </div>
                      </div>
                    </div>
                  )}

                  {isFloorStock && (
                    <div className="p-3 bg-sky-50 border border-sky-300 rounded-xl text-xs text-sky-950 flex items-start space-x-2.5">
                      <span className="text-xl">💉</span>
                      <div className="space-y-0.5">
                        <div className="font-black text-sky-900">
                          ยาหัตถการใช้ในห้องทำแผล / อุบัติเหตุฉุกเฉิน (Floor Stock):
                        </div>
                        <p className="text-sky-850 leading-relaxed text-[11px]">
                          เบิกออกจากคลังยาในเป็น <strong>{mainUnit} (20 ml)</strong> เพื่อนำมาใช้ในห้องทำแผล (เย็บแผล, ถอดเล็บ, ผ่าฝี) ดูดฉีด 3-5 ml ต่อเคส ไม่ได้จ่ายให้ผู้ป่วยกลับบ้าน 
                          ระบบจะตัดสต็อกคลังในตามจำนวน{mainUnit}ที่เบิกไปห้องทำแผลจริง เพื่อไม่ให้ยอดคลาดเคลื่อนจากการบันทึกจ่ายรายเคสใน JHCIS
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Lot Selection List in Main Store */}
                  <div className="pt-2 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-emerald-600" />
                        <span>รายการ Lot ที่คงเหลือในคลังยาใน (คลิกเลือก Lot ที่ต้องการหยิบเบิก)</span>
                      </h3>
                      <span className="text-[11px] text-emerald-700 font-semibold">เรียงตาม FEFO (หมดอายุก่อนขึ้นก่อน)</span>
                    </div>

                    {(!drugInfo.mainStoreLots || drugInfo.mainStoreLots.length === 0) ? (
                      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                        ยังไม่มีข้อมูล Lot รับเข้าในคลังยาใน — ท่านยังสามารถกรอกเลข Lot และจำนวนที่เบิกด้านขวามือได้ทันที
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {drugInfo.mainStoreLots.map((lot, idx) => {
                          const rem = Number(lot.remaining) || 0;
                          const isSelected = selectedLot === lot.lotno;
                          const isFirstAvailable = rem > 0 && drugInfo.mainStoreLots.findIndex(l => Number(l.remaining) > 0) === idx;

                          return (
                            <div
                              key={`${lot.lotno}_${idx}`}
                              onClick={() => {
                                setSelectedLot(lot.lotno || 'N/A');
                                setSelectedExp(lot.dateexpire && lot.dateexpire !== 'ไม่ระบุ' ? lot.dateexpire : '');
                              }}
                              className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                                  : rem <= 0
                                  ? 'border-slate-200 bg-slate-50 opacity-60'
                                  : 'border-slate-200 hover:border-emerald-400 bg-white'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="radio"
                                    checked={isSelected}
                                    onChange={() => {
                                      setSelectedLot(lot.lotno || 'N/A');
                                      setSelectedExp(lot.dateexpire && lot.dateexpire !== 'ไม่ระบุ' ? lot.dateexpire : '');
                                    }}
                                    className="text-emerald-600 focus:ring-emerald-500"
                                  />
                                  <span className="font-mono font-extrabold text-xs sm:text-sm text-slate-900">
                                    Lot: {lot.lotno}
                                  </span>
                                </div>
                                {isFirstAvailable && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                                    แนะนำ FEFO
                                  </span>
                                )}
                              </div>

                              <div className="mt-2 space-y-1 text-xs">
                                <div className="flex justify-between text-slate-600">
                                  <span>วันหมดอายุ (Exp):</span>
                                  <span className="font-mono font-bold text-slate-900">{lot.dateexpire || 'ไม่ระบุ'}</span>
                                </div>
                                <div className="flex justify-between text-slate-500">
                                  <span>จำนวนตั้งต้น:</span>
                                  <span className="font-mono">{Number(lot.amount).toLocaleString()} {mainUnit}</span>
                                </div>
                                <div className="flex justify-between items-center pt-1 border-t border-slate-200/70">
                                  <span className="font-bold text-slate-700">เหลือในคลังใน:</span>
                                  <span className={`font-mono text-sm font-black ${rem > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    {rem.toLocaleString()} {mainUnit}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Requisition Form (กรอกจำนวนเบิกออกวางเคาน์เตอร์) */}
              <div className="lg:col-span-5 space-y-4">
                <form onSubmit={handleWithdrawSubmit} className="bg-white rounded-2xl border-2 border-emerald-500/80 p-5 shadow-md space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                        <ArrowRight className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                          บันทึกเบิกยาออกวางหน้าเคาน์เตอร์
                        </h3>
                        <p className="text-[11px] text-slate-500">หักออกจากคลังยาใน $\rightarrow$ เติมเข้าจุดจ่ายยาเคาน์เตอร์</p>
                      </div>
                    </div>
                  </div>

                  {/* Selected Lot & Exp */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Lot ที่เบิกออก *
                      </label>
                      <input
                        type="text"
                        required
                        value={selectedLot}
                        onChange={(e) => setSelectedLot(e.target.value)}
                        placeholder="เลข Lot..."
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 bg-slate-50 focus:bg-white focus:outline-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        วันหมดอายุ (Exp)
                      </label>
                      <input
                        type="date"
                        value={selectedExp}
                        onChange={(e) => setSelectedExp(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 bg-slate-50 focus:bg-white focus:outline-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Quick Preset Quantity Buttons */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        จำนวนที่เบิกไปเคาน์เตอร์ ({mainUnit}) *
                      </label>
                      {currentSelectedLotObj && (
                        <span className="text-[11px] font-semibold text-emerald-700">
                          Lot นี้เหลือ: {Number(currentSelectedLotObj.remaining || 0).toLocaleString()} {mainUnit}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {presetValues.map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setWithdrawAmount(String(preset))}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer ${
                            Number(withdrawAmount) === preset
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-100 hover:bg-emerald-50 text-slate-800 border-slate-200'
                          }`}
                        >
                          +{preset.toLocaleString()} {(isRepackaged || isFloorStock) ? mainUnit : ''}
                        </button>
                      ))}
                      {currentSelectedLotObj && Number(currentSelectedLotObj.remaining) > 0 && (
                        <button
                          type="button"
                          onClick={() => setWithdrawAmount(String(currentSelectedLotObj.remaining))}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 cursor-pointer"
                        >
                          ยกทั้ง Lot ({Number(currentSelectedLotObj.remaining).toLocaleString()})
                        </button>
                      )}
                    </div>

                    <input
                      type="number"
                      min="1"
                      step="any"
                      required
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder={`ระบุจำนวน (${mainUnit})...`}
                      className="w-full px-4 py-3 border-2 border-emerald-500 rounded-xl text-xl font-mono font-black text-emerald-950 bg-emerald-50/30 focus:bg-white focus:outline-none"
                    />

                    {isRepackaged && (
                      <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-300 text-xs text-center text-emerald-950 shadow-2xs mt-2">
                        👉 เบิก <strong className="font-mono text-sm">{withdrawAmount || 0}</strong> {mainUnit} → จะได้รับ <strong className="font-mono text-emerald-700 text-sm">{(Number(withdrawAmount || 0) * factor).toLocaleString()}</strong> {counterUnit} วางพร้อมจ่ายที่เคาน์เตอร์
                      </div>
                    )}
                  </div>

                  {/* Date & Note */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">วันที่เบิก</label>
                      <input
                        type="date"
                        value={withdrawDate}
                        onChange={(e) => setWithdrawDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">หมายเหตุ</label>
                      <input
                        type="text"
                        value={withdrawNote}
                        onChange={(e) => setWithdrawNote(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50"
                      />
                    </div>
                  </div>

                  {/* Preview After Withdrawal */}
                  {Number(withdrawAmount) > 0 && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                      <div className="font-bold text-slate-700">ผลลัพธ์หลังกดยืนยันเบิก:</div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">📦 คลังยาในจะเหลือ:</span>
                        <span className="font-mono font-black text-emerald-700">
                          {((drugInfo.hybridSummary?.mainStoreBalance ?? 0) - Number(withdrawAmount)).toLocaleString()} {mainUnit}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">💊 หน้าเคาน์เตอร์จะมีพร้อมจ่าย:</span>
                        <span className="font-mono font-black text-blue-700">
                          {((drugInfo.hybridSummary?.counterBalance ?? 0) + (Number(withdrawAmount) * factor)).toLocaleString()} {counterUnit}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-1 flex flex-col gap-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white rounded-xl text-sm font-extrabold shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      <span>{submitting ? 'กำลังบันทึกตัดคลังยาใน...' : `ยืนยันเบิกออกวางเคาน์เตอร์ (ตัดคลังยาใน ${withdrawAmount ? `${withdrawAmount} ${mainUnit}` : ''})`}</span>
                    </button>

                    {onOpenStockCard && (
                      <button
                        type="button"
                        onClick={() => onOpenStockCard(drugInfo.drug.drugcode)}
                        className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
                      >
                        <FileText className="w-4 h-4 text-emerald-600" />
                        <span>เปิดดูใบ Stock Card คลังยาในของยานี้</span>
                      </button>
                    )}
                  </div>
                </form>

                {/* Recent Transfers for this drug */}
                {drugInfo.recentTransfers && drugInfo.recentTransfers.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-emerald-600" />
                      <span>ประวัติการเบิกยานี้ออกวางเคาน์เตอร์ล่าสุด</span>
                    </h4>
                    <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto text-xs">
                      {drugInfo.recentTransfers.map(t => (
                        <div key={t.id} className="py-2 flex items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold text-slate-800">
                              <span className="font-mono text-emerald-700 font-bold">-{t.amount.toLocaleString()}</span> {t.mainStoreUnit || mainUnit}
                              {(Number(t.conversionFactor) > 1 || factor > 1) && (
                                <span className="text-[11px] text-blue-700 font-medium ml-1">
                                  (→ +{(t.counterYield || (t.amount * (Number(t.conversionFactor) || factor))).toLocaleString()} {t.counterUnit || counterUnit})
                                </span>
                              )}
                              {' '}(Lot: <span className="font-mono">{t.lotno}</span>)
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {t.date} {t.time} • โดย {t.dispensedBy}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteTransfer(t)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="ยกเลิกรายการเบิกนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
            );
          })() : (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <QrCode className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">พร้อมสแกน QR Code เบิกยาจากคลังยาใน</h3>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">
                กดปุ่ม <strong>"📱 เชื่อมต่อมือถือ (Wi-Fi วงแลน รพ.สต.)"</strong> ด้านบนเพื่อใช้มือถือเดินสแกนป้าย QR ที่ชั้นวางยาในคลังยาใน หรือพิมพ์ค้นหาชื่อยาในช่องด้านบนได้เลยครับ
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: พิมพ์สติกเกอร์ QR Code ติดหน้าชั้นวางยาในคลังยาใน                */}
      {/* ===================================================================== */}
      {activeSubTab === 'labels' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 no-print">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={qrSearch}
                  onChange={(e) => setQrSearch(e.target.value)}
                  placeholder="กรองชื่อยา หรือรหัสยา..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div className="flex items-center space-x-1.5 text-xs">
                <span className="font-bold text-slate-700">รูปแบบ QR:</span>
                <select
                  value={qrFormat}
                  onChange={(e) => setQrFormat(e.target.value)}
                  className="border-2 border-emerald-500 rounded-lg px-2.5 py-1.5 bg-emerald-50/40 text-emerald-950 font-bold text-xs focus:outline-none"
                >
                  <option value="lan_url">📶 1. ลิงก์ Wi-Fi วงแลน ({mobileBridge?.primaryLanUrl || 'http://192.168.x.x:5000'}/m/... สแกนบนมือถือเบิกได้ทันที)</option>
                  <option value="standard">🏷️ 2. รหัสมาตรฐาน JHCIS-DRUG (JHCIS-DRUG:รหัสยา สำหรับเครื่องยิงบาร์โค้ด USB 2D)</option>
                </select>
              </div>

              <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyWithStock}
                  onChange={(e) => setOnlyWithStock(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>เฉพาะยาที่มีสต็อกคลังใน (&gt; 0)</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadQrCodes(qrSearch, qrFormat)}
                className="px-3 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 flex items-center space-x-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>รีเฟรช</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>พิมพ์ป้าย QR Code ({filteredQrList.length} รายการ)</span>
              </button>
            </div>
          </div>

          {loadingQr ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">
              กำลังสร้างป้าย QR Code สำหรับทะเบียนยา JHCIS...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 print:grid-cols-3 print:gap-2">
              {filteredQrList.map(item => (
                <div
                  key={item.drugcode}
                  className="bg-white rounded-xl border border-slate-300 p-3 flex items-center gap-3 shadow-2xs break-inside-avoid"
                >
                  {item.qrDataUrl && (
                    <img src={item.qrDataUrl} alt={item.drugcode} className="w-20 h-20 shrink-0 border border-slate-100 rounded p-0.5" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-mono text-[11px] font-black px-1.5 py-0.2 bg-slate-900 text-white rounded">
                        JHCIS: {item.drugcode}
                      </span>
                      {item.hosdrugcode && (
                        <span className="font-mono text-[10px] font-bold px-1 py-0.2 bg-slate-100 text-slate-700 rounded border border-slate-200">
                          รพ.: {item.hosdrugcode}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-extrabold text-slate-900 line-clamp-2 leading-snug" title={item.drugname}>
                      {item.drugname}
                    </div>
                    <div className="text-[11px] text-slate-600 flex items-center justify-between flex-wrap gap-1">
                      <span>คลังใน: <strong className="text-emerald-700 font-mono">{Number(item.mainStoreBalance || 0).toLocaleString()}</strong> {item.mainStoreUnit || item.drugunit}</span>
                      {Number(item.conversionFactor) > 1 && (
                        <span className="text-[10px] text-amber-800 font-bold bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                          1 {item.mainStoreUnit || 'กระปุก'} = {item.conversionFactor} {item.counterUnit || 'ตลับ'}
                        </span>
                      )}
                    </div>
                    <div className="pt-1 no-print">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSubTab('scan');
                          handleLookupDrug(item.drugcode);
                        }}
                        className="w-full py-1 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        สแกน/เบิกยานี้
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: ประวัติการเบิกยาจากคลังยาในออกวางหน้าเคาน์เตอร์                  */}
      {/* ===================================================================== */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="ค้นหาเลขใบเบิก, ชื่อยา, รหัสยา หรือ Lot No..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white"
              />
            </div>
            <button
              type="button"
              onClick={loadTransferHistory}
              className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 flex items-center space-x-1.5 self-end sm:self-auto cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>รีเฟรชประวัติ</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">วัน-เวลาที่เบิก</th>
                    <th className="py-3 px-4">เลขที่อ้างอิง</th>
                    <th className="py-3 px-4">รหัสยา</th>
                    <th className="py-3 px-4">ชื่อรายการยา</th>
                    <th className="py-3 px-4">Lot No.</th>
                    <th className="py-3 px-4">วันหมดอายุ</th>
                    <th className="py-3 px-4 text-right">จำนวนเบิกไปเคาน์เตอร์</th>
                    <th className="py-3 px-4">ผู้เบิก</th>
                    <th className="py-3 px-4 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400">กำลังโหลดประวัติการเบิกยาคลังใน...</td>
                    </tr>
                  ) : filteredTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400">ยังไม่มีประวัติการสแกนเบิกยาจากคลังในไปเคาน์เตอร์</td>
                    </tr>
                  ) : (
                    filteredTransfers.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                          {t.date} <span className="text-[10px] text-slate-400">{t.time || ''}</span>
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-700 whitespace-nowrap">{t.transferNo}</td>
                        <td className="py-2.5 px-4 font-mono font-bold text-emerald-700">{t.drugcode}</td>
                        <td className="py-2.5 px-4 font-semibold text-slate-900">{t.drugname}</td>
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-800">{t.lotno || '-'}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">{t.dateexpire || '-'}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-black text-emerald-700">
                          {Number(t.amount).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{t.dispensedBy || '-'}</td>
                        <td className="py-2.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteTransfer(t)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="ยกเลิกรายการเบิกนี้ (คืนยอดเข้าคลังยาใน)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: เชื่อมต่อมือถือผ่าน Wi-Fi วงแลน รพ.สต. (LAN Mode)                */}
      {/* ===================================================================== */}
      {showMobileModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 no-print">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Wifi className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                    เชื่อมต่อมือถือสแกนเบิกยาคลังใน (Wi-Fi วงแลน รพ.สต.)
                  </h3>
                  <p className="text-xs text-slate-500">
                    เชื่อมต่อมือถือเข้า Wi-Fi เดียวกันกับคอมพิวเตอร์ห้องยา แล้วสแกน QR Code ครั้งเดียวเพื่อเปิดระบบ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 sm:p-5">
              {mobileBridge?.primaryLanUrl ? (
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  {mobileBridge.lanQrDataUrl && (
                    <div className="bg-white p-3.5 rounded-2xl border-2 border-emerald-500 shadow-sm shrink-0 text-center">
                      <img
                        src={mobileBridge.lanQrDataUrl}
                        alt="LAN Mobile QR"
                        className="w-48 h-48 mx-auto"
                      />
                      <span className="text-[11px] font-bold text-emerald-800 block mt-1.5">
                        สแกนด้วยกล้องมือถือ / LINE
                      </span>
                    </div>
                  )}

                  <div className="space-y-3 flex-1 min-w-0">
                    <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Wi-Fi วงแลนเดียวกัน (ไม่ต้องออกอินเทอร์เน็ตนอก)</span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs font-bold text-slate-700">ลิงก์เข้าสู่ระบบผ่าน Wi-Fi วงแลน:</div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly
                          value={mobileBridge.lanConnectUrl || mobileBridge.primaryLanUrl}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-xs text-emerald-800 font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopyUrl(mobileBridge.lanConnectUrl || mobileBridge.primaryLanUrl)}
                          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shrink-0 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedLink ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
                        </button>
                      </div>
                    </div>

                    <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside bg-white p-3 rounded-xl border border-slate-200">
                      <li>
                        <strong>เชื่อมต่อ Wi-Fi:</strong> มือถือต้องเชื่อมต่อ Wi-Fi วงเดียวกับคอมพิวเตอร์เครื่องนี้
                      </li>
                      <li>
                        <strong>สแกนครั้งเดียว:</strong> ใช้แอปกล้องหรือ LINE บนมือถือสแกน QR Code ด้านซ้ายเพื่อเปิดระบบ
                      </li>
                      <li>
                        <strong>📌 ทำเป็นไอคอนแอปถาวร:</strong> บนมือถือให้แตะเมนูเบราว์เซอร์ แล้วเลือก <strong>"เพิ่มไปยังหน้าจอโฮม" (Add to Home Screen)</strong> จะได้ไอคอนแอปเปิดใช้งานได้ตลอดไป ไม่ต้องสแกนใหม่อีก
                      </li>
                      <li>
                        <strong>สแกนเบิกยาที่ชั้น:</strong> เมื่ออยู่ที่คลังยาใน สามารถใช้กล้องมือถือสแกนป้าย QR ยาที่ติดชั้นวาง เพื่อเปิดหน้าเบิกยานั้นๆ ได้ทันที!
                      </li>
                    </ol>

                    {Array.isArray(mobileBridge.lanAddresses) && mobileBridge.lanAddresses.length > 1 && (
                      <div className="text-[11px] text-slate-500 bg-slate-100 p-2 rounded-lg space-y-0.5">
                        <span className="font-bold text-slate-700">IP อื่นๆ ในเครื่องนี้: </span>
                        {mobileBridge.lanAddresses.slice(1).map(a => (
                          <span key={a.ip} className="mr-2 font-mono">
                            {a.ip} ({a.interfaceName})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-slate-500">
                  กำลังตรวจหา IP วงแลนของเครื่องคอมพิวเตอร์...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
