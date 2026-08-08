"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export type PcccTargetType = "EXTINGUISHER" | "CABINET" | "BULK" | "FM200_PANEL";

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
  _count?: { extinguishers: number; cabinets: number; bulks: number; fm200Panels: number; signatures: number };
}

/** Mốc thời gian do SERVER tính theo giờ VN (máy người dùng có thể sai đồng hồ/múi giờ). */
export interface PcccClockMeta {
  today: string;
  currentLabel: string;
  isLastDayOfMonth: boolean;
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
  apSuat: string | null;
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
}

export interface ExtinguisherSummaryRow {
  chungLoai: string;
  tongSo: number;
  khaDung: number;
  canTheoDoi: number;
  batKhaDung: number;
  quaHanThayThe: number;
  sapDenHan: number;
  giSetThanBinh: number;
  giSetTayNam: number;
  phanTramKhaDung: number;
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
}

/**
 * Dòng này người đang đăng nhập có được sửa không. Đây chỉ là lớp KHOÁ Ô CHO ĐỠ HỤT
 * CÔNG — server vẫn kiểm lại đúng luật này khi ghi, vì client gọi thẳng API được.
 */
export function canEditPcccRow(scope: PcccWriteScopeMeta | undefined, row: { cuongViCode?: string | null }) {
  if (!scope || scope.all) return true;
  return Boolean(row.cuongViCode && scope.codes.includes(row.cuongViCode));
}

export interface PcccListMeta {
  period: PcccPeriod;
  total: number;
  page: number;
  pageCount: number;
  cuongViList: PositionOption[];
  giamSatList?: PositionOption[];
  groups?: { label: string; statuses: string[] }[];
  writeScope?: PcccWriteScopeMeta;
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

export function usePcccBulks(filters: PcccFilters) {
  return useQuery({
    queryKey: ["pccc-bulks", filters],
    queryFn: () => apiGet<{ bulks: BulkRow[]; panels: Fm200Panel[] }>(`/api/pccc/bulks${qs(filters)}`),
  });
}

/** Mọi mutation đều làm mới cả danh sách và tổng quan — số liệu dashboard là dẫn xuất. */
function useInvalidatePccc() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["pccc-summary", "pccc-extinguishers", "pccc-cabinets", "pccc-bulks", "pccc-periods"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

const PATCH_URL: Record<PcccTargetType, string> = {
  EXTINGUISHER: "/api/pccc/extinguishers",
  CABINET: "/api/pccc/cabinets",
  BULK: "/api/pccc/bulks",
  FM200_PANEL: "/api/pccc/fm200",
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

export interface PcccBulkSignInput {
  targetType: "EXTINGUISHER" | "CABINET";
  period?: string;
  cuongVi?: string;
  machine?: string;
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
export function usePcccArchives() {
  return useQuery({
    queryKey: ["pccc-archives"],
    queryFn: () => apiGet<PcccArchiveEntry[]>("/api/pccc/archive"),
    staleTime: 5 * 60 * 1000,
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
