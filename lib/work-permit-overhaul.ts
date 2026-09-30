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

/**
 * Bảng "Tiến độ đại tu" trên sổ PCT: 4 link Google Sheets theo dõi tiến độ, sửa được tiêu đề + link
 * (lưu RbacConfig key OVERHAUL_SCHEDULE_CONFIG_KEY). Danh sách dòng cố định theo `id`; giá trị ở đây là mặc định.
 */
export const OVERHAUL_SCHEDULE_CONFIG_KEY = "work-permit-overhaul-schedules";
export const OVERHAUL_SCHEDULE_DEFAULTS = [
  // STT 0 (đứng đầu, đánh số từ 0): file lọc dữ liệu hạng mục thô, nguồn chung cho các file tiến độ bên dưới.
  { id: "RAW_FILTER", title: "Lọc dữ liệu hạng mục thô", url: "" },
  { id: "BOILER", title: "Tiến độ Lò hơi", url: "https://docs.google.com/spreadsheets/d/1iQhTAx2QveGGpgZWCzuZh6-4Fcuaz4ju7J7xQLC39fs/edit?gid=2093533043#gid=2093533043" },
  { id: "TURBINE", title: "Tiến độ Turbine", url: "" },
  { id: "GENERATOR", title: "Tiến độ Máy phát", url: "" },
  { id: "CI", title: "Tiến độ C&I", url: "" },
] as const;
export type OverhaulScheduleId = (typeof OVERHAUL_SCHEDULE_DEFAULTS)[number]["id"];
export type OverhaulScheduleLink = { id: OverhaulScheduleId; title: string; url: string; updatedAt: string | null; updatedBy: string | null };
export const OVERHAUL_SCHEDULE_TITLE_MAX = 120;
export const OVERHAUL_SCHEDULE_URL_MAX = 1000;

/** Link hợp lệ: rỗng (chưa có) hoặc http(s) đầy đủ. Trả câu lỗi tiếng Việt, null = hợp lệ. */
export function overhaulScheduleUrlError(url: string) {
  if (!url) return null;
  if (url.length > OVERHAUL_SCHEDULE_URL_MAX) return `Link tối đa ${OVERHAUL_SCHEDULE_URL_MAX} ký tự`;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? null : "Link phải bắt đầu bằng https://";
  } catch {
    return "Link không hợp lệ — dán nguyên đường dẫn chia sẻ của Google Sheets (https://docs.google.com/…)";
  }
}
