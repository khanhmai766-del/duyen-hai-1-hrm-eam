"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { MaterialReplacement, MaterialReplacementLog } from "@prisma/client";

export type ReplacementDevice = { id: string; code: string; name: string; system: string | null; managingPosition?: string | null };
export type ReplacementMaterial = {
  id: string;
  code: string;
  name: string;
  unit: string;
  imageUrl?: string | null;
  system: string | null;
  machine?: string | null; // tổ máy của vật tư trong Danh mục: S1 | S2 | COMMON
  category?: string | null; // loại vật tư: Dầu bôi trơn, Lõi lọc dầu, Hóa Chất...
  deviceMaterials?: Array<{ device: ReplacementDevice }>;
};

export interface ReplacementItem extends MaterialReplacement {
  deviceId?: string | null;
  material: ReplacementMaterial & { imageUrl: string | null };
  device: ReplacementDevice | null;
  _count: { logs: number };
}

export interface ReplacementDetail extends MaterialReplacement {
  deviceId?: string | null;
  material: { id: string; code: string; name: string; unit: string; imageUrl: string | null };
  device: ReplacementDevice | null;
  logs: (MaterialReplacementLog & { doneBy: { id: string; name: string; position: string | null; avatarUrl: string | null } })[];
}

export interface ReplacementFilters {
  q?: string;
  materialId?: string;
  due?: string; // OVERDUE | DUE_SOON | OK | WARN | ALL
}

export interface ReplacementLogItem extends MaterialReplacementLog {
  doneBy: { id: string; name: string; position: string | null; avatarUrl: string | null };
  /** Tài khoản khớp duy nhất với tên người ghi nhận trên dòng lưu trữ. */
  recordedByUser?: { id: string; name: string; position: string | null; avatarUrl: string | null } | null;
  /** Điểm theo dõi đã bị gỡ/xoá — dòng đang hiển thị bằng snapshot của chính log. */
  pointRemoved?: boolean;
  /** true = dòng LƯU TRỮ nhập từ sổ theo dõi vật tư (chỉ tra cứu, không gắn điểm theo dõi). */
  imported?: boolean;
  /**
   * Nội dung thực hiện đọc SỐNG từ lịch sử khiếm khuyết của phiếu (chờ chốt hoặc đã
   * chốt). Null với dòng ghi thủ công. Vì đọc sống nên phiếu được sửa/chốt lúc nào là
   * dòng lịch sử thay thế đổi theo lúc đó.
   */
  defectHistory?: {
    status: "PENDING" | "FINALIZED";
    workOrderNumber: string | null;
    requestType: string | null;
    performedAt: string | Date;
    content: string | null;
    result: string | null;
    /** Hạn tự chốt lịch sử; chỉ có khi đang PENDING. */
    finalizeAt: string | Date | null;
  } | null;
  /**
   * Khi điểm còn liên kết thì đây là dữ liệu của điểm; khi đã bị gỡ, server dựng lại
   * từ snapshot trên log nên giao diện không phải phân biệt hai trường hợp.
   */
  replacement: {
    system: string | null;
    managingPosition: string | null;
    intervalMonths: number;
    intervalNote: string | null;
    device: ReplacementDevice | null;
    material: ReplacementMaterial;
  } | null;
}

