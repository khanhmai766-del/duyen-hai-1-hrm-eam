import { normalizeText } from "@/lib/nav";

// Ánh xạ Cương vị nội bộ (Defect.system, khớp User.position để giữ nguyên phân
// quyền hiện có) → nhãn hiển thị đúng theo dropdown "Cương vị" trên Google Sheet.
//
// Chỉ dùng khi GHI ra Sheet (đồng bộ hai chiều — chưa triển khai). Không dùng để
// đọc/ghi đè Cương vị nội bộ, không dùng cho phân quyền.

/** Cương vị phân theo tổ máy — Sheet có nhãn riêng cho S1 và S2. */
export const DEFECT_SHEET_POSITION_LABELS_BY_UNIT: Record<string, { S1: string; S2: string }> = {
  "Lò Phó": { S1: "12. Lò phó S1", S2: "13. Lò phó S2" },
  "Máy Trưởng": { S1: "4. Máy trưởng S1", S2: "5. Máy trưởng S2" },
  "Máy Phó": { S1: "6. Máy phó S1", S2: "7. Máy phó S2" },
  "Trợ Thủ": { S1: "8. Trợ thủ S1", S2: "9. Trợ thủ S2" },
  "Lò Trưởng": { S1: "10. Lò trưởng S1", S2: "11. Lò trưởng S2" },
  "Máy Nghiền": { S1: "14. Máy nghiền S1", S2: "15. Máy nghiền S2" },
  "ESP": { S1: "16. ESP S1", S2: "17. ESP S2" },
  "FGD": { S1: "18. FGD S1", S2: "19. FGD S2" },
  "Thải Xỉ": { S1: "20. Thải xỉ S1", S2: "21. Thải xỉ S2" },
};

/** Cương vị dùng chung một nhãn bất kể tổ máy S1/S2. */
export const DEFECT_SHEET_POSITION_LABELS_SHARED: Record<string, string> = {
  "TK Lò máy": "2. Trưởng kíp lò máy",
  "Trưởng kíp điện": "3. Trưởng kíp điện",
  "Trực chính điện": "27. Trực chính điện",
  "Trực phụ điện": "28. Trực phụ điện",
  "Trạm bơm tuần hoàn": "22. VHV TBTH",
  "Trưởng ca": "1. Trưởng ca",
};

/** Cương vị chỉ áp dụng cho tổ máy COMMON (bao gồm cả 2 nhánh BOP/CHUNG). */
export const DEFECT_SHEET_POSITION_LABELS_COMMON: Record<string, string> = {
  "Trạm bơm nước thô": "30. VHV Trạm bơm nước thô",
  "NH3- Lò hơi phụ": "26. VHV NH3-LHP",
  "Thiết bị đo lường điều khiển": "29. VHV C&I",
  "XLNT": "25. VHV XLNT-ND5.",
  "XLN hỗn hợp": "24. VHV XLNHH",
  "Khí nén - Nhà dầu": "23. VHV MNK-ND3.",
};

/** Tra nhãn Sheet cho một cương vị nội bộ theo tổ máy đang chọn. Trả về null nếu chưa có ánh xạ. */
export function defectSheetPositionLabel(position: string | null | undefined, unit: string | null | undefined): string | null {
  if (!position) return null;
  const normalizedPosition = normalizeText(position);
  const byUnitEntry = Object.entries(DEFECT_SHEET_POSITION_LABELS_BY_UNIT)
    .find(([key]) => normalizeText(key) === normalizedPosition);
  if (unit === "S1" || unit === "S2") {
    const byUnit = byUnitEntry?.[1];
    if (byUnit) return byUnit[unit];
  }
  const shared = Object.entries(DEFECT_SHEET_POSITION_LABELS_SHARED)
    .find(([key]) => normalizeText(key) === normalizedPosition)?.[1];
  const common = Object.entries(DEFECT_SHEET_POSITION_LABELS_COMMON)
    .find(([key]) => normalizeText(key) === normalizedPosition)?.[1];
  return shared ?? common ?? null;
}
