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
  /**
   * Chỉ có trong request: người cấp đã xác nhận đưa hạng mục đang nằm trong PCT khác còn hiệu lực vào phiếu này.
   * Không lưu vào ảnh chụp trên phiếu.
   */
  confirmedShared?: boolean;
};

/** Phiếu đã cấp, chưa huỷ / kết thúc phiếu đang có một hạng mục — chọn lại được nhưng phải xác nhận. */
export type OverhaulItemUsage = { permitId: string; number: string; status: string };

/** Hạng mục gợi ý do API trả về. */
export type OverhaulItemOption = OverhaulItemSnapshot & {
  id: string;
  positionTitle: string;
  percent: string;
  status: string;
  /** Các phiếu đã cấp (chưa huỷ / kết thúc phiếu) đang có hạng mục này → chọn phải xác nhận. */
  usedBy: OverhaulItemUsage[];
  /** Phiếu NHÁP đang có hạng mục này — chỉ để biết, vẫn chọn được. */
  draftIn: string[];
};

/** Khoá so một hạng mục giữa các phiếu: cùng file, cùng tab, cùng mã = cùng hàng trên Sheet. */
export const overhaulItemKey = (item: Pick<OverhaulItemSnapshot, "source" | "sheet" | "code">) => `${item.source}\u0000${item.sheet}\u0000${item.code}`;
/** Trạng thái phiếu giữ hạng mục: đã cấp tới trước khi huỷ / kết thúc phiếu. Kết thúc LẦN làm việc không trả hạng mục.
 *  Hai phiếu cùng giữ một hạng mục được phép, nhưng phiếu sau phải xác nhận khi chọn. */
export const OVERHAUL_HOLDING_STATUSES = ["ISSUED", "ACTIVE", "PAUSED", "WAITING"] as const;

/**
 * Chữ ghi vào ô trạng thái từng ngày và cột "Trạng thái hiện tại" của Sheet tiến độ — web là nguồn, Sheet theo web.
 * "Chưa thực hiện" là mặc định của hạng mục chưa nằm trong PCT nào (app không ghi).
 */
export const OVERHAUL_DAY_STATUSES = {
  NOT_STARTED: "Chưa thực hiện",
  IN_PROGRESS: "Đang thực hiện",
  SKIPPED: "Không thực hiện",
  NOT_OPENED: "Không mở ngày thực hiện",
  CLOSED: "Kết thúc công tác",
} as const;
export type OverhaulDayStatus = (typeof OVERHAUL_DAY_STATUSES)[keyof typeof OVERHAUL_DAY_STATUSES];

/** Kết quả một hạng mục khi kết thúc lần làm việc (WorkPermitSession.itemProgress). */
export type OverhaulItemProgress = Pick<OverhaulItemSnapshot, "code" | "sheet" | "source"> & {
  /** Có thực hiện trong lần làm việc này. */
  done: boolean;
  /** % lũy kế 0–100 sau lần này; null khi không thực hiện (giữ % lần trước). */
  percent: number | null;
  note: string;
  /** Lần "Cập nhật tiến độ" giữa chừng gần nhất của hạng mục (ISO) — trên lần làm việc đang mở. */
  at?: string;
};

export function overhaulItemProgressOf(value: unknown): OverhaulItemProgress[] {
  return Array.isArray(value) ? value.filter((item): item is OverhaulItemProgress => !!item && typeof item === "object" && typeof (item as OverhaulItemProgress).code === "string") : [];
}

/** % lũy kế gần nhất của từng hạng mục, đọc từ các lần làm việc đã kết thúc (mới nhất trước). */
export function latestOverhaulPercents(sessions: Array<{ itemProgress?: unknown }>) {
  const latest = new Map<string, number>();
  for (const session of sessions) {
    for (const item of overhaulItemProgressOf(session.itemProgress)) {
      const key = overhaulItemKey(item);
      if (item.percent !== null && !latest.has(key)) latest.set(key, item.percent);
    }
  }
  return latest;
}

/** Ghi chú gần nhất (khác rỗng) của từng hạng mục — hiện lại trong ô ghi chú để xem và viết tiếp. Cùng thứ tự như trên. */
export function latestOverhaulNotes(sessions: Array<{ itemProgress?: unknown }>) {
  const latest = new Map<string, string>();
  for (const session of sessions) {
    for (const item of overhaulItemProgressOf(session.itemProgress)) {
      const key = overhaulItemKey(item);
      if (item.done && typeof item.note === "string" && item.note.trim() && !latest.has(key)) latest.set(key, item.note.trim());
    }
  }
  return latest;
}

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
