// Hạng mục đại tu trên PCT nhà thầu · Đại tu — phần dùng chung server/client (không import prisma).

/**
 * Nguồn hạng mục = dòng 1–4 của bảng "Tiến độ đại tu" (cùng `id` với OVERHAUL_SCHEDULE_DEFAULTS); link lấy từ bảng.
 * Dòng 0 "Lọc dữ liệu hạng mục thô" KHÔNG phải nguồn gợi ý.
 */
export const OVERHAUL_SOURCES = { BOILER: "Lò hơi", TURBINE: "Turbine", GENERATOR: "Máy phát", CI: "C&I" } as const;
export type OverhaulSource = keyof typeof OVERHAUL_SOURCES;
/** Loại PCT khi tên tab không có đuôi Cơ/Điện: file Máy phát và C&I toàn PCT Điện; Lò/Turbine bắt buộc có đuôi. */
export const OVERHAUL_SOURCE_DEFAULT_KIND: Partial<Record<OverhaulSource, "MECHANICAL" | "ELECTRICAL">> = { GENERATOR: "ELECTRICAL", CI: "ELECTRICAL" };

/** Gợi ý mã hạng mục + phụ lục chỉ dành cho PCT giấy · nhà thầu · Đại tu. */
export function isOverhaulPaperPermit(permit: { teamType: string; contractorScope?: string | null; format?: string | null }) {
  return permit.teamType === "CONTRACTOR" && permit.contractorScope === "OVERHAUL" && (permit.format ?? "PAPER") === "PAPER";
}

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
/**
 * "Van đầu vào…" / "Bơm dầu IDF" → viết thường chữ đầu để ghép giữa câu. Giữ nguyên khi từ đầu là chữ viết tắt ("ESP 1")
 * hoặc tên viết hoa từng chữ ("Máy Phát") — hạ chữ đầu sẽ thành "máy Phát".
 */
function lowerFirst(text: string) {
  const words = text.split(/\s+/);
  const isAcronym = (word: string) => /\d/.test(word) || (word.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase());
  const titleCased = (word: string) => word[0] !== word[0].toLowerCase() && !isAcronym(word);
  if (!words[0] || isAcronym(words[0]) || words.slice(1).some(titleCased)) return text;
  return words[0][0].toLowerCase() + text.slice(1);
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
