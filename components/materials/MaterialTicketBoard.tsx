"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, Minus, X, Check, FileText, Zap, FlaskConical, ClipboardList, Package, Clock, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  AlertTriangle, Ban, Download, CircleCheck, Circle, CircleDot, Loader2, Pencil, Trash2, UserCog, CalendarDays,
  Filter, ChevronDown, Search,
  Wrench, ExternalLink,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UsagePhotoCard } from "./UsagePhotoCard";
import { DeliveryPhotoField } from "./DeliveryPhotoField";
import {
  ChemicalTruckLockedTable,
  ChemicalTruckPanel,
  ChemicalTruckRows,
  emptyTruck,
  truckRowError,
  trucksToPayload,
  type TruckRow,
} from "./ChemicalTruckRows";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useMaterialTickets, useTicketOptions, useCreateTicket, useTicketAction, useDeleteTicket,
  useWorkflowRoles, useSaveWorkflowRoles, actionsFor,
  useTicketLots,
  useTicketChemicalTrucks,
  useTicketUsagePhotos,
  samePosition,
  type MaterialTicket, type TicketViewer, type WorkflowRoleMap,
  useTicketReplacementRequest,
  usePrefetchTicketOptions } from "@/hooks/useMaterialTickets";
import { DefectForm } from "@/components/defects/defect-form";
import type { DefectItem } from "@/hooks/useDefects";
import { usePositions } from "@/hooks/useUsers";
import { MIN_USAGE_PHOTOS, usesHandwrittenBbnt, COMMON_MATERIAL_POSITION, displayMaterialCategory, GAS_RETURN_STATUS, isChemicalFlowTicket, isGasCylinderTicket, isOtherMaterialAdvanceTicket, isOtherMaterialCategory, isOtherMaterialTicketType, isSingleStepTicketMaterial, CHEMICAL_TICKET_TYPE, isSupplementReason, MATERIAL_CATEGORY_FILTERS, materialCategoryMatches, materialTicketBelongsToRecoveryTab, materialTicketRequiresRecovery, OTHER_MATERIAL_ADVANCE_TICKET_TYPE, OTHER_MATERIAL_GROUP, OTHER_MATERIAL_TICKET_TYPE, ticketReasonsFor, TICKET_REASONS, TICKET_REASON_OTHER, SINGLE_STEP_TICKET_TYPE, TICKET_MATERIAL_CATEGORIES, TICKET_TO_MATERIAL_CATEGORY } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
import { positionsMatch } from "@/lib/position-catalog";
import {
  materialTicketMonthKey,
  materialTicketMonthLabel,
  materialTicketReference,
} from "@/lib/material-ticket-sequence";

/* ============ meta hiển thị ============ */
const C = {
  navy: "#1E3A5F", accent: "#2563eb", cream: "#f6f4ef", line: "#e3e1da",
  ok: "#16a34a", okBg: "#e9f7ef", bad: "#dc2626", badBg: "#fdecec",
  warn: "#d97706", warnBg: "#fdf3e3", ung: "#ea580c", ungBg: "#fff1e7",
  muted: "#6b7280", soft: "#94a3b8",
};
const STATUS: Record<string, { label: string; c: string }> = {
  CHO_DE_XUAT: { label: "Chờ đề xuất", c: C.accent },
  CHO_XAC_NHAN: { label: "Chờ xác nhận", c: C.navy },
  CHO_XAC_NHAN_PHAT: { label: "Chờ Thống Kê xác nhận ĐXVT", c: "#0f766e" },
  CHO_PHIEU__XUAT_KHO: { label: "Chờ Thống Kê xác nhận ĐXVT", c: "#0f766e" },
  VAT_TU_KHONG_CO: { label: "Vật tư không có", c: C.bad },
  CHO_THONG_KE: { label: "Chờ thống kê", c: "#7c3aed" },
  VHV_LANH_VAT_TU: { label: "Chờ VHV lãnh vật tư", c: "#2563eb" },
  NHAN_TU_HIEN_CO: { label: "Nhận vật tư hiện có", c: "#0891b2" },
  NHAN_VAT_TU: { label: "Xác nhận vật tư lãnh", c: "#0891b2" },
  CHO_PHIEU_YCSC: { label: "Xác nhận vật tư lãnh", c: "#0891b2" },
  SU_DUNG_VAT_TU: { label: "Sử dụng vật tư", c: "#6d28d9" },
  CHO_NGHIEM_THU: { label: "Chờ nghiệm thu", c: C.warn },
  CHO_TRA_VO: { label: "Chờ xác nhận trả", c: C.warn },
  CHO_QUYET_TOAN: { label: "Chờ quyết toán", c: "#7c3aed" },
  CHO_THONG_KE_XUAT_BIEN_BAN: { label: "Chờ Thống kê xác nhận mã", c: "#0f766e" },
  CHO_NHAP_LIEU: { label: "Chờ nhập số lượng ứng", c: C.ung },
  CHO_NHAP_LIEU_THAY_THE: { label: "Chờ nhập liệu thay thế", c: C.ung },
  CHO_XAC_NHAN_PDF: { label: "Chờ xác nhận xuất file", c: C.ung },
  CHO_HOAN_THIEN: { label: "Chờ hoàn thiện hồ sơ", c: C.ung },
  HOAN_TAT: { label: "Hoàn tất", c: C.ok },
  TU_CHOI: { label: "Từ chối", c: C.bad },
};
const FLOW: Record<string, { key: string; label: string; who: string }[]> = {
  CHUA_CHON: [
    { key: "B0", label: "VHV tạo đề xuất", who: "VHV" },
    { key: "CHO_XAC_NHAN", label: "Xác nhận yêu cầu", who: "Trưởng ca/Trưởng kíp" },
  ],
  DE_XUAT: [
    { key: "B0", label: "VHV tạo đề xuất", who: "VHV" },
    { key: "CHO_THONG_KE", label: "Trưởng ca/Trưởng kíp xác nhận", who: "Trưởng ca/Trưởng kíp" },
    { key: "CHO_PHIEU__XUAT_KHO", label: "Thống Kê xác nhận ĐXVT", who: "Theo phân quyền quy trình" },
    { key: "NHAN_VAT_TU", label: "Xác nhận vật tư lãnh", who: "Theo phân quyền quy trình" },
    { key: "SU_DUNG_VAT_TU", label: "Xác nhận vật tư sử dụng", who: "Theo phân quyền quy trình" },
    { key: "CHO_NGHIEM_THU", label: "Nghiệm thu và xuất BBNT", who: "Theo phân quyền quy trình" },
    { key: "CHO_QUYET_TOAN", label: "Quyết toán vật tư", who: "Thống kê" },
  ],
  UNG: [
    { key: "B0", label: "VHV tạo đề xuất", who: "VHV" },
    { key: "VHV_LANH_VAT_TU", label: "VHV lãnh vật tư", who: "VHV được giao thực hiện" },
    { key: "SU_DUNG_VAT_TU", label: "Xác nhận vật tư sử dụng", who: "Theo phân quyền quy trình" },
    { key: "CHO_NGHIEM_THU", label: "Nghiệm thu công việc", who: "Theo phân quyền quy trình" },
    { key: "NHAN_VAT_TU", label: "Xác nhận ĐXVT", who: "Thống kê" },
    { key: "CHO_QUYET_TOAN", label: "Quyết toán vật tư", who: "Thống kê" },
  ],
  // Luồng hóa chất: bỏ bước Trưởng ca/Trưởng kíp và cả cụm sử dụng — nghiệm thu — quyết toán.
  [CHEMICAL_TICKET_TYPE]: [
    { key: "B0", label: "VHV tạo đề xuất", who: "VHV" },
    { key: "CHO_THONG_KE", label: "Xác nhận bồn / thiết bị đủ điều kiện", who: "Trưởng ca / TK Lò máy / Trưởng kíp điện" },
    { key: "CHO_PHIEU__XUAT_KHO", label: "Xác nhận đề xuất vật tư", who: "Thống kê hoặc Kỹ thuật viên" },
    { key: "NHAN_VAT_TU", label: "VHV xác nhận khối lượng lãnh", who: "VHV được giao" },
  ],
  // NH3 lỏng: tạo đề xuất trước, VHV được giao chốt chuyến xe và khối lượng thực lãnh sau.
  [SINGLE_STEP_TICKET_TYPE]: [
    { key: "B0", label: "VHV tạo đề xuất", who: "VHV" },
    { key: "NHAN_VAT_TU", label: "VHV xác nhận khối lượng lãnh", who: "VHV được giao" },
  ],
  [OTHER_MATERIAL_TICKET_TYPE]: [
    { key: "B0", label: "Lập phiếu đề xuất", who: "Người lập phiếu" },
    { key: "CHO_PHIEU__XUAT_KHO", label: "Xác nhận mã ERP và số ĐXVT", who: "Thống kê" },
    { key: "NHAN_VAT_TU", label: "Lãnh và nhập vào Hiện có", who: "Theo phân quyền quy trình" },
  ],
  [OTHER_MATERIAL_ADVANCE_TICKET_TYPE]: [
    { key: "B0", label: "Lập phiếu ứng", who: "Người lập phiếu" },
    { key: "NHAN_VAT_TU", label: "Lãnh ứng và nhập vào Hiện có", who: "Theo phân quyền quy trình" },
    { key: "CHO_THONG_KE", label: "Hoàn thiện số ĐXVT và chứng từ", who: "Thống kê" },
  ],
  // Luồng Sử dụng hiện có không có BBNT ký tay: bước nghiệm thu chỉ xuất BBTHVT, còn
  // BBNT D-Office do Thống kê xuất ở bước sau. Tên bước gọi đúng tệp thực sự được xuất.
  SU_DUNG_HIEN_CO: [
    { key: "B0", label: "VHV tạo đề xuất", who: "VHV" },
    { key: "XAC_NHAN_HIEN_CO", label: "Trưởng ca/Trưởng kíp xác nhận", who: "Trưởng ca/Trưởng kíp" },
    { key: "NHAN_TU_HIEN_CO", label: "Xác nhận vật tư lãnh", who: "Theo phân quyền quy trình" },
    { key: "SU_DUNG_VAT_TU", label: "Xác nhận vật tư sử dụng", who: "Theo phân quyền quy trình" },
    { key: "CHO_NGHIEM_THU", label: "Nghiệm thu và xuất BBTHVT", who: "Theo phân quyền quy trình" },
    { key: "CHO_THONG_KE_XUAT_BIEN_BAN", label: "Xuất BBNT DO", who: "Thống kê" },
    { key: "CHO_QUYET_TOAN", label: "Quyết toán vật tư", who: "Thống kê" },
  ],
};
const ORDER: Record<string, string[]> = {
  CHUA_CHON: ["B0", "CHO_XAC_NHAN"],
  [SINGLE_STEP_TICKET_TYPE]: ["B0", "NHAN_VAT_TU", "HOAN_TAT"],
  [CHEMICAL_TICKET_TYPE]: ["B0", "CHO_THONG_KE", "CHO_PHIEU__XUAT_KHO", "NHAN_VAT_TU", "HOAN_TAT"],
  [OTHER_MATERIAL_TICKET_TYPE]: ["B0", "CHO_PHIEU__XUAT_KHO", "NHAN_VAT_TU", "HOAN_TAT"],
  [OTHER_MATERIAL_ADVANCE_TICKET_TYPE]: ["B0", "NHAN_VAT_TU", "CHO_THONG_KE", "HOAN_TAT"],
  DE_XUAT: ["B0", "CHO_THONG_KE", "CHO_PHIEU__XUAT_KHO", "NHAN_VAT_TU", "SU_DUNG_VAT_TU", "CHO_NGHIEM_THU", "CHO_QUYET_TOAN", "HOAN_TAT"],
  UNG: ["B0", "VHV_LANH_VAT_TU", "SU_DUNG_VAT_TU", "CHO_NGHIEM_THU", "NHAN_VAT_TU", "CHO_PHIEU__XUAT_KHO", "CHO_QUYET_TOAN", "HOAN_TAT"],
  SU_DUNG_HIEN_CO: ["B0", "XAC_NHAN_HIEN_CO", "NHAN_TU_HIEN_CO", "SU_DUNG_VAT_TU", "CHO_NGHIEM_THU", "CHO_THONG_KE_XUAT_BIEN_BAN", "CHO_QUYET_TOAN", "HOAN_TAT"],
};
/* Chai khí (xem `isGasCylinderTicket`): vẫn là DE_XUAT/UNG nhưng bỏ nghiệm thu + quyết toán,
   thay bằng bước cuối Xác nhận trả vỏ chai. Ứng thì Thống kê xác nhận ĐXVT nằm SAU bước lãnh. */
const GAS_FLOW: Record<string, { key: string; label: string; who: string }[]> = {
  DE_XUAT: [
    { key: "B0", label: "VHV tạo đề xuất", who: "VHV" },
    { key: "CHO_THONG_KE", label: "Trưởng ca/Trưởng kíp xác nhận", who: "Trưởng ca/Trưởng kíp" },
    { key: "CHO_PHIEU__XUAT_KHO", label: "Thống Kê xác nhận ĐXVT", who: "Theo phân quyền quy trình" },
    { key: "NHAN_VAT_TU", label: "Xác nhận vật tư lãnh", who: "Theo phân quyền quy trình" },
    { key: GAS_RETURN_STATUS, label: "Xác nhận trả", who: "Theo phân quyền quy trình" },
  ],
  UNG: [
    { key: "B0", label: "VHV tạo đề xuất", who: "VHV" },
    { key: "CHO_XAC_NHAN", label: "Trưởng ca/Trưởng kíp xác nhận", who: "Trưởng ca/Trưởng kíp" },
    { key: "VHV_LANH_VAT_TU", label: "Xác nhận vật tư lãnh", who: "VHV được giao thực hiện" },
    { key: "NHAN_VAT_TU", label: "Thống Kê xác nhận ĐXVT", who: "Thống kê" },
    { key: GAS_RETURN_STATUS, label: "Xác nhận trả", who: "Theo phân quyền quy trình" },
  ],
};
const GAS_ORDER: Record<string, string[]> = {
  DE_XUAT: ["B0", "CHO_THONG_KE", "CHO_PHIEU__XUAT_KHO", "NHAN_VAT_TU", GAS_RETURN_STATUS, "HOAN_TAT"],
  UNG: ["B0", "CHO_XAC_NHAN", "VHV_LANH_VAT_TU", "NHAN_VAT_TU", GAS_RETURN_STATUS, "HOAN_TAT"],
};
const isGasTicketFlow = (t: { type: string; materialCategory: string | null }) =>
  isGasCylinderTicket(t.materialCategory) && !!GAS_FLOW[t.type];
const flowOf = (t: { type: string; materialCategory: string | null }) =>
  (isGasTicketFlow(t) ? GAS_FLOW[t.type] : FLOW[t.type]) ?? FLOW.CHUA_CHON;
const orderOf = (t: { type: string; materialCategory: string | null }) =>
  (isGasTicketFlow(t) ? GAS_ORDER[t.type] : ORDER[t.type]) ?? ORDER.CHUA_CHON;

const flowStatusKey = (status: string, type: string) =>
  (type === "DE_XUAT" || type === CHEMICAL_TICKET_TYPE) && status === "CHO_XAC_NHAN" ? "CHO_THONG_KE"
  : type === "DE_XUAT" && status === "CHO_THONG_KE_XUAT_BIEN_BAN" ? "CHO_NGHIEM_THU"
  : type === OTHER_MATERIAL_ADVANCE_TICKET_TYPE && status === "CHO_THONG_KE" ? "CHO_THONG_KE"
  : status === "CHO_THONG_KE" ? "CHO_PHIEU__XUAT_KHO"
  : status === "CHO_XAC_NHAN_PHAT" ? "CHO_PHIEU__XUAT_KHO"
  : status === "CHO_PHIEU_YCSC" ? (type === "UNG" ? "VHV_LANH_VAT_TU" : "NHAN_VAT_TU")
  : status;
/** Chỉ ngày, không giờ — lịch giao hàng và ngày lãnh là mốc ngày. */
const fmtDay = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const fmt = (s?: string | null) =>
  s ? new Date(s).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";
const datetimeLocalValue = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const normalizeReceiptSource = (source?: string | null): "ERP" | "EXISTING" =>
  source === "EXISTING" || source === "OUTSIDE" ? "EXISTING" : "ERP";
