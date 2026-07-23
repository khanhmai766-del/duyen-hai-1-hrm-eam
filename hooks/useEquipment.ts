"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export interface EquipmentNode {
  seq: string;
  parentSeq: string | null;
  name: string;
  drawing: string | null;
  depth: number;
  deviceId?: string | null;
}

/** Node cây LAZY — trường nhẹ trả từ /roots, /children, /search. */
export interface TreeNode {
  seq: string;
  parentSeq: string | null;
  code: string;
  name: string;
  kks: string | null;
  depth: number;
  childCount: number;
  hasChildren: boolean;
}

const TREE_STALE = 5 * 60 * 1000; // nhánh ít đổi → cache 5 phút, không refetch khi focus lại

/** Chỉ tải các nhánh GỐC khi mở trang (không tải toàn bộ cây). */
export function useTreeRoots() {
  return useQuery({
    queryKey: ["equipment-tree", "roots"],
    queryFn: () => apiGet<TreeNode[]>("/api/equipment-tree/roots"),
    staleTime: TREE_STALE,
    refetchOnWindowFocus: false,
  });
}

export const treeChildrenKey = (parentSeq: string) => ["equipment-tree", "children", parentSeq] as const;

/** Tải CON TRỰC TIẾP của một nút khi bung (dùng imperative qua queryClient, cache lại). */
export function fetchTreeChildren(qc: QueryClient, parentSeq: string) {
  return qc.fetchQuery({
    queryKey: treeChildrenKey(parentSeq),
    queryFn: () => apiGet<TreeNode[]>(`/api/equipment-tree/children?parentSeq=${encodeURIComponent(parentSeq)}`),
    staleTime: TREE_STALE,
  });
}

/** Tìm kiếm phía server, phân trang 50/lần (cursor theo sort). */
export function useTreeSearch(q: string) {
  const query = q.trim();
  return useInfiniteQuery({
    queryKey: ["equipment-tree", "search", query],
    queryFn: ({ pageParam }) =>
      apiGet<TreeNode[]>(`/api/equipment-tree/search?q=${encodeURIComponent(query)}&cursor=${pageParam ?? 0}`),
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage) => (lastPage.meta?.nextCursor ?? null) as number | null,
    enabled: query.length >= 2,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export interface EquipmentNodeDetail extends EquipmentNode {
  attachedInfo: string | null;
  documentUrl: string | null;
  imageUrl: string | null;
}

/**
 * Cây danh mục thiết bị ĐẦY ĐỦ (~22k node, ~3MB) — CHỈ dùng cho các màn hình thật sự cần
 * cả cây (form nghiệp vụ cũ, admin). Mặc định vẫn bật để tương thích; nơi nào có thể hãy
 * truyền { enabled } để chỉ tải khi cần. Cây hiển thị chính đã chuyển sang lazy (useTreeRoots…).
 */
export function useEquipmentTree(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["equipment-tree"],
    queryFn: () => apiGet<EquipmentNode[]>("/api/equipment-tree"),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });
}

export function useEquipmentNode(seq: string | null | undefined) {
  return useQuery({
    queryKey: ["equipment-node", seq],
    queryFn: () => apiGet<EquipmentNodeDetail>(`/api/equipment-tree/${encodeURIComponent(seq!)}`),
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

import type { EquipmentMachine } from "@/lib/equipment-units";

/** Hồ sơ theo tổ máy của một nút (S1/COMMON ngầm định; S2 tạo lười). */
export interface MachineProfile {
  machine: EquipmentMachine;
  code: string;
  kks: string | null;
  name: string;
  exists: boolean;
  attachedInfo: string | null;
  documentUrl: string | null;
  imageUrl: string | null;
}

export function useNodeProfiles(seq: string | null | undefined) {
  return useQuery({
    queryKey: ["equipment-profiles", seq],
    queryFn: () => apiGet<MachineProfile[]>(`/api/equipment-tree/profiles?seq=${encodeURIComponent(seq!)}`),
    enabled: !!seq,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** "Tạo hồ sơ S2 từ S1" — chỉ tạo dòng profile, KHÔNG sao chép dữ liệu nghiệp vụ. */
export function useCreateS2Profile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (seq: string) => apiMutate<{ id: string; code: string }>("/api/equipment-tree/profiles", "POST", { seq }),
    onSuccess: (_d, seq) => qc.invalidateQueries({ queryKey: ["equipment-profiles", seq] }),
  });
}

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
