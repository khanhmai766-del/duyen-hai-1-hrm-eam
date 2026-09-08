/**
 * TBYCNN — THIẾT BỊ YÊU CẦU NGHIÊM NGẶT VỀ AN TOÀN LAO ĐỘNG.
 *
 * Logic nghiệp vụ dùng chung cho CẢ server và client (giống `lib/pccc-status.ts`):
 * client dùng để dựng bộ lọc + tô màu, server dùng để CƯỠNG CHẾ khi ghi — kiểm tra ở
 * client là chưa đủ vì người dùng gọi thẳng API được.
 *
 * Nguồn gốc: ứng dụng rời `QuanLyThietBi_project` (1 file HTML + localStorage). Các quy
 * tắc dưới đây bê nguyên từ đó (mục 6 trong README của bản cũ), chỉ đổi cách LƯU:
 *  - Ngày tháng: bản cũ giữ chuỗi thô vì ~45% ô không phải ngày hợp lệ ("-", "Không có",
 *    "Tem bị mờ"…). Ở đây giữ nguyên chuỗi trong `*Text` VÀ lưu thêm ngày đã parse để
 *    lọc/đếm quá hạn — không đánh đổi cái nào.
 *  - `nhomPhu` của bản cũ bị bỏ: cả 709 dòng nguồn đều rỗng, giữ lại chỉ làm rối bảng.
 */

export const TBYCNN_KD_SOON_DAYS = 90; // "sắp đến hạn" = dưới 3 tháng, theo bản cũ

/** Đơn vị quản lý mặc định — cả 709 dòng nguồn đều là PXVH1. */
export const TBYCNN_DON_VI_QUAN_LY = "PXVH1";

/**
 * Dòng KHÔNG có cương vị quản lý — hồ sơ để trống thật, không phải dữ liệu thiếu.
 * Có từ bộ dụng cụ ATLĐ 2026-09: 3 dây đai mới chưa giao cho ai, và cả bảng dụng cụ
 * điện cầm tay vốn không có cột Cương vị.
 *
 * Khoá lọc BẮT BUỘC khác chuỗi rỗng: ô lọc Cương vị dựng bằng Radix `<SelectItem>`, mà
 * `value=""` thì Radix ném lỗi và sập cả bảng chọn Bộ lọc — một dòng khuVuc rỗng đủ làm
 * hỏng trang cho mọi người.
 */
export const TBYCNN_NO_POSITION_KEY = "__CHUA_CO_CUONG_VI__";
export const TBYCNN_NO_POSITION_LABEL = "Chưa có cương vị";

/** Khoá lọc theo cương vị: mã chuẩn → nhãn thô → khoá "chưa có". Dùng chung cho ô lọc và
 *  vị từ lọc, hai chỗ lệch nhau là bấm lọc ra bảng rỗng. */
export function tbycnnPositionKey(row: { cuongViCode?: string | null; khuVuc?: string | null }) {
  return row.cuongViCode || row.khuVuc || TBYCNN_NO_POSITION_KEY;
}

/** Nhãn hiển thị cương vị của một dòng, kể cả dòng hồ sơ để trống. */
export function tbycnnPositionLabel(row: { cuongVi?: string | null; khuVuc?: string | null }) {
  return row.cuongVi || row.khuVuc || TBYCNN_NO_POSITION_LABEL;
}

