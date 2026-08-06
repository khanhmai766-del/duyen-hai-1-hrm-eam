"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { TreeScope } from "@/lib/equipment-units";

export interface EquipmentNode {
  seq: string;
  parentSeq: string | null;
  name: string;
  drawing: string | null;
  depth: number;
  deviceId?: string | null;
}

/**
 * Node cây LAZY — trường nhẹ trả từ /roots, /children, /search.
 * `seq` LUÔN là mã chuẩn DH1.S1.x (khóa nghiệp vụ chung cho cả 3 phạm vi);
 * `fullCode`/`code`/`kks` đã được chiếu theo phạm vi đang xem.
 */
export interface TreeNode {
  seq: string;
  parentSeq: string | null;
  machine: TreeScope;
  fullCode: string;
  code: string;
  name: string;
  kks: string | null;
  depth: number;
  childCount: number;
  hasChildren: boolean;
}

const TREE_STALE = 5 * 60 * 1000; // nhánh ít đổi → cache 5 phút, không refetch khi focus lại

export type EquipmentPermissionScope = "material-manage" | "replacement-manage";

// Bỏ trống `scope` = CẢ cây (đủ 6 nhánh) — bộ chọn thư mục khi cấu hình phân quyền cần vậy.
const scopeKeyOf = (scope?: TreeScope) => scope ?? "ALL";
const treeParams = (
  scope?: TreeScope,
  permissionScope?: EquipmentPermissionScope,
  positionScope?: string | null
) => {
  const params = new URLSearchParams();
  if (scope) params.set("scope", scope);
  if (permissionScope) params.set("permissionScope", permissionScope);
  if (positionScope?.trim()) params.set("positionScope", positionScope.trim());
  const query = params.toString();
  return query ? `${query}&` : "";
};

/** Chỉ tải các nhánh GỐC của phạm vi đang xem khi mở trang (không tải toàn bộ cây). */
export function useTreeRoots(
  scope?: TreeScope,
  permissionScope?: EquipmentPermissionScope,
  positionScope?: string | null
) {
  return useQuery({
    queryKey: [
      "equipment-tree",
      "roots",
      scopeKeyOf(scope),
      permissionScope ?? "position-scope",
      positionScope?.trim() || "current-position",
    ],
    queryFn: () =>
      apiGet<TreeNode[]>(
        `/api/equipment-tree/roots?${treeParams(scope, permissionScope, positionScope)}`
      ),
    staleTime: TREE_STALE,
    refetchOnWindowFocus: false,
  });
}

export const treeChildrenKey = (
  scope: TreeScope | undefined,
  parentSeq: string,
  permissionScope?: EquipmentPermissionScope,
  positionScope?: string | null
) =>
  [
    "equipment-tree",
    "children",
    scopeKeyOf(scope),
    permissionScope ?? "position-scope",
    positionScope?.trim() || "current-position",
    parentSeq,
  ] as const;

/** Tải CON TRỰC TIẾP của một nút khi bung (dùng imperative qua queryClient, cache lại). */
export function fetchTreeChildren(
  qc: QueryClient,
  scope: TreeScope | undefined,
  parentSeq: string,
  permissionScope?: EquipmentPermissionScope,
  positionScope?: string | null
) {
  return qc.fetchQuery({
    queryKey: treeChildrenKey(
      scope,
      parentSeq,
      permissionScope,
      positionScope
    ),
    queryFn: () =>
      apiGet<TreeNode[]>(
        `/api/equipment-tree/children?${treeParams(scope, permissionScope, positionScope)}parentSeq=${encodeURIComponent(parentSeq)}`
      ),
    staleTime: TREE_STALE,
  });
}

