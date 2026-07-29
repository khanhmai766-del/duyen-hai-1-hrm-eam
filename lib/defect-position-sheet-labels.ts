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
  // FGD có ba phạm vi: S1, S2 và phần dùng chung. Trên Sheet phần dùng chung
  // dùng nhãn riêng "FGD"; Tổ máy CHUNG mới là dữ liệu phân biệt phạm vi.
  "FGD": "FGD",
  "Trạm bơm nước thô": "30. VHV Trạm bơm nước thô",
  "NH3- Lò hơi phụ": "26. VHV NH3-LHP",
  "Thiết bị đo lường điều khiển": "29. VHV C&I",
  "XLNT": "25. VHV XLNT-ND5.",
  "XLN hỗn hợp": "24. VHV XLNHH",
  "Khí nén - Nhà dầu": "23. VHV MNK-ND3.",
};

function positionKey(value: string) {
  return normalizeText(value)
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^vhv\s+/, "")
    .replace(/\s+s[12]$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function exactLabel(
  labels: Record<string, string>,
  normalizedPosition: string
) {
  return Object.entries(labels)
    .find(([key]) => positionKey(key) === normalizedPosition)?.[1] ?? null;
}

// Tên cương vị trong dữ liệu nhân sự có thể dài hơn tên nghiệp vụ trên Sheet
// và khác giữa localhost/production. Các cụm dưới đây đủ đặc trưng để nhận diện,
// không phụ thuộc tiền tố "VHV" hoặc phần mô tả nhà dầu/trạm ở phía sau.
const DEFECT_SHEET_COMMON_POSITION_ALIASES: Array<{
  aliasGroups: string[][];
  label: string;
}> = [
  { aliasGroups: [["tram bom nuoc tho"]], label: "30. VHV Trạm bơm nước thô" },
  { aliasGroups: [["nh3"], ["lo hoi phu", "lhp"]], label: "26. VHV NH3-LHP" },
  { aliasGroups: [["thiet bi do luong dieu khien", "c i"]], label: "29. VHV C&I" },
  { aliasGroups: [["xln thai", "xlnt"], ["nha dau 5000", "nd5"]], label: "25. VHV XLNT-ND5." },
  { aliasGroups: [["xln hon hop", "xlnhh"]], label: "24. VHV XLNHH" },
  { aliasGroups: [["khi nen", "mnk nd3"]], label: "23. VHV MNK-ND3." },
];

/** Tra nhãn Sheet cho một cương vị nội bộ theo tổ máy đang chọn. Trả về null nếu chưa có ánh xạ. */
export function defectSheetPositionLabel(position: string | null | undefined, unit: string | null | undefined): string | null {
  if (!position) return null;
  const normalizedPosition = positionKey(position);
  const byUnitEntry = Object.entries(DEFECT_SHEET_POSITION_LABELS_BY_UNIT)
    .find(([key]) => positionKey(key) === normalizedPosition);
  if (unit === "S1" || unit === "S2") {
    const byUnit = byUnitEntry?.[1];
    if (byUnit) return byUnit[unit];
  }
  const shared = exactLabel(DEFECT_SHEET_POSITION_LABELS_SHARED, normalizedPosition);
  const common = exactLabel(DEFECT_SHEET_POSITION_LABELS_COMMON, normalizedPosition);
  if (shared || common) return shared ?? common;
  if (unit !== "COMMON") return null;
  return DEFECT_SHEET_COMMON_POSITION_ALIASES.find((rule) =>
    rule.aliasGroups.every((aliases) =>
      aliases.some((alias) => normalizedPosition.includes(alias))
    )
  )?.label ?? null;
}