export function useReplacementHistory(filters: { q?: string } = {}) {
  const qs = new URLSearchParams();
  if (filters.q) qs.set("q", filters.q);
  return useQuery({
    queryKey: ["replacement-history", filters],
    queryFn: () => apiGet<ReplacementLogItem[]>(`/api/material-replacements/history?${qs.toString()}`),
    // Lịch sử là dữ liệu đã chốt, đổi rất ít. Không có staleTime thì mỗi lần chuyển
    // trang lại tải lại toàn bộ (646 dòng) và bảng chớp trắng.
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}

/** Một điểm khai báo có thể chọn để ra SYC thay thế ngay trong form khiếm khuyết. */
export interface ReplacementPointOption {
  id: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  materialUnit: string;
  category: string | null;
  deviceSeq: string | null;
  deviceName: string;
  deviceIsFolder: boolean;
  systemName: string;
  managingPosition: string | null;
  machine: string;
  /** Tổng lượng cần thay tại điểm = dung tích × số thiết bị. */
  quantity: number;
  intervalMonths: number;
  intervalNote: string | null;
  lastReplacedAt: string | null;
  nextDueAt: string;
  dueStatus: "OVERDUE" | "DUE_SOON" | "OK" | null;
  /** Số yêu cầu còn dang dở của chính điểm này, nếu có. */
  openRequestNumber: string | null;
}

/**
 * Điểm khai báo lọc theo tổ máy + cương vị đang chọn ở form khiếm khuyết.
 * Không đủ hai tham số thì không gọi API — server cũng trả rỗng.
 */
export function useReplacementPointOptions(
  filters: { machine?: string; position?: string; category?: string },
  options?: { enabled?: boolean }
) {
  const ready = Boolean(filters.machine && filters.position);
  const qs = new URLSearchParams();
  if (filters.machine) qs.set("machine", filters.machine);
  if (filters.position) qs.set("position", filters.position);
  if (filters.category) qs.set("category", filters.category);
  return useQuery({
    queryKey: ["replacement-point-options", filters],
    queryFn: () => apiGet<ReplacementPointOption[]>(`/api/material-replacements/points?${qs.toString()}`),
    enabled: ready && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export interface ReplacementMeta {
  total: number;
  counts: { OVERDUE: number; DUE_SOON: number; OK: number };
  warn: number;
  /** Phạm vi cương vị được xem, do server tính (xem lib/position-data-scope.ts).
   *  `all` = xem toàn bộ; ngược lại ô lọc "Cương vị" chỉ bày `labels`. */
  positionScope?: { all: boolean; codes: string[]; labels: string[] };
}

export function useReplacements(filters: ReplacementFilters = {}, options?: { enabled?: boolean }) {
  const qs = new URLSearchParams();
  if (filters.q) qs.set("q", filters.q);
  if (filters.materialId) qs.set("materialId", filters.materialId);
  if (filters.due && filters.due !== "ALL") qs.set("due", filters.due);
  return useQuery({
    enabled: options?.enabled ?? true,
    queryKey: ["replacements", filters],
    queryFn: () => apiGet<ReplacementItem[]>(`/api/material-replacements?${qs.toString()}`),
    // Không có staleTime = coi dữ liệu cũ ngay lập tức → gọi lại API mỗi lần mount.
    // Ghi nhận/sửa/xoá điểm thay thế đều invalidate ["replacements"] nên vẫn tươi khi cần.
    staleTime: 60_000,
  });
}

/** Cảnh báo thay thế: các điểm quá hạn hoặc sắp đến hạn (≤ 1 tháng). */
export function useReplacementAlerts() {
  return useQuery({
    queryKey: ["replacements", { due: "WARN" }],
    queryFn: () => apiGet<ReplacementItem[]>(`/api/material-replacements?due=WARN`),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
  });
}

export function useReplacement(id: string | undefined) {
  return useQuery({
    queryKey: ["replacement", id],
    queryFn: () => apiGet<ReplacementDetail>(`/api/material-replacements/${id}`),
    enabled: !!id,
  });
}

export type ReplacementInput = Record<string, unknown>;

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["replacements"] });
  qc.invalidateQueries({ queryKey: ["replacement-history"] });
  qc.invalidateQueries({ queryKey: ["materials"] });
}

/** Tạo một điểm theo dõi thời gian thay thế (bản ghi riêng, isActive=true). */
export function useCreateReplacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReplacementInput) =>
      apiMutate<ReplacementItem>("/api/material-replacements", "POST", body),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateReplacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ReplacementInput & { id: string }) =>
      apiMutate<ReplacementItem>(`/api/material-replacements/${id}`, "PUT", body),
    onSuccess: (_d, vars) => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: ["replacement", vars.id] });
    },
  });
}

export function useDeleteReplacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/material-replacements/${id}`, "DELETE"),
    onSuccess: () => invalidate(qc),
  });
}

// Không còn hook ghi nhận thay thế thủ công: lịch sử thay thế CHỈ được sinh khi
// hoàn thành số yêu cầu thay thế vật tư, để mỗi lần thay đều truy ngược được về
// một phiếu khiếm khuyết có số. Hai hook dưới chỉ sửa/xoá dòng lịch sử đã có.

export function useUpdateReplacementLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ReplacementInput & { id: string }) =>
      apiMutate<ReplacementLogItem>(`/api/material-replacements/history/${id}`, "PUT", body),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteReplacementLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/material-replacements/history/${id}`, "DELETE"),
    onSuccess: () => invalidate(qc),
  });
}
