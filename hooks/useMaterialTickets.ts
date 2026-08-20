"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import { CHEMICAL_TICKET_TYPE, GAS_RETURN_STATUS, OTHER_MATERIAL_TICKET_TYPE } from "@/lib/constants";

export interface TicketItem {
  id: string;
  materialId: string;
  erpCode: string | null;
  erpName: string | null;
  deviceSeq: string | null;
  replacementPointKeys: string[];
  deviceNameManual: string | null;
  quantity: number;
  replacementQuantity: number | null;
  receivedQuantity: number | null;
  material: { id: string; code: string; erpCodes?: string[]; name: string; unit: string; quantity: number };
  device: { seq: string; name: string; kks: string | null } | null;
}

export interface MaterialTicket {
  id: string;
  sequenceMonth: string;
  sequenceNumber: number;
  // GHI_NHAN = phiếu khai một bước (NH3 lỏng): tạo xong là HOAN_TAT, không có bước tiếp.
  // HOA_CHAT = luồng hóa chất 3 bước (xem CHEMICAL_TICKET_TYPE trong lib/constants).
  type: "CHUA_CHON" | "DE_XUAT" | "UNG" | "SU_DUNG_HIEN_CO" | "GHI_NHAN" | "HOA_CHAT" | "VAT_TU_KHAC";
  unit: string;
  status: string;
  assignedPosition: string;
  materialCategory: string | null;
  bbktNumber: string | null;
  proposalNote: string | null;
  pctNumber: string | null;
  proposalNumber: string | null;
  proposalDocUrl: string | null;
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
  // Luồng hóa chất: lịch giao hàng và khối lượng giao chốt ở bước xác nhận đề xuất.
  deliveryScheduledAt: string | null;
  deliveryQuantity: number | null;
  recoveryReturnedAt: string | null;
  recoveryDocUrl: string | null;
  workStartedAt: string | null;
  workEndedAt: string | null;
  sccnRepresentativeName: string | null;
  sccnRepresentativePosition: string | null;
  bbntDoNumber: string | null;
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
  materialUserName: string | null;
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
  issue: boolean;
  use: boolean;
  accept: boolean;
  /** Xác nhận trả vỏ chai (bước cuối luồng chai khí); chưa cấu hình thì theo quyền bước Sử dụng. */
  return: boolean;
  stats: boolean;
  statsHandover: boolean;
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
  /** Kỹ thuật viên — luồng hóa chất cho xác nhận đề xuất ngang với Thống kê. */
  isTechnician?: boolean;
  canCreate: boolean;
  isAdmin: boolean;
  hasScope: boolean;
  steps?: ViewerSteps;
}

export type WorkflowRoleMap = {
  create: string[]; confirm: string[]; vhvReceive: string[]; stats: string[]; statsHandover: string[];
  receive: string[]; issue: string[]; use: string[]; accept: string[]; return: string[]; settle: string[]; manage: string[];
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

export interface MaterialTicketMonthSummary {
  month: string;
  count: number;
}

export function useMaterialTickets(month = "ALL") {
  return useQuery({
    queryKey: ["material-tickets", month],
    // 30s: mutation nào cũng invalidate query này nên thao tác của CHÍNH MÌNH vẫn
    // hiện tức thì; staleTime 0 trước đây khiến mỗi lần mount lại tải toàn bộ phiếu.
    staleTime: 30_000,
    // Quy trình nhiều người chờ lượt nhau: tự làm mới mỗi 60s để phiếu người khác
    // vừa chuyển bước hiện ra mà không cần F5 (chỉ chạy khi tab đang mở).
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (month !== "ALL") qs.set("month", month);
      const res = await apiGet<MaterialTicket[]>(`/api/material-tickets?${qs.toString()}`);
      return {
        tickets: res.data,
        viewer: (res.meta?.viewer ?? null) as TicketViewer | null,
        months: (res.meta?.months ?? []) as MaterialTicketMonthSummary[],
      };
    },
  });
}

