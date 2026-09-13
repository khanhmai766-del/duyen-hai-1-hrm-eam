"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiGet, apiMutate, apiUpload } from "@/lib/fetcher";
import type {
  GroundingStatus,
  GroundingType,
} from "@/lib/grounding-lightning-shared";

export type GroundingAttachment = {
  id: string;
  pointId: string;
  originalName: string | null;
  url: string;
  createdAt: string;
};
export type GroundingPoint = {
  id: string;
  type: GroundingType;
  status: GroundingStatus;
  defectDescription: string | null;
  updatedAt: string;
  attachments: GroundingAttachment[];
};
export type GroundingInspection = {
  id: string;
  note: string | null;
  inspectorName: string;
  inspectorPosition: string | null;
  /** Ảnh đại diện của người ký, máy chủ tra thêm — không có trong phiên đăng nhập. */
  inspectorAvatarUrl: string | null;
  signedAt: string;
  results: Array<{
    id: string;
    type: GroundingType;
    status: GroundingStatus;
    defectDescription: string | null;
    imageKeys: string[];
  }>;
};
export type GroundingItem = {
  id: string;
  areaEquipment: string;
  position: string | null;
  positionCode: string | null;
  machine: string;
  note: string | null;
  updatedAt: string;
  points: GroundingPoint[];
  latestInspection: GroundingInspection | null;
  needsSignature: boolean;
};
export type GroundingFilters = {
  q: string;
  positionCode: string;
  machine: string;
  type: string;
  status: string;
};

function queryString(filters: GroundingFilters) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value && value !== "ALL") sp.set(key, value);
  return sp.toString();
}

export function useGroundingItems(filters: GroundingFilters) {
  return useQuery({
    queryKey: ["grounding-lightning", filters],
    queryFn: () =>
      apiGet<GroundingItem[]>(
        `/api/grounding-lightning?${queryString(filters)}`,
      ),
    staleTime: 15_000,
    /*
     * Giữ danh sách CŨ trên bảng trong lúc tải kết quả cho bộ lọc/từ khoá MỚI.
     *
     * Bộ lọc nằm trong queryKey nên mỗi lần đổi là một khoá chưa có dữ liệu: không có
     * dòng này thì `data` về undefined, bảng rơi xuống 0 dòng và nháy dòng "Chưa có dữ
     * liệu phù hợp" rồi mới hiện lại — đúng cảm giác giật khi gõ tìm kiếm hay đổi bộ lọc.
     */
    placeholderData: keepPreviousData,
  });
}

export function useGroundingAreaOptions(positionCode: string, machine: string) {
  return useQuery({
    queryKey: ["grounding-lightning-area-options", positionCode, machine],
    queryFn: () =>
      apiGet<GroundingItem[]>(
        `/api/grounding-lightning?${queryString({ q: "", positionCode, machine, type: "ALL", status: "ALL" })}`,
      ),
    enabled: Boolean(positionCode && machine),
    staleTime: 30_000,
  });
}

function useInvalidateGrounding() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["grounding-lightning"] }),
      qc.invalidateQueries({
        queryKey: ["grounding-lightning-area-options"],
      }),
    ]);
}

export function useCreateGroundingItem() {
  const invalidate = useInvalidateGrounding();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiMutate<GroundingItem>("/api/grounding-lightning", "POST", body),
    onSuccess: invalidate,
  });
}
export function useUpdateGroundingItem() {
  const invalidate = useInvalidateGrounding();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiMutate<GroundingItem>(`/api/grounding-lightning/${id}`, "PATCH", body),
    onSuccess: invalidate,
  });
}
export function useDeleteGroundingItem() {
  const invalidate = useInvalidateGrounding();
  return useMutation({
    mutationFn: (id: string) =>
      apiMutate<{ id: string }>(`/api/grounding-lightning/${id}`, "DELETE"),
    onSuccess: invalidate,
  });
}
export function useSignGroundingItem() {
  const invalidate = useInvalidateGrounding();
  return useMutation({
    mutationFn: (id: string) =>
      apiMutate<GroundingInspection>(
        `/api/grounding-lightning/${id}/sign`,
        "POST",
      ),
    onSuccess: invalidate,
  });
}
export function useUploadGroundingImage() {
  const invalidate = useInvalidateGrounding();
  return useMutation({
    mutationFn: ({
      itemId,
      pointId,
      file,
    }: {
      itemId: string;
      pointId: string;
      file: File;
    }) => {
      const form = new FormData();
      form.set("pointId", pointId);
      form.set("file", file);
      return apiUpload<GroundingAttachment>(
        `/api/grounding-lightning/${itemId}/attachments`,
        form,
      );
    },
    onSuccess: invalidate,
  });
}
export function useDeleteGroundingImage() {
  const invalidate = useInvalidateGrounding();
  return useMutation({
    mutationFn: (id: string) =>
      apiMutate(`/api/grounding-lightning/attachments/${id}`, "DELETE"),
    onSuccess: invalidate,
  });
}
export function useGroundingHistory(id: string | null) {
  return useQuery({
    queryKey: ["grounding-lightning-history", id],
    queryFn: () =>
      apiGet<GroundingInspection[]>(`/api/grounding-lightning/${id}/history`),
    enabled: Boolean(id),
  });
}