// Nguồn lãnh chỉ có HAI giá trị lưu trữ: ERP (lãnh kho công ty) và EXISTING. Nhưng EXISTING
// mang hai nghĩa khác hẳn nhau tùy luồng nên nhãn phải đọc theo luồng:
//   • luồng Ứng → "Lãnh ngoài" (VHV tự lãnh ngoài kho DH1)
//   • luồng SỬ DỤNG HIỆN CÓ → vật tư lấy từ kho phân xưởng, không lãnh ở đâu cả.
//   • luồng HÓA CHẤT → nhà thầu giao thẳng theo hợp đồng, KHÔNG qua kho DH1.
// Dùng chung một nhãn khiến phiếu "Sử dụng hiện có" hiện "Lãnh ngoài" — sai nghĩa.
//
// Riêng hóa chất, cột `receiptSource` trong DB vẫn mang giá trị mặc định 'ERP' vì luồng
// này không hề hỏi nguồn lãnh — đọc thẳng cột đó ra là hiện 'Lãnh kho DH1', sai hoàn
// toàn. Nhãn phải suy từ LOẠI PHIẾU chứ không từ cột dữ liệu.
const receiptSourceLabel = (source?: string | null, ticketType?: string | null) => {
  if (ticketType === "SU_DUNG_HIEN_CO") return "Lấy từ Hiện có";
  if (ticketType === CHEMICAL_TICKET_TYPE || ticketType === SINGLE_STEP_TICKET_TYPE) return "Nhà thầu giao ngoài";
  return normalizeReceiptSource(source) === "ERP" ? "Lãnh kho DH1" : "Lãnh ngoài";
};
const bbntDownloadUrl = (url: string, deviceName: string) => {
  if (!deviceName || /[?&]filename=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}deviceName=${encodeURIComponent(deviceName)}`;
};
const materialCatalogHref = (ticket: MaterialTicket, code: string) => {
  const qs = new URLSearchParams({ may: ticket.unit, search: code });
  const category = ticket.materialCategory ? TICKET_TO_MATERIAL_CATEGORY[ticket.materialCategory] ?? ticket.materialCategory : "";
  if (category) qs.set("category", category);
  return `/materials?${qs.toString()}`;
};
const FINISHED_STATUSES = ["HOAN_TAT", "TU_CHOI"];
const TICKET_PAGE_SIZE = 10;
const STATUS_FILTER_OPTIONS = [
  { value: "ALL", label: "Tất cả" },
  { value: "RUNNING", label: "Đang thực hiện" },
  { value: "HOAN_TAT", label: "Hoàn tất" },
] as const;
/* Số ngày phiếu đứng ở bước hiện tại = hôm nay - mốc thao tác gần nhất trên phiếu */
const waitDaysOf = (t: MaterialTicket) => {
  const stamps = [t.createdAt, t.proposedAt, t.confirmedAt, t.statsAt, t.receivedAt, t.usedAt, t.completedAt]
    .filter(Boolean)
    .map((s) => new Date(s as string).getTime());
  return Math.max(0, Math.floor((Date.now() - Math.max(...stamps)) / 86_400_000));
};

export default function MaterialTicketBoard({
  creating = false,
  onCloseCreate,
}: {
  creating?: boolean;
  onCloseCreate?: () => void;
} = {}) {
  const [monthFilter, setMonthFilter] = useState(() => materialTicketMonthKey());
  const { data, isLoading } = useMaterialTickets(monthFilter);
  // Kéo trước danh mục cho form phiếu trong lúc trình duyệt rảnh — chỉ cho người thật sự
  // lập được phiếu, để tài khoản chỉ xem không phải tải một khối dữ liệu họ không dùng tới.
  usePrefetchTicketOptions(Boolean(data?.viewer?.canCreate));
  const [openId, setOpenId] = useState<string | null>(null);
  const progressDialogRef = React.useRef<HTMLElement>(null);
  const [filter, setFilter] = useState("ALL");
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState("ALL");
  const [unitFilter, setUnitFilter] = useState("ALL");
  // Lọc theo luồng phiếu (cột Yêu cầu): Đề xuất / Ứng / Sử dụng hiện có.
  const [typeFilter, setTypeFilter] = useState("ALL");
  // Ô tìm kiếm nằm cùng hàng với bộ lọc — nó lọc chính bảng này chứ không phải cả trang.
  const [searchQ, setSearchQ] = useState("");
  const [listPage, setListPage] = useState(1);
  /** Đang lọc riêng luồng hóa chất (gồm cả NH3 khai một bước) hay riêng vật tư thường? */
  const chemicalOnly = typeFilter === CHEMICAL_TICKET_TYPE || typeFilter === SINGLE_STEP_TICKET_TYPE;
  const materialOnly = typeFilter !== "ALL" && !chemicalOnly;
  const [editTicket, setEditTicket] = useState<MaterialTicket | null>(null);
  const [delTicket, setDelTicket] = useState<MaterialTicket | null>(null);
  const del = useDeleteTicket();

  const tickets = useMemo(() => data?.tickets ?? [], [data?.tickets]);
  const viewer = data?.viewer ?? null;
  const monthOptions = useMemo(() => {
    const options = [...(data?.months ?? [])];
    if (monthFilter !== "ALL" && !options.some((item) => item.month === monthFilter)) {
      options.push({ month: monthFilter, count: 0 });
    }
    return options.sort((a, b) => b.month.localeCompare(a.month));
  }, [data?.months, monthFilter]);
  const selectedMonthCount = monthFilter === "ALL"
    ? monthOptions.reduce((sum, item) => sum + item.count, 0)
    : monthOptions.find((item) => item.month === monthFilter)?.count ?? 0;
  const selectedStatusFilter = STATUS_FILTER_OPTIONS.find((option) => option.value === filter)
    ?? STATUS_FILTER_OPTIONS[0];
  const myTurn = useMemo(() => tickets.filter((t) => actionsFor(t, viewer).length > 0), [tickets, viewer]);
  const myTurnIds = useMemo(() => new Set(myTurn.map((t) => t.id)), [myTurn]);
  const waitDays = useMemo(() => new Map(tickets.map((t) => [t.id, waitDaysOf(t)])), [tickets]);

  // Lần tải đầu: có việc chờ mình → mặc định tab "Đến lượt bạn", không thì "Tất cả".
  const defaultFilterApplied = React.useRef(false);
  React.useEffect(() => {
    if (defaultFilterApplied.current || !data) return;
    defaultFilterApplied.current = true;
    if (myTurn.length > 0) setFilter("MINE");
  }, [data, myTurn.length]);

  const searchText = normalizeText(searchQ);
  const shown = useMemo(() => {
    const list = tickets.filter((t) => {
      const matchesStatus =
        filter === "ALL" ? true
        : filter === "MINE" ? myTurnIds.has(t.id)
        : filter === "RUNNING" ? !FINISHED_STATUSES.includes(t.status)
        // Tab "Hóa chất": gom cả luồng hóa chất 3 bước và phiếu NH3 khai một bước.
        : filter === "CHEMICAL" ? normalizeText(t.materialCategory ?? "") === normalizeText("Hóa chất")
        // Tab "Thu hồi": chỉ phiếu đã có BBTHVT hoặc snapshot nghiệp vụ xác nhận chắc chắn phải xuất.
        : filter === "RECOVERY" ? materialTicketBelongsToRecoveryTab(t)
        : t.status === filter;
      const ticketCategory = t.materialCategory ? TICKET_TO_MATERIAL_CATEGORY[t.materialCategory] ?? t.materialCategory : "";
      const matchesMaterialCategory = materialCategoryFilter === "ALL" || materialCategoryMatches(ticketCategory, materialCategoryFilter);
      const matchesUnit = unitFilter === "ALL" || t.unit === unitFilter;
      const matchesType = typeFilter === "ALL"
        || (typeFilter === "DE_XUAT" ? t.type === "DE_XUAT" || t.type === OTHER_MATERIAL_TICKET_TYPE
          : typeFilter === "UNG" ? t.type === "UNG" || t.type === OTHER_MATERIAL_ADVANCE_TICKET_TYPE
          : t.type === typeFilter);
      const searchable = normalizeText([
        t.proposalNumber,
        ...t.items.flatMap((it) => [it.erpName, it.material.name, it.material.code]),
      ].filter(Boolean).join(" "));
      const matchesSearch = !searchText || searchable.includes(searchText);
      return matchesStatus && matchesMaterialCategory && matchesUnit && matchesType && matchesSearch;
    });
    // Tháng mới nhất đứng trước; trong từng tháng, STT cao nhất là phiếu mới nhất.
    return list.sort((a, b) =>
      b.sequenceMonth.localeCompare(a.sequenceMonth)
      || b.sequenceNumber - a.sequenceNumber
      || b.createdAt.localeCompare(a.createdAt)
    );
  }, [tickets, filter, myTurnIds, materialCategoryFilter, unitFilter, typeFilter, searchText]);
  const activeFilterCount = Number(materialCategoryFilter !== "ALL") + Number(unitFilter !== "ALL");
  const totalPages = Math.max(1, Math.ceil(shown.length / TICKET_PAGE_SIZE));
  const currentPage = Math.min(listPage, totalPages);
  const firstShown = shown.length === 0 ? 0 : (currentPage - 1) * TICKET_PAGE_SIZE + 1;
  const lastShown = Math.min(currentPage * TICKET_PAGE_SIZE, shown.length);
  const visibleTickets = shown.slice(firstShown ? firstShown - 1 : 0, lastShown);
  const openTicket = openId ? tickets.find((ticket) => ticket.id === openId) ?? null : null;
  const openTicketMaterialText = openTicket
    ? Array.from(new Set(openTicket.items.map((item) => item.erpName || item.material?.name).filter(Boolean))).join(", ") || "Phiếu vật tư"
    : "";
  const openTicketStatus = openTicket ? STATUS[openTicket.status] ?? { label: openTicket.status, c: C.soft } : null;

  React.useEffect(() => {
    setListPage(1);
    setOpenId(null);
  }, [filter, materialCategoryFilter, monthFilter, searchText, typeFilter, unitFilter]);

  React.useEffect(() => {
    setListPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  React.useEffect(() => {
    if (!openId) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => progressDialogRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector(".step-review-dialog")) return;
      setOpenId(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [openId]);

  return (
    <div className="mtw">
      <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="top-tools">
        <div className="filters">
          <button className={`mine-tab ${filter === "MINE" ? "on" : ""}`} onClick={() => setFilter("MINE")}>
            <Zap size={13} /> Đến lượt bạn
            <span className="mine-count">{myTurn.length}</span>
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`status-filter-trigger ${STATUS_FILTER_OPTIONS.some((option) => option.value === filter) ? "on" : ""}`}
                aria-label={`Lọc theo trạng thái: ${selectedStatusFilter.label}`}
              >
                <span>{selectedStatusFilter.label}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={7} className="status-filter-menu">
              <div className="status-filter-heading">Trạng thái phiếu</div>
              {STATUS_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={filter === option.value ? "selected" : ""}
                  onClick={() => setFilter(option.value)}
                >
                  <span>{option.label}</span>
                  {filter === option.value && <Check size={15} aria-hidden="true" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          {[["CHEMICAL", "Hóa chất"], ["RECOVERY", "Thu hồi"]].map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="turn-spacer" />
        <label className="tool-search">
          <Search size={14} aria-hidden="true" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Tìm phiếu đề xuất, tên vật tư..."
            aria-label="Tìm phiếu đề xuất hoặc tên vật tư"
          />
        </label>
        <label className="month-filter" title="Lọc và thống kê phiếu theo tháng">
          <CalendarDays size={14} aria-hidden="true" />
          <select
            value={monthFilter}
            onChange={(e) => {
              setOpenId(null);
              setMonthFilter(e.target.value);
            }}
            aria-label="Lọc phiếu vật tư theo tháng"
          >
            <option value="ALL">Tất cả tháng</option>
            {monthOptions.map((item) => (
              <option key={item.month} value={item.month}>
                {materialTicketMonthLabel(item.month)} ({item.count})
              </option>
            ))}
          </select>
          <span className="month-count" aria-label={`${selectedMonthCount} phiếu`}>
            {selectedMonthCount}
          </span>
        </label>
        <label className="mobile-type-filter" title="Lọc theo luồng phiếu">
          <ClipboardList size={14} aria-hidden="true" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Lọc theo luồng phiếu"
          >
            <option value="ALL">Mọi yêu cầu</option>
            <option value="DE_XUAT">Đề xuất</option>
            <option value="UNG">Ứng</option>
            <option value="SU_DUNG_HIEN_CO">Hiện có</option>
            <option value={CHEMICAL_TICKET_TYPE}>Hóa chất</option>
            <option value={SINGLE_STEP_TICKET_TYPE}>Ghi nhận</option>
          </select>
        </label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="soft"
              size="toolbar"
              className={`advanced-filter-trigger group min-w-[112px] justify-between ${activeFilterCount > 0 ? "border-sky-200 bg-sky-50 text-sky-800" : ""}`}
              aria-label={`Bộ lọc nâng cao${activeFilterCount > 0 ? `, ${activeFilterCount} bộ lọc đang áp dụng` : ""}`}
              title="Bộ lọc nâng cao"
            >
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-sky-600" />
                <span className="advanced-filter-label">Bộ lọc</span>
                {activeFilterCount > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-navy px-1.5 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </span>
              <ChevronDown className="advanced-filter-chevron h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-slate-200/90 bg-white p-0 shadow-[0_22px_55px_rgba(15,23,42,0.18)]"
          >
            <div className="flex items-center justify-between border-b border-sky-100 bg-[linear-gradient(135deg,#f8fbff_0%,#edf7ff_58%,#f0fdfa_100%)] px-4 py-3.5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">Lọc danh sách</p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">Phiếu thay thế vật tư</p>
              </div>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => { setMaterialCategoryFilter("ALL"); setUnitFilter("ALL"); }}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-sky-700 transition hover:bg-white hover:shadow-sm"
                >
                  Đặt lại
                </button>
              )}
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                Loại vật tư
                <select
                  value={materialCategoryFilter}
                  onChange={(e) => setMaterialCategoryFilter(e.target.value)}
                  aria-label="Lọc theo loại vật tư"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="ALL">Tất cả loại</option>
                  {MATERIAL_CATEGORY_FILTERS.map((c) => <option key={c} value={c}>{displayMaterialCategory(c)}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                Tổ máy
                <select
                  value={unitFilter}
                  onChange={(e) => setUnitFilter(e.target.value)}
                  aria-label="Lọc theo tổ máy"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="ALL">Tất cả tổ máy</option>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="list">
        <div className="row rhead">
          <span>STT</span>
          <span className="type-head">
            <select
              className={typeFilter !== "ALL" ? "filtering" : ""}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Lọc theo luồng phiếu"
              title="Lọc theo luồng phiếu"
            >
              <option value="ALL">Yêu cầu</option>
              <option value="DE_XUAT">Đề xuất</option>
              <option value="UNG">Ứng</option>
              <option value="SU_DUNG_HIEN_CO">Sử dụng hiện có</option>
              <option value={CHEMICAL_TICKET_TYPE}>Hóa chất</option>
              <option value={SINGLE_STEP_TICKET_TYPE}>Ghi nhận</option>
            </select>
          </span>
          <span>Cương vị</span><span>Tên vật tư</span>
          {/*
            Cột này mang hai nghĩa khác nhau: luồng vật tư thường theo dõi SỐ PHIẾU ĐXVT,
            luồng hóa chất theo dõi NGÀY GIAO HÀNG (không có phiếu ĐXVT nào cả). Chỉ khi
            đang lọc riêng một luồng mới đặt được tiêu đề dứt khoát; danh sách trộn thì
            ghi cả hai để không nói sai về nửa số dòng.
          */}
          <span>{chemicalOnly ? "Ngày giao hàng" : materialOnly ? "Phiếu đề xuất" : "Phiếu đề xuất / Ngày giao"}</span>
          <span>Số lượng</span><span>Trạng thái</span><span>Chờ</span><span>Thao tác</span>
        </div>
        {isLoading && <div className="empty"><Loader2 className="spin" size={18} /> Đang tải…</div>}
	        {!isLoading && visibleTickets.map((t) => {
	          const baseMeta = t.type === SINGLE_STEP_TICKET_TYPE && t.status === "NHAN_VAT_TU"
            ? { label: "Chờ VHV xác nhận khối lượng lãnh", c: "#7c3aed" }
		            : t.type === CHEMICAL_TICKET_TYPE && t.status === "CHO_XAC_NHAN"
		            ? { label: "Chờ xác nhận bồn/thiết bị", c: "#7c3aed" }
		            : t.type === CHEMICAL_TICKET_TYPE && t.status === "CHO_THONG_KE"
		            ? { label: "Chờ xác nhận đề xuất", c: "#7c3aed" }
	            : t.type === CHEMICAL_TICKET_TYPE && t.status === "NHAN_VAT_TU"
	            ? { label: "Chờ VHV xác nhận lãnh", c: "#7c3aed" }
	            : t.type === OTHER_MATERIAL_ADVANCE_TICKET_TYPE && t.status === "NHAN_VAT_TU"
	            ? { label: "Chờ lãnh vật tư ứng", c: C.ung }
	            : t.type === OTHER_MATERIAL_ADVANCE_TICKET_TYPE && t.status === "CHO_THONG_KE"
	            ? { label: "Chờ hoàn thiện ĐXVT", c: "#0891b2" }
		            : t.type === "UNG" && t.status === "CHO_XAC_NHAN_PHAT"
		            ? { label: "Chưa xác nhận trả phiếu", c: C.warn }
		            : t.type === "UNG" && t.status === "NHAN_VAT_TU"
		            ? { label: "Chờ xác nhận ĐXVT", c: "#0891b2" }
		            : t.type === "DE_XUAT" && t.status === "CHO_THONG_KE_XUAT_BIEN_BAN"
		            ? { label: "Chờ Thống kê xuất BBNT", c: "#0f766e" }
		            : STATUS[t.status] ?? { label: t.status, c: C.soft };
	          const recoveryPending = !!t.usedAt && materialTicketRequiresRecovery(t) && !t.recoveryReturnedAt;
	          const mine = actionsFor(t, viewer).length > 0;
	          // Sửa/Xoá: Admin hoặc cương vị được phân quyền bước "Sửa/Xoá phiếu";
	          // khi admin CHƯA cấu hình bước này → người tạo phiếu (mặc định cũ).
	          const canEdit =
	            !!viewer &&
	            (viewer.isAdmin ||
	              viewer.steps?.manage ||
	              (!viewer.steps?.manageConfigured && viewer.id === t.createdById));
	          const canDelete = canEdit && (!t.settledAt || viewer?.isAdmin);
          const materialNames = Array.from(new Set(t.items.map((i) => i.erpName || i.material?.name).filter(Boolean)));
          const materialText = materialNames.length ? materialNames.join(", ") : "—";
          const isOpen = openId === t.id;
          return (
            <React.Fragment key={t.id}>
            <button
              className={`row ${mine ? "mine" : ""} ${t.type === SINGLE_STEP_TICKET_TYPE ? "ghinhan" : ""}`}
              onClick={() => setOpenId(isOpen ? null : t.id)}
              aria-expanded={isOpen}
              aria-haspopup="dialog"
              aria-label={`${isOpen ? "Thu gọn" : "Mở"} chi tiết phiếu ${materialTicketReference(t)}`}
            >
              <span className="code-cell">
                <span className={`exp ${isOpen ? "open" : ""}`} title={isOpen ? "Thu gọn" : "Mở chi tiết"}>
                  {isOpen ? <Minus size={10} /> : <Plus size={10} />}
                </span>
                <span className="code">{t.sequenceNumber}</span>
              </span>
              <span className="kind-cell">
                {t.type === SINGLE_STEP_TICKET_TYPE
                  ? <span className="tag ghinhan"><FlaskConical size={11} /> Ghi nhận</span>
                  : t.type === CHEMICAL_TICKET_TYPE
                  ? <span className="tag hoachat"><FlaskConical size={11} /> Hóa chất</span>
                  : t.type === "UNG" || t.type === OTHER_MATERIAL_ADVANCE_TICKET_TYPE
                  ? <span className="tag ung"><Zap size={11} /> Ứng</span>
                  : t.type === "CHUA_CHON"
                    ? <span className="tag"><Clock size={11} /> Chờ chọn luồng</span>
                    : t.type === "SU_DUNG_HIEN_CO"
                      ? <span className="tag dx"><Package size={11} /> Sử dụng hiện có</span>
                    : <span className="tag dx"><ClipboardList size={11} /> Đề xuất</span>}
                <small className="kind-sub">{t.unit}{t.materialCategory ? ` · ${displayMaterialCategory(t.materialCategory)}` : ""}</small>
              </span>
              <span className="position-cell">{t.assignedPosition}</span>
              <span className="material-name" title={materialText}>{materialText}</span>
              <span className="proposal-cell">
                {t.type === SINGLE_STEP_TICKET_TYPE
                  /* Phiếu khai một bước xong ngay khi lập, không có lịch giao để chốt. */
                  ? <span className="nophieu">Không áp dụng</span>
                  : t.type === CHEMICAL_TICKET_TYPE
                    ? (t.deliveryScheduledAt
                      ? <span className="code">{new Date(t.deliveryScheduledAt).toLocaleDateString("vi-VN")}</span>
                      : <span className="nophieu">Chưa chốt lịch giao</span>)
                    : t.proposalNumber
                      ? <span className="code">{t.proposalNumber}</span>
                      : <span className="nophieu">{t.type === "SU_DUNG_HIEN_CO" ? "Không cần phiếu đề xuất" : "Chưa có phiếu đề xuất"}</span>}
              </span>
              <span className="quantity-cell">{t.items.some((i) => i.quantity > 0) ? t.items.filter((i) => i.quantity > 0).map((i) => `${i.quantity} ${i.material.unit}`).join(", ") : "Chưa nhập"}</span>
	              <span className="status-stack">
	                <span className="st status-primary" style={{ color: baseMeta.c, background: baseMeta.c + "16" }}>
	                  {mine && <i className="pd" />}{baseMeta.label}
	                </span>
	                {recoveryPending && (
	                  <small className="status-secondary" title="Chờ xác nhận trả vật tư thu hồi">Chờ xác nhận trả vật tư thu hồi</small>
	                )}
	              </span>
              <span className="wait-cell">
                {FINISHED_STATUSES.includes(t.status)
                  ? <span className="soft">—</span>
                  : (() => {
                      const w = waitDays.get(t.id) ?? 0;
                      return (
                        <b className={`wait-badge ${w >= 5 ? "hot" : w >= 2 ? "warm" : ""}`}>
                          {w === 0 ? "hôm nay" : `${w} ngày`}
                        </b>
                      );
                    })()}
              </span>
              <span className="ops">
                {canEdit && !isOtherMaterialTicketType(t.type) && (
                  <span role="button" tabIndex={0} title="Sửa phiếu" className="op"
                    onClick={(e) => { e.stopPropagation(); setEditTicket(t); }}><Pencil size={14} /></span>
                )}
                {canDelete && (
                  <span role="button" tabIndex={0} title="Xóa phiếu" className="op del"
                    onClick={(e) => { e.stopPropagation(); setDelTicket(t); }}><Trash2 size={14} /></span>
                )}
                {!canEdit && !canDelete && <span className="soft">—</span>}
              </span>
            </button>
            </React.Fragment>
          );
        })}
        {!isLoading && shown.length === 0 && (
          <div className="empty">{filter === "MINE" ? "☕ Không có phiếu nào chờ bạn xử lý." : "Không có phiếu nào."}</div>
        )}
      </div>

      {!isLoading && shown.length > 0 && (
        <nav className="ticket-pagination" aria-label="Phân trang danh sách phiếu vật tư">
          <div className="ticket-pagination-summary">
            Hiển thị <b>{firstShown}–{lastShown}</b> trong tổng số <b>{shown.length}</b> bản ghi
          </div>
          <div className="ticket-pagination-actions">
            <button type="button" onClick={() => setListPage(1)} disabled={currentPage <= 1} aria-label="Trang đầu" title="Trang đầu">
              <ChevronsLeft size={16} />
            </button>
            <button type="button" onClick={() => setListPage((page) => Math.max(1, page - 1))} disabled={currentPage <= 1} aria-label="Trang trước" title="Trang trước">
              <ChevronLeft size={16} />
            </button>
            <span className="ticket-page-indicator" aria-label={`Trang ${currentPage} trên ${totalPages}`}>{currentPage}/{totalPages}</span>
            <button type="button" onClick={() => setListPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages} aria-label="Trang sau" title="Trang sau">
              <ChevronRight size={16} />
            </button>
            <button type="button" onClick={() => setListPage(totalPages)} disabled={currentPage >= totalPages} aria-label="Trang cuối" title="Trang cuối">
              <ChevronsRight size={16} />
            </button>
          </div>
        </nav>
      )}

      {openTicket && openTicketStatus && (
        <div className="ticket-detail-layer">
          <button
            type="button"
            className="ticket-detail-backdrop"
            onClick={() => setOpenId(null)}
            aria-label="Đóng cửa sổ tiến độ đề xuất"
          />
          <section
            ref={progressDialogRef}
            className="ticket-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-progress-title"
            tabIndex={-1}
          >
            <header className="ticket-detail-header">
              <span className="ticket-detail-icon" aria-hidden="true"><ClipboardList size={20} /></span>
              <div className="ticket-detail-heading">
                <span className="ticket-detail-eyebrow">Tiến độ đề xuất · {materialTicketReference(openTicket)}</span>
                <h2 id="ticket-progress-title">{openTicketMaterialText}</h2>
                <p>{openTicket.unit} · {openTicket.assignedPosition}</p>
              </div>
              <span className="ticket-detail-status" style={{ color: openTicketStatus.c, background: openTicketStatus.c + "16" }}>
                <i style={{ background: openTicketStatus.c }} />{openTicketStatus.label}
              </span>
              <button type="button" className="ticket-detail-close" onClick={() => setOpenId(null)} title="Đóng cửa sổ">
                <X size={18} /><span className="sr-only">Đóng</span>
              </button>
            </header>
            <div className="ticket-detail-scroll">
              <div className="dwrap">
                <Detail t={openTicket} viewer={viewer} onClose={() => setOpenId(null)} />
              </div>
            </div>
          </section>
        </div>
      )}

      {creating && <CreateDialog onClose={() => onCloseCreate?.()} onOpen={setOpenId} />}

      {editTicket && <EditDialog t={editTicket} onClose={() => setEditTicket(null)} />}

      {delTicket && (
        <>
          <div className="ovl" onClick={() => setDelTicket(null)} />
          <div className="dlg" style={{ width: 420 }}>
            <div className="dlg-h"><b>Xóa phiếu {materialTicketReference(delTicket)}?</b>
              <button className="x" onClick={() => setDelTicket(null)}><X size={16} /></button></div>
            <div className="frm">
              <p className="note" style={{ background: C.badBg, color: C.bad }}>
                <AlertTriangle size={13} /> Xóa vĩnh viễn phiếu này và toàn bộ vật tư trong phiếu. Không thể hoàn tác.
              </p>
              <div className="frm-f">
                <button className="btn ghost" onClick={() => setDelTicket(null)}>Hủy</button>
                <button className="btn danger" disabled={del.isPending}
                  onClick={async () => {
                    try {
                      await del.mutateAsync(delTicket.id);
                      toast.success(`Đã xóa phiếu ${materialTicketReference(delTicket)}`);
                      if (openId === delTicket.id) setOpenId(null);
                      setDelTicket(null);
                    } catch (e) { toast.error(e instanceof Error ? e.message : "Xóa thất bại"); }
                  }}>
                  {del.isPending ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />} Xóa phiếu
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

/* ================= tạo phiếu ================= */
const CATEGORIES = TICKET_MATERIAL_CATEGORIES.filter((category) =>
  !["Chai khí", "Văn phòng phẩm", "Khác"].includes(category)
);
const UNITS = ["S1", "S2", "COMMON"];
const SCCN_REPRESENTATIVES = ["Võ Văn Chiến", "Lê Văn Khánh", "Nguyễn Thanh Toàn"] as const;
const SCCN_POSITIONS = ["Quản Đốc", "Phó Quản Đốc"] as const;
type TicketDeviceOption = { seq: string; label: string; system: string | null; managingPosition: string | null; recoveryOnSupplement: boolean };
const totalMaterialErpStock = (material: { erpCodes: { erpStock: number }[] }) =>
  material.erpCodes.reduce((total, item) => total + Number(item.erpStock || 0), 0);

function SystemMultiSelect({
  options,
  value,
  onChange,
  disabled = false,
  placeholder = "— Chọn một hoặc nhiều hệ thống —",
}: {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const allSelected = options.length > 0 && options.every((system) => value.includes(system));

  function toggle(system: string) {
    onChange(value.includes(system)
      ? value.filter((item) => item !== system)
      : [...value, system]);
  }

  return (
    <div className="device-multi-wrap system-multi-wrap">
      <details className={`device-multiselect system-multiselect ${disabled ? "disabled" : ""}`}>
        <summary onClick={(event) => { if (disabled) event.preventDefault(); }}>
          <span className="device-multi-summary">
            <b>{value.length ? `${value.length} hệ thống đã chọn` : placeholder}</b>
            {value.length > 0 && <small>Có thể tiếp tục chọn thêm hệ thống</small>}
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </summary>
        <div className="device-multi-panel" role="group" aria-label="Chọn hệ thống thiết bị">
          <div className="device-multi-toolbar">
            <span>{options.length} hệ thống phù hợp</span>
            <button
              type="button"
              disabled={!options.length}
              onClick={() => onChange(allSelected ? [] : [...options])}
            >
              {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            </button>
          </div>
          <div className="device-multi-options system-multi-options">
            {options.map((system) => {
              const checked = value.includes(system);
              return (
                <label key={system} className={checked ? "checked" : ""}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(system)} />
                  <span className="device-check"><Check size={12} /></span>
                  <span><b>{system}</b></span>
                </label>
              );
            })}
            {!options.length && <div className="device-multi-empty">Chưa có hệ thống phù hợp với vật tư đã chọn.</div>}
          </div>
        </div>
      </details>
      {value.length > 0 && (
        <div className="device-selected-list system-selected-list" aria-label="Các hệ thống đã chọn">
          {value.map((system) => (
            <span key={system} title={system}>
              <Check size={11} /> {system}
              <button type="button" onClick={() => toggle(system)} aria-label={`Bỏ chọn ${system}`}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceMultiSelect({
  options,
  allOptions,
  value,
  onChange,
  disabled = false,
}: {
  options: TicketDeviceOption[];
  allOptions: TicketDeviceOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const selectedOptions = value
    .map((key) => allOptions.find((option) => option.seq === key))
    .filter((option): option is TicketDeviceOption => Boolean(option));
  const visibleKeys = options.map((option) => option.seq);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => value.includes(key));

  function toggle(key: string) {
    onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key]);
  }

  return (
    <div className="device-multi-wrap">
      <details className={`device-multiselect ${disabled ? "disabled" : ""}`}>
        <summary onClick={(event) => { if (disabled) event.preventDefault(); }}>
          <span className="device-multi-summary">
            <b>{value.length ? `${value.length} thiết bị đã chọn` : "— Chọn một hoặc nhiều thiết bị —"}</b>
            {value.length > 0 && <small>Nhấn để xem hoặc thay đổi lựa chọn</small>}
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </summary>
        <div className="device-multi-panel" role="group" aria-label="Chọn thiết bị thay thế">
          <div className="device-multi-toolbar">
            <span>{options.length} thiết bị phù hợp</span>
            <button
              type="button"
              disabled={!visibleKeys.length}
              onClick={() => onChange(allVisibleSelected
                ? value.filter((key) => !visibleKeys.includes(key))
                : Array.from(new Set([...value, ...visibleKeys])))}
            >
              {allVisibleSelected ? "Bỏ chọn nhóm này" : "Chọn tất cả"}
            </button>
          </div>
          <div className="device-multi-options">
            {options.map((option) => {
              const checked = value.includes(option.seq);
              return (
                <label key={`${option.seq}:${option.managingPosition ?? ""}`} className={checked ? "checked" : ""}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(option.seq)} />
                  <span className="device-check"><Check size={12} /></span>
                  <span>
                    <b>{option.label}</b>
                    {option.system && <small>{option.system}</small>}
                    {option.recoveryOnSupplement && <small className="text-amber-700">Bổ sung có BBVT thu hồi</small>}
                  </span>
                </label>
              );
            })}
            {!options.length && <div className="device-multi-empty">Không có thiết bị phù hợp trong hệ thống đã chọn.</div>}
          </div>
        </div>
      </details>
      {selectedOptions.length > 0 && (
        <div className="device-selected-list" aria-label="Các thiết bị đã chọn">
          {selectedOptions.map((option) => (
            <span key={option.seq} title={option.label}>
              <Check size={11} /> {option.label}
              <button type="button" onClick={() => toggle(option.seq)} aria-label={`Bỏ chọn ${option.label}`}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateDialog({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const [type, setType] = useState<"DE_XUAT" | "UNG" | null>("DE_XUAT");
  const [unit, setUnit] = useState("S1");
  const [reasonChoice, setReasonChoice] = useState("");
  const [reasonDetail, setReasonDetail] = useState("");
  const note = joinReason(reasonChoice, reasonDetail);
  const [assigned, setAssigned] = useState("");
  const [category, setCategory] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [selectedErpCode, setSelectedErpCode] = useState("");
  const [proposedQuantity, setProposedQuantity] = useState(1);
  const [replacementDeviceSeqs, setReplacementDeviceSeqs] = useState<string[]>([]);
  const [replacementSystems, setReplacementSystems] = useState<string[]>([]);
  const [otherItems, setOtherItems] = useState<Array<{ materialId: string; quantity: number; replacementDeviceSeqs: string[] }>>([]);
  // Hóa chất / chai khí chỉ có lý do Nhập hoặc Khác — đổi loại vật tư mà lý do cũ không còn
  // hợp lệ thì xoá luôn, tránh gửi lên máy chủ một lý do đã bị khoá.
  const reasonOptions = useMemo(() => ticketReasonsFor(category), [category]);
  React.useEffect(() => {
    if (reasonChoice && !reasonOptions.includes(reasonChoice)) {
      setReasonChoice("");
      setReasonDetail("");
    }
  }, [reasonOptions, reasonChoice]);

  const { data: opts } = useTicketOptions(true); // lấy danh sách cương vị
  const create = useCreateTicket();
  const materialCategoryLabel = category ? TICKET_TO_MATERIAL_CATEGORY[category] ?? category : "";
  // Nghiệp vụ chốt 2026-08-10: KHÔNG chia cương vị theo tổ máy nữa — chọn S1, S2 hay
  // COMMON đều hiện đủ danh sách chức danh. Server cũng đã bỏ chốt tương ứng.
  const positionOptions = useMemo(() => [COMMON_MATERIAL_POSITION, ...(opts?.positions ?? []).filter((position) => position !== COMMON_MATERIAL_POSITION)], [opts?.positions]);
  const materialCards = useMemo(() => {
    if (!assigned || !materialCategoryLabel) return [];
    return (opts?.materials ?? []).filter((m) => {
      const matchesCategory = category === OTHER_MATERIAL_GROUP ? isOtherMaterialCategory(m.category) : m.category === materialCategoryLabel;
      const matchesUnit = m.machine === unit;
      const matchesPosition = assigned === COMMON_MATERIAL_POSITION
        ? m.managingPositions.length === 0 && m.devices.length === 0
        : m.managingPositions.some((p) => positionsMatch(p, assigned));
      return matchesCategory && matchesUnit && matchesPosition;
    });
  }, [assigned, category, materialCategoryLabel, opts?.materials, unit]);
  const isProposalType = false; // mã vật tư chỉ được chọn ở bước Trưởng ca/Trưởng kíp
  const selectedMaterial = materialCards.find((m) => m.id === selectedMaterialId) ?? null;
  const availableDeviceOptions = useMemo(
    () => (selectedMaterial?.devices ?? []).filter((device) => positionsMatch(device.managingPosition, assigned)),
    [assigned, selectedMaterial]
  );
  const replacementSystemOptions = useMemo(
    () => Array.from(new Set(availableDeviceOptions.map((device) => device.system?.trim()).filter(Boolean) as string[])),
    [availableDeviceOptions]
  );
  const selectedDeviceOptions = useMemo(
    () => replacementSystems.length
      ? availableDeviceOptions.filter((device) => replacementSystems.includes(device.system?.trim() ?? ""))
      : availableDeviceOptions,
    [availableDeviceOptions, replacementSystems]
  );
  const supplementRecoverySelected = isSupplementReason(note) && availableDeviceOptions.some(
    (device) => replacementDeviceSeqs.includes(device.seq) && device.recoveryOnSupplement,
  );
  const selectedErpOptions = useMemo(
    () => selectedMaterial?.erpCodes?.length
      ? selectedMaterial.erpCodes
      : selectedMaterial
        ? [{ code: selectedMaterial.code, erpStock: 0 }]
        : [],
    [selectedMaterial]
  );
  const selectedManagedGasItem = useMemo(() => {
    if (category !== OTHER_MATERIAL_GROUP || assigned === COMMON_MATERIAL_POSITION) return null;
    return otherItems.find((item) => {
      const material = materialCards.find((row) => row.id === item.materialId);
      return isGasCylinderTicket(material?.category);
    }) ?? null;
  }, [assigned, category, materialCards, otherItems]);

  // Bộ chọn nhanh Đề xuất / Ứng của kho "Vật tư khác" chỉ dành cho cương vị Chung.
  // Chai khí có cương vị phải để Trưởng ca/Trưởng kíp chọn luồng ở bước xác nhận.
  React.useEffect(() => {
    if (assigned !== COMMON_MATERIAL_POSITION && type !== "DE_XUAT") setType("DE_XUAT");
  }, [assigned, type]);

  React.useEffect(() => {
    if (!materialCards.length) {
      if (selectedMaterialId) setSelectedMaterialId("");
      if (selectedErpCode) setSelectedErpCode("");
      if (replacementDeviceSeqs.length) setReplacementDeviceSeqs([]);
      if (replacementSystems.length) setReplacementSystems([]);
      return;
    }
    if (!materialCards.some((m) => m.id === selectedMaterialId)) {
      setSelectedMaterialId(materialCards[0].id);
      setReplacementDeviceSeqs([]);
      setReplacementSystems([]);
    }
  }, [materialCards, replacementDeviceSeqs.length, replacementSystems.length, selectedMaterialId, selectedErpCode]);

  React.useEffect(() => {
    const validSystems = new Set(replacementSystemOptions);
    setReplacementSystems((current) => {
      const next = current.filter((system) => validSystems.has(system));
      return next.length === current.length ? current : next;
    });
  }, [replacementSystemOptions]);

  React.useEffect(() => {
    if (!selectedErpOptions.length) {
      if (selectedErpCode) setSelectedErpCode("");
      return;
    }
    if (!selectedErpOptions.some((item) => item.code === selectedErpCode)) {
      setSelectedErpCode(selectedErpOptions[0].code);
    }
  }, [selectedErpCode, selectedErpOptions]);

  React.useEffect(() => {
    const validKeys = new Set(availableDeviceOptions.map((device) => device.seq));
    setReplacementDeviceSeqs((current) => {
      const next = current.filter((key) => validKeys.has(key));
      return next.length === current.length ? current : next;
    });
  }, [availableDeviceOptions]);

  function selectUnit(nextUnit: string) {
    setUnit(nextUnit);
    setSelectedMaterialId("");
    setSelectedErpCode("");
    setReplacementDeviceSeqs([]);
    setReplacementSystems([]);
  }

  async function submit() {
    try {
      const managedGasMaterial = selectedManagedGasItem
        ? materialCards.find((material) => material.id === selectedManagedGasItem.materialId)
        : null;
      const res = await create.mutateAsync({
        unit,
        note: note.trim() || undefined,
        workflowType: assigned === COMMON_MATERIAL_POSITION ? type ?? "DE_XUAT" : "DE_XUAT",
        assignedPosition: assigned,
        // Chai khí vẫn nằm trong nhóm hiển thị "Vật tư khác", nhưng phiếu phải dùng
        // luồng Chai khí cũ để Trưởng ca/Trưởng kíp chọn Đề xuất hoặc Ứng.
        materialCategory: managedGasMaterial ? "Chai khí" : category,
        materialId: (managedGasMaterial?.id ?? selectedMaterialId) || undefined,
        proposedQuantity: selectedManagedGasItem?.quantity ?? proposedQuantity,
        replacementDeviceSeqs: selectedManagedGasItem?.replacementDeviceSeqs ?? replacementDeviceSeqs,
        items: category === OTHER_MATERIAL_GROUP && !managedGasMaterial ? otherItems : undefined,
      });
      toast.success(`Đã tạo phiếu ${materialTicketReference(res)}`);
      onClose();
      onOpen(res.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tạo phiếu thất bại");
    }
  }

  return (
    <>
      <div className="ovl" onClick={onClose} />
      <div className="dlg dlg-scroll">
        <div className="dlg-h"><b>Tạo phiếu thay thế vật tư</b>
          <button className="x" onClick={onClose}><X size={16} /></button></div>
        {!type ? (
          <div className="pick">
            <button className="card dx" onClick={() => setType("DE_XUAT")}>
              <ClipboardList size={26} /><b>BBKT + Đề xuất vật tư</b>
              <span>Tạo phiếu, chọn vật tư, nhập số lượng và kiểm kho ngay từ đầu</span>
            </button>
            <button className="card ung" onClick={() => setType("UNG")}>
              <Zap size={26} /><b>Ứng vật tư</b>
              <span>Xử lý gấp: thay thế trước → hoàn tất BBKT &amp; thống kê song song sau</span>
            </button>
          </div>
        ) : (
          <div className="frm frm-scroll">
            <div className="ticket-unit-field">
              <label>Tổ máy</label>
              <div className="seg2 ticket-unit-options">{UNITS.map((u) => (
                <button key={u} className={unit === u ? "on" : ""} onClick={() => selectUnit(u)}>{u}</button>
              ))}</div>
            </div>

            <label>Cương vị được giao thực hiện *</label>
            <select value={assigned} onChange={(e) => { const next = e.target.value; setAssigned(next); if (next === COMMON_MATERIAL_POSITION) setUnit("COMMON"); setSelectedMaterialId(""); setSelectedErpCode(""); setReplacementDeviceSeqs([]); setReplacementSystems([]); setOtherItems([]); }}>
              <option value="">— Chọn cương vị (chỉ cương vị này thấy phiếu) —</option>
              {positionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            <label>Loại vật tư *</label>
            <div className="cats ticket-category-options">
              {CATEGORIES.map((c) => (
                <button key={c} type="button" className={category === c ? "on" : ""} onClick={() => { setCategory(c); setSelectedMaterialId(""); setSelectedErpCode(""); setReplacementDeviceSeqs([]); setReplacementSystems([]); setOtherItems([]); }}>{displayMaterialCategory(c)}</button>
              ))}
            </div>

            {category === OTHER_MATERIAL_GROUP && assigned === COMMON_MATERIAL_POSITION && (
              <div className="other-flow-picker">
                <label>Luồng thực hiện *</label>
                <div className="seg3 flow-toggle" aria-label="Chọn luồng Vật tư khác">
                  <button type="button" className={type === "DE_XUAT" ? "on" : ""} onClick={() => setType("DE_XUAT")}>
                    <ClipboardList size={14} /> Đề xuất
                  </button>
                  <button type="button" className={type === "UNG" ? "on" : ""} onClick={() => setType("UNG")}>
                    <Zap size={14} /> Ứng
                  </button>
                </div>
                <p className={`note ${type === "UNG" ? "ung" : ""}`}>
                  {type === "UNG"
                    ? <><Zap size={13} /> Lãnh và cộng vào Hiện có trước; Thống kê hoàn thiện số ĐXVT sau.</>
                    : <><ClipboardList size={13} /> Thống kê xác nhận ĐXVT trước, sau đó mới lãnh và cộng vào Hiện có.</>}
                </p>
              </div>
            )}

            {type && (
              <>
                <label>Tên vật tư</label>
                <div className="material-cards">
                  {!assigned ? (
                    <div className="material-empty">Chọn cương vị để hiện danh sách vật tư được quản lý</div>
                  ) : !category ? (
                    <div className="material-empty">Chọn loại vật tư để hiện danh sách tên vật tư</div>
                  ) : materialCards.length ? (
                    materialCards.map((m) => {
                      const otherSelected = otherItems.some((item) => item.materialId === m.id);
                      return (
                      <button
                        key={m.id}
                        type="button"
                        className={(category === OTHER_MATERIAL_GROUP ? otherSelected : selectedMaterialId === m.id) ? "on" : ""}
                        onClick={() => category === OTHER_MATERIAL_GROUP
                          ? setOtherItems((current) => {
                            if (otherSelected) return current.filter((item) => item.materialId !== m.id);
                            if (assigned !== COMMON_MATERIAL_POSITION && isGasCylinderTicket(m.category)) {
                              return [{ materialId: m.id, quantity: 1, replacementDeviceSeqs: [] }];
                            }
                            const hasManagedGas = assigned !== COMMON_MATERIAL_POSITION && current.some((item) => {
                              const material = materialCards.find((row) => row.id === item.materialId);
                              return isGasCylinderTicket(material?.category);
                            });
                            if (hasManagedGas) {
                              toast.error("Chai khí cần lập phiếu riêng để Trưởng ca/Trưởng kíp chọn luồng");
                              return current;
                            }
                            return [...current, { materialId: m.id, quantity: 1, replacementDeviceSeqs: [] }];
                          })
                          : (() => { setSelectedMaterialId(m.id); setSelectedErpCode(""); setReplacementDeviceSeqs([]); setReplacementSystems([]); })()}
                        title={`${m.code} - ${m.name}`}
                      >
                        <span>{category === OTHER_MATERIAL_GROUP && (otherSelected ? "✓ " : "+ ")}{m.name}</span>
                        {category === OTHER_MATERIAL_GROUP && <small>{m.category}</small>}
                        <small>Hiện có: {m.quantity} {m.unit}</small>
                        <small>Số lượng ERP: {totalMaterialErpStock(m).toLocaleString("vi-VN")} {m.unit}</small>
                      </button>
                    );})
                  ) : (
                    <div className="material-empty">
                      Cương vị này chưa quản lý vật tư nào thuộc loại đã chọn
                    </div>
                  )}
                </div>

                {isProposalType && (
                  <>
                    <label>Mã vật tư *</label>
                    <select value={selectedErpCode} disabled={!selectedMaterialId} onChange={(e) => setSelectedErpCode(e.target.value)}>
                      <option value="">{selectedMaterialId ? "— Chọn mã vật tư —" : "— Chọn tên vật tư trước —"}</option>
                      {selectedErpOptions.map((item) => (
                        <option key={item.code} value={item.code}>{item.code} · Số liệu ERP: {item.erpStock}</option>
                      ))}
                    </select>
                  </>
                )}
              </>
            )}

            {category === OTHER_MATERIAL_GROUP && otherItems.length > 0 && (
              <div className="frm-items">
                <label>Vật tư đã chọn và số lượng {type === "UNG" ? "ứng" : "đề xuất"}</label>
                {otherItems.map((item) => {
                  const material = materialCards.find((row) => row.id === item.materialId);
                  const deviceOptions = (material?.devices ?? []).filter((device) => positionsMatch(device.managingPosition, assigned));
                  return <div key={item.materialId} className="other-ticket-item">
                    <div className="other-ticket-item-head">
                      <b>{material?.name}</b>
                      <label>Số lượng ({material?.unit})
                        <input type="number" min={1} value={item.quantity} onChange={(event) => setOtherItems((current) => current.map((row) => row.materialId === item.materialId ? { ...row, quantity: Math.max(1, Math.trunc(Number(event.target.value)) || 1) } : row))} />
                      </label>
                    </div>
                    {deviceOptions.length > 0 && <DeviceMultiSelect
                      options={deviceOptions}
                      allOptions={deviceOptions}
                      value={item.replacementDeviceSeqs}
                      onChange={(value) => setOtherItems((current) => current.map((row) => row.materialId === item.materialId ? { ...row, replacementDeviceSeqs: value } : row))}
                    />}
                  </div>;
                })}
              </div>
            )}

            {selectedManagedGasItem && (
              <p className="note ghinhan">
                <Check size={13} /> Phiếu Chai khí sẽ chuyển đến Trưởng ca/Trưởng kíp để chọn luồng <b>Đề xuất</b> hoặc <b>Ứng</b>.
              </p>
            )}

            {category === OTHER_MATERIAL_GROUP ? (
              <div className="reason-grid">
                <div className="field"><label>Ghi chú / lý do {type === "UNG" ? "ứng" : "lãnh"} *</label><input value={reasonDetail} onChange={(event) => { setReasonChoice(TICKET_REASON_OTHER); setReasonDetail(event.target.value); }} placeholder={type === "UNG" ? "Nhập lý do cần ứng vật tư" : "Nhập mục đích lãnh vật tư"} /></div>
              </div>
            ) : type === "DE_XUAT" ? (
              <>
                <div className="reason-grid">
                  <div className="field">
                    <label>Lý do *</label>
                    <ReasonPicker choice={reasonChoice} detail={reasonDetail} onChoice={setReasonChoice} onDetail={setReasonDetail} options={reasonOptions} />
                  </div>
                  <div className="field qty-field">
                    <label>Số lượng đề xuất *</label>
                    <input type="number" min={1} value={proposedQuantity} onChange={(e) => setProposedQuantity(Math.max(1, Number(e.target.value) || 1))} />
                  </div>
                </div>
                <label>Thuộc hệ thống</label>
                <SystemMultiSelect
                  options={replacementSystemOptions}
                  value={replacementSystems}
                  onChange={setReplacementSystems}
                  disabled={!selectedMaterialId || !replacementSystemOptions.length}
                  placeholder={!selectedMaterialId
                    ? "— Chọn tên vật tư trước —"
                    : replacementSystemOptions.length
                      ? "— Chọn một hoặc nhiều hệ thống —"
                      : "— Chưa khai báo hệ thống / thiết bị —"}
                />
                <label>Thiết bị thay thế *</label>
                <DeviceMultiSelect
                  options={selectedDeviceOptions}
                  allOptions={availableDeviceOptions}
                  value={replacementDeviceSeqs}
                  onChange={setReplacementDeviceSeqs}
                  disabled={!selectedMaterialId || !availableDeviceOptions.length}
                />
                {supplementRecoverySelected && (
                  <p className="note ung"><Package size={13} /> Điểm đã chọn được cấu hình: lý do <b>Bổ sung</b> vẫn yêu cầu nhập lượng thu hồi và xuất BBVT thu hồi.</p>
                )}
                {selectedMaterialId && !selectedDeviceOptions.length && <p className="hint">Vật tư này chưa có thiết bị thuộc cương vị đã chọn trong Chi tiết điểm thay thế. Vui lòng khai báo tại Danh mục vận hành 1 trước.</p>}
              </>
            ) : (
              <p className="note ung"><Zap size={13} /> Luồng Ứng: số biên bản kiểm tra sẽ bổ sung sau bước xác nhận xuất file.</p>
            )}
            {isSingleStepTicketMaterial(selectedMaterial?.code) && (
              <p className="note ghinhan">
                <FlaskConical size={13} /> {selectedMaterial?.name} khai <b>một bước</b>: tạo phiếu xong là hoàn
                tất, phiếu chỉ để ghi nhận lượng đã dùng trên bảng theo dõi, không qua các bước lãnh —
                sử dụng — nghiệm thu — quyết toán.
              </p>
            )}
            <div className="frm-f">
              <button className="btn ghost" onClick={onClose}>Hủy</button>
              <button className="btn primary"
                disabled={
                  create.isPending ||
                  !assigned ||
                  !category ||
                  !note.trim() ||
                  (category === OTHER_MATERIAL_GROUP
                    ? otherItems.length === 0 || otherItems.some((item) => item.quantity <= 0 || ((materialCards.find((material) => material.id === item.materialId)?.devices ?? []).some((device) => positionsMatch(device.managingPosition, assigned)) && item.replacementDeviceSeqs.length === 0))
                    : !selectedMaterialId || proposedQuantity <= 0 || replacementDeviceSeqs.length === 0)
                }
                onClick={submit}>
                {create.isPending ? <Loader2 className="spin" size={14} /> : type === "UNG" && category === OTHER_MATERIAL_GROUP ? <Zap size={14} /> : <Plus size={14} />} {type === "UNG" && category === OTHER_MATERIAL_GROUP ? "Tạo phiếu ứng" : "Tạo đề xuất"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ================= phân quyền quy trình (ADMIN) ================= */
// `short` là nhãn cột của ma trận — phải đọc được trong ~90px. Nhãn đầy đủ và diễn giải
// mặc định nằm ở tooltip của ô tiêu đề, không bày hết ra màn hình.
const WF_STEPS: { key: keyof WorkflowRoleMap; short: string; label: string; hint: string }[] = [
  { key: "create", short: "Tạo phiếu", label: "Tạo phiếu / Đề xuất vật tư (B0)", hint: "Trống = mặc định: Quản trị, Kỹ thuật viên, Trưởng Ca/Trưởng Kíp" },
  { key: "confirm", short: "Xác nhận ĐX", label: "Xác nhận phiếu đề xuất", hint: "Trống = mặc định: Trưởng Ca/Trưởng Kíp" },
  { key: "vhvReceive", short: "Ứng · VHV lãnh", label: "Ứng — VHV lãnh vật tư", hint: "Trống = chỉ cương vị được giao phiếu; nếu cấu hình = đúng các cương vị được chọn" },
  { key: "stats", short: "TK xác nhận ĐXVT", label: "Thống kê xác nhận ĐXVT (chọn mã vật tư + nhập số phiếu)", hint: "Trống = mặc định: cương vị Thống kê" },
  { key: "statsHandover", short: "Giao/trả phiếu", label: "Xác nhận VHV nhận / trả phiếu ĐXVT", hint: "Bước tách riêng khỏi Thống kê xác nhận ĐXVT — trống = mặc định: cương vị Thống kê" },
  { key: "receive", short: "Vật tư lãnh", label: "Xác nhận vật tư lãnh (khối lượng lãnh + nguồn lãnh)", hint: "Trống = mặc định: Trưởng Ca/Trưởng Kíp" },
  { key: "issue", short: "Cấp vật tư", label: "Cấp vật tư từ số lượng hiện có", hint: "Trống = mặc định: Trưởng Ca/Trưởng Kíp; có thể chọn riêng cương vị phát vật tư" },
  { key: "use", short: "Ghi nhận dùng", label: "Ghi nhận sử dụng vật tư (ngày + số lượng dùng)", hint: "Cương vị gắn với vật tư/thiết bị luôn được ghi nhận; chọn thêm tại đây để cấp quyền quản lý" },
  { key: "accept", short: "Nghiệm thu", label: "Nghiệm thu và xuất BBNT", hint: "Trống = mặc định: Trưởng Ca/Trưởng Kíp" },
  { key: "return", short: "Trả (chai khí)", label: "Xác nhận trả vỏ chai — bước cuối luồng Chai khí", hint: "Trống = dùng luôn quyền bước Sử dụng vật tư" },
  { key: "settle", short: "Quyết toán", label: "Quyết toán vật tư", hint: "Trống = mặc định: cương vị Thống kê" },
  { key: "manage", short: "Sửa / Xoá", label: "Sửa / Xoá phiếu", hint: "Trống = người tạo phiếu; nếu cấu hình = đúng các cương vị được chọn (Quản trị luôn được)" },
];

export function WorkflowRolesDialog({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useWorkflowRoles(true);
  const save = useSaveWorkflowRoles();
  const positions = usePositions();
  const [roles, setRoles] = useState<WorkflowRoleMap | null>(null);

  React.useEffect(() => {
    if (data?.data && !roles) setRoles(data.data);
  }, [data, roles]);

  const [query, setQuery] = useState("");
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  function toggle(step: keyof WorkflowRoleMap, position: string) {
    setRoles((r) => {
      if (!r) return r;
      const list = r[step];
      return { ...r, [step]: list.includes(position) ? list.filter((p) => p !== position) : [...list, position] };
    });
  }

  /** Bấm tiêu đề cột: đang có ai thì bỏ hết (về mặc định), đang trống thì chọn hết. */
  function toggleColumn(step: keyof WorkflowRoleMap, visible: string[]) {
    setRoles((r) => {
      if (!r) return r;
      const covered = visible.length > 0 && visible.every((p) => r[step].includes(p));
      return {
        ...r,
        [step]: covered ? r[step].filter((p) => !visible.includes(p)) : [...new Set([...r[step], ...visible])],
      };
    });
  }

  const assignedCountOf = (position: string) =>
    roles ? WF_STEPS.filter((s) => roles[s.key].includes(position)).length : 0;

  // Lọc theo ô tìm kiếm (không dấu) và theo "chỉ hiện cương vị đã giao".
  const visiblePositions = positions.filter((p) => {
    if (query.trim() && !normalizeText(p).includes(normalizeText(query))) return false;
    if (onlyAssigned && assignedCountOf(p) === 0) return false;
    return true;
  });

  async function submit() {
    if (!roles) return;
    try {
      await save.mutateAsync(roles);
      toast.success("Đã lưu phân quyền quy trình");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lưu thất bại");
    }
  }

  return (
    <>
      <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ovl" onClick={onClose} />
      <div className="dlg wfm-dialog" style={{ maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div className="dlg-h"><b>Phân quyền quy trình thay thế vật tư</b>
          <button className="x" onClick={onClose}><X size={16} /></button></div>
        <div className="frm" style={{ minHeight: 0, flex: 1, overflow: "hidden" }}>
          <p className="note"><UserCog size={13} /> Tích ô để giao CƯƠNG VỊ (dòng) vào BƯỚC (cột). Cột để trống dùng nhóm mặc định — di chuột vào tiêu đề cột để xem. Quản trị luôn thao tác được mọi bước.</p>
          {isLoading || !roles ? (
            <div className="empty"><Loader2 className="spin" size={16} /> Đang tải cấu hình…</div>
          ) : (
            <>
              <div className="wfm-tools">
                <input
                  className="wfm-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm cương vị…"
                  autoComplete="off"
                />
                <label className="wfm-toggle">
                  <input type="checkbox" checked={onlyAssigned} onChange={(e) => setOnlyAssigned(e.target.checked)} />
                  Chỉ hiện cương vị đã giao
                </label>
                <span className="wfm-count">{visiblePositions.length}/{positions.length} cương vị</span>
              </div>
              <div className="wfm-scroll">
                <table className="wfm">
                  <thead>
                    <tr>
                      <th className="wfm-rowhead">Cương vị</th>
                      {WF_STEPS.map((s) => {
                        const empty = roles[s.key].length === 0;
                        return (
                          <th
                            key={s.key}
                            title={`${s.label}\n${s.hint}\n\n(Bấm để chọn / bỏ cả cột)`}
                            onClick={() => toggleColumn(s.key, visiblePositions)}
                          >
                            <span className="wfm-th-label">{s.short}</span>
                            <span className={`wfm-th-sub${empty ? " df" : ""}`}>
                              {empty ? "mặc định" : `${roles[s.key].length} cương vị`}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePositions.map((p) => (
                      <tr key={p}>
                        <th className="wfm-rowhead" title={p}>
                          {p}
                          {assignedCountOf(p) > 0 && <em>{assignedCountOf(p)}</em>}
                        </th>
                        {WF_STEPS.map((s) => {
                          const on = roles[s.key].includes(p);
                          return (
                            <td key={s.key}>
                              <button
                                type="button"
                                className={`wfm-cell${on ? " on" : ""}`}
                                aria-pressed={on}
                                aria-label={`${p} — ${s.label}`}
                                title={`${p} — ${s.label}`}
                                onClick={() => toggle(s.key, p)}
                              >
                                {on && <Check size={13} strokeWidth={3} />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {visiblePositions.length === 0 && (
                      <tr>
                        <td className="wfm-empty" colSpan={WF_STEPS.length + 1}>
                          Không có cương vị nào khớp bộ lọc.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="frm-f">
            <button className="btn ghost" onClick={onClose}>Hủy</button>
            <button className="btn primary" disabled={save.isPending || !roles} onClick={submit}>
              {save.isPending ? <Loader2 className="spin" size={14} /> : <Check size={14} />} Lưu phân quyền
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ================= sửa thông tin phiếu ================= */
function EditDialog({ t, onClose }: { t: MaterialTicket; onClose: () => void }) {
  const canEditProposalDetails = ["CHUA_CHON", "DE_XUAT", "UNG", "SU_DUNG_HIEN_CO", CHEMICAL_TICKET_TYPE, SINGLE_STEP_TICKET_TYPE].includes(t.type);
  const canEditErpCode = ["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type);
  const [unit, setUnit] = useState(t.unit);
  const [assigned, setAssigned] = useState(t.assignedPosition);
  const [category, setCategory] = useState(t.materialCategory ?? "");
  const [selectedMaterialId, setSelectedMaterialId] = useState(t.items[0]?.materialId ?? "");
  const [selectedErpCode, setSelectedErpCode] = useState(t.items[0]?.erpCode ?? "");
  const [proposedQuantity, setProposedQuantity] = useState(t.items[0]?.quantity ?? 1);
  const initialReason = splitReason(t.proposalNote);
  const [reasonChoice, setReasonChoice] = useState(initialReason.choice);
  const [reasonDetail, setReasonDetail] = useState(initialReason.detail);
  const note = joinReason(reasonChoice, reasonDetail);
  // Hóa chất / chai khí chỉ có lý do Nhập hoặc Khác — đổi loại vật tư mà lý do cũ không còn
  // hợp lệ thì xoá luôn, tránh gửi lên máy chủ một lý do đã bị khoá.
  const reasonOptions = useMemo(() => ticketReasonsFor(category), [category]);
  React.useEffect(() => {
    if (reasonChoice && !reasonOptions.includes(reasonChoice)) {
      setReasonChoice("");
      setReasonDetail("");
    }
  }, [reasonOptions, reasonChoice]);

  const [replacementDeviceSeqs, setReplacementDeviceSeqs] = useState<string[]>(() => {
    const storedKeys = t.items[0]?.replacementPointKeys ?? [];
    return storedKeys.length ? storedKeys : t.items[0]?.deviceSeq ? [t.items[0].deviceSeq] : [];
  });
  const [replacementSystems, setReplacementSystems] = useState<string[]>([]);
  const initialSystemsApplied = React.useRef(false);
  const { data: opts } = useTicketOptions(true);
  const act = useTicketAction(t.id);
  const materialCategoryLabel = category ? TICKET_TO_MATERIAL_CATEGORY[category] ?? category : "";
  // Nghiệp vụ chốt 2026-08-10: KHÔNG chia cương vị theo tổ máy nữa — chọn S1, S2 hay
  // COMMON đều hiện đủ danh sách chức danh. Server cũng đã bỏ chốt tương ứng.
  const positionOptions = useMemo(() => opts?.positions ?? [], [opts?.positions]);
  const materialCards = useMemo(() => {
    if (!assigned || !materialCategoryLabel) return [];
    return (opts?.materials ?? []).filter((m) => {
      const matchesCategory = m.category === materialCategoryLabel;
      const matchesUnit = m.machine === unit;
      const matchesPosition = m.managingPositions.some((p) => positionsMatch(p, assigned));
      return matchesCategory && matchesUnit && matchesPosition;
    });
  }, [assigned, materialCategoryLabel, opts?.materials, unit]);
  const selectedMaterial = materialCards.find((m) => m.id === selectedMaterialId) ?? null;
  const availableDeviceOptions = useMemo(
    () => (selectedMaterial?.devices ?? []).filter((device) => positionsMatch(device.managingPosition, assigned)),
    [assigned, selectedMaterial]
  );
  const replacementSystemOptions = useMemo(
    () => Array.from(new Set(availableDeviceOptions.map((device) => device.system?.trim()).filter(Boolean) as string[])),
    [availableDeviceOptions]
  );
  const selectedDeviceOptions = useMemo(
    () => replacementSystems.length
      ? availableDeviceOptions.filter((device) => replacementSystems.includes(device.system?.trim() ?? ""))
      : availableDeviceOptions,
    [availableDeviceOptions, replacementSystems]
  );
  const supplementRecoverySelected = isSupplementReason(note) && availableDeviceOptions.some(
    (device) => replacementDeviceSeqs.includes(device.seq) && device.recoveryOnSupplement,
  );
  const selectedErpOptions = useMemo(
    () => selectedMaterial?.erpCodes?.length
      ? selectedMaterial.erpCodes
      : selectedMaterial
        ? [{ code: selectedMaterial.code, erpStock: 0 }]
        : [],
    [selectedMaterial]
  );

  React.useEffect(() => {
    if (!canEditProposalDetails || !opts) return;
    if (!materialCards.length) {
      if (selectedMaterialId) setSelectedMaterialId("");
      if (selectedErpCode) setSelectedErpCode("");
      if (replacementDeviceSeqs.length) setReplacementDeviceSeqs([]);
      if (replacementSystems.length) setReplacementSystems([]);
      return;
    }
    if (!materialCards.some((m) => m.id === selectedMaterialId)) {
      setSelectedMaterialId(materialCards[0].id);
      setReplacementDeviceSeqs([]);
      setReplacementSystems([]);
    }
  }, [canEditProposalDetails, materialCards, opts, replacementDeviceSeqs.length, replacementSystems.length, selectedErpCode, selectedMaterialId]);

  React.useEffect(() => {
    if (!canEditErpCode || !opts) return;
    if (!selectedErpOptions.length) {
      if (selectedErpCode) setSelectedErpCode("");
      return;
    }
    if (!selectedErpOptions.some((item) => item.code === selectedErpCode)) {
      setSelectedErpCode(selectedErpOptions[0].code);
    }
  }, [canEditErpCode, opts, selectedErpCode, selectedErpOptions]);

  React.useEffect(() => {
    if (initialSystemsApplied.current || !availableDeviceOptions.length) return;
    initialSystemsApplied.current = true;
    const selectedKeys = new Set(replacementDeviceSeqs);
    setReplacementSystems(Array.from(new Set(
      availableDeviceOptions
        .filter((device) => selectedKeys.has(device.seq))
        .map((device) => device.system?.trim())
        .filter(Boolean) as string[]
    )));
  }, [availableDeviceOptions, replacementDeviceSeqs]);

  React.useEffect(() => {
    const validSystems = new Set(replacementSystemOptions);
    setReplacementSystems((current) => {
      const next = current.filter((system) => validSystems.has(system));
      return next.length === current.length ? current : next;
    });
  }, [replacementSystemOptions]);

  React.useEffect(() => {
    if (!canEditProposalDetails || !opts) return;
    if (!selectedMaterial) {
      if (replacementDeviceSeqs.length) setReplacementDeviceSeqs([]);
      return;
    }
    const validKeys = new Set(availableDeviceOptions.map((device) => device.seq));
    setReplacementDeviceSeqs((current) => {
      const next = current.filter((key) => validKeys.has(key));
      return next.length === current.length ? current : next;
    });
  }, [availableDeviceOptions, canEditProposalDetails, opts, replacementDeviceSeqs.length, selectedMaterial]);

  function selectUnit(nextUnit: string) {
    setUnit(nextUnit);
    setSelectedMaterialId("");
    setSelectedErpCode("");
    setReplacementDeviceSeqs([]);
    setReplacementSystems([]);
  }

  async function submit() {
    try {
      await act.mutateAsync({
        action: "editInfo", unit,
        assignedPosition: assigned, materialCategory: category,
        materialId: selectedMaterialId || undefined,
        erpCode: selectedErpCode || undefined,
        proposedQuantity,
        note: note.trim() || undefined,
        replacementDeviceSeqs,
      });
      toast.success(`Đã cập nhật phiếu ${materialTicketReference(t)}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cập nhật thất bại");
    }
  }

  return (
    <>
      <div className="ovl" onClick={onClose} />
      <div className="dlg dlg-scroll">
        <div className="dlg-h"><b>Sửa phiếu {materialTicketReference(t)}</b>
          <button className="x" onClick={onClose}><X size={16} /></button></div>
        <div className="frm frm-scroll">
          <div className="ticket-unit-field">
            <label>Tổ máy</label>
            <div className="seg2 ticket-unit-options">{UNITS.map((u) => (
              <button key={u} className={unit === u ? "on" : ""} onClick={() => selectUnit(u)}>{u}</button>
            ))}</div>
          </div>

          <label>Cương vị được giao thực hiện *</label>
          <select value={assigned} onChange={(e) => { setAssigned(e.target.value); setSelectedMaterialId(""); setSelectedErpCode(""); setReplacementDeviceSeqs([]); setReplacementSystems([]); }}>
            <option value="">— Chọn cương vị (chỉ cương vị này thấy phiếu) —</option>
            {positionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <label>Loại vật tư *</label>
          <div className="cats ticket-category-options">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" className={category === c ? "on" : ""} onClick={() => { setCategory(c); setSelectedMaterialId(""); setSelectedErpCode(""); setReplacementDeviceSeqs([]); setReplacementSystems([]); }}>{displayMaterialCategory(c)}</button>
            ))}
          </div>

          {canEditProposalDetails && (
            <>
              <label>Tên vật tư</label>
              <div className="material-cards">
                {!assigned ? (
                  <div className="material-empty">Chọn cương vị để hiện danh sách vật tư được quản lý</div>
                ) : !category ? (
                  <div className="material-empty">Chọn loại vật tư để hiện danh sách tên vật tư</div>
                ) : materialCards.length ? (
                  materialCards.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={selectedMaterialId === m.id ? "on" : ""}
                      onClick={() => { setSelectedMaterialId(m.id); setSelectedErpCode(""); setReplacementDeviceSeqs([]); setReplacementSystems([]); }}
                      title={`${m.code} - ${m.name}`}
                    >
                      <span>{m.name}</span>
                      <small>Hiện có: {m.quantity} {m.unit}</small>
                      <small>Số lượng ERP: {totalMaterialErpStock(m).toLocaleString("vi-VN")} {m.unit}</small>
                    </button>
                  ))
                ) : (
                  <div className="material-empty">
                    Cương vị này chưa quản lý vật tư nào thuộc loại đã chọn
                  </div>
                )}
                </div>

              {canEditErpCode && (
                <>
                  <label>Mã vật tư *</label>
                  <select value={selectedErpCode} disabled={!selectedMaterialId} onChange={(e) => setSelectedErpCode(e.target.value)}>
                    <option value="">{selectedMaterialId ? "— Chọn mã vật tư —" : "— Chọn tên vật tư trước —"}</option>
                    {selectedErpOptions.map((item) => (
                      <option key={item.code} value={item.code}>{item.code} · Số liệu ERP: {item.erpStock}</option>
                    ))}
                  </select>
                </>
              )}

              <div className="reason-grid">
                <div className="field">
                  <label>Lý do *</label>
                  <ReasonPicker choice={reasonChoice} detail={reasonDetail} onChoice={setReasonChoice} onDetail={setReasonDetail} options={reasonOptions} />
                </div>
                <div className="field qty-field">
                  <label>Số lượng đề xuất *</label>
                  <input type="number" min={1} value={proposedQuantity} onChange={(e) => setProposedQuantity(Math.max(1, Number(e.target.value) || 1))} />
                </div>
              </div>
              <label>Thuộc hệ thống</label>
              <SystemMultiSelect
                options={replacementSystemOptions}
                value={replacementSystems}
                onChange={setReplacementSystems}
                disabled={!selectedMaterialId || !replacementSystemOptions.length}
                placeholder={!selectedMaterialId
                  ? "— Chọn tên vật tư trước —"
                  : replacementSystemOptions.length
                    ? "— Chọn một hoặc nhiều hệ thống —"
                    : "— Chưa khai báo hệ thống / thiết bị —"}
              />
              <label>Thiết bị thay thế *</label>
              <DeviceMultiSelect
                options={selectedDeviceOptions}
                allOptions={availableDeviceOptions}
                value={replacementDeviceSeqs}
                onChange={setReplacementDeviceSeqs}
                disabled={!selectedMaterialId || !availableDeviceOptions.length}
              />
              {supplementRecoverySelected && (
                <p className="note ung"><Package size={13} /> Điểm đã chọn được cấu hình: lý do <b>Bổ sung</b> vẫn yêu cầu nhập lượng thu hồi và xuất BBVT thu hồi.</p>
              )}
              {selectedMaterialId && !selectedDeviceOptions.length && <p className="hint">Vật tư này chưa có thiết bị thuộc cương vị đã chọn trong Chi tiết điểm thay thế. Vui lòng khai báo tại Danh mục vận hành 1 trước.</p>}
            </>
          )}

          <div className="frm-f">
            <button className="btn ghost" onClick={onClose}>Hủy</button>
            <button className="btn primary"
              disabled={
                act.isPending ||
                !assigned ||
                !category ||
                (canEditProposalDetails && (!selectedMaterialId || (canEditErpCode && !selectedErpCode) || proposedQuantity <= 0 || !note.trim() || replacementDeviceSeqs.length === 0))
              }
              onClick={submit}>
              {act.isPending ? <Loader2 className="spin" size={14} /> : <Check size={14} />} Lưu thay đổi
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * LÝ DO ĐỀ XUẤT — chọn từ danh sách thay vì gõ tự do, để còn thống kê được vì sao phải
 * đề xuất. Cả bốn lựa chọn đều mở ô nhập chi tiết và lưu dưới dạng
 * "<Lựa chọn>: <nội dung>"; phiếu cũ chỉ lưu tên lựa chọn vẫn đọc được bình thường.
 */
