// fiscalYear.js — ปีงบประมาณไทย (ใช้ร่วมกันทุกหน้า)
// นิยาม: ปีงบประมาณ N = 1 ต.ค. (N−1) พ.ศ. → 30 ก.ย. N พ.ศ.
// เช่น ปีงบประมาณ 2570 = 1 ต.ค. 2569 (2026) – 30 ก.ย. 2570 (2027)
// ชื่อปีงบ = ปี "ที่สิ้นสุด" + 543 (มิฉะนั้นจะผิดไป 1 ปีในช่วง ต.ค.–ธ.ค.)

export function currentFiscalYear(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m >= 10) {
    // ต.ค.–ธ.ค.: อยู่ในปีงบที่เริ่มปีนี้ จบปีหน้า (ปีงบ = y+1+543)
    return { startDate: `${y}-10-01`, endDate: `${y + 1}-09-30`, label: `ปีงบ ${y + 1 + 543}` };
  }
  // ม.ค.–ก.ย.: อยู่ในปีงบที่เริ่มปีก่อน จบปีนี้ (ปีงบ = y+543)
  return { startDate: `${y - 1}-10-01`, endDate: `${y}-09-30`, label: `ปีงบ ${y + 543}` };
}

export function prevFiscalYear(now = new Date()) {
  const cur = currentFiscalYear(now);
  const start = new Date(cur.startDate);
  start.setFullYear(start.getFullYear() - 1);
  const end = new Date(cur.endDate);
  end.setFullYear(end.getFullYear() - 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end), label: `ปีงบ ${end.getFullYear() + 543}` };
}

// ปีที่สิ้นสุดงวด ณ วันที่นั้น แบบ พ.ศ. (ใช้ตั้งชื่อปุ่ม/ป้าย เช่น "ก.ย. - ต.ค. 69")
export function thaiYearShort(dateStr) {
  const y = new Date(dateStr).getFullYear() + 543;
  return String(y).slice(-2);
}
