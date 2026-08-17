"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { apiGet, apiMutate } from "@/lib/fetcher";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import type { Material } from "@/types";

export interface MaterialReplacementPoint {
  id: string;
  materialId: string;
  deviceSeq: string | null;
  deviceId: string | null;
  system: string | null;
  location: string | null; // tên thiết bị nhập tay
  deviceCount: number; // số lượng thiết bị tại điểm này
  managingPosition: string | null; // cương vị quản lý
  isActive: boolean; // true = đang theo dõi thời gian thay thế
  quantity: number;
  intervalMonths: number;
  intervalNote: string | null;
  /** Theo O&M chỉ lấy mẫu/theo dõi/châm bổ sung, không thay thế định kỳ. */
  samplingOnly?: boolean;
  recoveryOnSupplement?: boolean;
  lastReplacedAt: string | Date | null;
  nextDueAt: string | Date;
  note: string | null;
  _count?: { logs: number };
  device: { id: string; code: string; name: string; system: string | null } | null;
  /** Node gắn điểm là THƯ MỤC (còn thiết bị con) chứ không phải thiết bị cấp cuối. */
  deviceIsFolder?: boolean;
  /** Tổ máy sở hữu điểm khai báo: S1 | S2 | COMMON — quyết định cây thiết bị của SYC. */
  machine?: string;
  managingPositionCode?: string | null;
  /** Các SYC thay thế đã ra cho chính điểm này (mới nhất trước, tối đa 3). */
  defectRequests?: Array<{
    id: string;
    quantity: number;
    defect: {
      id: string;
      requestNumber: string | null;
      requestType: string | null;
      status: string;
      cancelledAt: string | Date | null;
    };
  }>;
}

export interface MaterialWithDevices extends Material {
  documentUrl: string | null;
  documentName: string | null;
  deviceMaterials?: Array<{
    id: string;
    deviceId: string;
    materialId: string;
    quantity: number;
    usedAt: string | Date;
    note: string | null;
    device: { id: string; code: string; name: string; system: string | null; managingPosition: string | null };
  }>;
  replacements?: MaterialReplacementPoint[];
  totalNeed?: number; // tổng nhu cầu 1 chu kỳ = Σ số lượng các điểm thay thế
  shortfall?: number; // đề xuất thêm = max(0, tổng nhu cầu − tồn kho)
  machines?: string[]; // các tổ máy đang có vật tư này (cùng code) — form Cập nhật tick sẵn
}

/**
 * Danh mục vật tư.
 * - machine: lọc theo tổ máy (S1/S2/COMMON) ngay từ server — payload nhỏ hơn nhiều.
 * - includeUsage: kèm lịch sử tiêu hao theo thiết bị (deviceMaterials) — chỉ Reports cần.
 * Mutation invalidate theo prefix ["materials"] nên mọi biến thể đều được làm mới.
 */
export function useMaterials(params: { machine?: string; includeUsage?: boolean } = {}) {
  const { data: session, status } = useSession();
  const rbac = useRbacAccess();
  const permissionLevel = rbac.permissionLevel("material-manage");
  const qs = new URLSearchParams();
  if (params.machine) qs.set("machine", params.machine);
  if (params.includeUsage) qs.set("include", "usage");
  return useQuery({
    // Danh sách trả về phụ thuộc tài khoản, cấp RBAC và phạm vi cương vị.
    // Không dùng chung cache giữa hai phiên đăng nhập trên cùng trình duyệt.
    queryKey: ["materials", session?.user?.id, permissionLevel, params],
    queryFn: () => apiGet<MaterialWithDevices[]>(`/api/materials?${qs.toString()}`),
    enabled: status === "authenticated" && !rbac.isLoading && permissionLevel !== "none",
    // Trước đây refetchOnMount:"always" + không staleTime → mỗi lần vào trang đều gọi lại API
    // và phải chờ trọn vòng đời request. Danh mục vật tư đổi không thường xuyên; các thao tác
    // thêm/sửa/xoá đều đã invalidate queryKey ["materials"] nên dữ liệu vẫn tươi khi cần.
    staleTime: 60_000,
  });
}

export type MaterialReplacementInput = {
  deviceSeq?: string | null;
  system?: string | null;
  location?: string | null;
  deviceCount?: number;
  managingPosition?: string | null;
  isActive?: boolean;
  quantity?: number;
  intervalMonths?: number;
  intervalNote?: string | null;
  lastReplacedAt?: string | null;
  recoveryOnSupplement?: boolean;
};

export type MaterialInput = Partial<Material> & {
  id?: string;
  documentUrl?: string | null;
  documentName?: string | null;
  replacements?: MaterialReplacementInput[];
  syncAll?: boolean;
  machines?: string[];
};

// Danh mục đổi thì dropdown "Vật tư trong danh mục" của khai báo vật tư thiết bị
// (["device-material-options"]) cũng phải làm mới, không thì dialog dùng cache cũ 5 phút.
function invalidateMaterialCatalog(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["materials"] });
  qc.invalidateQueries({ queryKey: ["device-material-options"] });
}

export function useUpsertMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MaterialInput) =>
      apiMutate<Material>("/api/materials", body.id ? "PUT" : "POST", body),
    onSuccess: () => invalidateMaterialCatalog(qc),
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/materials?id=${id}`, "DELETE"),
    onSuccess: () => invalidateMaterialCatalog(qc),
  });
}

/** Xoá hàng loạt nhiều vật tư trong một lần gọi. */
export function useDeleteMaterials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => apiMutate<{ ids: string[]; count: number }>("/api/materials", "DELETE", { ids }),
    onSuccess: () => invalidateMaterialCatalog(qc),
  });
}

/** Một lô tồn theo số phiếu giao hàng. */
export interface StockLotRow {
  id: string;
  label: string;
  deliveryNote: string | null;
  erpCode: string | null;
  receivedAt: string | null;
  quantityIn: number;
  quantityLeft: number;
}

export interface MaterialStockLots {
  code: string;
  name: string;
  unit: string;
  category: string | null;
  total: number;
  quantity: number;
  lots: StockLotRow[];
}

/** Tồn hiện có tách theo số phiếu giao hàng — bảng theo dõi ở Danh mục vật tư. */
export function useMaterialStockLots(category: string, enabled = true) {
  return useQuery({
    queryKey: ["material-stock-lots", category],
    queryFn: () => apiGet<MaterialStockLots[]>(`/api/materials/stock-lots?category=${encodeURIComponent(category)}`),
    enabled,
    staleTime: 30_000,
  });
}
