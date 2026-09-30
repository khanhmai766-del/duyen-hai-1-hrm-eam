// Hạng mục đại tu trên PCT nhà thầu · Đại tu — phần dùng chung server/client (không import prisma).

/** 4 file Google Sheets tiến độ đại tu; khoá = hậu tố biến môi trường OVERHAUL_SHEET_URL_<khoá>. */
export const OVERHAUL_SOURCES = { LO: "Lò", TURBINE: "Turbine", DIEN: "Điện", CI: "C&I" } as const;
export type OverhaulSource = keyof typeof OVERHAUL_SOURCES;

/** Ảnh chụp một hạng mục lưu trên phiếu (WorkPermit.overhaulItems) và in ra phụ lục. */
export type OverhaulItemSnapshot = {
  code: string;
  device: string;
  content: string;
  method: string;
  source: string;
  sheet: string;
};

/** Hạng mục gợi ý do API trả về. */
export type OverhaulItemOption = OverhaulItemSnapshot & {
  id: string;
  positionTitle: string;
  percent: string;
  status: string;
};

/** So mã hạng mục theo từng số: 1.2 < 1.10 < 2.1; phần không phải số so theo chữ. */
export function compareOverhaulCodes(a: string, b: string) {
  const left = a.split(/[.\s]+/), right = b.split(/[.\s]+/);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i], y = right[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = Number(x), ny = Number(y);
    const diff = Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x.localeCompare(y, "vi");
    if (diff) return diff;
  }
  return 0;
}

export function overhaulItemsOf(value: unknown): OverhaulItemSnapshot[] {
  return Array.isArray(value) ? value.filter((item): item is OverhaulItemSnapshot => !!item && typeof item === "object" && typeof (item as OverhaulItemSnapshot).code === "string") : [];
}

/**
 * Câu điền sẵn vào "Nội dung công việc": chi tiết từng mã nằm ở phụ lục in kèm, trên phiếu chỉ ghi mã.
 * Cùng một thiết bị → "Đại tu <thiết bị> theo hạng mục 1.1.1, 1.1.2"; nhiều thiết bị → liệt kê mã.
 */
/** "Van đầu vào…" → "van đầu vào…" để ghép giữa câu; giữ nguyên chữ viết tắt ("ESP 1", "IDF"). */
function lowerFirst(text: string) {
  const [first, second] = [...text];
  return first && second && second === second.toLowerCase() && second !== second.toUpperCase() ? first.toLowerCase() + text.slice(first.length) : text;
}

export function overhaulContentText(items: Pick<OverhaulItemSnapshot, "code" | "device">[]) {
  if (!items.length) return "";
  const codes = [...new Set(items.map(item => item.code))].sort(compareOverhaulCodes).join(", ");
  const devices = [...new Set(items.map(item => item.device.trim()).filter(Boolean))];
  if (devices.length === 1) return `Đại tu ${lowerFirst(devices[0])} theo hạng mục ${codes}`;
  return `Thực hiện đại tu theo hạng mục ${codes}`;
}
