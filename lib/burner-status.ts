// Dẫn xuất trạng thái HIỂN THỊ của vòi đốt từ dữ liệu thô — dùng chung cho: tô màu
// ô trên board, đếm 4 thẻ tổng, panel chi tiết → board và số liệu luôn khớp nhau.
// Thích ứng đúng field của model OilGun hiện tại (status String, defectSccn/defectScd,
// forceFlame; lớp than: coalStatus String + coalDefectNote 1 ô).

export type Layer = "oil" | "coal";
export type DisplayStatus = "available" | "defect" | "unavailable";

export interface BurnerRow {
  code?: string;
  status?: string | null;
  defectSccn?: string | null;
  defectScd?: string | null;
  forceFlame?: boolean | null;
  coalStatus?: string | null;
  coalDefectNote?: string | null;
}

const hasText = (s?: string | null) => !!s && s.trim().length > 0;

// Vòi dầu — đúng 4 case: (4) không khả dụng → đỏ; (3) có SCCN/SCĐ → cam; (1) khả dụng
// sạch, không tick → xanh; (2) khả dụng sạch + tick → xanh nhưng hiện 🔥 thay chấm.
export function deriveOil(r: BurnerRow): { status: DisplayStatus; showFire: boolean } {
  if (r.status === "unavailable") return { status: "unavailable", showFire: false };
  if (hasText(r.defectSccn) || hasText(r.defectScd)) return { status: "defect", showFire: false };
  return { status: "available", showFire: !!r.forceFlame };
}

// Vòi than — không có khái niệm force nên showFire luôn false; khiếm khuyết gộp 1 ô.
export function deriveCoal(r: BurnerRow): { status: DisplayStatus; showFire: boolean } {
  if (r.coalStatus === "unavailable") return { status: "unavailable", showFire: false };
  if (hasText(r.coalDefectNote)) return { status: "defect", showFire: false };
  return { status: "available", showFire: false };
}

export function derive(r: BurnerRow, layer: Layer) {
  return layer === "oil" ? deriveOil(r) : deriveCoal(r);
}

// Đếm 4 thẻ tổng theo lớp đang chọn (dùng chính logic derive để không lệch số với màu ô).
export function summarizeBurners(rows: BurnerRow[], layer: Layer) {
  const counts = { total: rows.length, available: 0, defective: 0, unavailable: 0 };
  for (const r of rows) {
    const s = derive(r, layer).status;
    if (s === "available") counts.available++;
    else if (s === "defect") counts.defective++;
    else counts.unavailable++;
  }
  return counts;
}
