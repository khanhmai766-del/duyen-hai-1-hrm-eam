"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export type PcccTargetType =
  | "EXTINGUISHER"
  | "CABINET"
  | "BULK"
  | "FM200_PANEL"
  | "ALARM_BUTTON"
  | "VALVE"
  | "EMERGENCY_LIGHT"
  | "HOSE_REEL"
  | "FIRE_CONTROL_CABINET";

export interface PcccSignature {
  targetId?: string;
  signerName: string;
  signerPosition: string | null;
  signedAt: string;
  /** Ảnh chữ ký số phục vụ qua proxy S3; null với bản ký cũ chưa gắn ảnh. */
  signatureUrl?: string | null;
}

export interface PcccPeriod {
  id: string;
  label: string;
  year: number;
  monthNo: number;
  isClosed: boolean;
  closedAt: string | null;
  /** Bản Excel đã đẩy lên S3 lúc chốt kỳ — null nghĩa là chưa lưu trữ. */
  archiveKey?: string | null;
  archivedAt?: string | null;
  _count?: { extinguishers: number; cabinets: number; bulks: number; fm200Panels: number; fireControlCabinets: number; signatures: number };
}

/** Mốc thời gian do SERVER tính theo giờ VN (máy người dùng có thể sai đồng hồ/múi giờ). */
export interface PcccClockMeta {
  today: string;
  currentLabel: string;
  isLastDayOfMonth: boolean;
  /** Hôm nay có nằm trong cửa sổ chuyển kỳ không (3 ngày cuối tháng + 2 ngày đầu tháng sau). */
  rolloverWindow?: boolean;
  keepPeriods: number;
}

/** Một bản lưu trữ Excel trên S3. */
export interface PcccArchiveEntry {
  label: string;
  key: string;
  bytes: number;
  archivedAt: string | null;
}

export interface PcccRolloverResult {
  closed: { label: string; archiveKey: string; bytes: number }[];
  created: string[];
  deleted: string[];
  keptWithoutArchive: string[];
  errors: string[];
}

export interface ExtinguisherRow {
  id: string;
  stt: number | null;
  ma: string;
  chungLoai: string | null;
  viTri: string | null;
  cuongVi: string | null;
  cuongViCode: string | null;
  machine: string;
  nguoiGiamSat: string | null;
  nguoiGiamSatCode: string | null;
  sl: number | null;
  dvt: string | null;
  tinhTrang: string | null;
  /** Phần trăm áp suất (MFZ/Foam) hoặc khối lượng còn lại (CO2), 0–100. */
  apSuat: number | null;
  viTriHienTai: string | null;
  tinhTrangNgoai: string | null;
  nguonGoc: string | null;
  thoiGianThayGanNhat: string | null;
  ngaySx: string | null;
  thoiGianSd: number | null;
  denHanThayThe: string | null;
  ngayKiemTra: string | null;
  nguoiKiemTra: string | null;
  ghiChu: string | null;
  /** Dùng để phát hiện người khác vừa sửa dòng này (chế độ "Sửa bảng"). */
  updatedAt: string;
  signature: PcccSignature | null;
}

export interface CabinetComponent {
  id: string;
  groupLabel: string;
  status: string;
  checked: boolean;
  groupOrder: number;
  statusOrder: number;
}

export interface CabinetRow {
  id: string;
  stt: number | null;
  ma: string;
  ten: string | null;
  viTri: string | null;
  cuongVi: string | null;
  cuongViCode: string | null;
  machine: string;
  sl: number | null;
  dvt: string | null;
  soYcsc: string | null;
  ngayKiemTra: string | null;
  nguoiKiemTra: string | null;
  ghiChu: string | null;
  tinhTrangTongThe: string | null;
  components: CabinetComponent[];
  /** Dùng để phát hiện người khác vừa sửa dòng này (chế độ "Sửa bảng"). */
  updatedAt: string;
  signature: PcccSignature | null;
}

export interface BulkRow {
  id: string;
  stt: number | null;
  ten: string;
  cuongVi: string | null;
  cuongViCode: string | null;
  machine: string;
  viTri: string | null;
  dvt: string | null;
  khoiLuongThietKe: number | null;
  khoiLuongHienTai: number | null;
  phanTramConLai: number | null;
  tinhTrang: string | null;
  ngayChot: string | null;
  nguoiChot: string | null;
  ghiChu: string | null;
  signature: PcccSignature | null;
}

