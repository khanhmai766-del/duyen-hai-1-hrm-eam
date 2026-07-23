"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { PositionSystemScope, ScopeAccess } from "@/lib/position-system-scopes";
import type { EquipmentBranchClassification } from "@/lib/equipment-classification";

// Phân quyền hệ thống theo cương vị hầu như không đổi — cache lâu để tránh refetch
// liên tục (hook này chạy trong useSystemAccess và mọi EquipmentTreePicker).
export function usePositionSystemScopes() {
  return useQuery({
    queryKey: ["position-system-scopes"],
    queryFn: () => apiGet<PositionSystemScope[]>("/api/position-system-scopes"),
    staleTime: 10 * 60 * 1000,
  });
}

export function useUpdatePositionSystemScope() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { position: string; entries: Array<{ systemSeq: string; access: ScopeAccess }> }) =>
      apiMutate<PositionSystemScope[]>("/api/position-system-scopes", "PUT", body),
    onSuccess: (data) => {
      queryClient.setQueryData(["position-system-scopes"], { data, meta: null });
      queryClient.invalidateQueries({ queryKey: ["position-system-scopes"] });
    },
  });
}

export type BranchPositionAssignmentResult = {
  seq: string;
  assignmentType: "block" | "position";
  value: string;
  affectedNodes: number;
};

/** Metadata Khối/Cương vị của nhánh; hoàn toàn không tham gia phân quyền. */
export function useEquipmentClassifications() {
  return useQuery({
    queryKey: ["equipment-classifications"],
    queryFn: () => apiGet<EquipmentBranchClassification[]>("/api/equipment-classifications"),
    staleTime: 10 * 60 * 1000,
  });
}

export function useAssignPositionToEquipmentBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { seq: string; assignmentType: "block" | "position"; value: string }) =>
      apiMutate<BranchPositionAssignmentResult>("/api/equipment-classifications/assign", "POST", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment-classifications"] });
    },
  });
}