/** Tìm kiếm phía server, phân trang 50/lần (cursor theo sort). */
export function useTreeSearch(
  q: string,
  scope?: TreeScope,
  permissionScope?: EquipmentPermissionScope,
  positionScope?: string | null
) {
  const query = q.trim();
  return useInfiniteQuery({
    queryKey: [
      "equipment-tree",
      "search",
      scopeKeyOf(scope),
      permissionScope ?? "position-scope",
      positionScope?.trim() || "current-position",
      query,
    ],
    queryFn: ({ pageParam }) =>
      apiGet<TreeNode[]>(
        `/api/equipment-tree/search?${treeParams(scope, permissionScope, positionScope)}q=${encodeURIComponent(query)}&cursor=${pageParam ?? 0}`
      ),
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage) => (lastPage.meta?.nextCursor ?? null) as number | null,
    enabled: query.length >= 2,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export interface EquipmentNodeDetail extends EquipmentNode {
  machine: TreeScope;
  fullCode: string;
  kks: string | null;
  attachedInfo: string | null;
  documentUrl: string | null;
  imageUrl: string | null;
}

/**
 * Cây danh mục thiết bị ĐẦY ĐỦ (~22k node, ~3MB) — CHỈ dùng cho các màn hình thật sự cần
 * cả cây (form nghiệp vụ cũ, admin). Mặc định vẫn bật để tương thích; nơi nào có thể hãy
 * truyền { enabled } để chỉ tải khi cần. Cây hiển thị chính đã chuyển sang lazy (useTreeRoots…).
 */
export function useEquipmentTree(options?: {
  enabled?: boolean;
  permissionScope?: EquipmentPermissionScope;
}) {
  const permissionScope = options?.permissionScope;
  return useQuery({
    queryKey: ["equipment-tree", permissionScope ?? "position-scope"],
    queryFn: () =>
      apiGet<EquipmentNode[]>(
        `/api/equipment-tree${permissionScope ? `?permissionScope=${encodeURIComponent(permissionScope)}` : ""}`
      ),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });
}

export function useEquipmentNode(
  seq: string | null | undefined,
  machine: TreeScope = "S1",
  permissionScope?: EquipmentPermissionScope,
  positionScope?: string | null
) {
  return useQuery({
    queryKey: [
      "equipment-node",
      seq,
      machine,
      permissionScope ?? "position-scope",
      positionScope?.trim() || "current-position",
    ],
    queryFn: () =>
      apiGet<EquipmentNodeDetail>(
        `/api/equipment-tree/${encodeURIComponent(seq!)}?machine=${machine}${permissionScope ? `&permissionScope=${encodeURIComponent(permissionScope)}` : ""}${positionScope?.trim() ? `&positionScope=${encodeURIComponent(positionScope.trim())}` : ""}`
      ),
    enabled: !!seq,
    staleTime: 5 * 60 * 1000,
  });
}

import type { RawImportRow, ImportMode, ImportPreview } from "@/lib/equipment-import";

export interface ImportResult {
  preview?: ImportPreview;
  result?: { created: number; updated: number; skipped: number; deleted: number };
  mode: ImportMode;
}

/** Nhập cây thiết bị: dryRun=true để xem trước/validate; false để ghi. */
export function useImportEquipmentTree() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { rows: RawImportRow[]; system: string; mode: ImportMode; dryRun: boolean }) =>
      apiMutate<ImportResult>("/api/equipment-tree/import", "POST", body),
    onSuccess: (data) => {
      if (data.result) qc.invalidateQueries({ queryKey: ["equipment-tree"] });
    },
  });
}

// Hồ sơ theo tổ máy không còn được đọc từ client: tổ máy đã chọn ở CÂY (?scope=) và mã/KKS
// theo tổ máy được các API cây/thiết bị chiếu sẵn. /api/equipment-tree/profiles chỉ còn là
// nơi lưu ghi đè tên/KKS riêng của một tổ máy (xem lib/equipment-profile-cache.ts).

/** Cập nhật thông tin/tài liệu/ảnh bổ sung của một node thiết bị (theo seq). */
export function useUpdateEquipmentNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { seq: string; attachedInfo?: string | null; documentUrl?: string | null; imageUrl?: string | null }) =>
      apiMutate("/api/equipment-tree", "PUT", body),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({ queryKey: ["equipment-tree"] });
      qc.invalidateQueries({ queryKey: ["equipment-node", body.seq] });
    },
  });
}

export function useMoveEquipmentNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { sourceSeq: string; targetParentSeq: string }) =>
      apiMutate<{ sourceSeq: string; seq: string; movedCount: number; targetParentSeq: string }>(
        "/api/equipment-tree/move",
        "POST",
        body
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-tree"] });
      qc.invalidateQueries({ queryKey: ["equipment-node"] });
      qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}