export interface Fm200Panel {
  id: string;
  panelKey: string;
  title: string;
  binhLabels: string[];
  cuongVi: string | null;
  cuongViCode: string | null;
  machine: string;
  mucMin: number | null;
  mucMax: number | null;
  mucDvt: string | null;
  mucValues: Record<string, number | null>;
  mucGhiChu: string | null;
  apMin: number | null;
  apMax: number | null;
  apDvt: string | null;
  apValues: Record<string, number | null>;
  apGhiChu: string | null;
  ngayKiemTra: string | null;
  nguoiKiemTra: string | null;
  signature: PcccSignature | null;
}

export interface FireControlCabinetRow {
  id: string;
  stt: number | null;
  heThong: string;
  ma: string;
  viTri: string | null;
  cuongVi: string | null;
  cuongViCode: string | null;
  machine: string;
  tinhTrang: string | null;
  ghiChu: string | null;
  ngayKiemTra: string | null;
  nguoiKiemTra: string | null;
  updatedAt: string;
  signature: PcccSignature | null;
}

export interface PcccSummary {
  bcc: {
    rows: ExtinguisherSummaryRow[];
    total: ExtinguisherSummaryRow;
  };
  tcc: {
    rows: { groupLabel: string; loaiTu: "INDOOR" | "OUTDOOR"; binhThuong: number; huHong1Phan: number; huHongHoanToan: number }[];
    total: { binhThuong: number; huHong1Phan: number; huHongHoanToan: number };
    ron: {
      loaiRon: "DN50" | "DN65";
      loaiTu: "INDOOR" | "OUTDOOR";
      soTu: number;
      tongRon: number;
      dayDu: number;
      thieuRon: number;
      thieuRonTheoNhom: Record<string, number>;
    }[];
  };
  fcd: (BulkRow & { tinhTrang: string })[];
  fm200: {
    panelKey: string;
    binh: {
      label: string;
      muc: { value: number | null; phanTram: number | null; tinhTrang: string };
      ap: { value: number | null; phanTram: number | null; tinhTrang: string };
    }[];
  }[];
  // --- Bốn nhóm bổ sung đợt 2 ---
  nnbc: {
    tongSo: number;
    dat: number;
    khongDat: number;
    theoNhom: ComponentBreakdownRow[];
  };
  van: {
    rows: ValveSummaryRow[];
    total: ValveSummaryRow;
  };
  den: LightSummaryRow[];
  cvcc: {
    tongSo: number;
    dat: number;
    khongDat: number;
    theoNhom: ComponentBreakdownRow[];
  };
}

/** Đếm ô đã tích theo ba mức nặng/nhẹ, gom theo nhóm linh kiện (nút nhấn, cuộn vòi). */
export interface ComponentBreakdownRow {
  groupLabel: string;
  binhThuong: number;
  huHong1Phan: number;
  huHongHoanToan: number;
}

export interface ValveSummaryRow {
  loaiVan: string;
  tongSo: number;
  khaDung: number;
  suyGiam: number;
  khongKhaDung: number;
  chuaCapNhat: number;
}

export interface LightSummaryRow {
  loai: string;
  tongSo: number;
  dat: number;
  khongDat: number;
  /** Vị trí thực tế không lắp đèn — KHÔNG phải lỗi thiết bị, nên đếm riêng. */
  khongCoDen: number;
  chuaCapNhat: number;
}

export interface ExtinguisherSummaryRow {
  chungLoai: string;
  tongSo: number;
  dat: number;
  khongDat: number;
  /** Chưa có kết quả kiểm tra (tình trạng còn trống). */
  chuaCapNhat: number;
  quaHanThayThe: number;
  sapDenHan: number;
  giSetThanBinh: number;
  giSetTayNam: number;
  phanTramDat: number;
}

/** Cương vị/cấp giám sát luôn đi theo cặp (mã, nhãn): lọc theo MÃ, hiển thị NHÃN. */
export interface PositionOption {
  code: string;
  label: string;
}

/**
 * Phạm vi GHI/KÝ của người đăng nhập (bước E — xem lib/pccc-service.ts).
 * `all` = ghi mọi cương vị; ngược lại chỉ các mã trong `codes` (nhãn để hiển thị ở `labels`).
 */