const OTHER_REASON = TICKET_REASON_OTHER;
const REASON_DETAIL_SEPARATOR = ": ";

/** Tách chuỗi đã lưu thành (lựa chọn, nội dung nêu rõ). */
function splitReason(value?: string | null): { choice: string; detail: string } {
  const raw = (value ?? "").trim();
  if (!raw) return { choice: "", detail: "" };
  for (const item of TICKET_REASONS) {
    if (raw === item) return { choice: item, detail: "" };
    const prefix = `${item}:`;
    if (raw.startsWith(prefix)) return { choice: item, detail: raw.slice(prefix.length).trimStart() };
  }
  // Phiếu cũ gõ tay: coi như "Khác" và giữ nguyên chữ đã nhập, không làm mất dữ liệu.
  return { choice: OTHER_REASON, detail: raw };
}

/** Ghép ngược lại để gửi lên máy chủ. */
function joinReason(choice: string, detail: string) {
  if (!choice) return "";
  const value = detail.trim();
  // Chọn "Khác" mà chưa nêu rõ thì coi như CHƯA ĐIỀN; ba lý do đã có nghĩa cụ thể vẫn
  // hợp lệ khi chưa bổ sung diễn giải.
  if (choice === OTHER_REASON && !value) return "";
  return value ? `${choice}${REASON_DETAIL_SEPARATOR}${value}` : choice;
}

/** Ô chọn lý do dùng chung cho hộp Tạo phiếu và hộp Sửa phiếu. */
function ReasonPicker({
  choice, detail, onChoice, onDetail, options = TICKET_REASONS,
}: { choice: string; detail: string; onChoice: (v: string) => void; onDetail: (v: string) => void; options?: readonly string[] }) {
  return (
    <>
      <div className="reason-chips">
        {options.map((item) => (
          <button
            key={item}
            type="button"
            className={choice === item ? "on" : ""}
            onClick={() => {
              if (choice !== item) onDetail("");
              onChoice(item);
            }}
          >
            {item}
          </button>
        ))}
      </div>
      {choice && (
        <input
          key={choice}
          autoFocus
          className="reason-detail"
          value={detail}
          onChange={(e) => onDetail(e.target.value)}
          placeholder={`Nhập nội dung chi tiết cho "${choice}"…`}
        />
      )}
    </>
  );
}

/* ================= chi tiết ================= */
const REPAIR_REQUEST_VISIBLE_STATUSES = new Set([
  "NHAN_VAT_TU",
  "NHAN_TU_HIEN_CO",
  "VHV_LANH_VAT_TU",
  "SU_DUNG_VAT_TU",
  "CHO_NGHIEM_THU",
  "CHO_PHIEU_YCSC",
]);

