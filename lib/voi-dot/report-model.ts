// Chuẩn hoá dữ liệu 36 vị trí thành "report model" dùng chung cho cả 2 bộ xuất
// (Excel + PDF). Logic trạng thái/force tái dùng từ lib/burner-status.ts để KHÔNG
// lặp lại — thích ứng đúng field model OilGun thật (defectSccn/defectScd/coalStatus/
// coalDefectNote, DisplayStatus dạng thường available|defect|unavailable).

import { deriveOil, deriveCoal, type BurnerRow, type DisplayStatus } from "@/lib/burner-status";

// Thứ tự vị trí theo đúng sơ đồ web (tường sau: D1…C1 | tường trước: C4…D4).
export const BACK  = ["D1","E1","F1","D2","E2","F2","D3","E3","F3","A3","B3","C3","A2","B2","C2","A1","B1","C1"] as const;
export const FRONT = ["C4","B4","A4","C5","B5","A5","C6","B6","A6","F6","E6","D6","F5","E5","D5","F4","E4","D4"] as const;

export interface ReportCell {
  code: string;
  status: DisplayStatus;     // trạng thái HIỂN THỊ vòi dầu (màu header)
  coalStatus: DisplayStatus; // trạng thái HIỂN THỊ vòi than (màu hàng than)
  force: boolean;            // chỉ true khi khả dụng + không khiếm khuyết + tick force
  oilText: string;           // nội dung ô "Khiếm khuyết vòi dầu"
  coalText: string;          // nội dung ô "Khiếm khuyết vòi than" ("" nếu không có)
}

export interface UnitReport {
  unit: string;  // "S1" | "S2"
  note: string;  // ghi chú hiển thị ở ô bên phải
  back: ReportCell[];
  front: ReportCell[];
}

const hasText = (s?: string | null) => !!s && s.trim().length > 0;

function toCell(row: BurnerRow): ReportCell {
  const oil = deriveOil(row);
  const coal = deriveCoal(row);
  const oilText =
    [row.defectSccn, row.defectScd].filter(hasText).map((s) => s!.trim()).join(" / ") ||
    (oil.status === "unavailable" ? "Bất khả dụng." : "Khả dụng.");
  const coalText = hasText(row.coalDefectNote)
    ? row.coalDefectNote!.trim()
    : coal.status === "unavailable"
      ? "Bất khả dụng."
      : "";
  return {
    code: row.code ?? "",
    status: oil.status,
    coalStatus: coal.status,
    force: oil.showFire,
    oilText,
    coalText,
  };
}

export function buildUnitReport(rows: BurnerRow[], unit: string, note: string): UnitReport {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const pick = (codes: readonly string[]): ReportCell[] =>
    codes.map((code) => {
      const r = byCode.get(code);
      // Thiếu dữ liệu vị trí → coi như khả dụng rỗng để không vỡ bố cục.
      return r
        ? toCell(r)
        : { code, status: "available", coalStatus: "available", force: false, oilText: "Khả dụng.", coalText: "" };
    });
  return { unit, note, back: pick(BACK), front: pick(FRONT) };
}