export interface PcccWriteScopeMeta {
  all: boolean;
  codes: string[];
  labels: string[];
  /**
   * Người đang xem có quyền quản trị không. Quyết định các ô CHỈ ADMIN SỬA ĐƯỢC (cương
   * vị, cấp giám sát, tổ máy, ĐVT, ngày/người kiểm tra, ngày/người chốt) — server tính
   * vì nó còn phụ thuộc chế độ quản trị đang bật hay tắt.
   */
  admin?: boolean;
}

/** Ô này chỉ ADMIN sửa được — người dùng thường thấy nhưng không mở ô ra được. */
export function canEditPcccAdminField(scope: PcccWriteScopeMeta | undefined) {
  return scope?.admin === true;
}

/**
 * Dòng này người đang đăng nhập có được sửa không. Đây chỉ là lớp KHOÁ Ô CHO ĐỠ HỤT
 * CÔNG — server vẫn kiểm lại đúng luật này khi ghi, vì client gọi thẳng API được.
 */
export function canEditPcccRow(scope: PcccWriteScopeMeta | undefined, row: { cuongViCode?: string | null }) {
  if (!scope || scope.all) return true;
  return Boolean(row.cuongViCode && scope.codes.includes(row.cuongViCode));
}

/** Lời giải thích cho nhóm ô chỉ ADMIN mới sửa được. */
export const PCCC_ADMIN_FIELD_REASON =
  "Ô này chỉ quản trị viên sửa được (cương vị, cấp giám sát, tổ máy, ĐVT, ngày/người kiểm tra, ngày/người chốt).";

/**
 * Câu giải thích VÌ SAO ô đang khoá, để bảng nói ra thay vì im lặng: cương vị hạn chế
 * bấm vào ô của dòng ngoài phạm vi thì nhận đúng lý do chứ không tưởng là bảng lỗi.
 * Trả `undefined` = ô mở bình thường. Chỉ dùng khi bảng ĐANG ở chế độ sửa; lúc bảng
 * còn khoá thì mọi ô đều đóng và đã có ghi chú "bấm Sửa bảng" ở chân bảng.
 */
export function pcccLockReason(
  scope: PcccWriteScopeMeta | undefined,
  row: { cuongViCode?: string | null; cuongVi?: string | null },
  /** Ô thuộc nhóm chỉ ADMIN sửa được (cương vị, cấp giám sát, ngày/người kiểm tra…). */
  adminField = false
): string | undefined {
  if (!canEditPcccRow(scope, row)) {
    const mine = scope?.labels.length ? scope.labels.join(" · ") : "chưa được gán cương vị nào";
    const owner = row.cuongVi ? `cương vị “${row.cuongVi}”` : "cương vị khác";
    return `Dòng này thuộc ${owner}, ngoài phạm vi sửa của bạn (${mine}). Liên hệ quản trị nếu cần chỉnh sửa.`;
  }
  if (adminField && !canEditPcccAdminField(scope)) return PCCC_ADMIN_FIELD_REASON;
  return undefined;
}

/**
 * Phạm vi XEM của người đăng nhập (quy tắc 4 — xem lib/pccc-service.ts).
 * `all` = thấy mọi cương vị; ngược lại server ĐÃ cắt dữ liệu về đúng `codes` trước khi
 * trả về — client chỉ dùng cái này để nói cho người dùng biết mình đang xem phần nào,
 * chứ không phải để tự lọc.
 */
export interface PcccViewScopeMeta {
  all: boolean;
  codes: string[];
  labels: string[];
}

export interface PcccListMeta {
  period: PcccPeriod;
  total: number;
  page: number;
  pageCount: number;
  cuongViList: PositionOption[];
  giamSatList?: PositionOption[];
  groups?: { label: string; statuses: string[] }[];
  heThongList?: string[];
  writeScope?: PcccWriteScopeMeta;
  viewScope?: PcccViewScopeMeta;
}

export interface PcccFilters {
  period?: string;
  /** MÃ chức danh (PositionCode), không phải nhãn. */
  cuongVi?: string;
  /** S1 | S2 | COMMON — bộ lọc xem theo tổ máy, không phải rào quyền. */
  machine?: string;
  giamSat?: string;
  tinhTrang?: string;
  chungLoai?: string;
  loaiTu?: string;
  heThong?: string;
  /** Ô lọc tình trạng RIÊNG của bảng cuộn vòi (vốn từ khác bảng tủ). */
  tinhTrangCvcc?: string;
  quaHan?: boolean;
  q?: string;
  page?: number;
  pageSize?: number;
  /** Tên cột sắp xếp (server chỉ nhận các cột trong danh sách cho phép). */
  sort?: string;
  dir?: "asc" | "desc";
}