const showsRepairRequestSection = (ticket: MaterialTicket) =>
  Boolean(ticket.repairRequestNumber)
  || (["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(ticket.type)
    && !isGasCylinderTicket(ticket.materialCategory)
    && REPAIR_REQUEST_VISIBLE_STATUSES.has(ticket.status));

function Detail({ t, viewer, onClose }: { t: MaterialTicket; viewer: TicketViewer | null; onClose: () => void }) {
  const [showActivity, setShowActivity] = useState(false);
  const [reviewStep, setReviewStep] = useState<string | null>(null);
  const flow = flowOf(t);
  const order = orderOf(t);
  const flowStatus = flowStatusKey(t.status, t.type);
  const idx = t.status === "TU_CHOI" ? 99 : t.status === "VAT_TU_KHONG_CO" ? 1 : order.indexOf(flowStatus);
  const currentReceiptSourceLabel = receiptSourceLabel(t.receiptSource, t.type);
  const replacementDeviceName = Array.from(new Set(t.items
    .map((item) => item.deviceNameManual || item.device?.name || "")
    .filter(Boolean)))
    .join(", ");
  const handwrittenBbntUrl = t.bbktDocUrl ? bbntDownloadUrl(t.bbktDocUrl, replacementDeviceName) : null;
  // Không hiển thị biên bản thu hồi cũ từng sinh sớm trước khi bước Nghiệm thu hoàn thành.
  const recoveryDocumentUrl = t.completedAt ? t.recoveryDocUrl : null;
  const exportedDocumentCount = [t.proposalDocUrl, t.docUrl, handwrittenBbntUrl, recoveryDocumentUrl].filter(Boolean).length;
  const hasSupportColumn = showsRepairRequestSection(t) || exportedDocumentCount > 0;
  const hasCompletionSummary = Boolean(
    (t.type !== "UNG" && t.pctNumber)
    || t.repairRequestNumber
    || t.completionNote
    || t.bbntDoNumber
    || t.receivedQuantity != null
    || t.vhvReceivedQuantity != null
    || t.usedQuantity != null,
  );
  const otherReceivedSummary = isOtherMaterialTicketType(t.type)
    ? t.items.map((item) => `${item.receivedQuantity ?? item.quantity} ${item.material.unit}`).join(", ")
    : "";
  const activityLogs = [
    t.createdAt && { at: t.createdAt, who: t.createdByName, what: "Tạo phiếu" },
    t.proposedAt && { at: t.proposedAt, who: t.proposedByName, pos: t.proposedByPosition, what: t.type === "UNG" ? "Nhập liệu thay thế" : "Đề xuất vật tư" },
    t.confirmedAt && { at: t.confirmedAt, who: t.confirmedByName, pos: t.confirmedByPosition, what: "Xác nhận — kho đủ" },
    t.vhvReceivedAt && { at: t.vhvReceivedAt, who: t.vhvReceivedByName, pos: t.vhvReceivedByPosition, what: `VHV lãnh ${t.vhvReceivedQuantity ?? ""}${t.vhvReceivedByName ? ` — VHV: ${t.vhvReceivedByName}` : ""}${t.repairRequestNumber ? ` · Số yêu cầu sửa chữa ${t.repairRequestNumber}` : ""}` },
    t.statsAt && { at: t.statsAt, who: t.statsByName, pos: t.statsByPosition, what: `Xác nhận ĐXVT: ${t.proposalNumber ?? ""}${t.proposalReceiverName ? ` · VHV nhận: ${t.proposalReceiverName}` : ""}` },
    t.proposalIssuedAt && !t.statsAt && { at: t.proposalIssuedAt, who: t.statsByName, pos: t.statsByPosition, what: `Xác nhận ĐXVT${t.proposalReceiverName ? ` · VHV nhận: ${t.proposalReceiverName}` : ""}` },
    t.receivedAt && { at: t.receivedAt, who: t.receivedByName, pos: t.receivedByPosition, what: [
      `Xác nhận vật tư lãnh: ${otherReceivedSummary || t.receivedQuantity || ""}`,
      receiptSourceLabel(t.receiptSource, t.type),
      // Luồng Sử dụng hiện có không có phiếu giao hàng — in "—" chỉ tố thêm nghi ngờ thiếu dữ liệu.
      (t.deliveryNoteNumber ?? t.receivedMethod) ? `Phiếu giao hàng ${t.deliveryNoteNumber ?? t.receivedMethod}` : "",
    ].filter(Boolean).join(" · ") },
    t.usedAt && { at: t.usedAt, who: t.usedByName, pos: t.usedByPosition, what: `Sử dụng vật tư${t.materialUserName ? ` — VHV: ${t.materialUserName}` : ""}: dùng ${t.usedQuantity ?? ""}, còn lại ${t.remainingQuantity ?? ""}` },
    t.completedAt && { at: t.completedAt, who: t.completedByName, pos: t.completedByPosition, what: t.type === SINGLE_STEP_TICKET_TYPE
      ? `VHV xác nhận khối lượng lãnh: ${t.receivedQuantity ?? ""} ${t.items[0]?.material.unit ?? ""}`.trim()
      : isOtherMaterialTicketType(t.type)
      ? isOtherMaterialAdvanceTicket(t.type) ? "Hoàn thiện ĐXVT, kết thúc phiếu ứng" : "Lãnh vật tư và hoàn tất phiếu"
      : isGasCylinderTicket(t.materialCategory)
        ? `Xác nhận trả: ${t.recoveryQuantity ?? ""} ${t.items[0]?.material.unit ?? ""}`.trim()
        : `Nghiệm thu${materialTicketRequiresRecovery(t) ? ", xuất BBTHVT" : ""}` },
    t.settledAt && { at: t.settledAt, who: t.settledByName, what: `Quyết toán vật tư · Số BBNT DO ${t.bbntDoNumber ?? "—"}` },
    ...(t.activityLogs ?? []).filter((log) => log.action === "MT_EDIT_STEP").map((log) => ({
      at: log.createdAt, who: log.user.name, pos: log.user.position, what: log.detail ?? "Chỉnh sửa nội dung bước",
    })),
  ].filter(Boolean) as Array<{ at: string; who: string | null; pos?: string | null; what: string }>;

  return (
    <>
      {/* Thông tin phiếu (mã, loại, giao, trạng thái...) đã hiện ở dòng bảng — chi tiết chỉ còn tiến trình + nội dung */}
      <div className="p-body">
        {/* Hàng trên: tiến trình (trái) + Dấu vết (phải) */}
        <div className="p-top">
        <div className="steps">
	          {flow.map((s) => {
	            const si = order.indexOf(s.key);
	            const done = t.status === "HOAN_TAT" || si < idx;
	            const cur = s.key === flowStatus;
	            const recoveryPending = s.key === "SU_DUNG_VAT_TU" && !!t.usedAt && materialTicketRequiresRecovery(t) && !t.recoveryReturnedAt;
	            const reviewable = done || (t.type === "UNG" && s.key === "CHO_HOAN_THIEN" && !!t.bbktNumber);
	            const caption = t.type === "DE_XUAT" && t.status === "CHO_THONG_KE_XUAT_BIEN_BAN" && s.key === "CHO_NGHIEM_THU"
	              ? "Thống kê · Chờ xuất BBNT D-Office"
	              : s.key === "CHO_PHIEU__XUAT_KHO" && t.proposalReceiverName
	              ? "Xem lại"
	              : `${s.who}${reviewable ? " · Xem lại" : ""}`;
	            return (
	              <button type="button" key={s.key} disabled={!reviewable} onClick={() => setReviewStep(s.key)} className={`step step-review ${done && !recoveryPending ? "done" : ""} ${recoveryPending ? "recovery-pending" : ""} ${cur ? "cur" : ""}`}>
	                {recoveryPending ? <AlertTriangle size={17} /> : done ? <CircleCheck size={17} /> : cur ? <CircleDot size={17} /> : <Circle size={17} />}
	                <div><b>{s.label}</b><span>{recoveryPending ? "Chưa xác nhận trả vật tư thu hồi · Xem lại" : caption}</span></div>
	              </button>
	            );
	          })}
          {t.status === "TU_CHOI" && (
            <div className="step rejected"><Ban size={17} /><div><b>Phiếu bị từ chối</b><span>{t.rejectedReason}</span></div></div>
          )}
          {t.status === "VAT_TU_KHONG_CO" && (
            <div className="step rejected"><AlertTriangle size={17} /><div><b>Vật tư không có/không đủ</b><span>Chỉ có thể từ chối phiếu này.</span></div></div>
          )}
        </div>

        <div className="items top-items">
          <div className="top-items-head">
            {t.items.length > 0 && <label className="lb"><Package size={13} /> Vật tư trong phiếu</label>}
            <div className="detail-actions">
              <button className="activity-toggle" onClick={() => setShowActivity(true)} title="Xem hoạt động ghi nhận"><Clock size={14} /> Hoạt động</button>
              <button className="dclose" onClick={onClose} title="Thu gọn"><X size={15} /></button>
            </div>
          </div>
          {t.items.length > 0 && (
            <>
            {t.items.map((it, itemIndex) => {
              const short = !isChemicalFlowTicket(t.materialCategory)
                && ["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type)
                && it.quantity > it.material.quantity;
              return (
                <div key={it.id} className={`item ${short ? "short" : ""}`}>
                  <div className="material-overview-grid">
                    <div className="material-info-column">
                      <b>{it.erpName || it.material.name}</b>
                      <span>{it.quantity > 0 ? `Số lượng đề xuất: ${it.quantity} ${it.material.unit}` : "Số lượng đề xuất: Chưa nhập"}{it.receivedQuantity != null ? ` · Thực lãnh: ${it.receivedQuantity} ${it.material.unit}` : ""} · Hiện có: {it.material.quantity}{short ? " — THIẾU" : ""}</span>
                      <span className="soft material-device-line">{it.deviceNameManual || (it.device ? `${it.device.seq} · ${it.device.name}` : "Chưa nhập thiết bị")}</span>
                      {itemIndex === 0 && t.bbktNumber && <span className="material-bbkt-line">Số biên bản kiểm tra: <b>{t.bbktNumber}</b></span>}
                    </div>
                    <div className="material-info-column material-info-column-right">
                      {it.erpCode && (
                        <Link className="material-code-link" href={materialCatalogHref(t, it.erpCode)}>
                          {it.erpCode}
                        </Link>
                      )}
                      {itemIndex === 0 && (
                        <span className="material-proposal-line">
                          {t.proposalNumber && <span>Số phiếu ĐXVT: <b>{t.proposalNumber}</b></span>}
                          {(t.deliveryNoteNumber || t.receivedMethod) && <span>Số phiếu giao hàng: <b>{t.deliveryNoteNumber ?? t.receivedMethod}</b></span>}
                          {t.type === "UNG" && t.pctNumber && <span>Số PCT/LCT: <b>{t.pctNumber}</b></span>}
                          {t.proposalReceiverName && <small>VHV nhận: <b>{t.proposalReceiverName}</b></small>}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </>
          )}

          <div className="step-workspace">
            <div className={`completion-overview ${hasSupportColumn ? "with-support" : ""}`}>
              <div className="completion-details">
                {hasCompletionSummary && (
                  <div className="completion-summary-card">
                    {((t.type !== "UNG" && t.pctNumber) || t.repairRequestNumber || t.bbntDoNumber) && (
                      <div className="ticket-note-row">
                        {t.type !== "UNG" && t.pctNumber && <div className="meta-line">Số PCT/LCT: <b>{t.pctNumber}</b></div>}
                        {t.repairRequestNumber && <div className="meta-line repair-request-meta">Số yêu cầu sửa chữa: <b>{t.repairRequestNumber}</b></div>}
                        {t.bbntDoNumber && <div className="meta-line">Số BBNT DO: <b>{t.bbntDoNumber}</b></div>}
                      </div>
                    )}
                    {t.completionNote && <div className="done-note"><Check size={13} /> {t.completionNote}</div>}
                    {t.receivedQuantity != null && (
                      <div className="meta-line received-summary">
                        <span>Vật tư lãnh: <b>{t.receivedQuantity} {t.items[0]?.material.unit ?? ""}</b></span>
                        <span>Nguồn lãnh: <b className="source-badge">{currentReceiptSourceLabel}</b></span>
                        {/*
                          Hóa chất KHÔNG cộng vào tồn kho và KHÔNG trừ ERP: hàng do nhà thầu giao
                          thẳng theo hợp đồng, phiếu chỉ ghi nhận khối lượng đề xuất và khối lượng
                          nhập. Bước xác nhận lãnh ở API cũng không đụng lô hay ERP — câu chú thích
                          cũ nói ngược lại với thứ hệ thống thực sự làm.
                        */}
                        <em>
                          {t.type === CHEMICAL_TICKET_TYPE || t.type === SINGLE_STEP_TICKET_TYPE
                            ? "chỉ ghi nhận khối lượng nhập, không cộng tồn kho và không trừ ERP"
                            : t.type === "SU_DUNG_HIEN_CO"
                              ? "lấy từ số đang có, kho trừ ở bước sử dụng"
                              : "đã cộng vào số lượng hiện có"}
                        </em>
                      </div>
                    )}
                    {t.vhvReceivedQuantity != null && <div className="meta-line">VHV đã lãnh: <b>{t.vhvReceivedQuantity} {t.items[0]?.material.unit ?? ""}</b></div>}
                    {t.usedQuantity != null && (
                      <div className="meta-line">
                        {/* "Còn lại" cũ đứng cạnh "Hiện có" nên bị đọc thành tồn kho còn bấy nhiêu. Đây là
                            phần LẤY RA MÀ CHƯA DÙNG ĐẾN CỦA RIÊNG PHIẾU NÀY (lấy 9 dùng 9 thì dư 0), không
                            liên quan tồn kho. Gọi đúng tên và nói rõ kho bị trừ bao nhiêu. */}
                        {t.materialUserName && <>VHV sử dụng: <b>{t.materialUserName}</b> · </>}Đã sử dụng: <b>{t.usedQuantity} {t.items[0]?.material.unit ?? ""}</b>
                        {(t.remainingQuantity ?? 0) !== 0 && <> · Lấy ra chưa dùng đến: <b>{t.remainingQuantity} {t.items[0]?.material.unit ?? ""}</b></>}
                        {` — kho đã trừ ${t.usedQuantity} ${t.items[0]?.material.unit ?? ""}`}
                      </div>
                    )}
                  </div>
                )}
                <ActionArea t={t} viewer={viewer} />
                {/* NH3 dùng khối riêng cho bước VHV xác nhận khối lượng lãnh; hóa chất
                    thường nhập xe trong ActionArea và chỉ xem lại tại đây sau khi chốt. */}
                <ChemicalTruckSection t={t} viewer={viewer} />
              </div>

              {hasSupportColumn && (
                <div className="completion-support-column">
                  <RepairRequestSection t={t} viewer={viewer} />

                  {exportedDocumentCount > 0 && (
                    <div className="document-downloads" aria-label="Biên bản đã xuất">
                      <div className="document-downloads-head">
                        <span className="document-downloads-label"><FileText size={14} /> Biên bản đã xuất</span>
                        <span className="document-downloads-count">{exportedDocumentCount} tệp</span>
                      </div>
                      <div className="document-download-links">
                        {t.proposalDocUrl && <a className="pdf" href={t.proposalDocUrl} target="_blank" rel="noreferrer"><Download size={14} /> Phiếu Đề Xuất Vật Tư</a>}
                        {/* Đã NGỪNG phát hành. Nút chỉ còn hiện với phiếu cũ đã xuất trước đó — hồ sơ đã có
                            thì phải tải lại được, chỉ là từ nay không sinh thêm bản mới nào. */}
                        {handwrittenBbntUrl && <a className="pdf" href={handwrittenBbntUrl} target="_blank" rel="noreferrer"><Download size={14} /> Biên Bản Nghiệm Thu Ký Tay</a>}
                        {t.docUrl && <a className="pdf" href={t.docUrl} target="_blank" rel="noreferrer"><Download size={14} /> Biên Bản Nghiệm Thu D-Office</a>}
                        {recoveryDocumentUrl && <a className="pdf recovery-download" href={recoveryDocumentUrl} target="_blank" rel="noreferrer"><Download size={14} /> Biên Bản Vật Tư Thu Hồi</a>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        </div>
      </div>

      {showActivity && <button className="activity-backdrop" aria-label="Đóng hoạt động ghi nhận" onClick={() => setShowActivity(false)} />}
      <aside className={`activity-drawer ${showActivity ? "open" : ""}`} aria-hidden={!showActivity}>
        <div className="activity-head">
          <b><Clock size={15} /> Hoạt động ghi nhận</b>
          <button className="x" onClick={() => setShowActivity(false)} title="Đóng"><X size={14} /></button>
        </div>
        <div className="activity-list">
          {activityLogs.map((log, index) => (
            <div className="activity-row" key={`${log.at}-${index}`}>
              <time>{fmt(log.at)}</time>
              <b>{log.who}{log.pos ? ` · ${log.pos}` : ""}</b>
              <span>{log.what}</span>
            </div>
          ))}
        </div>
      </aside>
      {reviewStep && <StepReviewDialog t={t} viewer={viewer} stepKey={reviewStep} onClose={() => setReviewStep(null)} />}
    </>
  );
}

function StepReviewDialog({ t, viewer, stepKey, onClose }: { t: MaterialTicket; viewer: TicketViewer | null; stepKey: string; onClose: () => void }) {
  const act = useTicketAction(t.id);
  const permission: keyof NonNullable<TicketViewer["steps"]> | null = ({ CHO_XAC_NHAN: "confirm", CHO_THONG_KE: "confirm", CHO_PHIEU__XUAT_KHO: "stats", CHO_XAC_NHAN_PHAT: "stats", NHAN_VAT_TU: "receive", SU_DUNG_VAT_TU: "use", CHO_NGHIEM_THU: "accept" } as const)[stepKey as "CHO_XAC_NHAN" | "CHO_THONG_KE" | "CHO_PHIEU__XUAT_KHO" | "CHO_XAC_NHAN_PHAT" | "NHAN_VAT_TU" | "SU_DUNG_VAT_TU" | "CHO_NGHIEM_THU"] ?? null;
  const canEdit = !!permission && !!viewer?.steps?.[permission];
  const editStep = permission;
  const [proposalNumber, setProposalNumber] = useState(t.proposalNumber ?? "");
  const [proposalReceiverNameReview, setProposalReceiverNameReview] = useState(t.proposalReceiverName ?? "");
  /*
   * Phiếu thuộc luồng hóa chất? Dùng cho CẢ HAI bước mà hộp Xem lại rẽ nhánh:
   *   • "stats"   chốt lịch giao hàng + khối lượng giao, không phải số phiếu ĐXVT
   *   • "receive" chỉ có khối lượng lãnh, không nguồn lãnh và không phiếu giao hàng
   * Hai luồng dùng chung khóa bước nhưng nội dung khác hẳn nhau.
   */
  const isChemicalStats = t.type === CHEMICAL_TICKET_TYPE || t.type === SINGLE_STEP_TICKET_TYPE;
  const [deliveryDateReview, setDeliveryDateReview] = useState(t.deliveryScheduledAt ? String(t.deliveryScheduledAt).slice(0, 10) : "");
  const [deliveryQtyReview, setDeliveryQtyReview] = useState(t.deliveryQuantity != null ? String(t.deliveryQuantity) : "");
  const [receivedQuantity, setReceivedQuantity] = useState(t.receivedQuantity ?? 1);
  const [receivedMethod, setReceivedMethod] = useState(t.deliveryNoteNumber ?? t.receivedMethod ?? "");
  const [receiptSource, setReceiptSource] = useState<"ERP" | "EXISTING">(normalizeReceiptSource(t.receiptSource));
  // Ảnh liên 3 đang gắn trên lô của phiếu — lô của chính phiếu này, nhận ra qua `taken`/nhãn
  // số phiếu giao hàng. Chỉ nạp khi đang mở đúng bước nhận để không gọi thừa.
  const [reviewDeliveryPhoto, setReviewDeliveryPhoto] = useState<string | null>(null);
  const reviewLots = useTicketLots(editStep === "receive" && !isChemicalStats ? t.id : "");
  const reviewLotPhotoUrl =
    (reviewLots.data?.data.lots ?? []).find((lot) => lot.label === (t.deliveryNoteNumber ?? t.receivedMethod))
      ?.deliveryPhotoUrl ?? null;
  const [usedQuantity, setUsedQuantity] = useState(t.usedQuantity ?? 1);
  const [materialUserName, setMaterialUserName] = useState(t.materialUserName ?? "");
  const [recoveryQuantity, setRecoveryQuantity] = useState(t.recoveryQuantity ?? 1);
  const [recoveryReturned, setRecoveryReturned] = useState(!!t.recoveryReturnedAt);
  const [pctNumber, setPctNumber] = useState(t.pctNumber ?? "");
  const [chiHuyName, setChiHuyName] = useState(t.chiHuyName ?? "");
  const [completionNote, setCompletionNote] = useState(t.completionNote ?? "");
  const [pctContent, setPctContent] = useState(t.pctContent ?? "");
  const [bbktNumber, setBbktNumber] = useState(t.bbktNumber ?? "");
  const [reason, setReason] = useState(t.proposalNote ?? "");
  // Ảnh hiện trường của bước sử dụng — xem lại, gỡ, thay ảnh khác ngay tại đây.
  const usagePhotos = useTicketUsagePhotos(t.id, editStep === "use");
  const usagePhotoCount = (usagePhotos.data ?? []).filter((photo) => photo.url).length;
  const missingUsagePhotos = editStep === "use" && usagePhotoCount < MIN_USAGE_PHOTOS;
  const [workStartedAt, setWorkStartedAt] = useState(datetimeLocalValue(t.workStartedAt));
  const [workEndedAt, setWorkEndedAt] = useState(datetimeLocalValue(t.workEndedAt));

  const label = flowOf(t).find((step) => step.key === stepKey)?.label ?? "Chi tiết bước";
  async function save() {
    if (!editStep) return;
    const payload: Record<string, unknown> = { action: "editStep", step: editStep };
    if (editStep === "confirm") Object.assign(payload, { note: reason.trim(), bbktNumber });
    if (editStep === "stats") {
      Object.assign(
        payload,
        isChemicalStats
          ? { deliveryScheduledAt: deliveryDateReview, deliveryQuantity: Number(deliveryQtyReview) }
          : { proposalNumber, proposalReceiverName: proposalReceiverNameReview }
      );
    }
    if (editStep === "receive") {
      Object.assign(
        payload,
        isChemicalStats
          ? { receivedQuantity }
          : {
              receivedQuantity,
              deliveryNoteNumber: receivedMethod,
              receiptSource,
              ...(reviewDeliveryPhoto ? { deliveryPhotoDataUrl: reviewDeliveryPhoto } : {}),
            }
      );
    }
    if (editStep === "use") Object.assign(payload, {
      usedQuantity,
      materialUserName: materialUserName.trim(),
      ...(materialTicketRequiresRecovery(t) ? { recoveryQuantity, recoveryReturned } : {}),
    });
    if (editStep === "accept") Object.assign(payload, {
      pctNumber,
      chiHuyName,
      pctContent,
      completionNote,
      workStartedAt,
      workEndedAt,
    });
    try {
      await act.mutateAsync(payload);
      const hasExportedDocuments = Boolean(t.proposalDocUrl || t.bbktDocUrl || t.docUrl || t.recoveryDocUrl);
      toast.success(hasExportedDocuments
        ? "Đã lưu chỉnh sửa và cập nhật biên bản đã xuất"
        : "Đã chỉnh sửa bước và cập nhật hoạt động");
      onClose();
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "Không thể chỉnh sửa bước"); }
  }

  return <>
    <div className="ovl" onClick={onClose} />
    <div className="dlg step-review-dialog">
      <div className="dlg-h"><b>{label}</b><button className="x" onClick={onClose}><X size={16} /></button></div>
      <div className="frm frm-scroll step-review-form">
        {!permission && <p className="note">Bước này được xem lại trong thông tin tổng quan của phiếu.</p>}
        {editStep === "confirm" && <>
          <label>Luồng thực hiện<input value={t.type === "DE_XUAT" ? "Đề xuất" : t.type === "UNG" ? "Ứng" : "Sử dụng hiện có"} disabled /></label>
          <label>Mã vật tư ERP<input value={t.items[0]?.erpCode ?? "—"} disabled /></label>
          <label>Tên vật tư ERP<input value={t.items[0]?.erpName ?? t.items[0]?.material.name ?? "—"} disabled /></label>
          <label>Số lượng đã xác nhận<input value={`${t.items[0]?.quantity ?? 0} ${t.items[0]?.material.unit ?? ""}`} disabled /></label>
          <label>Lý do *<input value={reason} disabled={!canEdit} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do thay thế vật tư" /></label>
          <label>Số biên bản kiểm tra (nếu có)<input value={bbktNumber} disabled={!canEdit} onChange={(e) => setBbktNumber(e.target.value)} placeholder="Chưa nhập số biên bản kiểm tra" /></label>
        </>}
        {editStep === "stats" && isChemicalStats && <>
          <label>Lịch giao hàng<input type="date" value={deliveryDateReview} disabled={!canEdit} onChange={(e) => setDeliveryDateReview(e.target.value)} /></label>
          <label>Khối lượng giao{t.items[0]?.material.unit ? ` (${t.items[0].material.unit})` : ""}<input type="number" min={1} value={deliveryQtyReview} disabled={!canEdit} onChange={(e) => setDeliveryQtyReview(e.target.value)} /></label>
        </>}
        {editStep === "stats" && !isChemicalStats && <>
          <label>Số phiếu ĐXVT<input value={proposalNumber} disabled={!canEdit} onChange={(e) => setProposalNumber(e.target.value)} /></label>
          {t.type !== "UNG" && <label>Tên VHV nhận phiếu ĐXVT<input value={proposalReceiverNameReview} disabled={!canEdit} onChange={(e) => setProposalReceiverNameReview(e.target.value)} /></label>}
        </>}
        {editStep === "receive" && isChemicalStats && (
          /*
            Hóa chất: nhà thầu giao thẳng theo hợp đồng nên KHÔNG có nguồn lãnh để chọn và
            KHÔNG phát sinh phiếu giao hàng. Bày hai ô đó ra là mời người dùng điền vào
            chỗ máy chủ không hề đọc tới.
          */
          <label>
            Khối lượng lãnh{t.items[0]?.material.unit ? ` (${t.items[0].material.unit})` : ""}
            <input type="number" min={1} value={receivedQuantity} disabled={!canEdit} onChange={(e) => setReceivedQuantity(Number(e.target.value))} />
          </label>
        )}
        {editStep === "receive" && !isChemicalStats && <>
          <label>Khối lượng lãnh<input type="number" min={1} value={receivedQuantity} disabled={!canEdit} onChange={(e) => setReceivedQuantity(Number(e.target.value))} /></label>
          <div className={`review-receive-row ${t.type !== "UNG" ? "single" : ""}`}>
            <div className="review-receive-source">
              <label>Nguồn lãnh vật tư</label>
              {t.type === "UNG" ? (
                <div className="seg2 review-receive-toggle">
                  <button type="button" disabled={!canEdit} className={receiptSource === "ERP" ? "on" : ""} onClick={() => setReceiptSource("ERP")}>Lãnh kho DH1</button>
                  <button type="button" disabled={!canEdit} className={receiptSource === "EXISTING" ? "on" : ""} onClick={() => setReceiptSource("EXISTING")}>Lãnh ngoài</button>
                </div>
              ) : <div className="fixed-receive-source">Lãnh kho DH1</div>}
            </div>
            <label className="field review-delivery-field">Số phiếu giao hàng
              <input value={receivedMethod} disabled={!canEdit} onChange={(e) => setReceivedMethod(e.target.value)} />
            </label>
          </div>
          {/* Chụp lại tờ liên 3 khi ảnh cũ mờ hoặc nhầm phiếu. Không chọn ảnh mới thì giữ nguyên
              ảnh đang gắn trên lô. */}
          <DeliveryPhotoField
            value={reviewDeliveryPhoto}
            existingUrl={reviewLotPhotoUrl}
            disabled={!canEdit}
            onChange={setReviewDeliveryPhoto}
          />
        </>}
        {(editStep === "use") && <>
          <div className="review-use-grid">
            <label>Tên VHV sử dụng vật tư<input value={materialUserName} disabled={!canEdit} onChange={(e) => setMaterialUserName(e.target.value)} placeholder="Nhập tên VHV sử dụng vật tư" /></label>
            <label>Số lượng sử dụng ({t.items[0]?.material.unit ?? ""})<input type="number" min={1} value={usedQuantity} disabled={!canEdit} onChange={(e) => setUsedQuantity(Number(e.target.value))} /></label>
          </div>
          <UsagePhotoCard ticketId={t.id} canEdit={canEdit} />
          {materialTicketRequiresRecovery(t) && (
            <div className="review-recovery-grid">
              <label className="review-recovery-quantity">Số lượng vật tư thu hồi ghi vào BBTHVT ({t.items[0]?.material.unit ?? ""}) *
                <input type="number" min={1} value={recoveryQuantity} disabled={!canEdit} onChange={(e) => setRecoveryQuantity(Number(e.target.value))} />
              </label>
              <label className={`recovery-return-check ${recoveryReturned ? "checked" : ""}`}>
                <input type="checkbox" disabled={!canEdit} checked={recoveryReturned} onChange={(e) => setRecoveryReturned(e.target.checked)} />
                <span><b>VHV xác nhận đã trả vật tư thu hồi xong</b><small className="cycle">Định kỳ thứ 5 hằng tuần</small>{recoveryReturned && <small>Ngày trả: {fmtDay(t.recoveryReturnedAt ?? new Date().toISOString())}</small>}</span>
              </label>
            </div>
          )}
        </>}
        {editStep === "accept" && <>
          <div className="review-accept-grid">
            <label>Số PCT/LCT *
              <input value={pctNumber} disabled={!canEdit} onChange={(e) => setPctNumber(e.target.value)} />
            </label>
            <label>Chỉ huy trực tiếp *
              <input value={chiHuyName} disabled={!canEdit} onChange={(e) => setChiHuyName(e.target.value)} />
            </label>
          </div>
          <div className="review-accept-grid">
            <label>Nội dung PCT
              <textarea rows={3} value={pctContent} disabled={!canEdit} onChange={(e) => setPctContent(e.target.value)} />
            </label>
            <label>Nội dung nghiệm thu *
              <textarea rows={3} value={completionNote} disabled={!canEdit} onChange={(e) => setCompletionNote(e.target.value)} />
            </label>
          </div>
          <div className="review-accept-grid">
            <label>Thời gian bắt đầu nghiệm thu *
              <input type="datetime-local" value={workStartedAt} disabled={!canEdit} onChange={(e) => setWorkStartedAt(e.target.value)} />
            </label>
            <label>Thời gian kết thúc nghiệm thu *
              <input type="datetime-local" value={workEndedAt} disabled={!canEdit} onChange={(e) => setWorkEndedAt(e.target.value)} />
            </label>
          </div>
          {/* Đại diện SCCN KHÔNG nằm ở bước này — Thống kê chọn ở bước xác nhận mã vật tư,
              cùng lúc xuất BBNT D-Office mang tên người đó. */}
        </>}
        {permission && !canEdit && <p className="hint">Bạn có thể xem lại nhưng chưa được phân quyền chỉnh sửa bước này.</p>}
        <div className="frm-f">
          {missingUsagePhotos && (
            <span className="note" style={{ marginRight: "auto" }}>
              <AlertTriangle size={13} /> Cần tối thiểu {MIN_USAGE_PHOTOS} trên 3 ảnh hiện trường ({usagePhotoCount}/3).
            </span>
          )}
          <button className="btn ghost" onClick={onClose}>Đóng</button>
          {canEdit && <button className="btn primary" disabled={act.isPending || missingUsagePhotos || (editStep === "confirm" && !reason.trim()) || (editStep === "accept" && (!pctNumber.trim() || !chiHuyName.trim() || !completionNote.trim() || !workStartedAt || !workEndedAt))} onClick={save}>{act.isPending ? <Loader2 className="spin" size={14} /> : <Pencil size={14} />} Lưu chỉnh sửa</button>}
        </div>
      </div>
    </div>
  </>;
}

/**
 * CHỎN PHÂN BỔ THEO PHIẾU GIAO HÀNG Ở BƯỚC NGHIỆM THU.
 *
 * Số đã dùng được chia sẵn theo FIFO (lô cũ trước) từ bước Sử dụng. Ở đây người lập biên
 * bản nhìn thấy lấy bao nhiêu từ phiếu nào và sửa được — vì biên bản phải khớp chứng từ thực
 * tế, có khi lấy dầu từ phýy mới chứ không phải phýy cũ.
 *
 * TỔNG PHẢI BẰNG số đã sử dụng; lệch thì khoá nút và nói rõ còn thiếu/thừa bao nhiêu.
 */
function LotAllocationPicker({
  ticketId, value, onChange,
}: { ticketId: string; value: Record<string, number> | null; onChange: (next: Record<string, number>) => void }) {
  const { data, isLoading } = useTicketLots(ticketId);
  const info = data?.data;
  const [previewLot, setPreviewLot] = useState<{ url: string; label: string } | null>(null);

  React.useEffect(() => {
    if (!info || value) return;
    onChange(Object.fromEntries(info.lots.map((lot) => [lot.id, lot.taken])));
  }, [info, value, onChange]);

  if (isLoading) return <p className="hint">Đang tải tồn theo phiếu giao hàng…</p>;
  if (!info || !info.lots.length) return null;

  const current = value ?? Object.fromEntries(info.lots.map((lot) => [lot.id, lot.taken]));
  const total = Object.values(current).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const diff = total - info.usedQuantity;

  return (
    <div className="lot-picker">
      <table className="lot-table">
        <thead>
          {/* Cột "Liên 3" cho thấy lô nào có sẵn ảnh phiếu xuất kho: lấy hàng từ lô nào thì
              BBTHVT tự in kèm ảnh của lô đó, người dùng không phải tải thêm gì. */}
          <tr><th>Số phiếu giao hàng</th><th>Mã vật tư</th><th>Liên 3</th><th>Có thể lấy</th><th>Lấy</th></tr>
        </thead>
        <tbody>
          {info.lots.map((lot) => (
            <tr key={lot.id}>
              <td>{lot.label}</td>
              <td className="lot-code">{lot.erpCode || "—"}</td>
              <td className="lot-code">
                {lot.deliveryPhotoUrl
                  ? (
                    <button
                      type="button"
                      className="pdf-inline lot-photo-preview-trigger"
                      onClick={() => setPreviewLot({ url: lot.deliveryPhotoUrl!, label: lot.label })}
                    >
                      Xem ảnh
                    </button>
                  )
                  : "—"}
              </td>
              <td className="lot-num">{lot.available} {info.unit}</td>
              <td className="lot-num">
                <input
                  type="number" min={0} max={lot.available}
                  value={current[lot.id] ?? 0}
                  onChange={(e) => onChange({ ...current, [lot.id]: Math.max(0, Math.min(lot.available, Math.trunc(Number(e.target.value) || 0))) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {diff !== 0 && (
        <div className="warnbox"><AlertTriangle size={15} /> Tổng đang phân bổ {total} {info.unit}, {diff > 0 ? `thừa ${diff}` : `thiếu ${-diff}`} so với số đã sử dụng ({info.usedQuantity} {info.unit}).</div>
      )}

      <Dialog open={Boolean(previewLot)} onOpenChange={(open) => !open && setPreviewLot(null)}>
        <DialogContent className="max-w-4xl overflow-hidden p-0">
          <DialogHeader className="border-b border-slate-200 bg-slate-50 px-5 py-4 text-left">
            <DialogTitle>Ảnh phiếu xuất kho liên 3</DialogTitle>
            <p className="text-xs text-slate-500">Phiếu giao hàng: <b className="text-slate-700">{previewLot?.label}</b></p>
          </DialogHeader>
          <div className="flex min-h-[320px] max-h-[72vh] items-center justify-center overflow-auto bg-slate-950/95 p-4">
            {previewLot && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewLot.url}
                alt={`Ảnh liên 3 của phiếu giao hàng ${previewLot.label}`}
                className="max-h-[68vh] max-w-full rounded-md object-contain shadow-2xl"
              />
            )}
          </div>
          <DialogFooter className="border-t border-slate-200 bg-white px-5 py-3 sm:justify-between">
            <span className="truncate text-xs text-slate-500">Kiểm tra ảnh trước khi xuất biên bản vật tư thu hồi.</span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setPreviewLot(null)}>Đóng</Button>
              {previewLot && (
                <Button type="button" size="sm" asChild>
                  <a href={previewLot.url} download={`lien-3-${previewLot.label}.jpg`}>
                    <Download className="h-4 w-4" /> Tải ảnh
                  </a>
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================= hành động theo lượt ================= */
/**
 * Khối "Chuyến xe hóa chất đã nhập" trong panel chi tiết phiếu.
 *
 * Chỉ hiện với phiếu thuộc luồng hóa chất. Cố ý nằm ngoài ActionArea để NH3 có một
 * workspace riêng cho bước VHV xác nhận khối lượng lãnh; hóa chất thường vẫn nhập
 * xe tại action `receive` của bước cuối.
 */
/**
 * Ra SYC sửa chữa từ chính phiếu vật tư — "cổng vật tư đứng trước SYC".
 *
 * Trước đây SYC ra bất cứ lúc nào nên có cảnh đội sửa chữa sang tới nơi mà vật tư chưa về.
 * Nay phiếu vật tư ra trước, xác nhận có vật tư xong mới tới lượt SYC.
 *
 * MỘT CHẠM chứ không tự động tạo: số yêu cầu là tài nguyên cấp phát một chiều rồi đẩy lên
 * Google Sheet, tự sinh là tiêu số cho cả những lần VHV tự thay không cần đội sửa chữa. Form
 * mồi sẵn 100% (nội dung lấy từ lý do đề xuất + số ĐXVT, thiết bị/cương vị lấy từ điểm thay
 * thế gắn trên phiếu), người thao tác chỉ đọc lại rồi bấm một lần.
 *
 * Dùng LẠI DefectForm của màn Khiếm khuyết, không dựng form riêng — nhờ vậy phiếu ra từ đây
 * giống hệt phiếu ra từ Danh mục vật tư, kể cả việc đẩy Google Sheet.
 */
function RepairRequestSection({ t, viewer }: { t: MaterialTicket; viewer: TicketViewer | null }) {
  const [open, setOpen] = useState(false);
  const applies = showsRepairRequestSection(t);
  // Tải điều kiện ngay khi hồ sơ phiếu được mở để quyết định CÓ HIỆN NÚT hay không;
  // trước đây chỉ tải sau cú bấm nên form đã mở rồi mới biết phiếu chưa đủ điều kiện.
  const seed = useTicketReplacementRequest(t.id, applies && !t.repairRequestNumber);
  const act = useTicketAction(t.id);

  const assigned = Boolean(viewer && (viewer.isAdmin || samePosition(viewer.position, t.assignedPosition)));
  const canLinkDefect = Boolean(viewer && (
    viewer.isAdmin
    || (t.type === "UNG"
      ? (viewer.steps?.vhvReceiveConfigured ? viewer.steps.vhvReceive : assigned)
      : (assigned && (viewer.steps?.receive ?? viewer.isShiftLeader)))
  ));

  // Chỉ hiện ở các bước từ "xác nhận vật tư lãnh" trở đi, và chỉ khi phiếu chưa gắn SYC.
  if (!applies) return null;

  if (t.repairRequestNumber) {
    return (
      <div className="document-downloads" aria-label="Số yêu cầu sửa chữa">
        <div className="document-downloads-head">
          <span className="document-downloads-label"><Wrench size={14} /> Số yêu cầu sửa chữa</span>
        </div>
        <div className="document-download-links">
          <a className="pdf" href={`/defects?q=${encodeURIComponent(t.repairRequestNumber)}`} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> {t.repairRequestNumber}
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="document-downloads" aria-label="Số yêu cầu sửa chữa">
        <div className="document-downloads-head">
          <span className="document-downloads-label"><Wrench size={14} /> Số yêu cầu sửa chữa</span>
        </div>
        <div className="document-download-links">
          {seed.isLoading ? (
            <span className="note"><Clock size={13} /> Đang kiểm tra điều kiện ra SYC…</span>
          ) : seed.isError ? (
            <span className="note"><AlertTriangle size={13} /> Không kiểm tra được điều kiện ra SYC</span>
          ) : !seed.data?.eligible ? (
            <span className="note"><Clock size={13} /> {seed.data?.reason ?? "Phiếu chưa đủ điều kiện ra SYC"}</span>
          ) : !canLinkDefect ? (
            <span className="note"><AlertTriangle size={13} /> Bạn không có quyền ra SYC ở bước xác nhận vật tư lãnh</span>
          ) : (
            <>
              <button type="button" className="pdf" onClick={() => setOpen(true)}>
                <Wrench size={14} /> Ra SYC sửa chữa
              </button>
              {t.type === "UNG" && t.status === "CHO_PHIEU_YCSC" && (
                <button
                  type="button"
                  className="pdf repair-request-skip"
                  disabled={act.isPending}
                  onClick={async () => {
                    try {
                      await act.mutateAsync({ action: "skipRepairRequest" });
                      toast.success("Đã xác nhận tự thực hiện, chuyển sang bước sử dụng vật tư");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Không thể chuyển bước");
                    }
                  }}
                >
                  <ChevronRight size={14} /> Không cần SYC
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {open && seed.data?.eligible && canLinkDefect && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,.45)" }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute", top: 0, right: 0, bottom: 0, width: "100%", maxWidth: 720,
              background: "#fff", boxShadow: "-8px 0 32px rgba(15,23,42,.18)", display: "flex",
              flexDirection: "column", overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 16, borderBottom: "1px solid #e2e8f0" }}>
              <div>
                <b style={{ fontSize: 16 }}>Ra số yêu cầu sửa chữa</b>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
                  Nội dung và thiết bị đã điền sẵn từ phiếu vật tư — kiểm tra lại rồi lưu.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Đóng"
                style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              {seed.isLoading && <p style={{ padding: 16, fontSize: 13, color: "#64748b" }}>Đang tải dữ liệu phiếu…</p>}
              {seed.data && !seed.data.materialRequest && (
                <p style={{ padding: 16, fontSize: 13, color: "#b45309" }}>
                  {seed.data.reason ?? "Phiếu chưa gắn điểm thay thế nào nên không ra được SYC thay thế."}
                </p>
              )}
              {seed.data?.eligible && seed.data.materialRequest && seed.data.device && (
                <DefectForm
                  lockDevice
                  initialDevice={seed.data.device}
                  initialMaterialRequest={seed.data.materialRequest}
                  onDone={async (created?: DefectItem) => {
                    setOpen(false);
                    if (created?.id) {
                      try {
                        await act.mutateAsync({ action: "linkDefect", defectId: created.id });
                      } catch (error) {
                        // SYC đã ra thành công rồi; chỉ mối liên hệ chưa ghi được.
                        toast.error(`Đã ra SYC nhưng chưa gắn được vào phiếu: ${(error as Error).message}`);
                      }
                    }
                  }}
                  onCancel={() => setOpen(false)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChemicalTruckSection({ t, viewer }: { t: MaterialTicket; viewer: TicketViewer | null }) {
  const act = useTicketAction(t.id);
  const qc = useQueryClient();
  const isChemicalTicket = t.type === CHEMICAL_TICKET_TYPE || t.type === SINGLE_STEP_TICKET_TYPE;
  const alreadyLinked = (t.chemicalReceiptIds?.length ?? 0) > 0;

  // Hóa chất khác NH3 chỉ nhập chuyến xe tại bước VHV xác nhận khối lượng lãnh trong
  // ActionArea. Khối độc lập này chỉ dành cho NH3, hoặc để xem lại các chuyến đã chốt
  // của phiếu hóa chất thường sau khi phiếu hoàn tất.
  const atReceiveStep = t.type === CHEMICAL_TICKET_TYPE && t.status === "NHAN_VAT_TU";
  const isSingleStepTicket = t.type === SINGLE_STEP_TICKET_TYPE
    && (t.status === "NHAN_VAT_TU" || alreadyLinked);
  const isCompletedChemicalTicket = t.type === CHEMICAL_TICKET_TYPE
    && t.status === "HOAN_TAT"
    && alreadyLinked;
  const applies = isChemicalTicket && !atReceiveStep && (isSingleStepTicket || isCompletedChemicalTicket);

  // Trạng thái khóa và quyền mở khóa do máy chủ quyết; ẩn nút mà để ngỏ API thì
  // chưa gọi là khóa, nên hai bên phải dùng chung một nguồn.
  const saved = useTicketChemicalTrucks(t.id, applies);

  if (!applies) return null;

  // Phiếu NH3 chưa hoàn tất: ghi chuyến xe xong là hoàn tất phiếu.
  const completesTicket = t.type === SINGLE_STEP_TICKET_TYPE && t.status !== "HOAN_TAT";

  const assigned = !!viewer && (viewer.isAdmin || samePosition(viewer.position, t.assignedPosition));
  const unit = t.items[0]?.material.unit ?? "";
  const trucks = saved.data?.trucks ?? [];
  const locked = saved.data?.locked ?? alreadyLinked;
  const canEdit = assigned && (saved.data?.canEdit ?? !alreadyLinked);

  return (
    <div className="act" style={{ marginTop: 10 }}>
      <label className="lb">
        {completesTicket ? "VHV xác nhận khối lượng lãnh" : "Chuyến xe hóa chất đã nhập"}
        {alreadyLinked && (
          <span style={{ marginLeft: 8, fontWeight: 500, color: "#0f766e" }}>
            · đã ghi {t.chemicalReceiptIds.length} chuyến vào sổ
          </span>
        )}
      </label>

      {saved.isLoading ? (
        <p className="note">Đang tải chuyến xe đã ghi…</p>
      ) : locked && trucks.length > 0 ? (
        <ChemicalTruckLockedTable trucks={trucks} unit={unit} />
      ) : (
        <ChemicalTruckPanel
          initialRows={[emptyTruck(t.receivedAt ? String(t.receivedAt).slice(0, 10) : "")]}
          unit={unit}
          canEdit={canEdit}
          pending={act.isPending}
          submitLabel={completesTicket ? "Xác nhận, chốt chuyến xe và hoàn tất" : "Chốt chuyến xe vào sổ hóa chất"}
          onSubmit={async (rows) => {
            try {
              await act.mutateAsync({ action: "chemicalTrucks", trucks: trucksToPayload(rows) });
              await qc.invalidateQueries({ queryKey: ["ticket-chemical-trucks", t.id] });
              toast.success(
                completesTicket
                  ? `Đã chốt ${rows.length} chuyến xe, hoàn tất và khóa phiếu`
                  : `Đã chốt ${rows.length} chuyến xe vào sổ Tồn kho hóa chất`
              );
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Ghi chuyến xe thất bại");
            }
          }}
        />
      )}

      {!assigned && (
        <p className="note">
          <AlertTriangle size={13} /> Chỉ VHV được giao phiếu ({t.assignedPosition}) mới ghi được chuyến xe.
        </p>
      )}
    </div>
  );
}

function ActionArea({ t, viewer }: { t: MaterialTicket; viewer: TicketViewer | null }) {
  const acts = actionsFor(t, viewer);
  const act = useTicketAction(t.id);
  const needItems = acts.includes("confirm") || acts.includes("receive") || acts.includes("propose") || acts.includes("stats") || acts.includes("accept") || acts.includes("statsExportDocuments") || acts.includes("otherApprove") || acts.includes("otherAdvanceReceive") || acts.includes("otherAdvanceApprove");
  const { data: opts } = useTicketOptions(needItems);
  const [items, setItems] = useState([{ materialId: "", erpCode: "", deviceSeq: "", quantity: 1 }]);
  const [note, setNote] = useState("");
  const [pctNoiDung, setPctNoiDung] = useState(t.pctContent ?? "");
  // Tách riêng từng loại số chứng từ. Trước đây dùng chung một state `num`, nên
  // số ĐXVT vừa nhập có thể bị giữ lại và tự xuất hiện trong ô số biên bản kiểm tra ở bước sau.
  const [proposalNumberInput, setProposalNumberInput] = useState("");
  const [bbktNumberInput, setBbktNumberInput] = useState(t.bbktNumber ?? "");
  const [confirmReasonInput, setConfirmReasonInput] = useState(t.proposalNote ?? ""); // Lý do — bước Xác nhận yêu cầu (lưu vào proposalNote)
  const [materialUserNameInput, setMaterialUserNameInput] = useState(t.materialUserName ?? "");
  // Đủ 2/3 ảnh mới cho qua bước sử dụng vật tư. Máy chủ cũng chặn — đây chỉ để người
  // dùng biết trước lý do nút mờ, thay vì bấm rồi nhận thông báo lỗi.
  const usagePhotos = useTicketUsagePhotos(t.id, acts.includes("use"));
  const usagePhotoCount = (usagePhotos.data ?? []).filter((photo) => photo.url).length;
  const [pct, setPct] = useState("");
  const [chiHuy, setChiHuy] = useState("");
  const [proposalReceiverName, setProposalReceiverName] = useState(t.proposalReceiverName ?? "");
  const [reason, setReason] = useState("");
  const [lotAllocation, setLotAllocation] = useState<Record<string, number> | null>(null);
  // Luồng hóa chất: lịch giao + khối lượng giao (bước 2), khối lượng/ngày/người lãnh (bước 3).
  const [deliveryDate, setDeliveryDate] = useState(t.deliveryScheduledAt ? String(t.deliveryScheduledAt).slice(0, 10) : "");
  const [deliveryQty, setDeliveryQty] = useState(String(t.deliveryQuantity ?? t.items[0]?.quantity ?? ""));
  const [receivedQty, setReceivedQty] = useState(String(t.deliveryQuantity ?? t.items[0]?.quantity ?? ""));
  const [receivedDate, setReceivedDate] = useState("");
  // Bảng chuyến xe của luồng hóa chất. Mặc định một dòng trống, ngày gợi ý theo lịch giao.
  const [truckRows, setTruckRows] = useState<TruckRow[]>(() => [
    emptyTruck(t.deliveryScheduledAt ? String(t.deliveryScheduledAt).slice(0, 10) : ""),
  ]);
  const truckError = truckRows.map(truckRowError).find(Boolean) ?? null;
  const [receiverName, setReceiverName] = useState(viewer?.name ?? "");
  const [otherErpCodes, setOtherErpCodes] = useState<Record<string, string>>(() => Object.fromEntries(t.items.map((item) => [item.id, item.erpCode ?? ""])));
  const [otherReceived, setOtherReceived] = useState<Record<string, number>>(() => Object.fromEntries(t.items.map((item) => [item.id, item.receivedQuantity ?? item.quantity])));
  const [otherDeliveryNote, setOtherDeliveryNote] = useState(t.deliveryNoteNumber ?? "");
  const [otherReceivedDate, setOtherReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [qty, setQty] = useState(() => Math.max(1, t.receivedQuantity ?? t.vhvReceivedQuantity ?? t.items[0]?.quantity ?? 1)); // số lượng xác nhận / lãnh / sử dụng
  const [method, setMethod] = useState(""); // hình thức lãnh
  // Ảnh phiếu xuất kho liên 3 — giữ trong state rồi gửi kèm chính lần xác nhận, vì lô vật tư
  // (chủ sở hữu của ảnh) chỉ ra đời khi bấm xác nhận. Xem lib/material-delivery-photo.ts.
  const [deliveryPhoto, setDeliveryPhoto] = useState<string | null>(null);
  const [receiptSource, setReceiptSource] = useState<"ERP" | "EXISTING">(normalizeReceiptSource(t.receiptSource));
  const [workflowType, setWorkflowType] = useState<"DE_XUAT" | "UNG" | "SU_DUNG_HIEN_CO">("DE_XUAT");
  const [erpCode, setErpCode] = useState(t.items[0]?.erpCode ?? "");
  const [sccnRepresentative, setSccnRepresentative] = useState(t.sccnRepresentativeName ?? "");
  const [sccnPosition, setSccnPosition] = useState(t.sccnRepresentativePosition ?? "");
  const [bbntDoNumberInput, setBbntDoNumberInput] = useState(t.bbntDoNumber ?? "");
  const [settlementConfirmed, setSettlementConfirmed] = useState(false);
  const [recoveryQuantityInput, setRecoveryQuantityInput] = useState(() =>
    String(t.recoveryQuantity ?? (isGasCylinderTicket(t.materialCategory) ? (t.receivedQuantity ?? t.vhvReceivedQuantity ?? 1) : 1)));
  const [recoveryReturned, setRecoveryReturned] = useState(!!t.recoveryReturnedAt);
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const confirmationMaterialOption = opts?.materials.find((material) => material.id === t.items[0]?.materialId);
  const confirmationErpInfoRows = confirmationMaterialOption?.erpCodes?.length
    ? confirmationMaterialOption.erpCodes
    : (t.items[0]?.material.erpCodes?.length ? t.items[0].material.erpCodes : [t.items[0]?.material.code].filter(Boolean) as string[])
        .map((code) => ({ code, name: t.items[0]?.material.name ?? "—", erpStock: 0 }));
  const isChemicalTicket = isChemicalFlowTicket(t.materialCategory);
  const isGasTicket = isGasCylinderTicket(t.materialCategory);
  // Hóa chất: một luồng duy nhất. Chai khí: chọn Đề xuất hoặc Ứng, nhưng không có Hiện có.
  const singleFlowTicket = isChemicalTicket && !isGasTicket;
  const proposalFlowAvailable = isChemicalTicket
    ? true
    : opts ? confirmationErpInfoRows.some((row) => row.erpStock > 0) : null;
  const [replacementRows, setReplacementRows] = useState<Array<{ key: string; itemId: string; deviceSeq: string; quantity: number }>>(() =>
    t.items.map((item, index) => ({
      key: `${item.id}-${index}`,
      itemId: item.id,
      deviceSeq: item.deviceSeq ?? "",
      quantity: Math.max(1, item.replacementQuantity ?? 1),
    }))
  );
  const replacementSourceKey = t.items.map((item) => item.id).join("|");

  React.useEffect(() => {
    setProposalNumberInput("");
    setBbktNumberInput("");
  }, [t.id, t.status]);

  React.useEffect(() => {
    setBbntDoNumberInput(t.bbntDoNumber ?? "");
    setSettlementConfirmed(false);
  }, [t.id, t.bbntDoNumber]);

  React.useEffect(() => {
    if (
      t.type === "CHUA_CHON"
      && t.status === "CHO_XAC_NHAN"
      && proposalFlowAvailable === false
      && workflowType === "DE_XUAT"
    ) {
      setWorkflowType("UNG");
    }
  }, [proposalFlowAvailable, t.status, t.type, workflowType]);

  React.useEffect(() => {
    if (t.status !== "CHO_NHAP_LIEU_THAY_THE") return;
    setReplacementRows(t.items.map((item, index) => ({
      key: `${item.id}-${index}`,
      itemId: item.id,
      deviceSeq: item.deviceSeq ?? "",
      quantity: Math.max(1, item.replacementQuantity ?? 1),
    })));
  }, [t.status, replacementSourceKey]);

  React.useEffect(() => {
    if (!needItems) return;
    try {
      const raw = sessionStorage.getItem(`material-ticket-draft:${t.id}`);
      if (!raw) {
        const firstItem = t.items[0];
        if (firstItem?.materialId) {
          setItems([{
            materialId: firstItem.materialId,
            erpCode: firstItem.erpCode ?? "",
            deviceSeq: firstItem.deviceSeq ?? "",
            quantity: Math.max(1, Number(firstItem.quantity) || 1),
          }]);
        }
        return;
      }
      const draft = JSON.parse(raw) as { materialId?: string; erpCode?: string; quantity?: number };
      setItems([{
        materialId: draft.materialId ?? "",
        erpCode: draft.erpCode ?? "",
        deviceSeq: "",
        quantity: Math.max(1, Number(draft.quantity) || 1),
      }]);
      sessionStorage.removeItem(`material-ticket-draft:${t.id}`);
    } catch {
      // Bỏ qua nháp tạm nếu dữ liệu sessionStorage không hợp lệ.
    }
  }, [needItems, t.id, t.items]);

  if (["HOAN_TAT", "TU_CHOI"].includes(t.status)) return null;

  if (acts.length === 0) {
    const waitMap: Record<string, string> = {
      CHO_DE_XUAT: `Cương vị "${t.assignedPosition}"`,
      CHO_XAC_NHAN: "Trưởng Ca / Trưởng Kíp",
      CHO_PHIEU__XUAT_KHO: "Người được phân quyền Thống Kê xác nhận ĐXVT",
      VAT_TU_KHONG_CO: "Người tạo phiếu / Trưởng Ca / Quản trị từ chối",
      CHO_THONG_KE: "Người được phân quyền Thống Kê xác nhận ĐXVT",
      CHO_XAC_NHAN_PHAT: "Người được phân quyền Xác nhận VHV nhận / trả phiếu ĐXVT",
      VHV_LANH_VAT_TU: `Cương vị VHV được giao "${t.assignedPosition}"`,
      NHAN_TU_HIEN_CO: `Cương vị được giao "${t.assignedPosition}" nhận vật tư từ Hiện có`,
      NHAN_VAT_TU: "Người được phân quyền Xác nhận vật tư lãnh",
      CHO_PHIEU_YCSC: "Người được phân quyền ra SYC sửa chữa từ phiếu vật tư",
      SU_DUNG_VAT_TU: "Người được phân quyền Xác nhận vật tư sử dụng",
      CHO_NGHIEM_THU: "Người được phân quyền Nghiệm thu",
      CHO_TRA_VO: "Người được phân quyền Xác nhận trả (chai khí)",
      CHO_NHAP_LIEU: `Người được phân quyền trong cương vị "${t.assignedPosition}"`,
      CHO_NHAP_LIEU_THAY_THE: `Người được phân quyền trong cương vị "${t.assignedPosition}"`,
      CHO_XAC_NHAN_PDF: "Người được phân quyền xác nhận luồng Ứng",
    };
    const waiting = t.status === "CHO_HOAN_THIEN"
      ? [!t.bbktNumber && "Người được phân quyền bổ sung số biên bản kiểm tra", !t.proposalNumber && "Người được phân quyền nhập số phiếu ĐXVT"].filter(Boolean).join(" + ")
      : waitMap[t.status];
    return <div className="wait"><Clock size={14} /> Đang chờ: <b>{waiting}</b> — bạn không có thao tác ở bước này.</div>;
  }

  async function run(body: Record<string, unknown>, okMsg: string) {
    try {
      await act.mutateAsync(body);
      toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Thao tác thất bại");
    }
  }

  const edit = (i: number, k: string, v: unknown) =>
    setItems((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const itemsValid = items.every((i) => i.materialId && i.erpCode && i.deviceSeq && i.quantity >= 1);
  const advanceItemsValid = items.every((i) => i.materialId && i.erpCode && i.quantity >= 1);

  // Lọc vật tư theo LOẠI của phiếu: loại phiếu (Dầu bôi trơn/Lọc dầu/Hóa chất/Bi nghiền)
  // ánh xạ sang loại trong Danh mục vật tư (Material.category) rồi chỉ hiện đúng loại đó.
  const wantCategory = t.materialCategory ? TICKET_TO_MATERIAL_CATEGORY[t.materialCategory] ?? null : null;
  const materialOptions = (opts?.materials ?? []).filter(
    (m) =>
      (!wantCategory || m.category === wantCategory) &&
      m.machine === t.unit &&
      m.managingPositions.some((position) => positionsMatch(position, t.assignedPosition))
  );
  const replacementStockErrors = t.items.flatMap((item) => {
    const used = replacementRows.filter((row) => row.itemId === item.id).reduce((sum, row) => sum + row.quantity, 0);
    return used > item.material.quantity ? [{ material: item.material, requested: used }] : [];
  });

  if (acts.includes("reject")) return (
    <div className="act">
      <label className="lb">Vật tư không có/không đủ</label>
      <div className="warnbox"><AlertTriangle size={15} /> Số lượng hiện có không đủ cho số lượng đề xuất. Phiếu này chỉ có thể từ chối.</div>
      <input placeholder="Lý do từ chối" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn danger big" disabled={!reason.trim() || act.isPending}
        onClick={() => run({ action: "reject", reason }, "Đã từ chối phiếu")}>
        <Ban size={15} /> Từ chối phiếu
      </button>
    </div>
  );

  const ItemsForm = (
    <div className="frm-items">
      {items.map((it, i) => {
        const rowMat = materialOptions.find((m) => m.id === it.materialId);
        const erpOptions = rowMat?.erpCodes?.length ? rowMat.erpCodes : rowMat ? [{ code: rowMat.code, erpStock: 0 }] : [];
        const deviceOptions = (rowMat?.devices ?? []).filter(
          (device) => positionsMatch(device.managingPosition, t.assignedPosition)
        );
        return (
        <div key={i} className="frm-item">
          <select value={it.materialId}
            onChange={(e) => {
              const materialId = e.target.value;
              const material = materialOptions.find((m) => m.id === materialId);
              const firstCode = material?.erpCodes?.[0]?.code ?? material?.code ?? "";
              setItems((a) => a.map((x, j) => (j === i ? { ...x, materialId, erpCode: firstCode, deviceSeq: "" } : x)));
            }}>
            <option value="">{wantCategory ? `— Vật tư (${wantCategory}) —` : "— Vật tư —"}</option>
            {materialOptions.map((m) => (
              <option key={m.id} value={m.id}>{m.name} (tồn: {m.quantity} {m.unit})</option>
            ))}
          </select>
          <select value={it.erpCode} disabled={!it.materialId}
            onChange={(e) => edit(i, "erpCode", e.target.value)}>
            <option value="">{it.materialId ? "— Mã vật tư —" : "— Chọn vật tư trước —"}</option>
            {erpOptions.map((code) => (
              <option key={code.code} value={code.code}>{code.code} · ERP: {code.erpStock}</option>
            ))}
          </select>
          <select value={it.deviceSeq} disabled={!it.materialId}
            onChange={(e) => edit(i, "deviceSeq", e.target.value)}>
            <option value="">{it.materialId ? "— Thiết bị —" : "— Chọn vật tư trước —"}</option>
            {deviceOptions.map((d) => (
              <option key={`${d.seq}:${d.managingPosition}`} value={d.seq}>{d.label}</option>
            ))}
          </select>
          <input type="number" min={1} value={it.quantity}
            onChange={(e) => edit(i, "quantity", Math.max(1, +e.target.value || 1))} />
          {items.length > 1 && <button className="mini" onClick={() => setItems((a) => a.filter((_, j) => j !== i))}><X size={13} /></button>}
        </div>
      );
      })}
      <button className="btn tiny" onClick={() => setItems((a) => [...a, { materialId: "", erpCode: "", deviceSeq: "", quantity: 1 }])}>
        <Plus size={13} /> Thêm vật tư
      </button>
    </div>
  );

  const AdvanceItemsForm = (
    <div className="frm-items">
      {items.map((it, i) => {
        const rowMat = materialOptions.find((m) => m.id === it.materialId);
        const erpOptions = rowMat?.erpCodes?.length ? rowMat.erpCodes : rowMat ? [{ code: rowMat.code, erpStock: 0 }] : [];
        return (
          <div key={i} className="advance-item-row">
            <select value={it.materialId}
              onChange={(e) => {
                const materialId = e.target.value;
                const material = materialOptions.find((m) => m.id === materialId);
                const firstCode = material?.erpCodes?.[0]?.code ?? material?.code ?? "";
                setItems((current) => current.map((item, index) => index === i
                  ? { ...item, materialId, erpCode: firstCode, deviceSeq: "" }
                  : item));
              }}>
              <option value="">{wantCategory ? `— Vật tư (${wantCategory}) —` : "— Vật tư —"}</option>
              {materialOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.name} (tồn: {m.quantity} {m.unit})</option>
              ))}
            </select>
            <select value={it.erpCode} disabled={!it.materialId}
              onChange={(e) => edit(i, "erpCode", e.target.value)}>
              <option value="">{it.materialId ? "— Mã vật tư —" : "— Chọn vật tư trước —"}</option>
              {erpOptions.map((code) => (
                <option key={code.code} value={code.code}>{code.code} · ERP: {code.erpStock}</option>
              ))}
            </select>
            <label className="inline-qty-label">
              Số lượng ứng
              <input type="number" min={1} value={it.quantity}
                onChange={(e) => edit(i, "quantity", Math.max(1, Math.trunc(Number(e.target.value)) || 1))} />
            </label>
            {items.length > 1 && <button className="mini" onClick={() => setItems((current) => current.filter((_, index) => index !== i))}><X size={13} /></button>}
          </div>
        );
      })}
      <button className="btn tiny" onClick={() => setItems((current) => [...current, { materialId: "", erpCode: "", deviceSeq: "", quantity: 1 }])}>
        <Plus size={13} /> Thêm vật tư
      </button>
    </div>
  );

  if (acts.includes("propose")) return (
    <div className="act">
      <label className="lb">Bước 1 — Đề xuất vật tư thay thế</label>
      {ItemsForm}
      <button className="btn primary big" disabled={!itemsValid || act.isPending}
        onClick={() => run({ action: "propose", items }, "Đã gửi đề xuất")}>
        <ChevronRight size={15} /> Gửi đề xuất
      </button>
    </div>
  );

  if (t.type === OTHER_MATERIAL_ADVANCE_TICKET_TYPE && acts.includes("otherAdvanceReceive")) {
    const rows = t.items.map((item) => {
      const material = opts?.materials.find((row) => row.id === item.materialId);
      const options = material?.erpCodes ?? [];
      const effectiveCode = otherErpCodes[item.id] || item.erpCode || (options.length === 1 ? options[0].code : "");
      return { item, options, effectiveCode, selected: options.find((option) => option.code === effectiveCode) };
    });
    const valid = otherReceivedDate
      && rows.every(({ item }) => (otherReceived[item.id] ?? 0) > 0)
      && (receiptSource === "EXISTING" || rows.every(({ selected, item }) => selected && selected.erpStock >= (otherReceived[item.id] ?? 0)));
    return <div className="act">
      <label className="lb">Lãnh ứng Vật tư khác</label>
      <div className="note ung"><Zap size={14} /><span>Số lượng thực lãnh được cộng vào <b>Hiện có ngay</b>. Thống kê sẽ bổ sung số ĐXVT sau và không cộng tồn lần nữa.</span></div>
      <div className="seg3 flow-toggle" aria-label="Nguồn lãnh vật tư ứng">
        <button type="button" className={receiptSource === "ERP" ? "on" : ""} onClick={() => setReceiptSource("ERP")}>Lãnh kho DH1</button>
        <button type="button" className={receiptSource === "EXISTING" ? "on" : ""} onClick={() => setReceiptSource("EXISTING")}>Nguồn ngoài</button>
      </div>
      <div className="frm-items">
        {rows.map(({ item, options, effectiveCode, selected }) => <div className="other-approve-row" key={item.id}>
          <span><b>{item.material.name}</b><small>Đề nghị ứng {item.quantity} {item.material.unit}</small></span>
          <select value={effectiveCode} disabled={options.length === 1} onChange={(event) => setOtherErpCodes((current) => ({ ...current, [item.id]: event.target.value }))}>
            <option value="">{receiptSource === "ERP" ? "— Chọn mã ERP —" : "— Chưa xác định mã —"}</option>
            {options.map((option) => <option key={option.code} value={option.code}>{option.code} · ERP: {option.erpStock.toLocaleString("vi-VN")}</option>)}
          </select>
          <label>Thực lãnh ({item.material.unit})<input type="number" min={1} value={otherReceived[item.id] ?? item.quantity} onChange={(event) => setOtherReceived((current) => ({ ...current, [item.id]: Math.max(1, Math.trunc(Number(event.target.value)) || 1) }))} /></label>
          {receiptSource === "ERP" && selected && selected.erpStock < (otherReceived[item.id] ?? item.quantity) && <small className="text-red-600">Không đủ tồn ERP</small>}
          {options.length === 1 && <small className="text-emerald-700">Đã tự chọn mã duy nhất</small>}
        </div>)}
      </div>
      <div className="chem-grid">
        <div><label className="lb">Số phiếu giao hàng (nếu đã có)</label><input value={otherDeliveryNote} onChange={(event) => setOtherDeliveryNote(event.target.value)} /></div>
        <div><label className="lb">Ngày lãnh *</label><input type="date" value={otherReceivedDate} onChange={(event) => setOtherReceivedDate(event.target.value)} /></div>
      </div>
      <button className="btn primary big" disabled={!valid || act.isPending} onClick={() => run({
        action: "otherAdvanceReceive",
        receiptSource,
        deliveryNoteNumber: otherDeliveryNote.trim() || undefined,
        receivedAt: otherReceivedDate,
        items: rows.map(({ item, effectiveCode }) => ({ itemId: item.id, erpCode: effectiveCode || undefined, receivedQuantity: otherReceived[item.id] ?? item.quantity })),
      }, "Đã lãnh ứng, cộng vào Hiện có và chuyển Thống kê hoàn thiện ĐXVT") }>
        {act.isPending ? <Loader2 className="spin" size={15} /> : <Zap size={15} />} Xác nhận lãnh ứng
      </button>
    </div>;
  }

  if (t.type === OTHER_MATERIAL_ADVANCE_TICKET_TYPE && acts.includes("otherAdvanceApprove")) {
    const sourceIsErp = normalizeReceiptSource(t.receiptSource) === "ERP";
    const rows = t.items.map((item) => {
      const material = opts?.materials.find((row) => row.id === item.materialId);
      const options = material?.erpCodes ?? [];
      const effectiveCode = otherErpCodes[item.id] || item.erpCode || (options.length === 1 ? options[0].code : "");
      return { item, options, effectiveCode, selected: options.find((option) => option.code === effectiveCode) };
    });
    const valid = proposalNumberInput.trim() && otherDeliveryNote.trim() && rows.every(({ selected }) => Boolean(selected));
    return <div className="act">
      <label className="lb">Hoàn thiện ĐXVT cho vật tư đã ứng</label>
      <div className="note"><FileText size={14} /><span>Vật tư đã được cộng vào <b>Hiện có</b> tại bước lãnh ứng. Bước này chỉ hoàn thiện hồ sơ và kết thúc phiếu.</span></div>
      <div className="frm-items">
        {rows.map(({ item, options, effectiveCode }) => <div className="other-approve-row" key={item.id}>
          <span><b>{item.material.name}</b><small>Đã lãnh {item.receivedQuantity ?? item.quantity} {item.material.unit}</small></span>
          <select value={effectiveCode} disabled={options.length === 1 || (sourceIsErp && Boolean(item.erpCode))} onChange={(event) => setOtherErpCodes((current) => ({ ...current, [item.id]: event.target.value }))}>
            <option value="">— Chọn mã ERP —</option>
            {options.map((option) => <option key={option.code} value={option.code}>{option.code} · ERP hiện tại: {option.erpStock.toLocaleString("vi-VN")}</option>)}
          </select>
          {sourceIsErp && item.erpCode && <small className="text-emerald-700">Mã đã trừ khi lãnh ứng</small>}
          {!item.erpCode && options.length === 1 && <small className="text-emerald-700">Đã tự chọn mã duy nhất</small>}
        </div>)}
      </div>
      <div className="chem-grid">
        <div><label className="lb">Số phiếu ĐXVT *</label><input value={proposalNumberInput} onChange={(event) => setProposalNumberInput(event.target.value)} /></div>
        <div><label className="lb">Số phiếu giao hàng *</label><input value={otherDeliveryNote} onChange={(event) => setOtherDeliveryNote(event.target.value)} /></div>
      </div>
      <button className="btn primary big" disabled={!valid || act.isPending} onClick={() => run({
        action: "otherAdvanceApprove",
        proposalNumber: proposalNumberInput.trim(),
        deliveryNoteNumber: otherDeliveryNote.trim(),
        items: rows.map(({ item, effectiveCode }) => ({ itemId: item.id, erpCode: effectiveCode })),
      }, "Đã hoàn thiện ĐXVT và kết thúc phiếu ứng") }>
        {act.isPending ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Hoàn thiện và kết thúc phiếu
      </button>
    </div>;
  }

  if (t.type === OTHER_MATERIAL_TICKET_TYPE && acts.includes("otherApprove")) {
    const rows = t.items.map((item) => {
      const material = opts?.materials.find((row) => row.id === item.materialId);
      const options = material?.erpCodes ?? [];
      const effectiveCode = otherErpCodes[item.id] || (options.length === 1 ? options[0].code : "");
      return { item, options, effectiveCode, selected: options.find((option) => option.code === effectiveCode) };
    });
    const valid = proposalNumberInput.trim() && rows.every(({ item, selected }) => selected && selected.erpStock >= item.quantity);
    return <div className="act">
      <label className="lb">Xác nhận đề xuất Vật tư khác</label>
      <div className="note"><Package size={14} /><span>Đối chiếu mã ERP cho từng vật tư. Phiếu sau khi xác nhận sẽ chuyển thẳng sang bước đi lãnh.</span></div>
      <div className="frm-items">
        {rows.map(({ item, options, effectiveCode, selected }) => <div className="other-approve-row" key={item.id}>
          <span><b>{item.material.name}</b><small>{item.quantity} {item.material.unit}</small></span>
          <select value={effectiveCode} disabled={options.length === 1} onChange={(event) => setOtherErpCodes((current) => ({ ...current, [item.id]: event.target.value }))}>
            <option value="">— Chọn mã ERP —</option>
            {options.map((option) => <option key={option.code} value={option.code}>{option.code} · ERP: {option.erpStock.toLocaleString("vi-VN")}</option>)}
          </select>
          {options.length === 1 && <small className="text-emerald-700">Đã tự chọn mã duy nhất</small>}
          {selected && selected.erpStock < item.quantity && <small className="text-red-600">Không đủ tồn ERP</small>}
        </div>)}
      </div>
      <label className="field">Số phiếu ĐXVT *<input value={proposalNumberInput} onChange={(event) => setProposalNumberInput(event.target.value)} placeholder="Nhập số phiếu đề xuất vật tư" /></label>
      <button className="btn primary big" disabled={!valid || act.isPending} onClick={() => run({ action: "otherApprove", proposalNumber: proposalNumberInput.trim(), items: rows.map(({ item, effectiveCode }) => ({ itemId: item.id, erpCode: effectiveCode })) }, "Đã xác nhận đề xuất, chuyển bước đi lãnh") }>
        {act.isPending ? <Loader2 className="spin" size={15} /> : <FileText size={15} />} Xác nhận và xuất Phiếu ĐXVT
      </button>
    </div>;
  }

  if (t.type === OTHER_MATERIAL_TICKET_TYPE && acts.includes("otherReceive")) {
    const valid = otherDeliveryNote.trim() && otherReceivedDate && t.items.every((item) => (otherReceived[item.id] ?? 0) > 0);
    return <div className="act">
      <label className="lb">Xác nhận đã lãnh Vật tư khác</label>
      <div className="note"><Check size={14} /><span>Số lượng thực lãnh sẽ được cộng vào <b>Hiện có</b> của từng vật tư; phiếu hoàn tất ngay sau bước này.</span></div>
      <div className="frm-items">
        {t.items.map((item) => <div className="other-receive-row" key={item.id}>
          <span><b>{item.erpName || item.material.name}</b><small>{item.erpCode} · đề xuất {item.quantity} {item.material.unit}</small></span>
          <label>Thực lãnh ({item.material.unit})<input type="number" min={1} value={otherReceived[item.id] ?? item.quantity} onChange={(event) => setOtherReceived((current) => ({ ...current, [item.id]: Math.max(1, Math.trunc(Number(event.target.value)) || 1) }))} /></label>
        </div>)}
      </div>
      <div className="chem-grid">
        <div><label className="lb">Số phiếu giao hàng *</label><input value={otherDeliveryNote} onChange={(event) => setOtherDeliveryNote(event.target.value)} /></div>
        <div><label className="lb">Ngày lãnh *</label><input type="date" value={otherReceivedDate} onChange={(event) => setOtherReceivedDate(event.target.value)} /></div>
      </div>
      <button className="btn primary big" disabled={!valid || act.isPending} onClick={() => run({ action: "otherReceive", deliveryNoteNumber: otherDeliveryNote.trim(), receivedAt: otherReceivedDate, items: t.items.map((item) => ({ itemId: item.id, receivedQuantity: otherReceived[item.id] })) }, "Đã lãnh vật tư, cộng vào Hiện có và hoàn tất phiếu") }>
        {act.isPending ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Xác nhận lãnh và hoàn tất
      </button>
    </div>;
  }

  // ---- Luồng hóa chất: ba bước riêng, không dính mã ERP / Phiếu ĐXVT / biên bản nào.
  if (t.type === CHEMICAL_TICKET_TYPE && acts.includes("confirm")) {
    return (
      <div className="act">
        <label className="lb">Xác nhận bồn / thiết bị đủ điều kiện</label>
        <div className="note"><Check size={14} /><span>Xác nhận bồn chứa và thiết bị liên quan đủ điều kiện để nhận hóa chất (mức chứa, van, đường ống, an toàn). Xác nhận xong mới chốt được lịch giao hàng.</span></div>
        <button className="btn primary big" disabled={act.isPending}
          onClick={() => run({ action: "confirm" }, "Đã xác nhận bồn/thiết bị, chuyển bước xác nhận đề xuất")}>
          <Check size={15} /> Bồn / thiết bị đủ điều kiện
        </button>
      </div>
    );
  }

  if (t.type === CHEMICAL_TICKET_TYPE && acts.includes("stats")) {
    const unit = t.items[0]?.material.unit ?? "";
    return (
      <div className="act">
        <label className="lb">Xác nhận đề xuất vật tư</label>
        <div className="note"><Check size={14} /><span>Chốt lịch giao hàng và khối lượng giao. Thống kê hoặc Kỹ thuật viên đều xác nhận được.</span></div>
        <div className="chem-grid">
          <div>
            <label className="lb">Lịch giao hàng *</label>
            <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </div>
          <div>
            <label className="lb">Khối lượng giao *{unit ? ` (${unit})` : ""}</label>
            <input type="number" min={1} value={deliveryQty} onChange={(e) => setDeliveryQty(e.target.value)} />
          </div>
        </div>
        <button className="btn primary big" disabled={act.isPending || !deliveryDate || Number(deliveryQty) <= 0}
          onClick={() => run({ action: "stats", deliveryScheduledAt: deliveryDate, deliveryQuantity: Number(deliveryQty) }, "Đã xác nhận đề xuất, chuyển VHV xác nhận lãnh")}>
          <Check size={15} /> Xác nhận đề xuất
        </button>
      </div>
    );
  }

  if (t.type === CHEMICAL_TICKET_TYPE && acts.includes("receive")) {
    const unit = t.items[0]?.material.unit ?? "";
    return (
      <div className="act">
        <label className="lb">VHV xác nhận khối lượng lãnh</label>
        {t.deliveryScheduledAt && (
          <div className="note"><Check size={14} /><span>Theo lịch: giao <b>{t.deliveryQuantity?.toLocaleString("vi-VN")} {unit}</b> ngày <b>{fmtDay(t.deliveryScheduledAt)}</b>.</span></div>
        )}
        {/*
          Hóa chất về theo ĐỢT NHIỀU XE nên bước này là một BẢNG, không phải ba ô đơn.
          Khối lượng lãnh của phiếu = tổng các chuyến; ngày lãnh lấy ngày muộn nhất.
          Từng chuyến chạy thẳng sang sổ Tồn kho hóa chất, qua cơ chế chống trùng hai cửa.
        */}
        <ChemicalTruckRows rows={truckRows} onChange={setTruckRows} unit={unit} disabled={act.isPending} />
        {truckError && (
          <p className="note" style={{ background: C.badBg, color: C.bad }}>
            <AlertTriangle size={13} /> {truckError}
          </p>
        )}
        <div className="chem-grid">
          <div>
            <label className="lb">VHV lãnh *</label>
            <input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="Họ tên người lãnh" />
          </div>
        </div>
        <button className="btn primary big"
          disabled={act.isPending || Boolean(truckError) || !receiverName.trim()}
          onClick={() => run(
            { action: "receive", receivedByName: receiverName.trim(), trucks: trucksToPayload(truckRows) },
            "Đã xác nhận lãnh, phiếu hoàn tất và chuyến xe đã vào sổ hóa chất"
          )}>
          <Check size={15} /> Xác nhận lãnh và hoàn tất
        </button>
      </div>
    );
  }

  if (acts.includes("confirm")) {
    if (t.type === "CHUA_CHON" || isChemicalTicket) {
      const existingStockShortages = t.items.filter((item, index) => (index === 0 ? qty : item.quantity) > item.material.quantity);
      const canUseExistingStock = existingStockShortages.length === 0;
      return <div className="act">
        <div className="act-title-row">
          <label className="lb">Xác nhận yêu cầu</label>
          <div className={`seg3 flow-toggle ${singleFlowTicket ? "single" : ""}`} aria-label="Chọn luồng vật tư">
            {proposalFlowAvailable !== false && (
              <button
                type="button"
                className={workflowType === "DE_XUAT" ? "on" : ""}
                disabled={proposalFlowAvailable !== true}
                onClick={() => setWorkflowType("DE_XUAT")}
              >
                Đề xuất
              </button>
            )}
            {!singleFlowTicket && <button type="button" className={workflowType === "UNG" ? "on" : ""} onClick={() => setWorkflowType("UNG")}>Ứng</button>}
            {!isChemicalTicket && (
              <button
                type="button"
                className={workflowType === "SU_DUNG_HIEN_CO" ? "on" : ""}
                disabled={!canUseExistingStock}
                title={canUseExistingStock ? "Sử dụng số lượng vật tư hiện có" : "Số lượng hiện có không đủ"}
                onClick={() => setWorkflowType("SU_DUNG_HIEN_CO")}
              >
                Sử dụng hiện có
              </button>
            )}
          </div>
        </div>
        {singleFlowTicket && (
          <div className="note"><Check size={14} /><span>Phiếu Hóa chất mặc định theo luồng <b>Đề xuất</b>; số lượng đề xuất không ràng buộc với tồn ERP.</span></div>
        )}
        {!isChemicalTicket && !canUseExistingStock && (
          <div className="warnbox">
            <AlertTriangle size={15} />
            Không thể chọn <b>Sử dụng hiện có</b>: {existingStockShortages.map((item) => `${item.material.name} cần ${item.id === t.items[0]?.id ? qty : item.quantity}, hiện có ${item.material.quantity} ${item.material.unit}`).join("; ")}. {proposalFlowAvailable === false ? <>Bạn chỉ có thể chọn <b>Ứng</b> vì tất cả mã vật tư ERP đều không còn tồn kho.</> : <>Bạn vẫn có thể chọn <b>Đề xuất</b> hoặc <b>Ứng</b>.</>}
          </div>
        )}
        {workflowType !== "SU_DUNG_HIEN_CO" && (
          <div className="erp-readonly-panel" aria-label="Thông tin vật tư ERP chỉ để xem">
            <div className="erp-readonly-head">
              <span><Package size={15} /> Thông tin vật tư ERP</span>
              <em>Chỉ để xem</em>
            </div>
            <div className="erp-readonly-table">
              <div className="erp-readonly-row erp-readonly-labels" aria-hidden="true">
                <span>Mã vật tư</span><span>Tên vật tư</span><span>Số lượng ERP</span>
              </div>
              {confirmationErpInfoRows.map((row) => (
                <div className="erp-readonly-row" key={row.code}>
                  <b>{row.code}</b>
                  <span>{row.name || t.items[0]?.material.name || "—"}</span>
                  <strong>{row.erpStock.toLocaleString("vi-VN")} {t.items[0]?.material.unit ?? ""}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="confirm-field-row three-even">
          <label className="field qty-field">Xác nhận lại số lượng {workflowType === "DE_XUAT" ? "đề xuất" : workflowType === "UNG" ? "ứng" : "sử dụng hiện có"} *
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label className="field">Lý do
            <input name={`reason-confirm-${t.id}`} autoComplete="off" value={confirmReasonInput} onChange={(e) => setConfirmReasonInput(e.target.value)} placeholder="VD: thay định kỳ / hư hỏng đột xuất…" />
          </label>
          {/* CHỖ DUY NHẤT nhập số BBKT trong quy trình. Nạp sẵn số đã có vì tác vụ
              confirm luôn ghi đè — để trống mà bấm Xác nhận là xóa mất số cũ.
              Sửa về sau chỉ qua đường có phân quyền: nút Sửa phiếu hoặc "Xem lại" bước này. */}
          <label className="field">Số biên bản kiểm tra
            <input name={`bbkt-confirm-${t.id}`} autoComplete="off" value={bbktNumberInput} onChange={(e) => setBbktNumberInput(e.target.value)} placeholder="Nhập số biên bản kiểm tra" />
          </label>
        </div>
        <button className="btn primary big" disabled={qty <= 0 || (workflowType === "DE_XUAT" && proposalFlowAvailable !== true) || (workflowType === "SU_DUNG_HIEN_CO" && !canUseExistingStock) || act.isPending} onClick={() => run({ action: "confirm", workflowType, proposedQuantity: qty, proposalNote: confirmReasonInput.trim() || undefined, bbktNumber: bbktNumberInput.trim() || undefined }, `Đã chọn luồng ${workflowType === "DE_XUAT" ? "Đề xuất" : workflowType === "UNG" ? "Ứng" : "Sử dụng hiện có"}`)}><Check size={15} /> Xác nhận</button>
      </div>;
    }
    const short = t.items.some((it) => it.quantity > it.material.quantity);
    return (
      <div className="act">
        <label className="lb">Bước 1&apos; — Xác nhận đề xuất (kiểm tra kho)</label>
        {short ? (
          <>
            <div className="warnbox"><AlertTriangle size={15} /> Số lượng hiện có <b>không đủ</b> — chỉ có thể Từ chối (chờ mua sắm ngoài hệ thống, sau đó tạo phiếu mới).</div>
            <input placeholder="Lý do từ chối" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn danger big" disabled={!reason.trim() || act.isPending}
              onClick={() => run({ action: "reject", reason }, "Đã từ chối phiếu")}>
              <Ban size={15} /> Từ chối phiếu
            </button>
          </>
        ) : (
          <button className="btn primary big" disabled={act.isPending}
            onClick={() => run({ action: "confirm" }, "Đã xác nhận — chuyển Thống kê")}>
            <Check size={15} /> Xác nhận (kho đủ) → chuyển Thống kê
          </button>
        )}
      </div>
    );
  }

  if (acts.includes("stats")) {
    const isReceiverPhase = t.status === "CHO_XAC_NHAN_PHAT";
    const asksForReceiver = isReceiverPhase && t.type !== "UNG";
    const asksForErpCode = !isReceiverPhase && t.type === "DE_XUAT";
    // Đề xuất: pha 1 xuất Phiếu ĐXVT (QLVT.12) rồi mới mở khóa nhập số phiếu (pha 2).
    const proposalExported = Boolean(t.proposalDocUrl);
    const proposalLocked = asksForErpCode && !proposalExported;
    const selectedMaterialOption = opts?.materials.find((material) => material.id === t.items[0]?.materialId);
    const allStatsCodeOptions = selectedMaterialOption?.erpCodes?.length
      ? selectedMaterialOption.erpCodes
      : (t.items[0]?.material.erpCodes?.length ? t.items[0].material.erpCodes : [t.items[0]?.material.code].filter(Boolean) as string[])
          .map((code) => ({ code, name: t.items[0]?.material.name ?? "", erpStock: 0 }));
    const proposedQuantity = Math.max(0, t.items[0]?.quantity ?? 0);
    // Khi mã chưa bị khóa, chỉ gợi ý các mã đủ tồn ERP để đáp ứng toàn bộ
    // số lượng đề xuất. Phiếu đã xuất vẫn hiện mã đã chọn để đối chiếu.
    const statsCodeOptions = proposalExported || isChemicalTicket
      ? allStatsCodeOptions
      : allStatsCodeOptions.filter((option) => option.erpStock >= proposedQuantity);
    const selectedStatsErp = statsCodeOptions.find((option) => option.code === erpCode);
    return (
      <div className="act">
        <div className={`stats-issue-grid ${asksForErpCode ? "" : "single"}`}>
          {!isReceiverPhase ? (
            <>
              {asksForErpCode && (
                <label className="field">Mã vật tư *
                  <select value={erpCode} disabled={proposalExported} onChange={(e) => setErpCode(e.target.value)}>
                    <option value="">— Chọn mã vật tư ERP —</option>
                    {statsCodeOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.code} · {option.name || t.items[0]?.material.name || "Chưa có tên vật tư"} · ERP: {option.erpStock.toLocaleString("vi-VN")} {t.items[0]?.material.unit ?? ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">Số phiếu ĐXVT *
                <input
                  name={`proposal-number-${t.id}`}
                  autoComplete="off"
                  placeholder={proposalLocked ? "Xuất Phiếu ĐXVT trước khi nhập số" : "Số phiếu ĐXVT (vd: ĐXVT-051)"}
                  disabled={proposalLocked}
                  value={proposalNumberInput}
                  onChange={(e) => setProposalNumberInput(e.target.value)}
                />
              </label>
            </>
          ) : asksForReceiver ? (
            <label className="field">Tên VHV nhận phiếu ĐXVT
              <input
                value={proposalReceiverName}
                onChange={(e) => setProposalReceiverName(e.target.value)}
                placeholder="Nhập tên VHV nhận phiếu ĐXVT"
              />
            </label>
          ) : <div className="warnbox"><AlertTriangle size={15} /> Chưa xác nhận đã trả phiếu.</div>}
        </div>
        {asksForErpCode && !proposalExported && statsCodeOptions.length === 0 && (
          <div className="warnbox">
            <AlertTriangle size={15} />
            Không có mã vật tư nào đủ tồn ERP cho số lượng đề xuất <b>{proposedQuantity} {t.items[0]?.material.unit ?? ""}</b>.
          </div>
        )}
        {asksForErpCode && selectedStatsErp && (
          <div className="note"><Package size={14} /><span><b>Tên vật tư ERP:</b> {selectedStatsErp.name} · <b>Số lượng ERP:</b> {selectedStatsErp.erpStock.toLocaleString("vi-VN")} {t.items[0]?.material.unit ?? ""}</span></div>
        )}
        {proposalLocked && (
          <div className="note"><FileText size={15} /><span>Bấm xác nhận để xuất <b>Phiếu ĐXVT (QLVT.12)</b> theo mã vật tư đã chọn — sau đó ô số phiếu sẽ được mở khóa.</span></div>
        )}
        {asksForErpCode && proposalExported && (
          <div className="note"><FileText size={15} /><span>Đã xuất Phiếu ĐXVT — <a className="pdf-inline" href={t.proposalDocUrl!} target="_blank" rel="noreferrer">tải xuống</a>. Nhập số phiếu ĐXVT để tiếp tục.</span></div>
        )}
        {proposalLocked ? (
          <button
            className="btn primary big"
            disabled={!selectedStatsErp || act.isPending}
            onClick={() => run({ action: "statsExportProposal", erpCode }, "Đã xuất Phiếu ĐXVT")}
          >
            {act.isPending ? <Loader2 className="spin" size={15} /> : <FileText size={15} />} Xác nhận & xuất Phiếu ĐXVT
          </button>
        ) : (
          <button
            className="btn primary big"
            disabled={(!isReceiverPhase && !proposalNumberInput.trim()) || act.isPending}
            onClick={() => run(
              asksForReceiver
                ? { action: "stats", proposalNumber: t.proposalNumber, proposalReceiverName: proposalReceiverName.trim() }
                : isReceiverPhase
                  ? { action: "stats", proposalNumber: t.proposalNumber }
                : { action: "stats", proposalNumber: proposalNumberInput.trim() },
              asksForReceiver ? "Đã xác nhận VHV nhận phiếu ĐXVT" : isReceiverPhase ? "Đã xác nhận trả phiếu" : "Đã xác nhận số phiếu ĐXVT"
            )}
          >
            <Check size={15} /> {asksForReceiver ? "Xác nhận VHV nhận phiếu ĐXVT" : isReceiverPhase ? "Xác nhận đã trả phiếu" : "Xác nhận số phiếu ĐXVT"}
          </button>
        )}
      </div>
    );
  }

  if (acts.includes("vhvReceive")) {
    const unit = t.items[0]?.material.unit ?? "";
    return <div className="act">
      <div className={`vhv-receive-grid${isGasTicket ? " has-receiver" : ""}`}>
        <label className="field">Số lượng vật tư đã lãnh{unit ? ` (${unit})` : ""} *
          <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value)) || 1))} />
        </label>
        {isGasTicket && (
          <label className="field">VHV lãnh *
            <input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="Họ tên người lãnh" />
          </label>
        )}
        <button className="btn primary big vhv-receive-confirm" disabled={qty <= 0 || (isGasTicket && !receiverName.trim()) || act.isPending} onClick={() => run({ action: "vhvReceive", quantity: qty, vhvReceivedByName: receiverName.trim() || undefined }, "Đã ghi nhận VHV lãnh vật tư")}><Check size={15} /> Xác nhận</button>
      </div>
      <p className="hint">Sau khi xác nhận, số lượng đã lãnh được cộng vào Hiện có để sử dụng ở bước sau. Nếu cần đội sửa chữa, dùng nút “Ra SYC sửa chữa” trong hồ sơ phiếu. Số lượng ERP không thay đổi.</p>
    </div>;
  }

  if (acts.includes("receiveExisting")) {
    const unit = t.items[0]?.material.unit ?? "";
    const stock = t.items[0]?.material.quantity ?? 0;
    return <div className="act">
      <div className="receive-existing-row">
        <div className="receive-existing-field">
          <label>Số lượng nhận{unit ? ` (${unit})` : ""} *</label>
          <input type="number" min={1} max={stock} value={qty} onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value)) || 1))} />
        </div>
        <p className="hint receive-existing-hint">Hiện có: <b>{stock} {unit}</b>. Bước này chỉ ghi nhận số lượng nhận, chưa trừ Hiện có.</p>
      </div>
      {qty > stock && <div className="warnbox"><AlertTriangle size={15} /> Số lượng nhận vượt quá Hiện có.</div>}
      <button className="btn primary big" disabled={qty <= 0 || qty > stock || act.isPending} onClick={() => run({ action: "receiveExisting", quantity: qty }, "Đã ghi nhận nhận vật tư từ Hiện có")}><Check size={15} /> Xác nhận</button>
    </div>;
  }

  if (acts.includes("receive")) {
    const unit = t.items[0]?.material.unit ?? "";
    const isAdvance = t.type === "UNG";
    const advanceProposalExported = Boolean(t.proposalDocUrl);
    const advanceDocumentLocked = isAdvance && !advanceProposalExported;
    const advanceMaterialCodeLocked = isAdvance && Boolean(t.items[0]?.erpCode);
    const selectedMaterialOption = opts?.materials.find((material) => material.id === t.items[0]?.materialId);
    const receiveCodeOptions = selectedMaterialOption?.erpCodes?.length
      ? selectedMaterialOption.erpCodes
      : (t.items[0]?.material.erpCodes ?? []).map((code) => ({ code, name: "", erpStock: 0 }));

    if (isAdvance) {
      const exportsRecoveryDocument = materialTicketRequiresRecovery(t) && !isGasTicket;
      const recoveryDocumentNeedsRetry = Boolean(t.receivedAt) && exportsRecoveryDocument && !t.recoveryDocUrl;
      const deliveryDocumentsConfirmed = Boolean(t.receivedAt) && !recoveryDocumentNeedsRetry;
      const selectedErp = receiveCodeOptions.find((option) => option.code === erpCode);

      // PHA 1 — đúng hai dữ liệu nghiệp vụ: mã ERP + khối lượng thực lãnh.
      if (!advanceProposalExported) return (
        <div className="act advance-document-phase">
          <div className="advance-phase-head">
            <span className="advance-phase-index">1</span>
            <div><b>Đối chiếu vật tư và xuất Phiếu ĐXVT</b><small>Chốt mã vật tư, khối lượng lãnh và nguồn lãnh.</small></div>
          </div>
          <div className="act-title-row receive-title-row">
            <div className="receive-location">
              <span>Vị trí lãnh vật tư:</span>
              <em>{receiptSource === "ERP" ? "Số lượng lãnh sẽ được trừ khỏi số lượng ERP." : "Lãnh ngoài không làm thay đổi số lượng ERP."}</em>
            </div>
            <div className="seg2 receive-source-toggle" aria-label="Nguồn lãnh vật tư">
              <button type="button" className={receiptSource === "ERP" ? "on" : ""} onClick={() => setReceiptSource("ERP")}>Lãnh kho DH1</button>
              <button type="button" className={receiptSource === "EXISTING" ? "on" : ""} onClick={() => setReceiptSource("EXISTING")}>Lãnh ngoài</button>
            </div>
          </div>
          <div className="advance-phase-grid">
            <label className="field">Mã vật tư *
              <select value={erpCode} disabled={advanceMaterialCodeLocked} onChange={(e) => setErpCode(e.target.value)}>
                <option value="">— Chọn mã vật tư ERP —</option>
                {receiveCodeOptions.map((option) => <option key={option.code} value={option.code}>{option.code} · ERP: {option.erpStock} {unit}</option>)}
              </select>
            </label>
            <label className="field">Khối lượng vật tư lãnh{unit ? ` (${unit})` : ""} *
              <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value)) || 1))} />
            </label>
          </div>
          {selectedErp && (
            <p className="hint">Phiếu ĐXVT sẽ ghi <b>{qty} {unit}</b> của mã <b>{selectedErp.code}</b> vào trường khối lượng trong mẫu.</p>
          )}
          <button
            className="btn primary big"
            disabled={!erpCode || qty <= 0 || act.isPending}
            onClick={() => run(
              { action: "statsExportProposal", erpCode, receivedQuantity: qty, receiptSource },
              "Đã xác nhận mã, khối lượng và xuất Phiếu Đề Xuất Vật Tư"
            )}
          >
            {act.isPending ? <Loader2 className="spin" size={15} /> : <FileText size={15} />} Xác nhận &amp; xuất Phiếu Đề Xuất Vật Tư
          </button>
        </div>
      );

      // PHA 2 — số ĐXVT + số giao hàng + ảnh liên 3 đi cùng nhau; BBTHVT chỉ sinh
      // sau khi ảnh đã được gắn vào lô để phụ lục không còn bị xuất thiếu.
      if (!deliveryDocumentsConfirmed) return (
        <div className="act advance-document-phase">
          <div className="advance-phase-head">
            <span className="advance-phase-index done"><Check size={14} /></span>
            <div><b>Hoàn thiện chứng từ giao hàng</b><small>Phiếu ĐXVT đã xuất — nhập số chứng từ và liên 3.</small></div>
          </div>
          <div className="note"><FileText size={15} /><span>Đã xuất Phiếu Đề Xuất Vật Tư — <a className="pdf-inline" href={t.proposalDocUrl!} target="_blank" rel="noreferrer">xem phiếu</a>.</span></div>
          {recoveryDocumentNeedsRetry ? (
            <div className="warnbox"><AlertTriangle size={15} /> Số ĐXVT, số giao hàng và ảnh liên 3 đã lưu; BBTHVT chưa tạo xong. Bấm xuất lại để tiếp tục.</div>
          ) : <>
            <div className="advance-phase-grid">
              <label className="field">Số phiếu ĐXVT *
                <input placeholder="Số phiếu ĐXVT (vd: ĐXVT-051)" value={proposalNumberInput} onChange={(e) => setProposalNumberInput(e.target.value)} />
              </label>
              <label className="field">Số phiếu giao hàng *
                <input placeholder="Nhập số phiếu giao hàng" value={method} onChange={(e) => setMethod(e.target.value)} />
              </label>
            </div>
            <DeliveryPhotoField value={deliveryPhoto} onChange={setDeliveryPhoto} />
          </>}
          <button
            className="btn primary big"
            disabled={recoveryDocumentNeedsRetry
              ? act.isPending
              : !proposalNumberInput.trim() || !method.trim() || !deliveryPhoto || act.isPending}
            onClick={() => run(
              recoveryDocumentNeedsRetry ? { action: "receive" } : {
                action: "receive",
                proposalNumber: proposalNumberInput.trim(),
                deliveryNoteNumber: method.trim(),
                deliveryPhotoDataUrl: deliveryPhoto,
                receivedQuantity: t.receivedQuantity ?? qty,
                receiptSource,
              },
              recoveryDocumentNeedsRetry
                ? "Đã xuất lại BBTHVT"
                : exportsRecoveryDocument
                ? "Đã xác nhận chứng từ, ảnh liên 3 và xuất BBTHVT"
                : isGasTicket ? "Đã xác nhận chứng từ, chuyển bước xác nhận trả" : "Đã xác nhận chứng từ giao hàng"
            )}
          >
            {act.isPending ? <Loader2 className="spin" size={15} /> : <FileText size={15} />}
            {recoveryDocumentNeedsRetry
              ? " Xuất lại BBTHVT"
              : exportsRecoveryDocument ? " Xác nhận & xuất BBTHVT" : " Xác nhận chứng từ giao hàng"}
          </button>
        </div>
      );

      // PHA 3 — chỉ còn đúng hai lựa chọn đại diện SCCN; BBNT D-Office là tài liệu
      // cuối của bước Xác nhận ĐXVT trước khi chuyển sang Quyết toán.
      return (
        <div className="act advance-document-phase">
          <div className="advance-phase-head">
            <span className="advance-phase-index">3</span>
            <div><b>Xuất BBNT D-Office</b><small>Chọn đại diện SCCN ký biên bản và hoàn thành bước Xác nhận ĐXVT.</small></div>
          </div>
          <div className="advance-document-summary">
            <a className="pdf" href={t.proposalDocUrl!} target="_blank" rel="noreferrer"><Download size={14} /> Phiếu Đề Xuất Vật Tư</a>
            {t.recoveryDocUrl && <a className="pdf recovery-download" href={t.recoveryDocUrl} target="_blank" rel="noreferrer"><Download size={14} /> Biên Bản Vật Tư Thu Hồi</a>}
          </div>
          <div className="advance-phase-grid">
            <label className="field">Đại diện SCCN *
              <select value={sccnRepresentative} onChange={(e) => setSccnRepresentative(e.target.value)}>
                <option value="">— Chọn đại diện SCCN —</option>
                {SCCN_REPRESENTATIVES.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="field">Chức vụ *
              <select value={sccnPosition} onChange={(e) => setSccnPosition(e.target.value)}>
                <option value="">— Chọn chức vụ —</option>
                {SCCN_POSITIONS.map((position) => <option key={position} value={position}>{position}</option>)}
              </select>
            </label>
          </div>
          <button
            className="btn primary big"
            disabled={!sccnRepresentative || !sccnPosition || act.isPending}
            onClick={() => run(
              { action: "statsExportAdvanceBbntDo", sccnRepresentative, sccnPosition },
              "Đã xuất BBNT D-Office và chuyển bước Quyết toán"
            )}
          >
            {act.isPending ? <Loader2 className="spin" size={15} /> : <FileText size={15} />} Xác nhận &amp; xuất BBNT D-Office
          </button>
        </div>
      );
    }
    return (
      <div className="act">
        {isAdvance && <div className="act-title-row receive-title-row">
          <div className="receive-location">
            <span>Vị trí lãnh vật tư:</span>
            <em>{receiptSource === "ERP" ? "Số lượng lãnh sẽ được trừ khỏi số lượng ERP." : "Lãnh ngoài không làm thay đổi số lượng ERP."}</em>
          </div>
          <div className="seg2 receive-source-toggle" aria-label="Nguồn lãnh vật tư">
            <button type="button" className={receiptSource === "ERP" ? "on" : ""} onClick={() => setReceiptSource("ERP")}>Lãnh kho DH1</button>
            <button type="button" className={receiptSource === "EXISTING" ? "on" : ""} onClick={() => setReceiptSource("EXISTING")}>Lãnh ngoài</button>
          </div>
        </div>}
        <div className={`receive-field-grid ${isAdvance ? "advance-receive-fields" : ""}`}>
          {isAdvance && (
            <label className="field">Mã vật tư *
              <select value={erpCode} disabled={advanceMaterialCodeLocked || advanceProposalExported} onChange={(e) => setErpCode(e.target.value)}>
                <option value="">— Chọn mã vật tư ERP —</option>
                {receiveCodeOptions.map((option) => <option key={option.code} value={option.code}>{option.code} · ERP: {option.erpStock} {unit}</option>)}
              </select>
            </label>
          )}
          <label className="field">Khối lượng vật tư lãnh
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value)) || 1))} />
          </label>
          {isAdvance && (
            <label className="field">Số phiếu ĐXVT *
              {/* Nhập được ngay cả khi chưa xuất Phiếu ĐXVT: người lập thường đã cầm số
                  trên tay. Số chỉ được LƯU ở nút Xác nhận ĐXVT, sau khi phiếu đã xuất. */}
              <input
                placeholder="Số phiếu ĐXVT (vd: ĐXVT-051)"
                value={proposalNumberInput}
                onChange={(e) => setProposalNumberInput(e.target.value)}
              />
            </label>
          )}
          <label className="field">Số phiếu giao hàng *
            <input
              placeholder="Nhập số phiếu giao hàng"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            />
          </label>
        </div>
        {/* Ảnh liên 3 nằm ngay dưới ô số phiếu giao hàng vì hai thứ đó là một cặp: số phiếu
            và bản chụp của chính tờ phiếu ấy. */}
        <DeliveryPhotoField value={deliveryPhoto} onChange={setDeliveryPhoto} />
        {advanceDocumentLocked && (
          <div className="accept-two-grid">
            <label className="field">Đại diện SCCN *
              <select value={sccnRepresentative} onChange={(e) => setSccnRepresentative(e.target.value)}>
                <option value="">— Chọn đại diện SCCN —</option>
                {SCCN_REPRESENTATIVES.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="field">Chức vụ *
              <select value={sccnPosition} onChange={(e) => setSccnPosition(e.target.value)}>
                <option value="">— Chọn chức vụ —</option>
                {SCCN_POSITIONS.map((position) => <option key={position} value={position}>{position}</option>)}
              </select>
            </label>
          </div>
        )}
        {isAdvance && advanceProposalExported && (
          <div className="note"><FileText size={15} /><span>Đã xuất Phiếu Đề Xuất Vật Tư — <a className="pdf-inline" href={t.proposalDocUrl!} target="_blank" rel="noreferrer">tải xuống</a>. Mã vật tư đã được khóa; có thể nhập số phiếu để tiếp tục.</span></div>
        )}
        {advanceDocumentLocked ? (
          <button
            className="btn primary big"
            disabled={!erpCode || !sccnRepresentative || !sccnPosition || act.isPending}
            onClick={() => run(
              { action: "statsExportProposal", erpCode, sccnRepresentative, sccnPosition },
              "Đã xác nhận và xuất Phiếu Đề Xuất Vật Tư"
            )}
          >
            {act.isPending ? <Loader2 className="spin" size={15} /> : <FileText size={15} />} Xác nhận &amp; xuất Phiếu Đề Xuất Vật Tư
          </button>
        ) : (
          <button className="btn primary big" disabled={qty <= 0 || (isAdvance && (!erpCode || !proposalNumberInput.trim())) || !method.trim() || !deliveryPhoto || act.isPending}
            onClick={() => run({ action: "receive", receivedQuantity: qty, deliveryNoteNumber: method.trim(), deliveryPhotoDataUrl: deliveryPhoto, receiptSource: isAdvance ? receiptSource : "ERP", ...(isAdvance ? { erpCode, proposalNumber: proposalNumberInput.trim() } : {}) }, isAdvance ? (isGasTicket ? "Đã xác nhận ĐXVT, chuyển bước Sử dụng vật tư" : "Đã xác nhận ĐXVT, chuyển Quyết toán") : "Đã xác nhận số phiếu giao hàng")}>
            {act.isPending ? <Loader2 className="spin" size={15} /> : <Check size={15} />} {isAdvance ? "Xác nhận ĐXVT" : "Xác nhận số phiếu giao hàng"}
          </button>
        )}
      </div>
    );
  }

  if (acts.includes("use")) {
    const unit = t.items[0]?.material.unit ?? "";
    const stock = t.items[0]?.material.quantity ?? 0;
    const received = t.receivedQuantity ?? (t.type === "UNG" ? t.vhvReceivedQuantity ?? t.items[0]?.quantity ?? 0 : 0);
    const quantityExceedsStock = qty > stock;
    const quantityExceedsReceived = t.type === "SU_DUNG_HIEN_CO" && qty > received;
	    const recoveryRequired = materialTicketRequiresRecovery(t);
	    const recoveryQuantity = Math.trunc(Number(recoveryQuantityInput));
	            return (
	              <div className="act">
	        <div className="use-field-grid">
	          <label className="field">Tên VHV sử dụng vật tư *
	            <input value={materialUserNameInput} onChange={(e) => setMaterialUserNameInput(e.target.value)} placeholder="Nhập tên VHV sử dụng vật tư" />
	          </label>
	          <label className="field">Khối lượng vật tư sử dụng{unit ? ` (${unit})` : ""} *
	            <input type="number" min={1} max={stock} value={qty} onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value)) || 1))} />
	          </label>
	        </div>
        {/* Ảnh không bắt buộc: thiếu ảnh thì ô tương ứng trong BBNT để trống, không chặn bước. */}
        <UsagePhotoCard ticketId={t.id} canEdit />
        {recoveryRequired && (
          <div className="recovery-quantity-row">
            <label className="field">Số lượng vật tư thu hồi ghi vào BBTHVT{unit ? ` (${unit})` : ""} *
              <input type="number" min={1} value={recoveryQuantityInput} onChange={(e) => setRecoveryQuantityInput(e.target.value)} />
            </label>
            <label className={`recovery-return-check ${recoveryReturned ? "checked" : ""}`}>
              <input type="checkbox" checked={recoveryReturned} onChange={(e) => setRecoveryReturned(e.target.checked)} />
              <span>
                <b>VHV xác nhận đã trả vật tư thu hồi xong</b>
                {/* Kho chỉ nhận vật tư thu hồi theo lịch cố định — nhắc ngay tại ô tick
                    để VHV không tick trước rồi ôm vật tư chờ cả tuần. */}
                <small className="cycle">Định kỳ thứ 5 hằng tuần</small>
                {recoveryReturned && <small>Ngày trả: {fmtDay(t.recoveryReturnedAt ?? new Date().toISOString())}</small>}
              </span>
            </label>
          </div>
        )}
        {quantityExceedsStock && (
          <div className="warnbox"><AlertTriangle size={15} /> Số lượng vật tư sử dụng đã nhập vượt số lượng hiện có. Hiện còn {stock} {unit}; vui lòng nhập lại số lượng.</div>
        )}
        {quantityExceedsReceived && <div className="warnbox"><AlertTriangle size={15} /> Số lượng sử dụng vượt số lượng đã nhận từ Hiện có ({received} {unit}).</div>}
        {usagePhotoCount < MIN_USAGE_PHOTOS && (
          <div className="warnbox"><AlertTriangle size={15} /> Cần tối thiểu {MIN_USAGE_PHOTOS} trên 3 ảnh hiện trường mới xác nhận được ({usagePhotoCount}/3 ảnh).</div>
        )}
        <button className="btn primary big" disabled={!materialUserNameInput.trim() || qty <= 0 || usagePhotoCount < MIN_USAGE_PHOTOS || quantityExceedsStock || quantityExceedsReceived || (recoveryRequired && (!Number.isFinite(recoveryQuantity) || recoveryQuantity <= 0)) || act.isPending}
          onClick={() => run({ action: "use", materialUserName: materialUserNameInput.trim(), usedQuantity: qty, ...(recoveryRequired ? { recoveryQuantity, recoveryReturned } : {}) }, "Đã xác nhận sử dụng vật tư")}>
          {act.isPending ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Xác nhận
        </button>
      </div>
    );
  }

  if (acts.includes("returnItems")) {
    const unit = t.items[0]?.material.unit ?? "";
    const received = t.receivedQuantity ?? t.vhvReceivedQuantity ?? 0;
    const returned = Math.trunc(Number(recoveryQuantityInput));
    const stock = t.items[0]?.material.quantity ?? 0;
    return (
      <div className="act">
        <label className="lb">Xác nhận trả</label>
        <div className="note"><Check size={14} /><span>Đã lãnh <b>{received} {unit}</b>. Xác nhận số vỏ chai đã trả về kho để hoàn tất phiếu; số chai trả sẽ được <b>trừ khỏi Hiện có</b> (đang là {stock} {unit}).</span></div>
        <div className="chem-grid">
          <div>
            <label className="lb">Số lượng trả *{unit ? ` (${unit})` : ""}</label>
            <input type="number" min={1} value={recoveryQuantityInput} onChange={(e) => setRecoveryQuantityInput(e.target.value)} />
          </div>
          <div>
            <label className="lb">Ngày trả *</label>
            <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </div>
          <div>
            <label className="lb">Người trả *</label>
            <input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="Họ tên người trả" />
          </div>
        </div>
        {returned > received && received > 0 && (
          <div className="warnbox"><AlertTriangle size={15} /> Số chai trả ({returned}) nhiều hơn số đã lãnh ({received} {unit}).</div>
        )}
        {returned > stock && (
          <div className="warnbox"><AlertTriangle size={15} /> Số chai trả vượt số lượng hiện có ({stock} {unit}).</div>
        )}
        <button className="btn primary big"
          disabled={act.isPending || !Number.isFinite(returned) || returned <= 0 || returned > stock || (received > 0 && returned > received) || !receivedDate || !receiverName.trim()}
          onClick={() => run({ action: "returnItems", returnedQuantity: returned, returnedAt: receivedDate, returnedByName: receiverName.trim() }, "Đã xác nhận trả, phiếu hoàn tất")}>
          {act.isPending ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Xác nhận trả và hoàn tất
        </button>
      </div>
    );
  }

  if (acts.includes("accept")) {
    // Phiếu theo luồng mới đã có PCT/chỉ huy/nội dung từ bước Sử dụng vật tư;
    // phiếu cũ (trước khi thêm bước) vẫn nhập tại đây để tương thích.
    const selectedMaterialOption = opts?.materials.find((material) => material.id === t.items[0]?.materialId);
    const codeOptions = selectedMaterialOption?.erpCodes?.length
      ? selectedMaterialOption.erpCodes
      : (t.items[0]?.material.erpCodes?.length ? t.items[0].material.erpCodes : [t.items[0]?.material.code].filter(Boolean) as string[])
          .map((code) => ({ code, name: t.items[0]?.material.name ?? "", erpStock: 0 }));
    // Luồng Ứng chờ tới bước Xác nhận ĐXVT, sau khi có số giao hàng + ảnh liên 3,
    // mới xuất BBTHVT. Hai luồng còn lại vẫn xuất tại Nghiệm thu như cũ.
    const exportsRecoveryDocument = t.type !== "UNG" && materialTicketRequiresRecovery(t);
    // BBNT ký tay chỉ còn cho bi nghiền — xem `usesHandwrittenBbnt` ở lib/bbnt-doc.ts.
    const exportsHandwrittenBbnt = usesHandwrittenBbnt(t.materialCategory);
    return (
      <div className="act">
          <>
            {/* Còn một ô sau khi số BBKT dời về bước chọn luồng — cho trải hết bề ngang
                thay vì để nửa hàng trống. */}
            <div className="accept-two-grid one-col">
              <label className="field">Mã vật tư dùng xuất biên bản *
                <select value={erpCode} onChange={(e) => setErpCode(e.target.value)}>
                  <option value="">— Chọn mã vật tư ERP —</option>
                  {codeOptions.map((option) => <option key={option.code} value={option.code}>{option.code} · ERP: {option.erpStock.toLocaleString("vi-VN")} {t.items[0]?.material.unit ?? ""}</option>)}
                </select>
              </label>
            </div>
            <LotAllocationPicker ticketId={t.id} value={lotAllocation} onChange={setLotAllocation} />
            <div className="accept-two-grid">
              <label className="field">Số PCT/LCT *
                <input placeholder="Nhập số PCT/LCT" value={pct} onChange={(e) => setPct(e.target.value)} />
              </label>
              <label className="field">Tên chỉ huy trực tiếp (SCCN) *
                <input placeholder="Nhập tên chỉ huy trực tiếp" value={chiHuy} onChange={(e) => setChiHuy(e.target.value)} />
              </label>
            </div>
            {/* Hai nội dung đi đôi với nhau: bên trái là việc GIAO theo PCT, bên phải là
                kết quả NGHIỆM THU. Đặt cạnh nhau để người ghi đối chiếu được ngay. */}
            <div className="accept-two-grid accept-note-grid">
              <label className="field">Nội dung PCT
                <textarea rows={3} placeholder="Nội dung công việc ghi trên PCT/LCT…" value={pctNoiDung} onChange={(e) => setPctNoiDung(e.target.value)} />
              </label>
              <label className="field">Nội dung nghiệm thu *
                <textarea rows={3} placeholder="Nội dung nghiệm thu…" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            <div className="accept-two-grid">
              <label className="field">Thời gian bắt đầu nghiệm thu *
                <input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
              </label>
              <label className="field">Thời gian kết thúc nghiệm thu *
                <input type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
              </label>
            </div>
          </>
        <button className="btn primary big" disabled={act.isPending || !erpCode || !note.trim() || !pct.trim() || !chiHuy.trim() || !startedAt || !endedAt}
          onClick={() => run(
            {
              action: "accept", erpCode, completionNote: note.trim(), pctContent: pctNoiDung.trim(), pctNumber: pct.trim(), chiHuyName: chiHuy.trim(),
              workStartedAt: startedAt, workEndedAt: endedAt,
              ...(lotAllocation ? { lotAllocation: Object.entries(lotAllocation).map(([lotId, quantity]) => ({ lotId, quantity })) } : {}),
            },
            [
              "Đã nghiệm thu",
              [exportsHandwrittenBbnt && "BBNT ký tay", exportsRecoveryDocument && "BBTHVT"].filter(Boolean).join(" và "),
            ].filter(Boolean).join(", xuất ") + (t.type === "UNG" ? "" : ", chuyển Thống kê xuất BBNT D-Office"),
          )}>
          {act.isPending ? <Loader2 className="spin" size={15} /> : <FileText size={15} />}
          {" Xác nhận nghiệm thu"}
          {exportsHandwrittenBbnt && " và xuất BBNT ký tay"}
          {exportsRecoveryDocument && (exportsHandwrittenBbnt ? " + BBTHVT" : " và xuất BBTHVT")}
        </button>
      </div>
    );
  }

  if (acts.includes("statsExportDocuments")) {
    const unit = t.items[0]?.material.unit ?? "";
    const selectedMaterialOption = opts?.materials.find((material) => material.id === t.items[0]?.materialId);
    const codeOptions = selectedMaterialOption?.erpCodes?.length
      ? selectedMaterialOption.erpCodes
      : (t.items[0]?.material.erpCodes?.length ? t.items[0].material.erpCodes : [t.items[0]?.material.code].filter(Boolean) as string[])
          .map((code) => ({ code, name: t.items[0]?.material.name ?? "", erpStock: 0 }));
    const selectedErp = codeOptions.find((option) => option.code === erpCode);
    // Đề xuất và Sử dụng hiện có đều xuất BBNT D-Office tại đây — đây là chỗ duy nhất chọn
    // đại diện SCCN, và biên bản phải mang tên người đó. Tên bước giữ theo từng luồng vì
    // người dùng gọi quen như vậy.
    const exportsBbntDo = t.type === "DE_XUAT" || t.type === "SU_DUNG_HIEN_CO";
    const stepLabel = t.type === "DE_XUAT" ? "Thống kê xuất BBNT D-Office" : "Xuất BBNT DO";
    return (
      <div className="act">
        <label className="lb">{stepLabel}</label>
        <label className="field">Mã vật tư *
          <select value={erpCode} disabled>
            <option value="">— Chọn mã vật tư ERP —</option>
            {codeOptions.map((option) => <option key={option.code} value={option.code}>{option.code} · ERP: {option.erpStock.toLocaleString("vi-VN")} {unit}</option>)}
          </select>
        </label>
        {selectedErp && (
          <div className="erp-readonly-panel" aria-label="Thông tin vật tư dùng để xuất biên bản">
            <div className="erp-readonly-head"><span><Package size={15} /> Thông tin đưa vào biên bản</span><em>Đã đối chiếu ERP</em></div>
            <div className="erp-readonly-row">
              <b>{selectedErp.code}</b><span>{selectedErp.name}</span><strong>{selectedErp.erpStock.toLocaleString("vi-VN")} {unit}</strong>
            </div>
          </div>
        )}
        {exportsBbntDo && (
          <div className="accept-two-grid">
            <label className="field">Đại diện SCCN *
              <select value={sccnRepresentative} onChange={(e) => setSccnRepresentative(e.target.value)}>
                <option value="">— Chọn đại diện SCCN —</option>
                {SCCN_REPRESENTATIVES.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="field">Chức vụ *
              <select value={sccnPosition} onChange={(e) => setSccnPosition(e.target.value)}>
                <option value="">— Chọn chức vụ —</option>
                {SCCN_POSITIONS.map((position) => <option key={position} value={position}>{position}</option>)}
              </select>
            </label>
          </div>
        )}
        <p className="hint">
          {exportsBbntDo
            ? `${[usesHandwrittenBbnt(t.materialCategory) && "BBNT ký tay", materialTicketRequiresRecovery(t) && "Biên bản vật tư thu hồi"].filter(Boolean).join(" và ") || "Hồ sơ"} đã được xuất ở bước Nghiệm thu. Chọn đại diện SCCN để xuất BBNT D-Office, sau đó chuyển sang bước Quyết toán.`
            : "Bước này chỉ xác nhận mã vật tư trước khi chuyển quyết toán."}
        </p>
        <button className="btn primary big" disabled={!erpCode || act.isPending || (exportsBbntDo && (!sccnRepresentative || !sccnPosition))}
          onClick={() => run(
            {
              action: "statsExportDocuments",
              erpCode,
              sccnRepresentative: exportsBbntDo ? sccnRepresentative : undefined,
              sccnPosition: exportsBbntDo ? sccnPosition : undefined,
            },
            exportsBbntDo ? "Đã xuất BBNT D-Office và chuyển bước Quyết toán" : "Đã xác nhận mã vật tư",
          )}>
          {act.isPending ? <Loader2 className="spin" size={15} /> : <FileText size={15} />} {exportsBbntDo ? "Xác nhận và xuất BBNT D-Office" : "Xác nhận mã vật tư"}
        </button>
      </div>
    );
  }

  if (acts.includes("settle")) return (
    <div className="act">
      <div className="settlement-number-card">
        <label className="field">Số BBNT DO *
          <input
            value={bbntDoNumberInput}
            onChange={(e) => {
              setBbntDoNumberInput(e.target.value);
              if (!e.target.value.trim()) setSettlementConfirmed(false);
            }}
            placeholder="Nhập số BBNT DO"
            autoComplete="off"
          />
        </label>
        <span>Nhập số biên bản đã phát hành trên D-Office trước khi xác nhận quyết toán.</span>
      </div>
      <label className={`settlement-check ${settlementConfirmed ? "checked" : ""} ${!bbntDoNumberInput.trim() ? "disabled" : ""}`}>
        <input
          type="checkbox"
          checked={settlementConfirmed}
          disabled={!bbntDoNumberInput.trim()}
          onChange={(e) => setSettlementConfirmed(e.target.checked)}
        />
        <span className="settlement-check-box" aria-hidden="true">
          {settlementConfirmed && <Check size={14} strokeWidth={3} />}
        </span>
        <span className="settlement-check-label">Xác nhận đã quyết toán vật tư</span>
      </label>
      <div className="note"><CircleCheck size={15}/> Các biên bản đã được xuất ở bước nghiệm thu. Bước này chỉ xác nhận quyết toán vật tư.</div>
      <button className="btn primary big" disabled={!bbntDoNumberInput.trim() || !settlementConfirmed || act.isPending} onClick={() => run({ action: "settle", bbntDoNumber: bbntDoNumberInput.trim() }, "Đã xác nhận quyết toán vật tư")}>
        <CircleCheck size={15}/> Xác nhận quyết toán vật tư
      </button>
    </div>
  );

  return null;
}

/* ============================== CSS ============================== */
const CSS = `
.mtw{font-family:var(--font-sans),system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2430;position:relative;}
.mtw *{box-sizing:border-box;font-family:inherit;}
.step-review{width:100%;text-align:left;border:0;background:transparent;cursor:pointer;}
.step-review:disabled{cursor:default;}
.step-review:not(:disabled):hover{background:#f8fafc;border-radius:10px;}
.step.recovery-pending{color:${C.warn};background:${C.warnBg};}
.dlg.step-review-dialog{width:min(680px,calc(100vw - 32px));max-height:min(90dvh,860px);display:flex;flex-direction:column;overflow:hidden;}
.step-review-dialog>.dlg-h{flex:0 0 auto;}
.step-review-dialog>.step-review-form{min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;}
.review-receive-row{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,.65fr);gap:12px;align-items:end;min-width:0;}
.review-receive-row.single{grid-template-columns:minmax(0,1fr) minmax(170px,1fr);}
.review-receive-source{display:flex;flex-direction:column;gap:6px;min-width:0;}
.fixed-receive-source{display:flex;height:40px;align-items:center;border:1px solid ${C.line};border-radius:9px;background:#f8fafc;padding:0 12px;color:${C.navy};font-size:12px;font-weight:700;}
.review-receive-toggle{display:grid;width:100%;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;}
.review-receive-toggle button{height:40px;min-width:0;padding:0 12px;font-size:12px;line-height:1.2;white-space:nowrap;}
.review-delivery-field{gap:6px;min-width:0;}
.review-delivery-field input{height:40px;margin:0;}
.review-use-grid,.review-accept-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:end;min-width:0;}
.review-recovery-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,1.08fr);gap:12px;align-items:stretch;min-width:0;}
.review-recovery-grid>label{min-width:0;}
.review-recovery-quantity{display:flex;flex-direction:column;justify-content:flex-end;gap:6px;line-height:1.35;}
.review-recovery-quantity input{margin-top:auto;}
.step-review-dialog .review-recovery-grid .recovery-return-check{min-height:64px;align-self:end;}
.step-review-dialog .review-recovery-grid .recovery-return-check b{overflow-wrap:anywhere;}
.step-review-dialog .frm-f{align-items:center;flex-wrap:nowrap;}
.step-review-dialog .frm-f>.note{flex:1 1 260px;min-width:0;margin-right:0!important;line-height:1.35;}
.step-review-dialog .frm-f>.btn{flex:0 0 auto;justify-content:center;white-space:nowrap;}
.step-review-dialog .frm-f>.btn.primary{min-width:142px;}
.head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px;}
.head-l{display:flex;gap:13px;align-items:center;}
.head-ic{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,${C.navy},${C.accent});}
.head h1{font-family:inherit;font-size:21px;font-weight:700;color:${C.navy};margin:0;}
.head p{margin:2px 0 0;font-size:12.5px;color:${C.muted};}
.top-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;}
.turn-spacer{flex:1 1 auto;min-width:0;}
.tool-search{display:inline-flex;align-items:center;gap:7px;flex:0 1 250px;min-width:180px;height:38px;padding:0 11px;border:1px solid ${C.line};background:#fff;border-radius:11px;box-shadow:0 1px 2px rgba(15,23,42,.04);transition:border-color .15s,box-shadow .15s;}
.tool-search:focus-within{border-color:#60a5fa;box-shadow:0 0 0 3px rgba(37,99,235,.1);}
.tool-search>svg{flex:0 0 auto;color:${C.soft};}
.tool-search input{flex:1 1 auto;min-width:0;border:0;background:transparent;outline:0;font-size:12.5px;font-weight:600;color:${C.navy};}
.tool-search input::placeholder{color:${C.soft};font-weight:500;}
.month-filter{display:inline-flex;align-items:center;flex:0 0 auto;height:38px;border:1px solid #bfdbfe;background:linear-gradient(180deg,#fff 0%,#f8fbff 100%);border-radius:11px;padding:3px 5px 3px 10px;box-shadow:0 1px 2px rgba(15,23,42,.04);transition:border-color .15s,box-shadow .15s;}
.month-filter:focus-within{border-color:#60a5fa;box-shadow:0 0 0 3px rgba(37,99,235,.1);}
.month-filter>svg{flex:0 0 auto;color:${C.accent};}
.month-filter select{height:30px;min-width:114px;border:0;background:transparent;padding:0 18px 0 7px;color:${C.navy};font-size:12.5px;font-weight:800;outline:0;cursor:pointer;}
.month-count{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 6px;border-radius:8px;background:#e8f1ff;color:#1d4ed8;font-size:11.5px;font-weight:900;font-variant-numeric:tabular-nums;}
.mobile-type-filter{display:none;}
.bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
.filters{display:flex;gap:5px;flex:0 0 auto;background:#fff;border:1px solid ${C.line};border-radius:11px;padding:3px;}
.filters button{border:0;background:transparent;font-size:12.5px;font-weight:600;color:#64748b;padding:7px 12px;border-radius:8px;cursor:pointer;}
.filters button.on{background:${C.navy};color:#fff;}
.filters button.mine-tab{display:inline-flex;align-items:center;gap:6px;font-weight:700;color:${C.warn};}
.filters button.mine-tab.on{background:#f59e0b;color:#fff;}
.filters button.status-filter-trigger{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:142px;white-space:nowrap;transition:background .18s,color .18s,box-shadow .18s;}
.filters button.status-filter-trigger>span{width:100%;padding:0 16px;text-align:center;}
.filters button.status-filter-trigger>svg{position:absolute;right:9px;flex:0 0 auto;color:#94a3b8;transition:transform .18s,color .18s;}
.filters button.status-filter-trigger[data-state=open]>svg{transform:rotate(180deg);}
.filters button.status-filter-trigger.on>svg{color:#bfdbfe;}
.status-filter-menu{width:174px!important;padding:6px!important;border:1px solid #dbe5f0!important;border-radius:12px!important;background:#fff!important;box-shadow:0 14px 34px rgba(15,23,42,.14)!important;}
.status-filter-heading{padding:6px 9px 7px;color:#94a3b8;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;}
.status-filter-menu button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;border:0;border-radius:8px;background:transparent;padding:8px 9px;color:#475569;font-family:inherit;font-size:12.5px;font-weight:650;line-height:1.25;white-space:nowrap;cursor:pointer;transition:background .16s,color .16s;}
.status-filter-menu button:hover{background:#f1f5f9;color:${C.navy};}
.status-filter-menu button:focus-visible{outline:2px solid #60a5fa;outline-offset:1px;}
.status-filter-menu button.selected{background:#eff6ff;color:${C.accent};font-weight:750;}
.status-filter-menu button>svg{flex:0 0 auto;}
.mine-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;font-size:10.5px;font-weight:800;background:${C.warnBg};color:${C.warn};}
.mine-tab.on .mine-count{background:rgba(255,255,255,.28);color:#fff;}
.btn{display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-weight:600;font-size:13px;border-radius:10px;padding:9px 14px;cursor:pointer;border:1px solid ${C.line};background:#fff;color:#475569;transition:.15s;}
.btn.primary{background:${C.accent};border-color:${C.accent};color:#fff;}
.btn.primary:disabled{opacity:.5;cursor:not-allowed;}
.btn.danger{background:${C.bad};border-color:${C.bad};color:#fff;}
.btn.ghost{background:#fff;}
.btn.big{width:100%;justify-content:center;padding:13px;font-size:14px;margin-top:8px;}
.btn.tiny{font-size:11.5px;padding:5px 9px;border-radius:8px;align-self:flex-start;}
.mini{border:1px solid ${C.line};background:#fff;border-radius:8px;cursor:pointer;color:#94a3b8;display:grid;place-items:center;width:30px;}
.list{background:#fff;border:1px solid ${C.line};border-radius:14px;overflow-x:auto;overflow-y:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04);}
.ticket-pagination{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:12px;border:1px solid ${C.line};border-radius:14px;background:#fff;padding:12px 14px;box-shadow:0 1px 2px rgba(15,23,42,.04);}
.ticket-pagination-summary{color:${C.muted};font-size:12.5px;}
.ticket-pagination-summary b{color:${C.navy};font-variant-numeric:tabular-nums;}
.ticket-pagination-actions{display:flex;align-items:center;gap:7px;}
.ticket-pagination-actions button{display:grid;width:34px;height:34px;place-items:center;border:1px solid #dbe3ec;border-radius:10px;background:#fff;color:#64748b;cursor:pointer;transition:border-color .15s,background .15s,color .15s,transform .15s;}
.ticket-pagination-actions button:hover:not(:disabled){border-color:#93c5fd;background:#eff6ff;color:${C.accent};transform:translateY(-1px);}
.ticket-pagination-actions button:disabled{cursor:not-allowed;opacity:.35;}
.ticket-page-indicator{display:grid;height:34px;min-width:48px;place-items:center;border-radius:10px;background:${C.navy};padding:0 9px;color:#fff;font-size:11.5px;font-weight:850;font-variant-numeric:tabular-nums;box-shadow:0 5px 12px rgba(30,58,95,.18);}
.row{display:grid;grid-template-columns:48px 120px 108px minmax(240px,2.2fr) 180px 84px minmax(176px,1.1fr) 60px 68px;gap:10px;align-items:center;min-width:1192px;width:100%;text-align:left;min-height:54px;padding:6px 14px;border:0;border-bottom:1px solid ${C.line};background:#fff;cursor:pointer;font-size:13px;}
.row:not(.rhead){min-height:62px;padding-top:9px;padding-bottom:9px;}
.row:not(.rhead)>span:nth-child(n+2):nth-child(-n+7){justify-self:stretch;text-align:center;}
.code-cell{display:inline-flex;align-items:center;justify-content:flex-start;gap:6px;min-width:0;}
.code-cell .code{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ops{display:flex;gap:6px;justify-content:center;}
.op{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;border:1px solid ${C.line};background:#fff;color:${C.muted};cursor:pointer;transition:.15s;}
.op:hover{border-color:${C.accent};color:${C.accent};}
.op.del:hover{border-color:${C.bad};color:${C.bad};background:${C.badBg};}
.row>span{min-width:0;justify-self:stretch;}
.row>span:nth-child(1),.row>span:nth-child(6){font-variant-numeric:tabular-nums;}
.row>span:nth-child(6){text-align:right;}
.row>span:nth-child(8),.row>span:nth-child(9){text-align:center;}
.row:hover{background:#fafaf8;}
.row.mine{background:#fffbeb;box-shadow:inset 3px 0 0 #f59e0b;}
/* Phiếu khai một bước — nền xanh ngọc để tách hẳn khỏi các phiếu còn đi tiếp quy trình. */
.row.ghinhan{background:#ecfeff;box-shadow:inset 3px 0 0 #0e7490;}
.row.ghinhan:hover{background:#cffafe;}
.tag.ghinhan{background:#cffafe;color:#155e75;}
.tag.hoachat{background:#ede9fe;color:#5b21b6;}
.note.ghinhan{background:#ecfeff;border-color:#a5f3fc;color:#155e75;}
.chem-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;}
.lot-picker{display:flex;flex-direction:column;gap:6px;}
.lot-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.lot-table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;padding:4px 8px;font-weight:600;}
.lot-table td{border-top:1px solid ${C.line};padding:5px 8px;}
.lot-table .lot-code{font-family:inherit;font-size:11.5px;font-variant-numeric:tabular-nums;color:#64748b;}
.lot-table .lot-num{text-align:center;white-space:nowrap;}
.lot-table input{width:84px;text-align:center;padding:6px 8px;}
.row.mine:hover{background:#fef3c7;}
.row.mine .d.cur{background:#f59e0b;box-shadow:0 0 0 3px #f59e0b30;animation:mtwpulse 1.3s ease-in-out infinite;}
.pd{display:inline-block;width:7px;height:7px;border-radius:50%;background:#f59e0b;margin-right:5px;vertical-align:middle;animation:mtwpulse 1.3s ease-in-out infinite;}
@keyframes mtwpulse{0%,100%{opacity:1;}50%{opacity:.35;}}
.wait-cell{display:flex;align-items:center;justify-content:center;min-width:0;white-space:nowrap;}
.wait-badge{display:inline-flex;align-items:center;justify-content:center;min-width:58px;max-width:100%;height:28px;border-radius:8px;background:#eef2f7;padding:0 7px;font-size:12px;font-weight:700;line-height:1;color:${C.soft};white-space:nowrap;}
.wait-badge.warm{color:${C.warn};}
.wait-badge.hot{color:${C.bad};}
.rhead{background:#fbfbfa;font-size:11px;font-weight:700;letter-spacing:.04em;line-height:1.25;text-transform:uppercase;color:${C.soft};cursor:default;min-height:40px;}
.rhead>span{display:flex;align-items:center;justify-content:center;min-width:0;text-align:center;white-space:nowrap;}
.rhead .type-head{display:flex;justify-content:center;}
.rhead .type-head select{border:0;background:transparent;font:inherit;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.soft};cursor:pointer;outline:0;padding:0;max-width:100%;text-align:center;text-align-last:center;}
.rhead .type-head select.filtering{color:${C.navy};}
.code{font-family:inherit;font-weight:600;font-variant-numeric:tabular-nums;color:${C.navy};}
.proposal-cell{display:flex;min-width:0;flex-direction:column;align-items:center;gap:3px;text-align:center;}
.proposal-cell small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${C.muted};font-size:10.5px;font-weight:600;}
.nophieu{display:inline-block;background:${C.warnBg};color:${C.warn};font-size:11px;font-weight:600;padding:3px 8px;border-radius:7px;}
.soft{color:${C.soft};}
.tag{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:4px 9px;border-radius:8px;}
.tag.ung{background:${C.ungBg};color:${C.ung};}
.tag.dx{background:${C.accent}14;color:${C.accent};}
.kind-cell{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;text-align:center;}
.kind-top{display:inline-flex;align-items:center;gap:6px;min-width:0;}
.exp{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:0 0 auto;border-radius:50%;background:#10b981;color:#fff;box-shadow:0 1px 2px rgba(15,23,42,.18);}
.exp.open{background:#f43f5e;}
.detail-inline{min-width:1144px;border-bottom:1px solid ${C.line};background:#f6f8fb;padding:12px 16px;}
.detail-inline .dwrap{position:relative;border:1px solid ${C.line};border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 8px 22px rgba(15,23,42,.07);}
.ticket-detail-layer{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:20px;isolation:isolate;}
.ticket-detail-backdrop{position:absolute;inset:0;z-index:0;border:0;background:rgba(15,35,64,.52);backdrop-filter:blur(5px);cursor:default;animation:ticketBackdropIn .18s ease-out both;}
.ticket-detail-modal{position:relative;z-index:1;display:flex;width:min(1120px,calc(100vw - 40px));max-height:calc(100dvh - 40px);min-height:0;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.76);border-radius:22px;background:#f7f9fc;box-shadow:0 30px 90px rgba(15,35,64,.34),0 2px 0 rgba(255,255,255,.8) inset;outline:0;animation:ticketModalIn .2s ease-out both;}
.ticket-detail-header{position:relative;display:flex;align-items:center;gap:12px;min-width:0;flex:0 0 auto;border-bottom:1px solid #dbe5ef;background:linear-gradient(135deg,#f8fbff 0%,#eef6ff 52%,#f0fdfa 100%);padding:14px 58px 14px 16px;}
.ticket-detail-icon{display:grid;width:42px;height:42px;flex:0 0 42px;place-items:center;border-radius:13px;background:linear-gradient(145deg,${C.navy},#2563eb);color:#fff;box-shadow:0 8px 20px rgba(30,58,95,.22);}
.ticket-detail-heading{display:flex;min-width:0;flex:1;flex-direction:column;gap:2px;}
.ticket-detail-eyebrow{color:#2563eb;font-size:10px;font-weight:850;letter-spacing:.09em;text-transform:uppercase;}
.ticket-detail-heading h2{margin:0;overflow:hidden;color:${C.navy};font-family:inherit;font-size:16px;font-weight:800;line-height:1.3;text-overflow:ellipsis;white-space:nowrap;}
.ticket-detail-heading p{margin:0;color:${C.muted};font-size:11.5px;font-weight:650;}
.ticket-detail-status{display:inline-flex;max-width:240px;flex:0 0 auto;align-items:center;gap:6px;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:800;line-height:1.25;text-align:center;}
.ticket-detail-status i{width:7px;height:7px;flex:0 0 7px;border-radius:50%;box-shadow:0 0 0 3px rgba(255,255,255,.7);}
.ticket-detail-close{position:absolute;top:14px;right:14px;display:grid;width:34px;height:34px;place-items:center;border:1px solid #d6e0eb;border-radius:11px;background:rgba(255,255,255,.9);color:#64748b;cursor:pointer;transition:border-color .15s,background .15s,color .15s,transform .15s;}
.ticket-detail-close:hover{border-color:#fecaca;background:#fff1f2;color:#e11d48;transform:rotate(3deg);}
.ticket-detail-scroll{min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;background:linear-gradient(180deg,#f8fafc 0%,#f4f7fb 100%);}
.ticket-detail-scroll .dwrap{position:relative;min-height:0;background:transparent;}
.ticket-detail-modal .p-body{overflow:visible;padding:16px;}
.ticket-detail-modal .steps{gap:5px;margin:0;padding:10px;border:1px solid #dce6f0;border-radius:16px;background:rgba(255,255,255,.86);box-shadow:0 6px 18px rgba(15,35,64,.055);}
.ticket-detail-modal .step{position:relative;min-height:50px;margin:0;border:1px solid transparent;padding:9px 11px;border-radius:11px;}
.ticket-detail-modal .step.done{border-color:#bbf7d0;background:#f0fdf4;}
.ticket-detail-modal .step.cur{border-color:#bfdbfe;background:#eff6ff;box-shadow:inset 3px 0 0 ${C.accent};}
.ticket-detail-modal .step.recovery-pending{border-color:#fed7aa;background:#fff7ed;box-shadow:inset 3px 0 0 ${C.warn};}
.ticket-detail-modal .step.rejected{border-color:#fecaca;}
.ticket-detail-modal .detail-actions .dclose{display:none;}
@keyframes ticketBackdropIn{from{opacity:0;}to{opacity:1;}}
@keyframes ticketModalIn{from{opacity:0;}to{opacity:1;}}
.dclose{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:0 0 28px;border-radius:8px;border:1px solid ${C.line};background:#f8fafc;color:#64748b;cursor:pointer;}
.dclose:hover{background:#eef2f7;color:#0f172a;}
.activity-toggle{display:inline-flex;align-items:center;gap:6px;height:28px;border:1px solid ${C.line};border-radius:8px;background:#f8fafc;color:${C.navy};padding:0 10px;font-size:11.5px;font-weight:700;white-space:nowrap;cursor:pointer;}
.activity-toggle:hover{border-color:${C.accent};color:${C.accent};}
.detail-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-left:auto;}
.activity-backdrop{position:absolute;inset:0;z-index:4;border:0;background:rgba(15,23,42,.18);cursor:pointer;}
.activity-drawer{position:absolute;z-index:5;top:0;right:0;bottom:0;width:min(380px,42%);background:#fff;box-shadow:-12px 0 32px rgba(15,23,42,.16);transform:translateX(105%);transition:transform .2s ease;display:flex;flex-direction:column;pointer-events:none;}
.activity-drawer.open{transform:translateX(0);pointer-events:auto;}
.activity-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 14px;border-bottom:1px solid ${C.line};}
.activity-head>b{display:flex;align-items:center;gap:7px;color:${C.navy};font-size:13px;}
.activity-list{padding:8px 14px 14px;overflow-y:auto;}
.activity-row{position:relative;display:flex;flex-direction:column;gap:2px;padding:10px 4px 10px 16px;border-bottom:1px solid #edf0f4;}
.activity-row:before{content:"";position:absolute;left:2px;top:15px;width:6px;height:6px;border-radius:50%;background:${C.accent};}
.activity-row time{font-size:10.5px;color:${C.soft};}
.activity-row b{font-size:12px;color:${C.navy};overflow-wrap:anywhere;}
.activity-row span{font-size:11.5px;color:${C.muted};line-height:1.35;}
.kind-sub{display:block;max-width:100%;color:${C.soft};font-size:10.5px;font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.material-name{display:block;min-width:0;color:${C.navy};font-size:13px;font-weight:700;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.d{width:9px;height:9px;border-radius:50%;background:#e2e8f0;}
.d.on{background:${C.ok};}
.d.cur{background:${C.accent};box-shadow:0 0 0 3px ${C.accent}30;}
.st{font-size:11.5px;font-weight:700;padding:5px 10px;border-radius:9px;text-align:center;white-space:nowrap;}
.status-stack{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0;width:100%;text-align:center;}
.status-stack .st{display:inline-block;max-width:100%;box-sizing:border-box;}
.status-stack .status-secondary{display:block;max-width:100%;padding:0 2px;font-size:10.5px;font-weight:700;line-height:1.25;color:${C.warn};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.empty{padding:40px;text-align:center;color:${C.soft};display:flex;gap:8px;align-items:center;justify-content:center;}
.spin{animation:mtwspin 1s linear infinite;}@keyframes mtwspin{to{transform:rotate(360deg);}}
.ovl{position:fixed;inset:0;background:rgba(15,23,42,.38);z-index:40;}
.dlg{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:520px;max-width:94vw;background:#fff;border-radius:18px;z-index:41;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.3);}
.dlg-scroll{max-height:min(92vh,920px);display:flex;flex-direction:column;}
.dlg-h{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid ${C.line};font-family:inherit;color:${C.navy};}
.x{border:0;background:#f1f5f9;border-radius:8px;width:28px;height:28px;display:grid;place-items:center;cursor:pointer;color:#64748b;}
.x.w{position:absolute;top:14px;right:14px;background:rgba(255,255,255,.18);color:#fff;}
.pick{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:18px;}
.card{border:1.5px solid ${C.line};border-radius:14px;padding:18px 14px;background:#fff;cursor:pointer;display:flex;flex-direction:column;gap:8px;align-items:flex-start;text-align:left;transition:.15s;}
.card b{font-family:inherit;font-size:15px;color:${C.navy};}
.card span{font-size:12px;color:${C.muted};line-height:1.45;}
.card.dx:hover{border-color:${C.accent};box-shadow:0 8px 22px ${C.accent}22;}
.card.dx svg{color:${C.accent};}
.card.ung:hover{border-color:${C.ung};box-shadow:0 8px 22px ${C.ung}22;}
.card.ung svg{color:${C.ung};}
.frm{padding:16px;display:flex;flex-direction:column;gap:8px;}
.frm-scroll{min-height:0;overflow-y:auto;padding-bottom:14px;}
.frm label{font-size:12.5px;font-weight:600;color:${C.navy};}
.field{display:flex;flex-direction:column;gap:6px;min-width:0;}
.edit-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:end;}
.bbkt-grid{display:grid;grid-template-columns:minmax(0,1fr) 142px;gap:10px;align-items:end;}
/* Hàng Lý do: 4 lựa chọn chiếm phần rộng, Số lượng bám bên phải — gộp hai trường vào một
   hàng thay vì xếp dọc, ô "nêu rõ" chỉ hiện khi chọn Khác nên không chiếm chỗ trống. */
.reason-grid{display:grid;grid-template-columns:minmax(0,1fr) 118px;gap:10px;align-items:start;}
/* auto-fit chứ không chốt 4 cột: hộp Sửa phiếu đặt ô này ở nửa bề ngang, chốt cứng 4 cột
   thì nhãn dài nhất ("Thay thế") bị cắt chữ; auto-fit thì nó tự xếp 2 hàng. */
.reason-chips{display:grid;grid-template-columns:repeat(auto-fit,minmax(74px,1fr));gap:6px;}
.reason-chips button{min-height:34px;padding:7px 6px;border-radius:8px;border:1.5px solid ${C.line};background:#fff;font-weight:600;font-size:12px;line-height:1.15;color:#64748b;cursor:pointer;white-space:nowrap;transition:border-color .15s ease,background-color .15s ease,color .15s ease;}
.reason-chips button:hover{border-color:#94a3b8;background:#f8fafc;}
.reason-chips button.on{border-color:${C.accent};background:${C.accent}10;color:${C.accent};}
.reason-detail{margin-top:6px;}
/* Hộp Sửa phiếu chia đôi bề ngang; để ô Lý do ăn trọn hàng để 4 lựa chọn nằm một dòng
   thay vì gãy 3+1 trông như xếp hỏng. */
.edit-field-grid .reason-field-wide{grid-column:1 / -1;}
.qty-field input{text-align:center;font-weight:800;color:${C.navy};}
.frm input,.frm select,.act input,.act select,.act textarea,.frm-item select,.frm-item input{border:1.5px solid ${C.line};border-radius:10px;padding:10px 12px;font-size:13px;outline:0;width:100%;background:#fff;}
.cats{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.cats button{padding:10px;border-radius:10px;border:1.5px solid ${C.line};background:#fff;font-weight:600;font-size:13px;cursor:pointer;color:#64748b;transition:.15s;}
.cats button.on{border-color:${C.accent};background:${C.accent}10;color:${C.accent};}
.wfchips{display:flex;flex-wrap:wrap;gap:6px;}
.wfchips button{padding:6px 10px;border-radius:999px;border:1.5px solid ${C.line};background:#fff;font-weight:600;font-size:12px;cursor:pointer;color:#64748b;transition:.15s;}
.wfchips button.on{border-color:${C.accent};background:${C.accent}12;color:${C.accent};}
/* ---- Ma trận phân quyền quy trình: dòng = cương vị, cột = bước ---- */
.wfm-tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
.wfm-search{max-width:240px;}
.wfm-toggle{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:${C.muted};cursor:pointer;}
.wfm-toggle input{width:15px;height:15px;accent-color:${C.accent};cursor:pointer;}
.wfm-count{margin-left:auto;font-size:11.5px;font-weight:700;color:${C.soft};}
/* Modal rộng và bảng fixed để thấy trọn 10 bước, chỉ cần cuộn dọc danh sách cương vị. */
.wfm-dialog{width:min(1200px,calc(100vw - 24px));max-width:none;}
.wfm-scroll{min-height:0;flex:1;overflow-x:hidden;overflow-y:auto;border:1px solid ${C.line};border-radius:12px;background:#fff;scrollbar-gutter:stable;}
.wfm{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed;}
.wfm thead th{position:sticky;top:0;z-index:3;background:${C.cream};border-bottom:1.5px solid ${C.line};padding:7px 4px;vertical-align:bottom;cursor:pointer;user-select:none;min-width:0;transition:background .15s;}
.wfm thead th:hover{background:#ecebe4;}
.wfm thead th.wfm-rowhead{z-index:4;cursor:default;}
.wfm thead th.wfm-rowhead:hover{background:${C.cream};}
.wfm-th-label{display:block;font-size:11.5px;font-weight:800;color:${C.navy};line-height:1.25;}
.wfm-th-sub{display:block;margin-top:2px;font-size:10px;font-weight:700;color:${C.accent};}
.wfm-th-sub.df{color:${C.soft};font-style:italic;}
/* Cột cương vị có độ rộng ổn định; các cột bước chia đều phần còn lại. */
.wfm .wfm-rowhead{position:sticky;left:0;z-index:2;width:180px;background:#fff;text-align:left;font-size:12px;font-weight:700;color:${C.navy};padding:0 12px;min-width:0;max-width:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-right:1.5px solid ${C.line};}
.wfm tbody tr:nth-child(even) .wfm-rowhead{background:#fafaf8;}
.wfm tbody tr:hover .wfm-rowhead,.wfm tbody tr:hover td{background:${C.accent}08;}
.wfm .wfm-rowhead em{margin-left:6px;font-style:normal;font-size:10px;font-weight:800;color:${C.accent};background:${C.accent}14;border-radius:999px;padding:1px 6px;}
.wfm tbody td{text-align:center;padding:3px;border-bottom:1px solid ${C.line}80;}
.wfm tbody tr:nth-child(even) td{background:#fafaf8;}
.wfm tbody tr:last-child td{border-bottom:0;}
.wfm-cell{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border-radius:7px;border:1.5px solid ${C.line};background:#fff;color:#fff;cursor:pointer;transition:.13s;}
.wfm-cell:hover{border-color:${C.accent};box-shadow:0 0 0 3px ${C.accent}18;}
.wfm-cell.on{border-color:${C.accent};background:${C.accent};}
.wfm-empty{padding:22px;text-align:center;font-size:12.5px;font-weight:600;color:${C.soft};}
.material-cards{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.material-cards button{min-height:50px;padding:9px 11px;border-radius:10px;border:1.5px solid ${C.line};background:#fff;text-align:left;color:${C.navy};cursor:pointer;transition:.15s;overflow:hidden;}
.material-cards button:hover{border-color:${C.accent};box-shadow:0 8px 18px rgba(37,99,235,.08);}
.material-cards button.on{border-color:${C.accent};background:${C.accent}0f;box-shadow:0 0 0 1px ${C.accent}22;}
.material-cards button span{display:block;font-size:12.5px;font-weight:800;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.material-cards button small{display:block;margin-top:3px;font-size:10.5px;font-weight:700;color:${C.soft};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.material-empty{grid-column:1/-1;border:1px dashed ${C.line};background:#fbfbfa;border-radius:10px;padding:11px 12px;text-align:center;font-size:12px;font-weight:600;color:${C.soft};}
.device-multi-wrap{display:flex;flex-direction:column;gap:7px;min-width:0;}
.device-multiselect{border:1px solid ${C.line};border-radius:10px;background:#fff;overflow:hidden;transition:border-color .16s ease,box-shadow .16s ease;}
.device-multiselect[open]{border-color:#93c5fd;box-shadow:0 0 0 3px #dbeafe80;}
.device-multiselect.disabled{background:#f8fafc;opacity:.66;pointer-events:none;}
.device-multiselect summary{list-style:none;min-height:40px;padding:7px 11px;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;color:#475569;user-select:none;}
.device-multiselect summary::-webkit-details-marker{display:none;}
.device-multiselect summary>svg{flex:0 0 auto;transition:transform .16s ease;color:#64748b;}
.device-multiselect[open] summary>svg{transform:rotate(90deg);}
.device-multi-summary{display:flex;flex-direction:column;gap:1px;min-width:0;}
.device-multi-summary b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.device-multi-summary small{font-size:10px;color:${C.soft};font-weight:500;}
.device-multi-panel{border-top:1px solid #e8edf3;background:#fbfdff;}
.device-multi-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 9px;border-bottom:1px solid #edf2f7;color:${C.muted};font-size:10.5px;font-weight:700;}
.device-multi-toolbar button{border:0;background:transparent;color:${C.accent};font-size:10.5px;font-weight:800;cursor:pointer;padding:3px 5px;border-radius:5px;}
.device-multi-toolbar button:hover{background:#dbeafe;}
.device-multi-toolbar button:disabled{opacity:.45;cursor:not-allowed;}
.device-multi-options{display:flex;flex-direction:column;max-height:184px;overflow-y:auto;padding:5px;}
.device-multi-options>label{display:grid;grid-template-columns:18px minmax(0,1fr);align-items:center;gap:8px;padding:7px 8px;border-radius:7px;cursor:pointer;color:#334155;transition:background .14s ease,color .14s ease;}
.device-multi-options>label:hover{background:#eff6ff;}
.device-multi-options>label.checked{background:#eaf3ff;color:${C.navy};}
.device-multi-options input{position:absolute;opacity:0;pointer-events:none;}
.device-check{width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;border:1.5px solid #cbd5e1;border-radius:5px;background:#fff;color:transparent;}
.device-multi-options label.checked .device-check{border-color:${C.accent};background:${C.accent};color:#fff;}
.device-multi-options label>span:last-child{display:flex;flex-direction:column;gap:1px;min-width:0;}
.device-multi-options label b{font-size:11.5px;line-height:1.25;white-space:normal;}
.device-multi-options label small{font-size:9.5px;color:${C.soft};}
.device-multi-empty{padding:14px;text-align:center;color:${C.soft};font-size:11px;}
.device-selected-list{display:flex;flex-wrap:wrap;gap:5px;}
.device-selected-list>span{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:4px 5px 4px 7px;border:1px solid #bfdbfe;border-radius:999px;background:#eff6ff;color:#1e40af;font-size:10.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.device-selected-list>span>svg{flex:0 0 auto;}
.device-selected-list>span>button{width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 16px;border:0;border-radius:50%;background:#dbeafe;color:#1e40af;cursor:pointer;padding:0;}
.device-selected-list>span>button:hover{background:#bfdbfe;}
.frm input:focus,.act input:focus,.act textarea:focus{border-color:${C.accent};}
.seg2{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
.seg2 button{padding:10px;border-radius:10px;border:1.5px solid ${C.line};background:#fff;font-weight:600;cursor:pointer;color:#64748b;}
.seg2 button.on{border-color:${C.navy};background:${C.navy};color:#fff;}
.ticket-unit-field{display:grid;grid-template-columns:68px minmax(0,360px);align-items:center;gap:10px;}
.ticket-unit-field>label{margin:0;white-space:nowrap;}
.ticket-unit-options{max-width:360px;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;}
.ticket-unit-options button,.ticket-category-options button{min-height:34px;padding:7px 10px;border-radius:8px;font-size:12px;line-height:1.15;box-shadow:0 1px 2px rgba(15,23,42,.04);transition:border-color .15s ease,background-color .15s ease,color .15s ease,box-shadow .15s ease;}
.ticket-unit-options button:hover,.ticket-category-options button:hover{border-color:#94a3b8;background:#f8fafc;box-shadow:0 2px 5px rgba(15,23,42,.06);}
.ticket-unit-options button.on:hover{border-color:${C.navy};background:${C.navy};}
/* Bảy loại vật tư chia 4 + 3 để các nhãn dài vẫn rõ ràng trong hộp thoại 520px. */
.ticket-category-options{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;}
.ticket-category-options button{padding-left:6px;padding-right:6px;white-space:nowrap;}
.ticket-category-options button.on:hover{border-color:${C.accent};background:${C.accent}10;}
.seg3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
.flow-toggle.single{grid-template-columns:minmax(140px,220px);}
.seg3 button{padding:10px;border-radius:10px;border:1.5px solid ${C.line};background:#fff;font-weight:600;cursor:pointer;color:#64748b;}
.seg3 button.on{border-color:${C.navy};background:${C.navy};color:#fff;}
.seg3 button:disabled{cursor:not-allowed;border-color:#e2e8f0;background:#f8fafc;color:#94a3b8;opacity:.72;}
.act-title-row{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:2px;}
.act-title-row.no-title{justify-content:flex-end;}
.act-title-row .lb{margin-bottom:0;min-width:0;}
.flow-toggle{display:inline-flex;grid-template-columns:none;align-items:center;gap:3px;width:auto;max-width:100%;padding:4px;border:1px solid ${C.accent};border-radius:12px;background:${C.accent};box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 8px 18px ${C.accent}26;}
.flow-toggle button{min-width:92px;height:32px;padding:0 14px;border:0;border-radius:9px;background:transparent;color:#dbeafe;font-size:12.5px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;transition:background .16s ease,color .16s ease,opacity .16s ease;}
.flow-toggle button:hover:not(:disabled){background:rgba(255,255,255,.1);color:#fff;}
.flow-toggle button.on{background:rgba(255,255,255,.18);color:#fff;box-shadow:0 1px 0 rgba(255,255,255,.12),inset 0 0 0 1px rgba(255,255,255,.08);}
.flow-toggle button:disabled{background:transparent;color:#93a4bb;opacity:.52;cursor:not-allowed;}
.receive-location{display:flex;align-items:flex-start;flex-direction:column;gap:2px;min-width:0;flex:1;}
.receive-location span{font-size:12px;font-weight:850;color:${C.navy};letter-spacing:-.01em;white-space:nowrap;}
.receive-location em{min-width:0;font-style:normal;font-size:11px;font-weight:600;color:${C.soft};line-height:1.35;}
.receive-source-toggle{display:inline-flex;grid-template-columns:none;align-items:center;gap:3px;width:auto;max-width:100%;padding:4px;border:1px solid ${C.accent};border-radius:12px;background:${C.accent};box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 8px 18px ${C.accent}26;}
.receive-source-toggle button{min-width:148px;height:34px;padding:0 16px;border:0;border-radius:9px;background:transparent;color:#dbeafe;font-size:12.5px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;transition:background .16s ease,color .16s ease;}
.receive-source-toggle button:hover{background:rgba(255,255,255,.1);color:#fff;}
.receive-source-toggle button.on{background:rgba(255,255,255,.18);color:#fff;box-shadow:0 1px 0 rgba(255,255,255,.12),inset 0 0 0 1px rgba(255,255,255,.08);}
.receive-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:end;}
.receive-field-grid.advance-receive-fields{grid-template-columns:repeat(2,minmax(0,1fr));}
.receive-field-grid .field{min-width:0;margin:0!important;}
.receive-field-grid .field input,.receive-field-grid .field select{width:100%;margin-top:6px;}
.vhv-receive-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:end;min-width:0;}
.vhv-receive-grid.has-receiver{grid-template-columns:repeat(3,minmax(0,1fr));}
.vhv-receive-grid .field{min-width:0;margin:0!important;}
.vhv-receive-grid .field input{width:100%;margin-top:6px;}
.vhv-receive-confirm{width:100%;height:42px;margin:0;padding:0 14px;align-self:end;}
.confirm-field-row{display:grid;grid-template-columns:minmax(280px,1.45fr) minmax(150px,.65fr) minmax(220px,1fr);gap:10px;align-items:end;}
.confirm-field-row.two-even{grid-template-columns:repeat(2,minmax(0,1fr));}
.confirm-field-row.three-even{grid-template-columns:minmax(160px,.7fr) minmax(0,1fr) minmax(0,1fr);}
.confirm-field-row .field{min-width:0;margin:0;}
.confirm-field-row select,.confirm-field-row input{width:100%;}
.erp-readonly-panel{overflow:hidden;border:1px solid #d9e3ef;border-radius:11px;background:#f8fbff;box-shadow:inset 3px 0 0 ${C.accent};}
.erp-readonly-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 12px;border-bottom:1px solid #e2eaf3;background:#f1f6fc;color:${C.navy};}
.erp-readonly-head span{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:800;}
.erp-readonly-head em{border:1px solid #cbd9e8;border-radius:999px;background:white;padding:2px 8px;color:${C.muted};font-size:10px;font-style:normal;font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
.erp-readonly-table{display:grid;}
.erp-readonly-row{display:grid;grid-template-columns:minmax(120px,.75fr) minmax(220px,1.7fr) minmax(120px,.65fr);gap:12px;align-items:center;padding:9px 12px;border-top:1px solid #e8eef5;color:#334155;font-size:12.5px;}
.erp-readonly-row:first-child{border-top:0;}
.erp-readonly-row b{color:${C.navy};font-family:inherit;font-variant-numeric:tabular-nums;}
.erp-readonly-row strong{color:#0f766e;text-align:right;white-space:nowrap;}
.erp-readonly-labels{padding-top:6px;padding-bottom:6px;background:#f8fafc;color:${C.muted};font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.045em;}
.erp-readonly-labels span:last-child{text-align:right;}
.note{display:flex;align-items:center;gap:6px;font-size:12px;border-radius:9px;padding:9px 11px;}
.note.ung{background:${C.ungBg};color:${C.ung};}
/* flex-shrink:0 — hộp thoại ma trận phân quyền cho .frm làm flex column có vùng cuộn;
   thiếu dòng này hàng nút bị co lại khi bảng cao. Các hộp thoại khác không đổi. */
.frm-f{display:flex;justify-content:flex-end;gap:8px;margin-top:6px;flex-shrink:0;}
.frm-scroll .frm-f{position:sticky;bottom:-14px;z-index:2;margin:8px -16px -14px;padding:12px 16px;background:linear-gradient(180deg,rgba(255,255,255,.92),#fff 34%);border-top:1px solid ${C.line};}
.panel{position:fixed;top:0;right:0;height:100%;width:460px;max-width:96vw;background:#fff;z-index:41;display:flex;flex-direction:column;box-shadow:-14px 0 44px rgba(15,23,42,.25);}
.p-h{position:relative;padding:20px;color:#fff;display:flex;flex-direction:column;gap:8px;}
.p-code{font-family:inherit;font-weight:700;font-size:24px;}
.p-sub{display:block;font-size:12px;opacity:.85;margin-top:2px;}
.p-badge{align-self:flex-start;font-size:11.5px;font-weight:700;padding:5px 11px;border-radius:20px;color:#fff;}
.p-body{flex:1;overflow-y:auto;padding:18px;}
.steps{display:flex;flex-direction:column;gap:2px;margin-bottom:16px;}
.step{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:10px;color:${C.soft};}
.step svg{margin-top:1px;flex-shrink:0;}
.step b{display:block;font-size:13px;color:#475569;font-weight:600;}
.step span{font-size:11px;}
.step.done{color:${C.ok};}
.step.done b{color:${C.ok};}
.step.cur{background:${C.accent}0d;color:${C.accent};}
.step.cur b{color:${C.accent};}
.step.rejected{color:${C.bad};background:${C.badBg};}
.step.rejected b{color:${C.bad};}
.lb{display:flex;align-items:center;gap:6px;font-family:inherit;font-weight:600;font-size:12.5px;color:${C.navy};margin-bottom:8px;}
.items{margin-bottom:14px;}
.step-workspace{margin-top:12px;}
.step-workspace .act,.step-workspace .wait{margin-bottom:0;}
.step-workspace .done-note{margin-bottom:8px;}
.item{border:1px solid ${C.line};border-radius:11px;padding:10px 12px;margin-bottom:7px;display:flex;flex-direction:column;gap:2px;font-size:12.5px;}
.item b{font-size:13px;color:${C.navy};}
.material-overview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;align-items:start;min-width:0;}
.material-info-column{display:flex;min-width:0;flex-direction:column;align-items:flex-start;gap:3px;line-height:1.35;}
.material-info-column>b{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.material-info-column-right{align-items:flex-end;text-align:right;}
.material-code-link{flex:0 0 auto;border-radius:7px;background:${C.accent}10;padding:3px 8px;font-family:inherit;font-size:11px;font-weight:800;font-variant-numeric:tabular-nums;color:${C.accent};text-decoration:none;}
.material-code-link:hover{background:${C.accent};color:#fff;}
.material-device-line{display:block;width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.material-bbkt-line{display:block;width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${C.muted};font-size:12px;font-weight:600;}
.material-bbkt-line b{font-size:12px;}
.material-proposal-line{display:flex;width:100%;min-width:0;margin:0;flex-direction:column;align-items:flex-end;gap:3px;font-size:12px;font-weight:600;color:${C.muted};text-align:right;}
.material-proposal-line>span,.material-proposal-line small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.material-proposal-line small{font-size:11px;}
.material-proposal-line b{font-size:12px;color:${C.navy};}
.item.short{border-color:${C.bad};background:${C.badBg};}
.done-note{display:flex;gap:7px;align-items:flex-start;background:${C.okBg};color:${C.ok};border-radius:10px;padding:10px 12px;font-size:12.5px;margin-bottom:10px;}
.pdf{display:inline-flex;align-items:center;gap:7px;border:1.5px solid ${C.navy};color:${C.navy};background:#fff;border-radius:10px;padding:9px 13px;font-weight:600;font-size:13px;cursor:pointer;margin-bottom:12px;text-decoration:none;}
.repair-request-skip{border-color:#94a3b8;color:#64748b;background:#fff;}
.repair-request-skip:disabled{opacity:.55;cursor:not-allowed;}
.pdf-inline{color:${C.navy};font-weight:700;text-decoration:underline;}
.lot-photo-preview-trigger{border:0;background:transparent;padding:0;font:inherit;cursor:pointer;}
.lot-photo-preview-trigger:hover{color:${C.accent};}
.ticket-note-row{display:flex;align-items:center;gap:6px 26px;min-width:0;margin-bottom:8px;flex-wrap:wrap;}
.ticket-note-row .meta-line{display:flex;align-items:baseline;gap:4px;min-width:0;margin:0;}
.ticket-note-row .repair-request-meta{flex:0 1 auto;}
.ticket-note-row b{overflow-wrap:anywhere;}
.completion-overview{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:stretch;min-width:0;}
.completion-overview.with-support{grid-template-columns:minmax(0,1fr) minmax(250px,26%);}
.completion-details{display:flex;min-width:0;flex-direction:column;gap:12px;padding-top:1px;}
.completion-details>.act{margin-bottom:0;}
.completion-summary-card{display:flex;min-width:0;flex-direction:column;gap:9px;border:1px solid ${C.line};border-radius:12px;background:linear-gradient(145deg,#fff 0%,#fbfcfe 100%);padding:13px 14px;box-shadow:0 4px 14px rgba(30,64,175,.05);}
.completion-summary-card .ticket-note-row,.completion-summary-card .done-note,.completion-summary-card .meta-line{margin-bottom:0;}
.completion-support-column{display:flex;min-width:0;align-self:start;flex-direction:column;gap:12px;}
.document-downloads{display:flex;min-width:0;align-self:stretch;flex-direction:column;justify-content:flex-start;gap:12px;border:1px solid #c9ded7;border-radius:12px;background:linear-gradient(145deg,#f7fcfa 0%,#eef8f4 100%);padding:14px;box-shadow:0 4px 14px rgba(15,118,110,.07);}
.document-downloads-head{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;}
.document-downloads-label{display:flex;align-items:center;gap:7px;min-width:0;color:#0f766e;font-size:12.5px;font-weight:800;}
.document-downloads-count{flex:0 0 auto;border-radius:999px;background:#dff3eb;color:#0f766e;padding:3px 7px;font-size:10.5px;font-weight:800;line-height:1.2;}
.document-download-links{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;}
.document-download-links .pdf{justify-content:center;min-width:0;margin:0;padding:12px 14px;border-width:1px;border-color:#8fa7ba;border-radius:9px;font-size:12px;line-height:1.25;text-align:center;white-space:normal;transition:border-color .16s ease,background .16s ease,transform .16s ease;}
.document-download-links .pdf:hover{border-color:#0f766e;background:#fff;transform:translateY(-1px);}
.document-download-links .recovery-download{border-color:#0f766e;background:#ecfdf5;color:#0f766e;}
.meta-line{font-size:12.5px;color:${C.muted};margin-bottom:8px;}
.received-summary{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;}
.received-summary span{display:inline-flex;align-items:center;gap:4px;}
.received-summary em{font-style:normal;color:#94a3b8;}
.source-badge{display:inline-flex;align-items:center;border-radius:999px;background:#e0f2fe;color:#0369a1;padding:2px 8px;font-size:12px;line-height:1.3;}
.act{border:1.5px dashed ${C.accent}66;background:linear-gradient(180deg,#f8fbff 0%,${C.accent}08 100%);border-radius:16px;padding:14px;margin-bottom:16px;display:flex;flex-direction:column;gap:11px;box-shadow:inset 0 1px 0 rgba(255,255,255,.85);}
.act label:not(.lb){display:block;font-size:11.5px;font-weight:600;color:#64748b;margin-bottom:-4px;}
.advance-document-phase{gap:13px;}
.advance-phase-head{display:flex;align-items:center;gap:10px;color:${C.navy};}
.advance-phase-head>div{display:flex;min-width:0;flex-direction:column;gap:2px;}
.advance-phase-head b{font-size:13.5px;}
.advance-phase-head small{color:${C.muted};font-size:11.5px;line-height:1.35;}
.advance-phase-index{display:grid;width:28px;height:28px;flex:0 0 28px;place-items:center;border-radius:9px;background:${C.accent};color:#fff;font-size:12px;font-weight:800;box-shadow:0 4px 10px ${C.accent}30;}
.advance-phase-index.done{background:${C.ok};}
.advance-phase-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:end;}
.advance-phase-grid .field{min-width:0;margin:0!important;}
.advance-phase-grid .field input,.advance-phase-grid .field select{height:42px;margin-top:6px;}
.advance-document-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;}
.advance-document-summary .pdf{justify-content:center;min-width:0;margin:0;border-color:#8fa7ba;font-size:12px;text-align:center;}
.advance-document-summary .recovery-download{border-color:#0f766e;background:#ecfdf5;color:#0f766e;}
.receive-existing-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:end;}
.receive-existing-field{display:flex;min-width:0;flex-direction:column;gap:11px;}
.receive-existing-hint{display:flex;min-height:42px;align-items:center;margin:0;padding:0 2px;line-height:1.45;}
.settlement-number-card{display:flex;flex-direction:column;gap:7px;border:1px solid #bfdbfe;border-radius:12px;background:linear-gradient(145deg,#eff6ff 0%,#f8fbff 100%);padding:13px 15px;box-shadow:0 2px 8px rgba(37,99,235,.06);}
.settlement-number-card .field{margin:0!important;color:${C.navy}!important;font-size:12px!important;font-weight:800!important;}
.settlement-number-card .field input{height:42px;margin-top:7px;background:#fff;}
.settlement-number-card>span{color:#64748b;font-size:11.5px;line-height:1.4;}
.act label.settlement-check{position:relative;display:flex;align-items:center;gap:12px;min-height:52px;margin:0;padding:12px 16px;border:1px solid #dbe3ee;border-radius:12px;background:#fff;color:${C.navy};font-size:13px;font-weight:600;line-height:1.4;cursor:pointer;box-shadow:0 1px 2px rgba(15,35,64,.04);transition:border-color .16s ease,background .16s ease,box-shadow .16s ease;}
.act .settlement-check:hover{border-color:${C.accent}66;background:#fafdff;box-shadow:0 3px 10px rgba(15,35,64,.06);}
.act .settlement-check.checked{border-color:${C.accent}80;background:${C.accent}08;}
.act .settlement-check.disabled{cursor:not-allowed;opacity:.55;}
.act .settlement-check.disabled:hover{border-color:#dbe3ee;background:#fff;box-shadow:0 1px 2px rgba(15,35,64,.04);}
.act .settlement-check input{position:absolute;width:1px;height:1px;margin:0;padding:0;border:0;border-radius:0;background:transparent;opacity:0;pointer-events:none;appearance:none;}
.settlement-check-box{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;box-sizing:border-box;border:1.5px solid #94a3b8;border-radius:6px;background:#fff;color:#fff;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease;}
.settlement-check-label{display:inline-block;min-width:0;color:${C.navy};line-height:1.4;white-space:nowrap;}
.settlement-check.checked .settlement-check-box{border-color:${C.accent};background:${C.accent};box-shadow:0 0 0 3px ${C.accent}18;}
.settlement-check:focus-within .settlement-check-box{box-shadow:0 0 0 3px ${C.accent}24;}
.stats-issue-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:end;}
.stats-issue-grid.single{grid-template-columns:1fr;}
.stats-issue-grid .field{min-width:0;margin:0!important;}
.stats-issue-grid .field input{margin-top:6px;}
.accept-two-grid{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:12px;align-items:end;}
.accept-two-grid .field{min-width:0;margin:0!important;}
.accept-two-grid .field input{height:42px;margin-top:6px;}
.accept-two-grid.one-col{grid-template-columns:minmax(0,1fr);}
.accept-note-grid{align-items:start;}
.accept-note-grid .field textarea{margin-top:6px;width:100%;}
.use-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:end;}
.use-field-grid .field{min-width:0;margin:0!important;}
.use-field-grid .field input{height:42px;margin-top:6px;}
.recovery-quantity-row{display:grid;grid-template-columns:minmax(220px,.75fr) minmax(0,1.25fr);gap:12px;align-items:end;}
.recovery-quantity-row .field{min-width:0;margin:0!important;}
.recovery-quantity-row .field input{height:42px;margin-top:6px;}
.recovery-return-check{display:flex!important;min-height:42px;align-items:center;gap:10px;margin:0!important;border:1px solid ${C.line};border-radius:10px;background:#fff;padding:8px 13px;color:${C.navy};cursor:pointer;transition:border-color .16s,background .16s,box-shadow .16s;}
.recovery-return-check:hover{border-color:#86efac;background:#f7fff9;}
.recovery-return-check.checked{border-color:#22c55e;background:#f0fdf4;box-shadow:0 0 0 2px rgba(34,197,94,.08);}
.recovery-return-check input{width:19px!important;height:19px!important;min-width:19px;margin:0!important;padding:0!important;accent-color:#16a34a;cursor:pointer;}
.recovery-return-check span{display:flex;min-width:0;flex-direction:column;gap:2px;line-height:1.25;}
.recovery-return-check b{font-size:12px;color:${C.navy};}
.recovery-return-check small{font-size:11px;font-weight:700;color:#15803d;}
.recovery-return-check small.cycle{font-weight:600;color:#64748b;}
.act-field-row{display:grid;grid-template-columns:156px minmax(0,1fr);align-items:center;gap:10px;}
.act-field-row label:not(.lb){margin-bottom:0;}
.advance-item-row{display:grid;grid-template-columns:minmax(150px,1.2fr) minmax(150px,1fr) 130px auto;align-items:end;gap:6px;}
.inline-qty-label{margin:0!important;}
.inline-qty-label input{margin-top:5px;text-align:center;font-weight:700;}
.replacement-entry-list{display:flex;flex-direction:column;gap:7px;}
.replacement-group{border:1px solid ${C.line};background:#fff;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;}
.replacement-group-head{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px dashed ${C.line};padding-bottom:8px;}
.replacement-entry-row{display:grid;grid-template-columns:24px minmax(220px,1fr) 150px 30px;align-items:end;gap:8px;}
.replacement-entry-row label{margin:0!important;}
.replacement-entry-row label input,.replacement-entry-row label select{margin-top:5px;}
.replacement-entry-row label input{text-align:center;font-weight:700;}
.replacement-entry-row .mini{height:39px;}
.replacement-entry-row .mini:disabled{opacity:.35;cursor:not-allowed;}
.device-row-number{align-self:center;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#eef2f7;color:${C.navy};font-size:11px;font-weight:800;}
.replacement-material{display:flex;flex-direction:column;gap:2px;min-width:0;}
.replacement-material b{font-size:13px;color:${C.navy};overflow-wrap:anywhere;}
.replacement-material span{font-size:11.5px;color:${C.muted};overflow-wrap:anywhere;}
.confirm-summary{display:flex;flex-direction:column;gap:5px;border:1px solid ${C.line};background:#fff;border-radius:10px;padding:10px 12px;font-size:12.5px;color:${C.muted};}
.confirm-summary b{color:${C.navy};}
.wait{display:flex;align-items:center;gap:7px;background:#f1f5f9;color:#64748b;border-radius:11px;padding:11px 13px;font-size:12.5px;margin-bottom:16px;flex-wrap:wrap;}
.warnbox{display:flex;gap:8px;align-items:flex-start;background:${C.badBg};color:${C.bad};border-radius:10px;padding:10px 12px;font-size:12.5px;}
.lockbox{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:${C.warnBg};color:${C.warn};border-radius:10px;padding:10px 12px;font-size:12.5px;}
.frm-items{display:flex;flex-direction:column;gap:7px;}
.other-ticket-item{display:flex;flex-direction:column;gap:9px;border:1px solid ${C.line};border-radius:12px;background:#fff;padding:11px 12px;}
.other-flow-picker{display:grid;gap:8px;padding:12px 14px;border:1px solid #dbeafe;border-radius:14px;background:linear-gradient(135deg,#f8fbff,#f0fdfa);}
.other-flow-picker>label{margin:0!important;color:${C.navy};font-size:12px;font-weight:850;}
.other-flow-picker .flow-toggle{justify-self:start;}
.other-flow-picker .note{margin:0;}
.other-ticket-item-head{display:grid;grid-template-columns:minmax(0,1fr) 150px;align-items:end;gap:12px;}
.other-ticket-item-head>b{align-self:center;color:${C.navy};font-size:13px;}
.other-ticket-item-head label{margin:0!important;}
.other-ticket-item-head input{margin-top:5px;text-align:center;font-weight:800;}
.other-approve-row,.other-receive-row{display:grid;grid-template-columns:minmax(180px,1fr) minmax(220px,1fr);align-items:end;gap:10px;border:1px solid ${C.line};border-radius:11px;background:#fff;padding:10px 12px;}
.other-approve-row>span,.other-receive-row>span{display:flex;min-width:0;flex-direction:column;gap:3px;}
.other-approve-row b,.other-receive-row b{color:${C.navy};font-size:13px;}
.other-approve-row small,.other-receive-row small{color:${C.muted};font-size:11px;}
.other-receive-row label{margin:0!important;}
.other-receive-row input{margin-top:5px;text-align:center;font-weight:800;}
.frm-item{display:grid;grid-template-columns:1.25fr 1.1fr 1.2fr 64px auto;gap:6px;}
.hint{font-size:11px;color:${C.soft};margin:2px 0 0;}
@media(max-width:700px){.receive-existing-row{grid-template-columns:1fr;}.receive-existing-hint{min-height:0;padding:0;}}
.loglist{border-top:1px dashed ${C.line};padding-top:12px;}
.p-top{display:grid;grid-template-columns:minmax(180px,.55fr) minmax(560px,2fr);gap:4px 20px;align-items:start;}
.p-top .top-items{border-left:1px dashed ${C.line};padding:4px 0 4px 16px;margin-bottom:0;}
.top-items-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:32px;margin:-4px 0 6px;}
.top-items-head .lb{min-width:0;margin:0;}
.p-top .loglist{border-top:0;border-left:1px dashed ${C.line};padding:4px 0 4px 16px;}
@media(max-width:1100px){.p-top{grid-template-columns:1fr;}.p-top .top-items,.p-top .loglist{border-left:0;padding-left:0;border-top:1px dashed ${C.line};padding-top:12px;margin-bottom:10px;}.completion-overview.with-support{grid-template-columns:1fr;}.document-downloads{width:100%;}.activity-drawer{width:min(420px,70%);}}
.logrow{display:flex;align-items:baseline;gap:9px;font-size:12px;padding:5px 0;color:#475569;white-space:nowrap;}
.logrow span{color:${C.soft};white-space:nowrap;}
.logrow b{white-space:nowrap;}
.logrow em{font-style:normal;color:${C.muted};white-space:nowrap;}
@media(max-width:640px){.panel{width:100%;}.detail-inline{min-width:1140px;padding:10px 12px;}.row{min-width:1140px;grid-template-columns:64px minmax(108px,.9fr) minmax(108px,.86fr) minmax(188px,1.36fr) minmax(180px,.95fr) 82px minmax(168px,1fr) 66px 70px;padding:11px 12px;font-size:12.5px;}.tag{padding:4px 7px}.nophieu{padding:3px 6px}.st{padding:5px 8px}.material-cards{grid-template-columns:1fr;}.edit-field-grid,.bbkt-grid,.confirm-field-row,.stats-issue-grid,.accept-two-grid,.use-field-grid,.recovery-quantity-row,.receive-field-grid,.receive-field-grid.advance-receive-fields,.vhv-receive-grid,.advance-phase-grid,.advance-document-summary,.review-receive-row,.review-use-grid,.review-recovery-grid,.review-accept-grid{grid-template-columns:1fr;gap:8px;}.step-review-dialog .frm-f{flex-wrap:wrap;}.step-review-dialog .frm-f>.note{flex-basis:100%;}.step-review-dialog .frm-f>.btn.primary{min-width:132px;}.erp-readonly-row{grid-template-columns:minmax(110px,.8fr) minmax(180px,1.5fr) minmax(110px,.7fr);}.review-receive-toggle{width:100%;}.review-receive-toggle button{flex:1;}.qty-field input{padding-left:8px;padding-right:8px;}}
@media(max-width:640px){.ticket-unit-field{grid-template-columns:58px minmax(0,1fr);gap:8px;}.ticket-unit-options{max-width:none;}.ticket-unit-options button{padding-left:6px;padding-right:6px;}.ticket-category-options{grid-template-columns:repeat(3,minmax(0,1fr));}}
@media(max-width:760px){
  .mtw{padding-bottom:6px;}
  .top-tools{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 44px;grid-template-areas:"search search search" "status status status" "month type more";align-items:center;gap:8px;margin-bottom:12px;padding:10px;border:1px solid #dbe7f3;border-radius:16px;background:linear-gradient(145deg,#fff 0%,#f8fbff 100%);box-shadow:0 5px 18px rgba(15,35,64,.06);}
  .turn{max-width:100%;min-width:0;}
  .turn-spacer{display:none;}
  .tool-search{grid-area:search;width:100%;height:42px;min-width:0;flex:none;border-color:#d7e0ea;background:#fff;}
  .tool-search input{font-size:13px;}
  .filters{grid-area:status;width:100%;max-width:100%;min-width:0;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;}
  .filters::-webkit-scrollbar{display:none;}
  .filters button{flex:0 0 auto;padding:7px 10px;white-space:nowrap;}
  .filters button.mine-tab{padding-left:10px;padding-right:10px;}
  .filters button.status-filter-trigger{min-width:128px;}
  .month-filter{grid-area:month;width:100%;height:40px;min-width:0;align-self:stretch;padding-left:9px;}
  .month-filter select{width:100%;min-width:0;max-width:none;padding-left:6px;padding-right:4px;font-size:11.5px;}
  .month-count{min-width:22px;height:22px;padding:0 5px;font-size:10.5px;}
  .mobile-type-filter{grid-area:type;display:flex;height:40px;min-width:0;align-items:center;gap:5px;border:1px solid #bfdbfe;border-radius:11px;background:#fff;padding:0 8px;color:${C.accent};box-shadow:0 1px 2px rgba(15,23,42,.04);}
  .mobile-type-filter select{width:100%;min-width:0;height:36px;border:0;background:transparent;color:${C.navy};font-size:11.5px;font-weight:800;outline:0;}
  .advanced-filter-trigger{grid-area:more!important;width:44px!important;min-width:44px!important;height:40px!important;justify-content:center!important;padding:0!important;border-radius:11px!important;}
  .advanced-filter-trigger>span{gap:0!important;}
  .advanced-filter-label,.advanced-filter-chevron{display:none!important;}

  .list{width:100%;overflow:visible;border:0;border-radius:0;background:transparent;box-shadow:none;}
  .ticket-pagination{align-items:flex-start;flex-direction:column;gap:12px;margin-top:2px;padding:14px 16px;border-color:#dbe5ef;border-radius:16px;box-shadow:0 5px 16px rgba(15,35,64,.055);}
  .ticket-pagination-summary{font-size:12px;}
  .ticket-pagination-actions{width:100%;justify-content:flex-start;gap:8px;}
  .ticket-pagination-actions button{width:34px;height:34px;}
  .ticket-page-indicator{min-width:52px;}
  .rhead{display:none;}
  .row:not(.rhead){position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"code kind" "material material" "position position" "proposal quantity" "status wait";gap:10px 12px;width:100%;min-width:0;min-height:0;margin:0 0 10px;padding:13px 14px;border:1px solid #dbe5ef;border-radius:16px;background:#fff;box-shadow:0 5px 16px rgba(15,35,64,.065);font-size:12.5px;text-align:left;overflow:hidden;}
  .row:not(.rhead):hover{background:#fff;}
  .row:not(.rhead).mine{border-color:#f6d381;background:linear-gradient(145deg,#fffdf5 0%,#fffbeb 100%);box-shadow:inset 3px 0 0 #f59e0b,0 5px 16px rgba(146,92,8,.08);}
  .row:not(.rhead).mine:hover{background:#fffbeb;}
  .row:not(.rhead).ghinhan{border-color:#a5e8ef;background:linear-gradient(145deg,#f7feff 0%,#ecfeff 100%);box-shadow:inset 3px 0 0 #0e7490,0 5px 16px rgba(14,116,144,.08);}
  .row:not(.rhead)>span,.row:not(.rhead)>span:nth-child(n+2):nth-child(-n+7){min-width:0;justify-self:stretch;text-align:left;}
  .code-cell{grid-area:code;justify-content:flex-start;align-self:start;padding-right:42px;}
  .code-cell:before{content:"STT";color:#94a3b8;font-size:9px;font-weight:850;letter-spacing:.08em;}
  .code-cell .code{font-size:14px;font-weight:850;}
  .exp{width:20px;height:20px;flex-basis:20px;}
  .kind-cell{grid-area:kind;align-items:flex-end;padding-right:72px;text-align:right;}
  .kind-sub{font-size:10px;}
  .material-name{grid-area:material;display:-webkit-box;padding-top:9px;border-top:1px dashed #dbe3ec;color:${C.navy};font-size:14px;font-weight:800;line-height:1.45;text-align:left;white-space:normal;overflow:hidden;text-overflow:ellipsis;-webkit-box-orient:vertical;-webkit-line-clamp:2;}
  .position-cell{grid-area:position;display:flex;align-items:center;gap:8px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .position-cell:before{content:"Cương vị";flex:0 0 auto;color:#94a3b8;font-size:9.5px;font-weight:850;letter-spacing:.04em;text-transform:uppercase;}
  .proposal-cell,.quantity-cell{min-height:50px;border:1px solid #e5eaf0;border-radius:11px;background:#f8fafc;padding:7px 9px;}
  .proposal-cell{grid-area:proposal;align-items:flex-start;text-align:left;}
  .proposal-cell:before,.quantity-cell:before{display:block;margin-bottom:4px;color:#94a3b8;font-size:9px;font-weight:850;letter-spacing:.05em;text-transform:uppercase;}
  .proposal-cell:before{content:"Đề xuất / ngày giao";}
  .quantity-cell{grid-area:quantity;display:block;color:${C.navy};font-weight:750;line-height:1.35;}
  .quantity-cell:before{content:"Số lượng";}
  .proposal-cell .nophieu{max-width:100%;padding:3px 6px;font-size:10px;line-height:1.35;white-space:normal;}
  .status-stack{grid-area:status;align-items:flex-start;justify-content:center;text-align:left;}
  .status-stack .st{max-width:100%;padding:5px 8px;font-size:10.5px;white-space:normal;line-height:1.3;text-align:left;}
  .status-stack .status-secondary{padding-left:0;text-align:left;white-space:normal;}
  .wait-cell{grid-area:wait;justify-content:flex-end;align-self:center;}
  .wait-badge{min-width:62px;height:27px;font-size:11px;}
  .ops{position:absolute;z-index:1;top:11px;right:11px;justify-content:flex-end;}
  .ops .soft{display:none;}
  .op{width:30px;height:30px;border-color:#dbe3ec;background:rgba(255,255,255,.9);}
  .ticket-detail-layer{place-items:end center;padding:8px 8px calc(74px + env(safe-area-inset-bottom));}
  .ticket-detail-modal{width:100%;max-height:calc(100dvh - 92px);border-radius:22px 22px 18px 18px;}
  .ticket-detail-header{align-items:flex-start;gap:10px;padding:13px 46px 12px 12px;}
  .ticket-detail-icon{width:38px;height:38px;flex-basis:38px;border-radius:12px;}
  .ticket-detail-eyebrow{font-size:9px;letter-spacing:.065em;}
  .ticket-detail-heading h2{display:-webkit-box;font-size:14px;line-height:1.35;white-space:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2;}
  .ticket-detail-heading p{font-size:10.5px;}
  .ticket-detail-status{position:absolute;right:46px;bottom:-14px;z-index:2;max-width:190px;padding:5px 8px;border:1px solid rgba(255,255,255,.9);background-color:#fff!important;font-size:9.5px;box-shadow:0 4px 12px rgba(15,35,64,.1);}
  .ticket-detail-close{top:12px;right:10px;width:32px;height:32px;border-radius:10px;}
  .ticket-detail-modal .p-body{padding:20px 10px 10px;}
  .ticket-detail-modal .steps{gap:4px;padding:6px;border-radius:14px;}
  .ticket-detail-modal .step{min-height:48px;padding:8px 9px;}
  .ticket-detail-modal .step b{font-size:12.5px;}
  .ticket-detail-modal .step span{font-size:10.5px;line-height:1.35;}
  .ticket-detail-modal .material-overview-grid{grid-template-columns:1fr;gap:8px;}
  .ticket-detail-modal .material-info-column-right{align-items:flex-start;text-align:left;}
  .ticket-detail-modal .material-proposal-line{align-items:flex-start;text-align:left;}
  .empty{min-height:112px;margin-bottom:10px;border:1px dashed #cbd5e1;border-radius:16px;background:#fff;padding:24px 16px;font-size:12.5px;}

  .act-title-row{align-items:stretch;flex-direction:column;gap:8px;}
  .receive-location{width:100%;align-items:flex-start;flex-direction:column;gap:3px;}
  .flow-toggle,.receive-source-toggle{width:100%;}
  .flow-toggle button,.receive-source-toggle button{flex:1;min-width:0;padding:0 8px;}
  .act-field-row,.advance-item-row{grid-template-columns:1fr;gap:6px;}
  .replacement-entry-row{grid-template-columns:24px minmax(0,1fr) 120px 30px;}
  .activity-drawer{width:86%;}
}
`;
