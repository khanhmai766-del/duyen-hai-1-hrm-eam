"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export interface TicketItem {
  id: string;
  materialId: string;
  erpCode: string | null;
  erpName: string | null;
  deviceSeq: string | null;
  deviceNameManual: string | null;
  quantity: number;
  replacementQuantity: number | null;
  material: { id: string; code: string; erpCodes?: string[]; name: string; unit: string; quantity: number };
  device: { seq: string; name: string; kks: string | null } | null;
}

export interface MaterialTicket {
  id: string;
  sequenceNumber: number;
  code: string;
  type: "CHUA_CHON" | "DE_XUAT" | "UNG" | "SU_DUNG_HIEN_CO";
  unit: string;
  status: string;
  assignedPosition: string;
  materialCategory: string | null;
  bbktNumber: string | null;
  proposalNote: string | null;
  pctNumber: string | null;
  proposalNumber: string | null;
  proposalIssuedAt: string | null;
  proposalReceiverName: string | null;
  deliveryNoteNumber: string | null;
  repairRequestNumber: string | null;
  completionNote: string | null;
  chiHuyName: string | null;
  docUrl: string | null;
  bbktDocUrl: string | null;
  recoveryRequired: boolean | null;
  recoveryQuantity: number | null;
  recoveryReturnedAt: string | null;
  recoveryDocUrl: string | null;
  workStartedAt: string | null;
  workEndedAt: string | null;
  settledAt: string | null;
  settledByName: string | null;
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
  vhvReceivedQuantity: number | null;
  vhvMaterialCode: string | null;
  vhvReceivedByName: string | null;
  vhvReceivedByPosition: string | null;
  vhvReceivedAt: string | null;
  receivedQuantity: number | null;
  receivedMethod: string | null;
  receiptSource: "ERP" | "OUTSIDE" | "EXISTING" | null;
  receivedByName: string | null;
  receivedByPosition: string | null;
  receivedAt: string | null;
  usedQuantity: number | null;
  remainingQuantity: number | null;
  usedByName: string | null;
  usedByPosition: string | null;
  usedAt: string | null;
  completedByName: string | null;
  completedByPosition: string | null;
  completedAt: string | null;
  createdAt: string;
  items: TicketItem[];
  activityLogs?: TicketActivityLog[];
}

export interface TicketActivityLog {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
  user: { name: string; position: string | null };
}

/** Quyền theo từng bước quy trình (admin cấu hình; bước trống dùng mặc định cũ). */
export interface ViewerSteps {
  create: boolean;
  confirm: boolean;
  vhvReceive: boolean;
  vhvReceiveConfigured: boolean;
  receive: boolean;
  use: boolean;
  accept: boolean;
  stats: boolean;
  settle: boolean;
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

export type WorkflowRoleMap = {
  create: string[]; confirm: string[]; vhvReceive: string[]; stats: string[]; receive: string[]; use: string[]; accept: string[];
  settle: string[]; manage: string[];
};

const samePosition = (a?: string | null, b?: string | null) => {
  const left = (a ?? "").trim().toLocaleLowerCase("vi");
  const right = (b ?? "").trim().toLocaleLowerCase("vi");
  return !!left && left === right;
};

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
    staleTime: 0,
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
          machine: string;
          erpCodes: { code: string; name: string; erpStock: number }[];
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
      type?: "DE_XUAT" | "UNG"; unit: string; bbktNumber?: string; note?: string;
      assignedPosition: string; materialCategory: string;
      materialId?: string; erpCode?: string; proposedQuantity?: number; replacementDeviceName?: string; replacementDeviceSeq?: string;
    }) =>
      apiMutate<MaterialTicket>("/api/material-tickets", "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["material-tickets"] });
      qc.invalidateQueries({ queryKey: ["material-ticket-options"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["oil-stock"] });
    },
  });
}

export function useTicketAction(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiMutate<MaterialTicket>(`/api/material-tickets/${id}`, "PUT", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["material-tickets"] });
      qc.invalidateQueries({ queryKey: ["material-ticket-options"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["oil-stock"] });
    },
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
  const isAssigned = samePosition(v.position, t.assignedPosition);
  const canOperateAssigned = isAssigned || v.isAdmin;
  if (t.type === "CHUA_CHON") {
    if (t.status === "CHO_XAC_NHAN" && (v.steps?.confirm ?? v.isShiftLeader)) a.push("confirm");
  } else if (["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type)) {
    if (t.status === "CHO_DE_XUAT" && isAssigned && v.hasScope) a.push("propose");
    if (t.status === "CHO_XAC_NHAN" && (v.steps?.confirm ?? v.isShiftLeader)) a.push("confirm");
    if (t.status === "VAT_TU_KHONG_CO" && (v.isShiftLeader || v.isAdmin || v.id === t.createdById)) a.push("reject");
    if ((t.status === "CHO_THONG_KE" || t.status === "CHO_PHIEU__XUAT_KHO" || t.status === "CHO_XAC_NHAN_PHAT") && v.steps?.stats) a.push("stats");
    if (t.status === "VHV_LANH_VAT_TU" && (v.steps?.vhvReceiveConfigured ? v.steps.vhvReceive : canOperateAssigned)) a.push("vhvReceive");
    if (t.status === "NHAN_TU_HIEN_CO" && (v.steps?.receive ?? v.isShiftLeader)) a.push("receiveExisting");
    if (t.status === "NHAN_VAT_TU" && (v.steps?.receive ?? v.isShiftLeader)) a.push("receive");
    if (t.status === "CHO_PHIEU_YCSC" && (v.steps?.receive ?? v.isShiftLeader)) a.push("repairRequest");
    if (t.status === "SU_DUNG_VAT_TU" && (v.steps?.use ?? v.isShiftLeader)) a.push("use");
    if (t.status === "CHO_NGHIEM_THU" && (v.steps?.accept ?? v.isShiftLeader)) a.push("accept");
    if (t.status === "CHO_QUYET_TOAN" && v.steps?.settle) a.push("settle");
  } else {
    if (t.status === "NHAN_VAT_TU" && (v.steps?.receive ?? v.isShiftLeader)) a.push("receive");
    if (t.status === "SU_DUNG_VAT_TU" && (v.steps?.use ?? v.isShiftLeader)) a.push("use");
  }
  return a;
}