function qs(filters: PcccFilters) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === "" || v === false) continue;
    sp.set(k, v === true ? "1" : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function usePcccPeriods() {
  return useQuery({ queryKey: ["pccc-periods"], queryFn: () => apiGet<PcccPeriod[]>("/api/pccc/periods") });
}

export function usePcccSummary(filters: PcccFilters) {
  return useQuery({
    queryKey: ["pccc-summary", filters],
    queryFn: () => apiGet<PcccSummary>(`/api/pccc/summary${qs(filters)}`),
  });
}

export function usePcccExtinguishers(filters: PcccFilters) {
  return useQuery({
    queryKey: ["pccc-extinguishers", filters],
    queryFn: () => apiGet<ExtinguisherRow[]>(`/api/pccc/extinguishers${qs(filters)}`),
  });
}

export function usePcccCabinets(filters: PcccFilters) {
  return useQuery({
    queryKey: ["pccc-cabinets", filters],
    queryFn: () => apiGet<CabinetRow[]>(`/api/pccc/cabinets${qs(filters)}`),
  });
}

export interface PcccCabinetOption {
  id: string;
  ma: string;
  ten: string | null;
  viTri: string | null;
  cuongVi: string | null;
  cuongViCode: string | null;
  machine: string;
  hoseReelCount: number;
}

/** Danh sách tủ rút gọn cho hộp thoại thêm cuộn vòi; chỉ gọi khi hộp thoại mở. */
export function usePcccCabinetOptions(filters: Pick<PcccFilters, "period" | "cuongVi" | "machine" | "q">, enabled: boolean) {
  return useQuery({
    queryKey: ["pccc-hose-reel-cabinet-options", filters],
    queryFn: () => apiGet<PcccCabinetOption[]>(`/api/pccc/hose-reels/cabinet-options${qs(filters)}`),
    enabled,
    staleTime: 30_000,
  });
}

export function usePcccBulks(filters: PcccFilters) {
  return useQuery({
    queryKey: ["pccc-bulks", filters],
    queryFn: () => apiGet<{ bulks: BulkRow[]; panels: Fm200Panel[] }>(`/api/pccc/bulks${qs(filters)}`),
  });
}

export function usePcccFireControlCabinets(filters: PcccFilters) {
  return useQuery({
    queryKey: ["pccc-fire-control-cabinets", filters],
    queryFn: () => apiGet<FireControlCabinetRow[]>(`/api/pccc/fire-control-cabinets${qs(filters)}`),
  });
}

/** Mọi mutation đều làm mới cả danh sách và tổng quan — số liệu dashboard là dẫn xuất. */
function useInvalidatePccc() {
  const qc = useQueryClient();
  return () => {
    // "pccc-book-status" phải nằm trong danh sách: ký/bỏ ký xong là điều kiện xuất sổ
    // đổi ngay, không đợi người dùng tải lại trang mới thấy nút.
    const keys = [
      "pccc-summary", "pccc-extinguishers", "pccc-cabinets", "pccc-bulks", "pccc-periods", "pccc-book-status",
      "pccc-alarm-buttons", "pccc-valves", "pccc-emergency-lights", "pccc-hose-reels",
      "pccc-hose-reel-cabinet-options",
      "pccc-fire-control-cabinets",
    ];
    for (const key of keys) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

const PATCH_URL: Record<PcccTargetType, string> = {
  EXTINGUISHER: "/api/pccc/extinguishers",
  CABINET: "/api/pccc/cabinets",
  BULK: "/api/pccc/bulks",
  FM200_PANEL: "/api/pccc/fm200",
  ALARM_BUTTON: "/api/pccc/alarm-buttons",
  VALVE: "/api/pccc/valves",
  EMERGENCY_LIGHT: "/api/pccc/emergency-lights",
  HOSE_REEL: "/api/pccc/hose-reels",
  FIRE_CONTROL_CABINET: "/api/pccc/fire-control-cabinets",
};

export function usePcccUpdate(targetType: PcccTargetType) {
  const invalidate = useInvalidatePccc();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      apiMutate<{
        signatureCleared?: boolean;
        /** Server đã nâng mức tình trạng theo quy tắc áp suất (chỉ bảng BCC). */
        autoAdjustedTinhTrang?: boolean;
        tinhTrang?: string | null;
      }>(`${PATCH_URL[targetType]}/${id}`, "PATCH", patch),
    onSuccess: invalidate,
  });
}

/**
 * Lưu MỘT LƯỢT nhiều dòng (chế độ "Sửa bảng"). Trả về số dòng đã lưu, số dòng bị quy
 * tắc áp suất nâng mức, và lỗi theo từng dòng — server từ chối cả lượt nếu có lỗi.
 */
export interface BulkSaveResult {
  saved: number;
  adjusted: number;
  errors: { id: string; ma?: string; message: string }[];
}

export interface BulkSaveItem {
  id: string;
  updatedAt?: string;
  patch: Record<string, unknown>;
}

export function usePcccBulkSaveExtinguishers() {
  const invalidate = useInvalidatePccc();
  return useMutation({
    mutationFn: (items: BulkSaveItem[]) => apiMutate<BulkSaveResult>("/api/pccc/extinguishers/bulk", "POST", { items }),
    onSuccess: invalidate,
  });
}

/** Lưu một lượt bảng TỦ CHỮA CHÁY — kèm cả các ô ☑ đã đổi của từng tủ. */
export interface CabinetBulkSaveItem {
  id: string;
  updatedAt?: string;
  patch: Record<string, unknown>;
  components?: { groupLabel: string; status: string; checked: boolean }[];
}

export function usePcccBulkSaveCabinets() {
  const invalidate = useInvalidatePccc();
  return useMutation({
    mutationFn: (items: CabinetBulkSaveItem[]) =>
      apiMutate<BulkSaveResult>("/api/pccc/cabinets/bulk", "POST", { items }),
    onSuccess: invalidate,
  });
}

/** Kết quả xem trước / ký hàng loạt theo cương vị. */
export interface PcccBulkSignPreview {
  total: number;
  alreadySigned: number;
  willSign: number;
  scopeLabel: string;
  periodLabel: string;
  signerName: string;
  /** false = tài khoản chưa có chữ ký số → hộp thoại nhắc và chặn nút xác nhận. */
  hasSignature: boolean;
  signatureSetupUrl: string;
}

export interface PcccBulkSignResult {
  signed: number;
  resigned: number;
  signerName: string;
  signedAt: string;
  signatureUrl: string;
  scopeLabel: string;
  periodLabel: string;
}

/** Sáu bảng ký gộp được. Bồn Foam/CO2/Diesel và FM200 ký từng mục trong tab của chúng. */
export type PcccBulkSignTarget =
  | "EXTINGUISHER"
  | "CABINET"
  | "ALARM_BUTTON"
  | "VALVE"
  | "EMERGENCY_LIGHT"
  | "HOSE_REEL"
  | "FIRE_CONTROL_CABINET";

export interface PcccBulkSignInput {
  targetType: PcccBulkSignTarget;
  period?: string;
  cuongVi?: string;
  machine?: string;
  /** BẮT BUỘC khi targetType = EMERGENCY_LIGHT: hai loại đèn chung một bảng. */
  loai?: "EXIT" | "CSSC";
  preview?: boolean;
}

/**
 * Ký một lượt toàn bộ dòng thuộc cương vị quản lý của người ký. Gọi kèm `preview: true`
 * thì KHÔNG ghi gì, chỉ trả số liệu cho hộp thoại xác nhận — hộp thoại phải nói đúng số
 * dòng sắp bị đụng vào, không đoán ở phía client.
 */
export function usePcccBulkSign() {
  const invalidate = useInvalidatePccc();
  return useMutation({
    mutationFn: (input: PcccBulkSignInput) =>
      apiMutate<PcccBulkSignResult>("/api/pccc/signatures/bulk", "POST", input),
    onSuccess: invalidate,
  });
}

export function usePcccBulkSignPreview() {
  return useMutation({
    mutationFn: (input: Omit<PcccBulkSignInput, "preview">) =>
      apiMutate<PcccBulkSignPreview>("/api/pccc/signatures/bulk", "POST", { ...input, preview: true }),
  });
}

export function usePcccSign() {
  const invalidate = useInvalidatePccc();
  return useMutation({
    mutationFn: ({ targetType, targetId, remove }: { targetType: PcccTargetType; targetId: string; remove?: boolean }) =>
      apiMutate("/api/pccc/signatures", remove ? "DELETE" : "POST", { targetType, targetId }),
    onSuccess: invalidate,
  });
}

/** 12 tháng lưu trữ gần nhất trên S3 — nguồn cho ô "Tải bản lưu trữ" của nút Xuất Excel. */
/**
 * `enabled=false` cho người chỉ xem được cương vị của mình: server trả 403 vì file lưu
 * trữ là bản đầy đủ cả phân xưởng, gọi làm gì cho tốn một lượt hỏng.
 */
/**
 * Trạng thái "Sổ theo dõi phương tiện PCCC (Mẫu số 01)" của cương vị đang đăng nhập:
 * đã ký đủ cả bảng Bình chữa cháy lẫn Tủ chữa cháy chưa. SERVER đếm trên toàn kỳ —
 * client chỉ có một trang 25 dòng nên tự đếm là sai ngay từ trang đầu.
 */
export interface PcccBookStatus {
  positionCode: string | null;
  positionLabel: string | null;
  /** Đếm theo từng nhóm thiết bị của sổ — thay cho hai trường cứng bcc/tcc trước đây. */
  groups: { key: string; label: string; total: number; signed: number }[];
  ready: boolean;
  /** Câu giải thích vì sao chưa xuất được — hiện thẳng cho người dùng. */
  reason: string | null;
}

export function usePcccBookStatus(filters: { period?: string; cuongVi?: string; tab?: string }, enabled = true) {
  return useQuery({
    queryKey: ["pccc-book-status", filters],
    queryFn: () => apiGet<PcccBookStatus>(`/api/pccc/so-theo-doi${qs(filters)}`),
    enabled: enabled && Boolean(filters.period),
  });
}

export function usePcccArchives(enabled = true) {
  return useQuery({
    queryKey: ["pccc-archives"],
    queryFn: () => apiGet<PcccArchiveEntry[]>("/api/pccc/archive"),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

/**
 * Chạy TAY đúng job mà bộ hẹn giờ vẫn chạy hằng tháng: chốt kỳ (kèm xuất Excel lên S3),
 * sinh kỳ mới, dọn DB còn 6 kỳ. Thay cho hai nút "Chốt kỳ" và "Sinh kỳ mới" trước đây —
 * hai việc đó phải đi liền nhau nên tách ra chỉ tạo cơ hội làm nửa vời.
 */
export function usePcccRollover() {
  const qc = useQueryClient();
  const invalidate = useInvalidatePccc();
  return useMutation({
    mutationFn: (closeCurrentPeriod?: boolean) =>
      apiMutate<PcccRolloverResult>("/api/pccc/rollover", "POST", { closeCurrentPeriod: closeCurrentPeriod === true }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["pccc-archives"] });
    },
  });
}

export function usePcccCreatePeriod() {
  const invalidate = useInvalidatePccc();
  return useMutation({
    mutationFn: (fromLabel?: string) => apiMutate<PcccPeriod>("/api/pccc/periods", "POST", { fromLabel }),
    onSuccess: invalidate,
  });
}

export function usePcccTogglePeriodClose() {
  const invalidate = useInvalidatePccc();
  return useMutation({
    mutationFn: (id: string) => apiMutate<PcccPeriod>(`/api/pccc/periods/${id}/close`, "POST"),
    onSuccess: invalidate,
  });
}

// ===========================================================================
// BỐN NHÓM THIẾT BỊ ĐỢT 2 — nút nhấn báo cháy, van chữa cháy, đèn EXIT / đèn
// chiếu sáng sự cố, cuộn vòi chữa cháy.
//
// Hai kiểu dữ liệu, dùng lại đúng hai khuôn đã có ở trên:
//   - `AlarmButtonRow`/`HoseReelRow` mang `components` như `CabinetRow`;
//   - `ValveRow`/`EmergencyLightRow` chỉ một ô tình trạng như `ExtinguisherRow`.
// ===========================================================================

export interface AlarmButtonRow {
  id: string;
  stt: number | null;
  rowKey: string;
  maKks: string;
  tenKhuVuc: string | null;
  viTri: string | null;
  cuongVi: string | null;
  cuongViCode: string | null;
  machine: string;
  nguoiGiamSat: string | null;
  nguoiGiamSatCode: string | null;
  /** Cột "Ghi chú khác" — nhật ký kiểm tra nhiều đợt, giữ nguyên văn, thường rất dài. */
  khac: string | null;
  ngayKiemTra: string | null;
  nguoiKiemTra: string | null;
  tinhTrangTongThe: string | null;
  components: CabinetComponent[];
  updatedAt: string;
  signature: PcccSignature | null;
}

export interface ValveRow {
  id: string;
  stt: number | null;
  rowKey: string;
  tenVan: string;
  loaiVan: string;
  maKks: string;
  cuongVi: string | null;
  cuongViCode: string | null;
  machine: string;
  nguoiGiamSat: string | null;
  nguoiGiamSatCode: string | null;
  viTri: string | null;
  tinhTrang: string | null;
  moTa: string | null;
  soYcsc: string | null;
  ngayKiemTra: string | null;
  nguoiKiemTra: string | null;
  updatedAt: string;
  signature: PcccSignature | null;
}

export interface EmergencyLightRow {
  id: string;
  loai: string;
  stt: number | null;
  rowKey: string;
  maKks: string;
  /** Ba cột cấp KHU VỰC — dùng chung cho nhiều đèn, không sửa lẻ từng dòng. */
  tenKhuVuc: string | null;
  maBanVe: string | null;
  soLuongKhuVuc: number | null;
  cuongVi: string | null;
  cuongViCode: string | null;
  machine: string;
  nguoiGiamSat: string | null;
  nguoiGiamSatCode: string | null;
  tinhTrang: string | null;
  /** Nguyên văn ô "Tháng MM/YYYY" mới nhất của sheet nguồn, có cả số phiếu YCSC. */
  ketQuaTest: string | null;
  ghiChu: string | null;
  ngayKiemTra: string | null;
  nguoiKiemTra: string | null;
  updatedAt: string;
  signature: PcccSignature | null;
}

export interface HoseReelRow {
  id: string;
  stt: number | null;
  ma: string;
  ten: string | null;
  viTri: string | null;
  cuongVi: string | null;
  cuongViCode: string | null;
  machine: string;
  soYcsc: string | null;
  ngayKiemTra: string | null;
  nguoiKiemTra: string | null;
  ghiChu: string | null;
  tinhTrangTongThe: string | null;
  components: CabinetComponent[];
  /** Tủ chữa cháy cha — hiển thị để biết cuộn vòi thuộc tủ nào. */
  cabinet: { id: string; ma: string; ten: string | null };
  updatedAt: string;
  signature: PcccSignature | null;
}

export function usePcccAlarmButtons(filters: PcccFilters) {
  return useQuery({
    queryKey: ["pccc-alarm-buttons", filters],
    queryFn: () => apiGet<AlarmButtonRow[]>(`/api/pccc/alarm-buttons${qs(filters)}`),
  });
}

export function usePcccValves(filters: PcccFilters & { loaiVan?: string }) {
  return useQuery({
    queryKey: ["pccc-valves", filters],
    queryFn: () => apiGet<ValveRow[]>(`/api/pccc/valves${qs(filters)}`),
  });
}

/**
 * `loai` BẮT BUỘC (EXIT | CSSC): hai loại đèn nằm chung một bảng, thiếu tham số này
 * thì server trả lỗi chứ không âm thầm trộn hai danh sách.
 */
export function usePcccEmergencyLights(filters: PcccFilters & { loai: "EXIT" | "CSSC" }) {
  return useQuery({
    queryKey: ["pccc-emergency-lights", filters],
    queryFn: () => apiGet<EmergencyLightRow[]>(`/api/pccc/emergency-lights${qs(filters)}`),
  });
}

export function usePcccHoseReels(filters: PcccFilters & { cabinetId?: string }) {
  return useQuery({
    queryKey: ["pccc-hose-reels", filters],
    queryFn: () => apiGet<HoseReelRow[]>(`/api/pccc/hose-reels${qs(filters)}`),
  });
}

/** Thêm một cuộn vòi vào tủ đã có. Bảng duy nhất của module cho thêm dòng bằng tay. */
export function usePcccCreateHoseReel() {
  const invalidate = useInvalidatePccc();
  return useMutation({
    mutationFn: (body: { cabinetId: string; ma: string; ten?: string }) =>
      apiMutate<HoseReelRow>("/api/pccc/hose-reels", "POST", body),
    onSuccess: invalidate,
  });
}

export function usePcccDeleteHoseReel() {
  const invalidate = useInvalidatePccc();
  return useMutation({
    mutationFn: (id: string) => apiMutate<{ id: string }>(`/api/pccc/hose-reels/${id}`, "DELETE"),
    onSuccess: invalidate,
  });
}