// --------------------------------------------------------------------- ngày tháng
/** "dd/mm/yyyy" → Date (UTC, 00:00). Trả null với mọi chuỗi không đúng định dạng. */
export function parseVNDate(input?: string | null): Date | null {
  const m = String(input ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  // Chặn "31/02/2026" — Date tự cuộn sang tháng sau chứ không báo lỗi.
  if (date.getUTCDate() !== Number(d) || date.getUTCMonth() !== Number(mo) - 1) return null;
  return date;
}

export function formatVNDate(date?: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/**
 * Hiển thị một mốc kiểm định: ưu tiên ngày đã parse, không có thì trả lại đúng chữ
 * người dùng nhập ("Chưa dán tem", "06/26"…) để không giấu mất thông tin.
 */
export function displayKdDate(date?: Date | string | null, text?: string | null): string {
  return formatVNDate(date) || String(text ?? "").trim();
}

/**
 * Mã lỗi Excel còn sót trong dữ liệu gốc — coi như ô trống khi tính hạn tiếp theo.
 * Giữ nguyên danh sách của bản cũ (KD_TIEPTHEO_ERROR_MARKERS).
 */
const EXCEL_ERROR_MARKERS = ["#VALUE!", "#REF!", "#NAME?", "#N/A", "#DIV/0!", "#NULL!", "#NUM!"];

export function isExcelErrorMarker(value?: string | null) {
  return EXCEL_ERROR_MARKERS.includes(String(value ?? "").trim().toUpperCase());
}

/**
 * Mặc định "KĐ tiếp theo" = "KĐ gần nhất" + chu kỳ thử tính bằng THÁNG.
 * Thiếu dữ liệu để tính thì trả null — KHÔNG ghi đè các giá trị đặc biệt như "Không có".
 */
export function computeDefaultKdTiepTheo(ganNhat: Date | null, chuKyThuThang: number | null): Date | null {
  if (!ganNhat || !chuKyThuThang || chuKyThuThang <= 0) return null;
  const months = Math.round(chuKyThuThang);
  if (!months) return null;
  const day = ganNhat.getUTCDate();
  // Dựng ngày 1 của tháng đích rồi mới đặt ngày: `setUTCMonth` trực tiếp sẽ cuộn tràn —
  // 31/01 + 1 tháng ra 03/03 vì tháng 2 không có ngày 31. Ở đây kẹp về ngày cuối tháng.
  const next = new Date(Date.UTC(ganNhat.getUTCFullYear(), ganNhat.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

// -------------------------------------------------------------------- tình trạng
/**
 * Chuỗi tình trạng SUY RA từ hai con số, không lưu trực tiếp: một dòng có `soLuong > 1`
 * (vd 24 bóng đèn) vừa có cái khả dụng vừa có cái hỏng.
 */
export function computeTinhTrang(khaDung?: number | null, khongKhaDung?: number | null): string {
  if (khaDung == null && khongKhaDung == null) return "";
  const a = khaDung ?? 0;
  const b = khongKhaDung ?? 0;
  if (a === 0 && b === 0) return "";
  if (b === 0 && a > 0) return "Khả dụng";
  if (a === 0 && b > 0) return "Không khả dụng";
  return `${a} khả dụng, ${b} không khả dụng`;
}

export const TBYCNN_STATUS_FILTERS = ["Khả dụng", "Không khả dụng", "Chưa cập nhật"] as const;

/**
 * Lọc theo tình trạng KHÔNG so khớp nguyên văn: lọc "Khả dụng" phải bắt cả dòng hỗn
 * hợp có `soLuongKhaDung > 0`. Nhờ vậy một dòng hỗn hợp xuất hiện ở CẢ HAI kết quả lọc,
 * đúng bản chất "có cả hai loại".
 */
export function statusMatch(
  row: { soLuongKhaDung?: number | null; soLuongKhongKhaDung?: number | null },
  filter?: string | null
) {
  if (!filter) return true;
  const a = row.soLuongKhaDung;
  const b = row.soLuongKhongKhaDung;
  if (filter === "Chưa cập nhật") return a == null && b == null;
  if (filter === "Khả dụng") return (a ?? 0) > 0;
  if (filter === "Không khả dụng") return (b ?? 0) > 0;
  return true;
}

/**
 * Tổng khả dụng + không khả dụng phải bằng `soLuong` khi có nhập ít nhất một ô — quy
 * tắc validate của bản cũ. Trả về thông báo lỗi (tiếng Việt) hoặc null nếu hợp lệ.
 */
export function validateSoLuong(
  soLuong: number | null,
  khaDung: number | null,
  khongKhaDung: number | null
): string | null {
  if (khaDung == null && khongKhaDung == null) return null;
  if ((khaDung ?? 0) < 0 || (khongKhaDung ?? 0) < 0) return "Số lượng không được âm";
  if (soLuong == null) return null;
  const total = (khaDung ?? 0) + (khongKhaDung ?? 0);
  if (total !== soLuong) {
    return `Khả dụng + không khả dụng (${total}) phải bằng số lượng (${soLuong})`;
  }
  return null;
}

// ------------------------------------------------------------------ hạn kiểm định
export const TBYCNN_KD_FILTERS = ["overdue", "soon", "ok", "none"] as const;
export type TbycnnKdFilter = (typeof TBYCNN_KD_FILTERS)[number];

export const TBYCNN_KD_LABEL: Record<TbycnnKdFilter, string> = {
  overdue: "Quá hạn",
  soon: "Sắp đến hạn (<3 tháng)",
  ok: "Còn hạn",
  none: "Chưa có hạn",
};

export type TbycnnKdStatus = { type: Exclude<TbycnnKdFilter, "none">; days: number } | null;

/** `today` truyền vào được để test và để server/client tính cùng một mốc. */
export function kdStatus(kdTiepTheo?: Date | string | null, today = new Date()): TbycnnKdStatus {
  if (!kdTiepTheo) return null;
  const d = typeof kdTiepTheo === "string" ? new Date(kdTiepTheo) : kdTiepTheo;
  if (Number.isNaN(d.getTime())) return null;
  const startOfDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diff = Math.round((d.getTime() - startOfDay) / 86_400_000);
  if (diff < 0) return { type: "overdue", days: -diff };
  if (diff <= TBYCNN_KD_SOON_DAYS) return { type: "soon", days: diff };
  return { type: "ok", days: diff };
}

export function kdMatch(
  kdTiepTheo: Date | string | null | undefined,
  filter?: string | null,
  today = new Date()
) {
  if (!filter) return true;
  const status = kdStatus(kdTiepTheo, today);
  if (filter === "none") return status === null;
  return status?.type === filter;
}

// ------------------------------------------------------------------- danh mục
/** Bỏ tiền tố số La Mã: "II. VAN AN TOÀN" → "VAN AN TOÀN". */
export function extractDanhMuc(nhom?: string | null) {
  return String(nhom ?? "").replace(/^\s*[IVXLCM]+\s*\.\s*/i, "").trim();
}

const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, M: 1000 };

/** "IV. THIẾT BỊ NÂNG" → 4. Không có tiền tố La Mã thì null (xếp xuống cuối). */
export function extractNhomSo(nhom?: string | null): number | null {
  const m = String(nhom ?? "").trim().match(/^([IVXLCM]+)\s*\./i);
  if (!m) return null;
  const chars = m[1].toUpperCase().split("");
  let total = 0;
  for (let i = 0; i < chars.length; i++) {
    const cur = ROMAN_VALUES[chars[i]];
    const next = ROMAN_VALUES[chars[i + 1]] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total || null;
}

const ROMAN_LITERALS: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

/**
 * 4 → "IV". Nghịch đảo của `extractNhomSo`, dùng khi ĐẶT TÊN một danh mục mới cho một
 * cương vị: số La Mã trong `nhom` đánh riêng theo từng cương vị, thêm danh mục mà không
 * đánh số thì dòng đó rơi xuống cuối sổ (xem TBYCNN_ORDER_BY).
 */
export function romanOf(value: number): string {
  let remain = Math.max(1, Math.trunc(value));
  let out = "";
  for (const [num, literal] of ROMAN_LITERALS) {
    while (remain >= num) {
      out += literal;
      remain -= num;
    }
  }
  return out;
}

// ------------------------------------------------------- khoá trường khi sửa
/**
 * Các trường LUÔN được sửa dù thiết bị đã có sẵn — thông tin "vận hành", cần cập nhật
 * định kỳ. Các trường còn lại (tên, mã hiệu, vị trí…) là thông tin gốc theo hồ sơ nhà
 * máy nên bị khoá khi SỬA, chỉ mở khi THÊM MỚI. Riêng `maHieu`/`kks` cho bổ sung nếu
 * đang trống. Quy tắc bê nguyên mục 6.6 của bản cũ và được cưỡng chế ở API.
 */
export const TBYCNN_EDITABLE_ON_EDIT = [
  "chuKyThu",
  "kdGanNhatText",
  "kdTiepTheoText",
  "soBbkd",
  "donViKd",
  "soLuongKhaDung",
  "soLuongKhongKhaDung",
  "khiemKhuyet",
  "ghiChu",
  // Bảy cột của ba bảng dụng cụ ATLĐ. Đều là số liệu GHI LẠI MỖI LƯỢT ĐI KIỂM TRA (thử
  // tải, đo cách điện, kết quả), không phải thông tin gốc theo hồ sơ nhà máy — nên thuộc
  // nhóm vận hành, sửa được. `ketQuaThu` là thứ người đi kiểm tra cập nhật mỗi chu kỳ.
  "taiTrongThuKg",
  "thoiGianThuPhut",
  "tinhTrangSuDung",
  "kiemTraBangMat",
  "cachDienMOhm",
  "ketQuaThu",
  "nghiemThuSauSuaChua",
] as const;

/**
 * "Đạt" / "Không đạt" của một dòng dụng cụ suy ra hai ô số lượng khả dụng.
 *
 * Cột `ketQuaThu` và cặp `soLuongKhaDung`/`soLuongKhongKhaDung` NÓI CÙNG MỘT SỰ THẬT:
 * dụng cụ này còn dùng được hay không. Để hai nơi tự do lệch nhau thì huy hiệu Tình trạng
 * trên bảng, năm thẻ thống kê và con số "đã kiểm tra N đạt" trên biên bản sẽ nói ba kiểu
 * khác nhau về cùng một cái thang.
 *
 * Trả `null` khi không suy được (ô để trống, hoặc dòng có số lượng khác 1 thì không thể
 * chia được từ một chữ "Đạt").
 */
export function suyKhaDungTuKetQua(
  ketQuaThu: string | null | undefined,
  soLuong: number | null | undefined
): { soLuongKhaDung: number; soLuongKhongKhaDung: number } | null {
  const value = String(ketQuaThu ?? "").trim();
  if (!value || (soLuong ?? 1) !== 1) return null;
  const dat = value.toLowerCase().startsWith("đạt");
  return { soLuongKhaDung: dat ? 1 : 0, soLuongKhongKhaDung: dat ? 0 : 1 };
}

/** Bổ sung được khi đang trống, dù các trường gốc khác đã khoá. */
export const TBYCNN_FILLABLE_WHEN_EMPTY = ["maHieu", "kks"] as const;

export function fieldLockedOnEdit(field: string, current: unknown) {
  if ((TBYCNN_EDITABLE_ON_EDIT as readonly string[]).includes(field)) return false;
  if ((TBYCNN_FILLABLE_WHEN_EMPTY as readonly string[]).includes(field)) {
    return String(current ?? "").trim().length > 0;
  }
  return true;
}

// ------------------------------------------------------------------------ cột
export type TbycnnColumn = {
  key: string;
  label: string;
  width: number;
  align?: "center";
  /** Nội dung dài thì cuộn nhỏ TRONG ô thay vì kéo giãn cả dòng (mục 6.12 bản cũ). */
  clamp?: boolean;
};

/** Thứ tự cột của bảng, PDF và Excel — sửa một chỗ, cả ba nơi đổi theo. */
export const TBYCNN_COLUMNS: TbycnnColumn[] = [
  { key: "tt", label: "TT", width: 52, align: "center" },
  { key: "tenThietBi", label: "Tên TBYCNN", width: 220 },
  { key: "soLuong", label: "SL", width: 56, align: "center" },
  { key: "maHieu", label: "Mã hiệu", width: 170, clamp: true },
  { key: "kks", label: "KKS", width: 130, clamp: true },
  { key: "thongSoKyThuat", label: "Thông số kỹ thuật", width: 220, clamp: true },
  { key: "viTri", label: "Vị trí", width: 150, clamp: true },
  { key: "chucDanhQuanLy", label: "Chức danh quản lý", width: 150, clamp: true },
  { key: "chuKyThu", label: "Chu kỳ thử (tháng)", width: 84, align: "center" },
  { key: "kdGanNhat", label: "KĐ gần nhất", width: 110, align: "center" },
  { key: "soBbkd", label: "Số BBKĐ", width: 120, clamp: true },
  { key: "donViKd", label: "Đơn vị KĐ", width: 170, clamp: true },
  { key: "kdTiepTheo", label: "KĐ tiếp theo", width: 120, align: "center" },
  { key: "khiemKhuyet", label: "Khiếm khuyết", width: 160, clamp: true },
  { key: "tinhTrang", label: "Tình trạng", width: 140 },
  { key: "ghiChu", label: "Ghi chú", width: 160, clamp: true },
];

/** Cột cuối cùng còn được ghim khi cuộn ngang (mô phỏng Freeze Panes của Excel). */
export const TBYCNN_FREEZE_UPTO = "tenThietBi";

// ------------------------------------------------- 3 bảng dụng cụ ATLĐ tách riêng
/**
 * Ba bảng dụng cụ ATLĐ có BIỂU MẪU RIÊNG, không dùng chung bộ cột với sổ chính:
 * sổ chính theo dõi thiết bị chịu áp lực / nâng hạ (KKS, số BBKĐ, đơn vị kiểm định),
 * còn ba bảng này theo dõi kết quả thử tải và đo cách điện.
 *
 * Vì vậy chúng được TÁCH HẲN khỏi sổ chính — cả bảng, năm thẻ thống kê lẫn file xuất ra:
 * để lẫn thì mỗi dòng đều thiếu quá nửa số cột của biểu mẫu nó thuộc về, và tổng trên
 * thẻ đếm gộp hai loại hồ sơ khác nhau.
 *
 * Khoá là `danhMuc` — cùng chuỗi mà script nạp và người dùng chọn trên biểu mẫu thêm
 * thiết bị, nên không cần thêm cột phân loại nào.
 */
export type TbycnnToolColumn = {
  key:
    | "thongSoKyThuat"
    | "taiTrongThuKg"
    | "thoiGianThuPhut"
    | "tinhTrangSuDung"
    | "kiemTraBangMat"
    | "cachDienMOhm"
    | "ketQuaThu"
    | "nghiemThuSauSuaChua"
    | "ghiChu";
  label: string;
  width: number;
  /** Ô số: canh giữa, trống thì hiện "—". */
  numeric?: boolean;
  /**
   * CHỈ hiện trong khối chi tiết (nút "+"), KHÔNG dựng thành cột trên bảng.
   *
   * Vẫn nằm trong bản Excel và bản in PDF: đó là cột CÓ THẬT trong biểu mẫu giấy, bỏ đi
   * là bản nộp không còn khớp mẫu. Chỉ trên màn hình mới cắt bớt, vì các cột này gần như
   * luôn trống hoặc lặp lại y hệt nhau ở mọi dòng.
   */
  detailOnly?: boolean;
};

export type TbycnnToolTab = {
  key: string;
  /** Nhãn trên tầng chọn — ngắn, vì đứng cạnh ba nhãn khác. */
  label: string;
  /** Giá trị `danhMuc` trong DB. Đây là khoá duy nhất phân biệt ba bảng. */
  danhMuc: string;
  columns: TbycnnToolColumn[];
};

export const TBYCNN_TOOL_TABS: TbycnnToolTab[] = [
  {
    key: "THANG",
    label: "Thang di động",
    danhMuc: "THANG DI ĐỘNG",
    columns: [
      { key: "thongSoKyThuat", label: "Thông số kỹ thuật", width: 200 },
      { key: "taiTrongThuKg", label: "Tải trọng thử (kg)", width: 110, numeric: true },
      { key: "thoiGianThuPhut", label: "Thời gian thử (phút)", width: 110, numeric: true },
      { key: "ketQuaThu", label: "Kết quả", width: 150 },
    ],
  },
  {
    key: "DAY_DAI",
    label: "Dây đai an toàn",
    danhMuc: "DÂY ĐAI AN TOÀN",
    columns: [
      { key: "taiTrongThuKg", label: "Tải trọng thử (kg)", width: 110, numeric: true },
      { key: "tinhTrangSuDung", label: "Tình trạng", width: 130 },
      { key: "ketQuaThu", label: "Kết quả", width: 190 },
    ],
  },
  {
    key: "DUNG_CU_DIEN",
    label: "Dụng cụ điện cầm tay",
    danhMuc: "DỤNG CỤ ĐIỆN CẦM TAY",
    columns: [
      { key: "thongSoKyThuat", label: "Thông số kỹ thuật", width: 250 },
      { key: "kiemTraBangMat", label: "Kiểm tra bằng mắt", width: 120 },
      { key: "cachDienMOhm", label: "Trị số đo cách điện (MΩ)", width: 120, numeric: true },
      { key: "ketQuaThu", label: "Đánh giá", width: 100 },
      { key: "nghiemThuSauSuaChua", label: "Nghiệm thu sau khi sửa chữa", width: 150, detailOnly: true },
      { key: "ghiChu", label: "Ghi chú", width: 150, detailOnly: true },
    ],
  },
];

/** Cột dựng thành CỘT TRÊN BẢNG (bỏ các cột chỉ hiện ở khối chi tiết). */
export function tbycnnToolTableColumns(tab: TbycnnToolTab) {
  return tab.columns.filter((col) => !col.detailOnly);
}

/** Danh mục thuộc ba bảng dụng cụ — dùng để LOẠI khỏi sổ chính. */
export const TBYCNN_TOOL_DANH_MUCS: readonly string[] = TBYCNN_TOOL_TABS.map((tab) => tab.danhMuc);

export function isTbycnnToolDanhMuc(danhMuc?: string | null) {
  return !!danhMuc && TBYCNN_TOOL_DANH_MUCS.includes(danhMuc);
}

export function tbycnnToolTabOf(key?: string | null) {
  return TBYCNN_TOOL_TABS.find((tab) => tab.key === key) ?? null;
}

// -------------------------------------------------------------------- kỳ (tháng)
/** "2026-09" cho thời điểm truyền vào. */
export function periodLabelOf(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parsePeriodLabel(label: string): { year: number; monthNo: number } | null {
  const m = String(label ?? "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const monthNo = Number(m[2]);
  if (monthNo < 1 || monthNo > 12) return null;
  return { year, monthNo };
}

// ------------------------------------------------------------------ tiện ích
/** Chuỗi số của bản cũ → số. "" / "-" / "2 năm" cho ra null / null / 2. */
export function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim().replace(",", ".");
  if (!raw) return null;
  const m = raw.match(/\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

export function toIntOrNull(value: unknown): number | null {
  const n = toNumberOrNull(value);
  return n == null ? null : Math.trunc(n);
}

export function trimOrNull(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s ? s : null;
}