export function useTicketOptions(enabled: boolean) {
  return useQuery({
    queryKey: ["material-ticket-options"],
    enabled,
    // Endpoint nặng (cây thiết bị + toàn bộ danh mục kèm ERP) — không tải lại
    // mỗi lần mở form; mutation liên quan vẫn invalidate nên dữ liệu không cũ.
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiGet<{
        devices: { seq: string; name: string; depth: number; parentSeq: string | null }[];
        materials: {
          id: string; code: string; name: string; unit: string; quantity: number; category: string | null;
          machine: string;
          erpCodes: { code: string; name: string; erpStock: number }[];
          managingPositions: string[];
          devices: { seq: string; label: string; system: string | null; managingPosition: string | null; recoveryOnSupplement: boolean }[];
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
      materialId?: string; erpCode?: string; proposedQuantity?: number; replacementDeviceName?: string;
      replacementDeviceSeq?: string; replacementDeviceSeqs?: string[];
      items?: Array<{ materialId: string; quantity: number; replacementDeviceSeqs?: string[] }>;
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

/* Hành động đang mở cho người xem trên 1 phiếu -> hiển thị "Đến lượt bạn" + nút.
 *
 * HAI RÀO GIAO NHAU (nghiệp vụ chốt 2026-08-18):
 *   1. Phân quyền BƯỚC (MaterialWorkflowRole) — cương vị nào được làm bước nào;
 *   2. Cương vị của PHIẾU — chỉ áp cho các bước do VHV được giao phiếu thực hiện.
 *
 * Trước đây chỉ có rào 1, mà rào 1 lại có phạm vi toàn phân xưởng: gán "Thải xỉ" vào
 * bước Nhận vật tư nghĩa là Thải xỉ nhận vật tư cho MỌI phiếu, nên tài khoản Thải xỉ
 * thấy "Đến lượt bạn" ở cả phiếu của Máy nghiền / Máy phó / XLN hỗn hợp.
 *
 * Bước của VHV (bắt buộc trùng cương vị phiếu): propose, vhvReceive, receiveExisting,
 * receive (trừ luồng Ứng), repairRequest, use, returnItems.
 * Bước điều hành (giữ phạm vi toàn phân xưởng, vì là việc chung của cả ca): confirm,
 * stats, statsHandover, accept, settle, statsExportDocuments, reject.
 */
export function actionsFor(t: MaterialTicket, v: TicketViewer | null): string[] {
  if (!v) return [];
  const a: string[] = [];
  const isAssigned = samePosition(v.position, t.assignedPosition);
  const canOperateAssigned = isAssigned || v.isAdmin;
  if (t.type === "CHUA_CHON") {
    if (t.status === "CHO_XAC_NHAN" && (v.steps?.confirm ?? v.isShiftLeader)) a.push("confirm");
  } else if (t.type === OTHER_MATERIAL_TICKET_TYPE) {
    if (t.status === "CHO_THONG_KE" && v.steps?.stats) a.push("otherApprove");
    if (t.status === "NHAN_VAT_TU" && v.steps?.receive) a.push("otherReceive");
  } else if (t.type === CHEMICAL_TICKET_TYPE) {
    // Luồng hóa chất chỉ có hai lượt thao tác sau khi tạo phiếu.
    // Xác nhận bồn/thiết bị đủ điều kiện: Trưởng ca / TK Lò máy / Trưởng kíp điện.
    if (t.status === "CHO_XAC_NHAN" && (v.steps?.confirm ?? v.isShiftLeader)) a.push("confirm");
    // Xác nhận đề xuất: Thống kê (theo phân quyền bước) HOẶC Kỹ thuật viên.
    if (t.status === "CHO_THONG_KE" && (v.steps?.stats || v.isTechnician)) a.push("stats");
    // Xác nhận khối lượng lãnh: CHỈ chính VHV được giao phiếu. Trước đây còn nhánh
    // "hoặc có bước Nhận vật tư", nhưng bước đó có phạm vi toàn phân xưởng nên cương vị
    // được phân bước lại thấy "đến lượt" ở phiếu hóa chất của mọi cương vị khác.
    if (t.status === "NHAN_VAT_TU" && canOperateAssigned) a.push("receive");
    if (t.status === "VAT_TU_KHONG_CO" && (v.isShiftLeader || v.isAdmin || v.id === t.createdById)) a.push("reject");
  } else if (["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type)) {
    if (t.status === "CHO_DE_XUAT" && isAssigned && v.hasScope) a.push("propose");
    if (t.status === "CHO_XAC_NHAN" && (v.steps?.confirm ?? v.isShiftLeader)) a.push("confirm");
    if (t.status === "VAT_TU_KHONG_CO" && (v.isShiftLeader || v.isAdmin || v.id === t.createdById)) a.push("reject");
    // Nhập mã ERP + số phiếu ĐXVT: quyền "stats".
    if ((t.status === "CHO_THONG_KE" || t.status === "CHO_PHIEU__XUAT_KHO") && v.steps?.stats) a.push("stats");
    // Xác nhận VHV nhận phiếu (hoặc đã trả phiếu): quyền RIÊNG "statsHandover" để giao
    // được cho cương vị khác ngoài Thống kê.
    if (t.status === "CHO_XAC_NHAN_PHAT" && (v.steps?.statsHandover ?? v.steps?.stats)) a.push("stats");
    if (t.status === "VHV_LANH_VAT_TU" && (v.steps?.vhvReceiveConfigured ? v.steps.vhvReceive : canOperateAssigned)) a.push("vhvReceive");
    if (t.status === "NHAN_TU_HIEN_CO" && canOperateAssigned && (v.steps?.receive ?? v.isShiftLeader)) a.push("receiveExisting");
    // Ứng: bước gộp "Xác nhận ĐXVT" — chỉ Thống kê; luồng khác giữ quyền Nhận vật tư.
    if (t.status === "NHAN_VAT_TU" && (t.type === "UNG" ? v.steps?.stats : (canOperateAssigned && (v.steps?.receive ?? v.isShiftLeader)))) a.push("receive");
    if (t.status === "CHO_PHIEU_YCSC" && canOperateAssigned && (v.steps?.receive ?? v.isShiftLeader)) a.push("repairRequest");
    if (t.status === "SU_DUNG_VAT_TU" && canOperateAssigned && (v.steps?.use ?? v.isShiftLeader)) a.push("use");
    if (t.status === "CHO_NGHIEM_THU" && (v.steps?.accept ?? v.isShiftLeader)) a.push("accept");
    // Chai khí: bước cuối là xác nhận trả vỏ chai, không nghiệm thu và không quyết toán.
    if (t.status === GAS_RETURN_STATUS && canOperateAssigned && (v.steps?.return ?? v.steps?.use ?? v.isShiftLeader)) a.push("returnItems");
    if (t.status === "CHO_THONG_KE_XUAT_BIEN_BAN" && v.steps?.stats) a.push("statsExportDocuments");
    if (t.status === "CHO_QUYET_TOAN" && v.steps?.settle) a.push("settle");
  } else {
    if (t.status === "NHAN_VAT_TU" && canOperateAssigned && (v.steps?.receive ?? v.isShiftLeader)) a.push("receive");
    if (t.status === "SU_DUNG_VAT_TU" && canOperateAssigned && (v.steps?.use ?? v.isShiftLeader)) a.push("use");
  }
  return a;
}

/** Các lô có thể dùng cho một phiếu + phần phiếu đang chiếm (bước Nghiệm thu). */
export interface TicketLotInfo {
  unit: string;
  materialName: string;
  usedQuantity: number;
  lots: Array<{ id: string; label: string; erpCode: string | null; receivedAt: string | null; available: number; taken: number }>;
}

export function useTicketLots(ticketId: string) {
  return useQuery({
    queryKey: ["ticket-lots", ticketId],
    queryFn: () => apiGet<TicketLotInfo>(`/api/material-tickets/${ticketId}/lots`),
    staleTime: 10_000,
  });
}
