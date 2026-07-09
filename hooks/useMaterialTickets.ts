"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export interface TicketItem {
  id: string;
  materialId: string;
  deviceSeq: string | null;
  deviceNameManual: string | null;
  quantity: number;
  material: { id: string; code: string; name: string; unit: string; quantity: number };
  device: { seq: string; name: string; kks: string | null } | null;
}

export interface MaterialTicket {
  id: string;
  code: string;
  type: "DE_XUAT" | "UNG";
  unit: string;
  status: string;
  assignedPosition: string;
  materialCategory: string | null;
  bbktNumber: string | null;
  proposalNote: string | null;
  pctNumber: string | null;
  proposalNumber: string | null;
  completionNote: string | null;
  chiHuyName: string | null;
  docUrl: string | null;
  rejectedReason: string | null;
  createdById: string;
  createdByName: string;
  proposedByName: string | null;
  proposedByPosition: string | null;
  proposedAt: string | null;
  confirmedByName: string | null;
  confirmedByPosition: string | null;
  confirmedAt: string | null;
  statsByName: string | null;
  statsByPosition: string | null;
  statsAt: string | null;
  completedByName: string | null;
  completedByPosition: string | null;
  completedAt: string | null;
  createdAt: string;
  items: TicketItem[];
}

/** Quyền theo từng bước quy trình (admin cấu hình; bước trống dùng mặc định cũ). */
export interface ViewerSteps {
  create: boolean;
  confirm: boolean;
  accept: boolean;
  manage: boolean;
  manageConfigured: boolean;
}

export interface TicketViewer {
  id: string;
  name: string;
  position: string | null;
  isShiftLeader: boolean;
  isStats: boolean;
  canCreate: boolean;
  isAdmin: boolean;
  hasScope: boolean;
  steps?: ViewerSteps;
}

export type WorkflowRoleMap = { create: string[]; confirm: string[]; accept: string[]; manage: string[] };

/** Cấu hình phân quyền quy trình (chỉ ADMIN gọi được). */
export function useWorkflowRoles(enabled: boolean) {
  return useQuery({
    queryKey: ["material-workflow-roles"],
    enabled,
    queryFn: () => apiGet<WorkflowRoleMap>("/api/material-workflow-roles"),
  });
}

export function useSaveWorkflowRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roles: WorkflowRoleMap) => apiMutate<WorkflowRoleMap>("/api/material-workflow-roles", "PUT", { roles }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["material-workflow-roles"] });
      qc.invalidateQueries({ queryKey: ["material-tickets"] });
    },
  });
}

export function useMaterialTickets() {
  return useQuery({
    queryKey: ["material-tickets"],
    staleTime: 60_000, // 60s không refetch lại, giảm request lên server
    queryFn: async () => {
      const res = await apiGet<MaterialTicket[]>("/api/material-tickets");
      return { tickets: res.data, viewer: (res.meta?.viewer ?? null) as TicketViewer | null };
    },
  });
}

export function useTicketOptions(enabled: boolean) {
  return useQuery({
    queryKey: ["material-ticket-options"],
    enabled,
    queryFn: async () => {
      const res = await apiGet<{
        devices: { seq: string; name: string; depth: number }[];
        materials: {
          id: string; code: string; name: string; unit: string; quantity: number; category: string | null;
          managingPositions: string[];
          devices: { seq: string; label: string }[];
        }[];
        positions: string[];
      }>("/api/material-tickets/options");
      return res.data;
    },
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      type: "DE_XUAT" | "UNG"; unit: string; bbktNumber?: string; note?: string;
      assignedPosition: string; materialCategory: string;
      materialId?: string; proposedQuantity?: number; replacementDeviceName?: string;
    }) =>
      apiMutate<MaterialTicket>("/api/material-tickets", "POST", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["material-tickets"] }),
  });
}

export function useTicketAction(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiMutate<MaterialTicket>(`/api/material-tickets/${id}`, "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["material-tickets"] }),
  });
}

export function useDeleteTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/material-tickets/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["material-tickets"] }),
  });
}

/* Hành động đang mở cho người xem trên 1 phiếu -> hiển thị "Đến lượt bạn" + nút */
export function actionsFor(t: MaterialTicket, v: TicketViewer | null): string[] {
  if (!v) return [];
  const a: string[] = [];
  const isAssigned = !!v.position && v.position === t.assignedPosition;
  if (t.type === "DE_XUAT") {
    if (t.status === "CHO_DE_XUAT" && isAssigned && v.hasScope) a.push("propose");
    if (t.status === "CHO_XAC_NHAN" && (v.steps?.confirm ?? v.isShiftLeader)) a.push("confirm");
    if (t.status === "VAT_TU_KHONG_CO" && (v.isShiftLeader || v.isAdmin || v.id === t.createdById)) a.push("reject");
    if ((t.status === "CHO_THONG_KE" || t.status === "CHO_PHIEU__XUAT_KHO") && v.isStats) a.push("stats");
    if (t.status === "CHO_NGHIEM_THU" && (v.steps?.accept ?? v.isShiftLeader)) a.push("accept");
  } else {
    if (t.status === "CHO_NHAP_LIEU" && isAssigned && v.hasScope) a.push("ungEntry");
    if (t.status === "CHO_XAC_NHAN_PDF" && v.isShiftLeader) a.push("ungConfirmDoc");
    if (t.status === "CHO_HOAN_THIEN") {
      if (v.isShiftLeader && !t.bbktNumber) a.push("ungBbkt");
      if (v.isStats && !t.proposalNumber) a.push("ungStats");
    }
  }
  return a;
}
