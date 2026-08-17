"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, Minus, X, Check, FileText, Zap, FlaskConical, ClipboardList, Package, Clock, ChevronRight,
  AlertTriangle, Ban, Download, CircleCheck, Circle, CircleDot, Loader2, Pencil, Trash2, UserCog, CalendarDays,
  Filter, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useMaterialTickets, useTicketOptions, useCreateTicket, useTicketAction, useDeleteTicket,
  useWorkflowRoles, useSaveWorkflowRoles, actionsFor,
  useTicketLots,
  type MaterialTicket, type TicketViewer, type WorkflowRoleMap,
} from "@/hooks/useMaterialTickets";
import { usePositions } from "@/hooks/useUsers";
import { displayMaterialCategory, isChemicalFlowTicket, isSingleStepTicketMaterial, CHEMICAL_TICKET_TYPE, isSupplementReason, MATERIAL_CATEGORIES, materialTicketRequiresRecovery, TICKET_REASONS, TICKET_REASON_OTHER, SINGLE_STEP_TICKET_TYPE, TICKET_MATERIAL_CATEGORIES, TICKET_TO_MATERIAL_CATEGORY } from "@/lib/constants";
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
    { key: "CHO_NGHIEM_THU", label: "Nghiệm thu và xuất BBNT", who: "Theo phân quyền quy trình" },
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
  // Khai một bước (NH3 lỏng): lập phiếu là xong, không có bước nào để thao tác tiếp.
  [SINGLE_STEP_TICKET_TYPE]: [
    { key: "B0", label: "VHV tạo đề xuất", who: "VHV" },
  ],
  SU_DUNG_HIEN_CO: [
    { key: "B0", label: "VHV tạo đề xuất", who: "VHV" },
    { key: "XAC_NHAN_HIEN_CO", label: "Trưởng ca/Trưởng kíp xác nhận", who: "Trưởng ca/Trưởng kíp" },
    { key: "NHAN_TU_HIEN_CO", label: "Xác nhận vật tư lãnh", who: "Theo phân quyền quy trình" },
    { key: "SU_DUNG_VAT_TU", label: "Xác nhận vật tư sử dụng", who: "Theo phân quyền quy trình" },
    { key: "CHO_NGHIEM_THU", label: "Nghiệm thu và xuất BBNT", who: "Theo phân quyền quy trình" },
    { key: "CHO_THONG_KE_XUAT_BIEN_BAN", label: "Thống kê xác nhận mã vật tư", who: "Thống kê" },
    { key: "CHO_QUYET_TOAN", label: "Quyết toán vật tư", who: "Thống kê" },
  ],
};
const ORDER: Record<string, string[]> = {
  CHUA_CHON: ["B0", "CHO_XAC_NHAN"],
  [SINGLE_STEP_TICKET_TYPE]: ["B0", "HOAN_TAT"],
  [CHEMICAL_TICKET_TYPE]: ["B0", "CHO_THONG_KE", "CHO_PHIEU__XUAT_KHO", "NHAN_VAT_TU", "HOAN_TAT"],
  DE_XUAT: ["B0", "CHO_THONG_KE", "CHO_PHIEU__XUAT_KHO", "NHAN_VAT_TU", "SU_DUNG_VAT_TU", "CHO_NGHIEM_THU", "CHO_QUYET_TOAN", "HOAN_TAT"],
  UNG: ["B0", "VHV_LANH_VAT_TU", "SU_DUNG_VAT_TU", "CHO_NGHIEM_THU", "NHAN_VAT_TU", "CHO_PHIEU__XUAT_KHO", "CHO_QUYET_TOAN", "HOAN_TAT"],
  SU_DUNG_HIEN_CO: ["B0", "XAC_NHAN_HIEN_CO", "NHAN_TU_HIEN_CO", "SU_DUNG_VAT_TU", "CHO_NGHIEM_THU", "CHO_THONG_KE_XUAT_BIEN_BAN", "CHO_QUYET_TOAN", "HOAN_TAT"],
};
const flowStatusKey = (status: string, type: string) =>
  (type === "DE_XUAT" || type === CHEMICAL_TICKET_TYPE) && status === "CHO_XAC_NHAN" ? "CHO_THONG_KE"
  : type === "DE_XUAT" && status === "CHO_THONG_KE_XUAT_BIEN_BAN" ? "CHO_NGHIEM_THU"
  : status === "CHO_THONG_KE" ? "CHO_PHIEU__XUAT_KHO"
  : status === "CHO_XAC_NHAN_PHAT" ? "CHO_PHIEU__XUAT_KHO"
  : status === "CHO_PHIEU_YCSC" ? "NHAN_VAT_TU"
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
// Dùng chung một nhãn khiến phiếu "Sử dụng hiện có" hiện "Lãnh ngoài" — sai nghĩa.
const receiptSourceLabel = (source?: string | null, ticketType?: string | null) => {
  if (ticketType === "SU_DUNG_HIEN_CO") return "Lấy từ Hiện có";
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
/* Số ngày phiếu đứng ở bước hiện tại = hôm nay - mốc thao tác gần nhất trên phiếu */
const waitDaysOf = (t: MaterialTicket) => {
  const stamps = [t.createdAt, t.proposedAt, t.confirmedAt, t.statsAt, t.receivedAt, t.usedAt, t.completedAt]
    .filter(Boolean)
    .map((s) => new Date(s as string).getTime());
  return Math.max(0, Math.floor((Date.now() - Math.max(...stamps)) / 86_400_000));
};

export default function MaterialTicketBoard({
  creating = false,
  searchQ = "",
  onCloseCreate,
}: {
  creating?: boolean;
  searchQ?: string;
  onCloseCreate?: () => void;
} = {}) {
  const [monthFilter, setMonthFilter] = useState(() => materialTicketMonthKey());
  const { data, isLoading } = useMaterialTickets(monthFilter);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState("ALL");
  const [unitFilter, setUnitFilter] = useState("ALL");
  // Lọc theo luồng phiếu (cột Yêu cầu): Đề xuất / Ứng / Sử dụng hiện có.
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [editTicket, setEditTicket] = useState<MaterialTicket | null>(null);
  const [delTicket, setDelTicket] = useState<MaterialTicket | null>(null);
  const del = useDeleteTicket();

  const tickets = data?.tickets ?? [];
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
        // Tab "Thu hồi": các phiếu có vật tư thu hồi (đã xuất hoặc sẽ xuất biên bản thu hồi)
        : filter === "RECOVERY" ? Boolean(materialTicketRequiresRecovery(t) || t.recoveryDocUrl)
        : t.status === filter;
      const ticketCategory = t.materialCategory ? TICKET_TO_MATERIAL_CATEGORY[t.materialCategory] ?? t.materialCategory : "";
      const matchesMaterialCategory = materialCategoryFilter === "ALL" || ticketCategory === materialCategoryFilter;
      const matchesUnit = unitFilter === "ALL" || t.unit === unitFilter;
      const matchesType = typeFilter === "ALL" || t.type === typeFilter;
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

  return (
    <div className="mtw">
      <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="top-tools">
        <div className="filters">
          <button className={`mine-tab ${filter === "MINE" ? "on" : ""}`} onClick={() => setFilter("MINE")}>
            <Zap size={13} /> Đến lượt bạn
            <span className="mine-count">{myTurn.length}</span>
          </button>
          {[["ALL", "Tất cả"], ["RUNNING", "Đang thực hiện"], ["HOAN_TAT", "Hoàn tất"], ["CHEMICAL", "Hóa chất"], ["RECOVERY", "Thu hồi"]].map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="turn-spacer" />
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
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="soft"
              size="toolbar"
              className={`group min-w-[112px] justify-between ${activeFilterCount > 0 ? "border-sky-200 bg-sky-50 text-sky-800" : ""}`}
            >
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-sky-600" />
                Bộ lọc
                {activeFilterCount > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-navy px-1.5 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
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
                  {MATERIAL_CATEGORIES.map((c) => <option key={c} value={c}>{displayMaterialCategory(c)}</option>)}
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
          <span>Số thứ tự</span>
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
          <span>Cương vị</span><span>Tên vật tư</span><span>Phiếu đề xuất</span><span>Số lượng</span><span>Trạng thái</span><span>Chờ</span><span>Thao tác</span>
        </div>
        {isLoading && <div className="empty"><Loader2 className="spin" size={18} /> Đang tải…</div>}
	        {!isLoading && shown.map((t) => {
		          const baseMeta = t.type === CHEMICAL_TICKET_TYPE && t.status === "CHO_XAC_NHAN"
		            ? { label: "Chờ xác nhận bồn/thiết bị", c: "#7c3aed" }
		            : t.type === CHEMICAL_TICKET_TYPE && t.status === "CHO_THONG_KE"
		            ? { label: "Chờ xác nhận đề xuất", c: "#7c3aed" }
		            : t.type === CHEMICAL_TICKET_TYPE && t.status === "NHAN_VAT_TU"
		            ? { label: "Chờ VHV xác nhận lãnh", c: "#7c3aed" }
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
            >
              <span className="code-cell">
                <span className={`exp ${isOpen ? "open" : ""}`} title={isOpen ? "Thu gọn" : "Mở chi tiết"}>
                  {isOpen ? <Minus size={12} /> : <Plus size={12} />}
                </span>
                <span className="code">{t.sequenceNumber}</span>
              </span>
              <span className="kind-cell">
                {t.type === SINGLE_STEP_TICKET_TYPE
                  ? <span className="tag ghinhan"><FlaskConical size={11} /> Ghi nhận</span>
                  : t.type === CHEMICAL_TICKET_TYPE
                  ? <span className="tag hoachat"><FlaskConical size={11} /> Hóa chất</span>
                  : t.type === "UNG"
                  ? <span className="tag ung"><Zap size={11} /> Ứng</span>
                  : t.type === "CHUA_CHON"
                    ? <span className="tag"><Clock size={11} /> Chờ chọn luồng</span>
                    : t.type === "SU_DUNG_HIEN_CO"
                      ? <span className="tag dx"><Package size={11} /> Sử dụng hiện có</span>
                    : <span className="tag dx"><ClipboardList size={11} /> Đề xuất</span>}
                <small className="kind-sub">{t.unit}{t.materialCategory ? ` · ${displayMaterialCategory(t.materialCategory)}` : ""}</small>
              </span>
              <span>{t.assignedPosition}</span>
              <span className="material-name" title={materialText}>{materialText}</span>
              <span className="proposal-cell">
                {t.proposalNumber
                  ? <span className="code">{t.proposalNumber}</span>
                  : <span className="nophieu">{t.type === "SU_DUNG_HIEN_CO" ? "Không cần phiếu đề xuất" : "Chưa có phiếu đề xuất"}</span>}
              </span>
              <span>{t.items.some((i) => i.quantity > 0) ? t.items.filter((i) => i.quantity > 0).map((i) => `${i.quantity} ${i.material.unit}`).join(", ") : "Chưa nhập"}</span>
	              <span className="status-stack">
	                <span className="st status-primary" style={{ color: baseMeta.c, background: baseMeta.c + "16" }}>
	                  {mine && <i className="pd" />}{baseMeta.label}
	                </span>
	                {recoveryPending && (
	                  <span className="st status-secondary" style={{ color: C.warn, background: C.warn + "16" }}>
	                    Chờ xác nhận trả vật tư thu hồi
	                  </span>
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
                {canEdit && (
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
            {/* Chi tiết bung ngay dưới dòng — cùng kiểu panel chi tiết của bảng Danh mục vật tư */}
            {isOpen && (
              <div className="detail-inline">
                <div className="dwrap">
                  <Detail t={t} viewer={viewer} onClose={() => setOpenId(null)} />
                </div>
              </div>
            )}
            </React.Fragment>
          );
        })}
        {!isLoading && shown.length === 0 && (
          <div className="empty">{filter === "MINE" ? "☕ Không có phiếu nào chờ bạn xử lý." : "Không có phiếu nào."}</div>
        )}
      </div>

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
const CATEGORIES = TICKET_MATERIAL_CATEGORIES;
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
  const { data: opts } = useTicketOptions(true); // lấy danh sách cương vị
  const create = useCreateTicket();
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
      const res = await create.mutateAsync({
        unit, note: note.trim() || undefined,
        assignedPosition: assigned, materialCategory: category,
        materialId: selectedMaterialId || undefined,
        proposedQuantity,
        replacementDeviceSeqs,
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

            {type && (
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

            {type === "DE_XUAT" ? (
              <>
                <div className="reason-grid">
                  <div className="field">
                    <label>Lý do *</label>
                    <ReasonPicker choice={reasonChoice} detail={reasonDetail} onChoice={setReasonChoice} onDetail={setReasonDetail} />
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
                  !selectedMaterialId ||
                  !note.trim() || proposedQuantity <= 0 || replacementDeviceSeqs.length === 0
                }
                onClick={submit}>
                {create.isPending ? <Loader2 className="spin" size={14} /> : <Plus size={14} />} Tạo đề xuất
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
  { key: "use", short: "Sử dụng", label: "Sử dụng vật tư (PCT/LCT + khối lượng dùng)", hint: "Trống = mặc định: Trưởng Ca/Trưởng Kíp" },
  { key: "accept", short: "Nghiệm thu", label: "Nghiệm thu và xuất BBNT", hint: "Trống = mặc định: Trưởng Ca/Trưởng Kíp" },
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
  const [bbkt, setBbkt] = useState(t.bbktNumber ?? "");
  const [assigned, setAssigned] = useState(t.assignedPosition);
  const [category, setCategory] = useState(t.materialCategory ?? "");
  const [selectedMaterialId, setSelectedMaterialId] = useState(t.items[0]?.materialId ?? "");
  const [selectedErpCode, setSelectedErpCode] = useState(t.items[0]?.erpCode ?? "");
  const [proposedQuantity, setProposedQuantity] = useState(t.items[0]?.quantity ?? 1);
  const initialReason = splitReason(t.proposalNote);
  const [reasonChoice, setReasonChoice] = useState(initialReason.choice);
  const [reasonDetail, setReasonDetail] = useState(initialReason.detail);
  const note = joinReason(reasonChoice, reasonDetail);
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
        action: "editInfo", unit, bbktNumber: bbkt.trim() || undefined,
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
                  <ReasonPicker choice={reasonChoice} detail={reasonDetail} onChoice={setReasonChoice} onDetail={setReasonDetail} />
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

          <div className="field">
            <label>Số biên bản kiểm tra (nếu có)</label>
            <input value={bbkt} onChange={(e) => setBbkt(e.target.value)} placeholder="Nhập số biên bản kiểm tra" />
          </div>

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
  choice, detail, onChoice, onDetail,
}: { choice: string; detail: string; onChoice: (v: string) => void; onDetail: (v: string) => void }) {
  return (
    <>
      <div className="reason-chips">
        {TICKET_REASONS.map((item) => (
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
function Detail({ t, viewer, onClose }: { t: MaterialTicket; viewer: TicketViewer | null; onClose: () => void }) {
  const [showActivity, setShowActivity] = useState(false);
  const [reviewStep, setReviewStep] = useState<string | null>(null);
  const flow = FLOW[t.type];
  const order = ORDER[t.type];
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
  const hasCompletionSummary = Boolean(
    (t.type !== "UNG" && t.pctNumber)
    || t.repairRequestNumber
    || t.completionNote
    || t.bbntDoNumber
    || t.receivedQuantity != null
    || t.vhvReceivedQuantity != null
    || t.usedQuantity != null,
  );
  const activityLogs = [
    t.createdAt && { at: t.createdAt, who: t.createdByName, what: "Tạo phiếu" },
    t.proposedAt && { at: t.proposedAt, who: t.proposedByName, pos: t.proposedByPosition, what: t.type === "UNG" ? "Nhập liệu thay thế" : "Đề xuất vật tư" },
    t.confirmedAt && { at: t.confirmedAt, who: t.confirmedByName, pos: t.confirmedByPosition, what: "Xác nhận — kho đủ" },
    t.vhvReceivedAt && { at: t.vhvReceivedAt, who: t.vhvReceivedByName, pos: t.vhvReceivedByPosition, what: `VHV lãnh ${t.vhvReceivedQuantity ?? ""}${t.repairRequestNumber ? ` · Số yêu cầu sửa chữa ${t.repairRequestNumber}` : ""}` },
    t.statsAt && { at: t.statsAt, who: t.statsByName, pos: t.statsByPosition, what: `Xác nhận ĐXVT: ${t.proposalNumber ?? ""}${t.proposalReceiverName ? ` · VHV nhận: ${t.proposalReceiverName}` : ""}` },
    t.proposalIssuedAt && !t.statsAt && { at: t.proposalIssuedAt, who: t.statsByName, pos: t.statsByPosition, what: `Xác nhận ĐXVT${t.proposalReceiverName ? ` · VHV nhận: ${t.proposalReceiverName}` : ""}` },
    t.receivedAt && { at: t.receivedAt, who: t.receivedByName, pos: t.receivedByPosition, what: [
      `Xác nhận vật tư lãnh: ${t.receivedQuantity ?? ""}`,
      receiptSourceLabel(t.receiptSource, t.type),
      // Luồng Sử dụng hiện có không có phiếu giao hàng — in "—" chỉ tố thêm nghi ngờ thiếu dữ liệu.
      (t.deliveryNoteNumber ?? t.receivedMethod) ? `Phiếu giao hàng ${t.deliveryNoteNumber ?? t.receivedMethod}` : "",
    ].filter(Boolean).join(" · ") },
    t.usedAt && { at: t.usedAt, who: t.usedByName, pos: t.usedByPosition, what: `Sử dụng vật tư${t.materialUserName ? ` — VHV: ${t.materialUserName}` : ""}: dùng ${t.usedQuantity ?? ""}, còn lại ${t.remainingQuantity ?? ""}` },
    t.completedAt && { at: t.completedAt, who: t.completedByName, pos: t.completedByPosition, what: `Nghiệm thu, xuất BBNT ký tay${materialTicketRequiresRecovery(t) ? " và BBTHVT" : ""}` },
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
                      <span>{it.quantity > 0 ? `Số lượng đề xuất: ${it.quantity} ${it.material.unit}` : "Số lượng đề xuất: Chưa nhập"} · Hiện có: {it.material.quantity}{short ? " — THIẾU" : ""}</span>
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
            <div className={`completion-overview ${exportedDocumentCount > 0 ? "with-documents" : ""}`}>
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
                        <em>{t.type === "SU_DUNG_HIEN_CO" ? "lấy từ số đang có, kho trừ ở bước sử dụng" : "đã cộng vào số lượng hiện có"}</em>
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
              </div>

              {exportedDocumentCount > 0 && (
              <div className="document-downloads" aria-label="Biên bản đã xuất">
                <div className="document-downloads-head">
                  <span className="document-downloads-label"><FileText size={14} /> Biên bản đã xuất</span>
                  <span className="document-downloads-count">{exportedDocumentCount} tệp</span>
                </div>
                <div className="document-download-links">
                  {t.proposalDocUrl && <a className="pdf" href={t.proposalDocUrl} target="_blank" rel="noreferrer"><Download size={14} /> Phiếu Đề Xuất Vật Tư</a>}
                  {handwrittenBbntUrl && <a className="pdf" href={handwrittenBbntUrl} target="_blank" rel="noreferrer"><Download size={14} /> Biên Bản Nghiệm Thu Ký Tay</a>}
                  {t.docUrl && <a className="pdf" href={t.docUrl} target="_blank" rel="noreferrer"><Download size={14} /> Biên Bản Nghiệm Thu D-Office</a>}
                  {recoveryDocumentUrl && <a className="pdf recovery-download" href={recoveryDocumentUrl} target="_blank" rel="noreferrer"><Download size={14} /> Biên Bản Vật Tư Thu Hồi</a>}
                </div>
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
  const permission: keyof NonNullable<TicketViewer["steps"]> | null = ({ CHO_THONG_KE: "confirm", CHO_PHIEU__XUAT_KHO: "stats", CHO_XAC_NHAN_PHAT: "stats", NHAN_VAT_TU: "receive", SU_DUNG_VAT_TU: "use", CHO_NGHIEM_THU: "accept" } as const)[stepKey as "CHO_THONG_KE" | "CHO_PHIEU__XUAT_KHO" | "CHO_XAC_NHAN_PHAT" | "NHAN_VAT_TU" | "SU_DUNG_VAT_TU" | "CHO_NGHIEM_THU"] ?? null;
  const canEdit = !!permission && !!viewer?.steps?.[permission];
  const editStep = permission;
  const [proposalNumber, setProposalNumber] = useState(t.proposalNumber ?? "");
  const [proposalReceiverNameReview, setProposalReceiverNameReview] = useState(t.proposalReceiverName ?? "");
  const [receivedQuantity, setReceivedQuantity] = useState(t.receivedQuantity ?? 1);
  const [receivedMethod, setReceivedMethod] = useState(t.deliveryNoteNumber ?? t.receivedMethod ?? "");
  const [receiptSource, setReceiptSource] = useState<"ERP" | "EXISTING">(normalizeReceiptSource(t.receiptSource));
  const [usedQuantity, setUsedQuantity] = useState(t.usedQuantity ?? 1);
  const [materialUserName, setMaterialUserName] = useState(t.materialUserName ?? "");
  const [recoveryQuantity, setRecoveryQuantity] = useState(t.recoveryQuantity ?? 1);
  const [recoveryReturned, setRecoveryReturned] = useState(!!t.recoveryReturnedAt);
  const [pctNumber, setPctNumber] = useState(t.pctNumber ?? "");
  const [chiHuyName, setChiHuyName] = useState(t.chiHuyName ?? "");
  const [completionNote, setCompletionNote] = useState(t.completionNote ?? "");
  const [bbktNumber, setBbktNumber] = useState(t.bbktNumber ?? "");
  const [reason, setReason] = useState(t.proposalNote ?? "");
  const [workStartedAt, setWorkStartedAt] = useState(datetimeLocalValue(t.workStartedAt));
  const [workEndedAt, setWorkEndedAt] = useState(datetimeLocalValue(t.workEndedAt));

  const label = FLOW[t.type].find((step) => step.key === stepKey)?.label ?? "Chi tiết bước";
  async function save() {
    if (!editStep) return;
    const payload: Record<string, unknown> = { action: "editStep", step: editStep };
    if (editStep === "confirm") Object.assign(payload, { note: reason.trim(), bbktNumber });
    if (editStep === "stats") Object.assign(payload, { proposalNumber, proposalReceiverName: proposalReceiverNameReview });
    if (editStep === "receive") Object.assign(payload, { receivedQuantity, deliveryNoteNumber: receivedMethod, receiptSource });
    if (editStep === "use") Object.assign(payload, {
      usedQuantity,
      materialUserName: materialUserName.trim(),
      ...(materialTicketRequiresRecovery(t) ? { recoveryQuantity, recoveryReturned } : {}),
    });
    if (editStep === "accept") Object.assign(payload, {
      pctNumber,
      chiHuyName,
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
      <div className="frm">
        {!permission && <p className="note">Bước này được xem lại trong thông tin tổng quan của phiếu.</p>}
        {editStep === "confirm" && <>
          <label>Luồng thực hiện<input value={t.type === "DE_XUAT" ? "Đề xuất" : t.type === "UNG" ? "Ứng" : "Sử dụng hiện có"} disabled /></label>
          <label>Mã vật tư ERP<input value={t.items[0]?.erpCode ?? "—"} disabled /></label>
          <label>Tên vật tư ERP<input value={t.items[0]?.erpName ?? t.items[0]?.material.name ?? "—"} disabled /></label>
          <label>Số lượng đã xác nhận<input value={`${t.items[0]?.quantity ?? 0} ${t.items[0]?.material.unit ?? ""}`} disabled /></label>
          <label>Lý do *<input value={reason} disabled={!canEdit} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do thay thế vật tư" /></label>
          <label>Số biên bản kiểm tra (nếu có)<input value={bbktNumber} disabled={!canEdit} onChange={(e) => setBbktNumber(e.target.value)} placeholder="Chưa nhập số biên bản kiểm tra" /></label>
        </>}
        {editStep === "stats" && <>
          <label>Số phiếu ĐXVT<input value={proposalNumber} disabled={!canEdit} onChange={(e) => setProposalNumber(e.target.value)} /></label>
          {t.type !== "UNG" && <label>Tên VHV nhận phiếu ĐXVT<input value={proposalReceiverNameReview} disabled={!canEdit} onChange={(e) => setProposalReceiverNameReview(e.target.value)} /></label>}
        </>}
        {editStep === "receive" && <>
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
        </>}
        {(editStep === "use") && <>
          <div className="review-use-grid">
            <label>Tên VHV sử dụng vật tư<input value={materialUserName} disabled={!canEdit} onChange={(e) => setMaterialUserName(e.target.value)} placeholder="Nhập tên VHV sử dụng vật tư" /></label>
            <label>Số lượng sử dụng ({t.items[0]?.material.unit ?? ""})<input type="number" min={1} value={usedQuantity} disabled={!canEdit} onChange={(e) => setUsedQuantity(Number(e.target.value))} /></label>
          </div>
          {materialTicketRequiresRecovery(t) && (
            <div className="review-recovery-grid">
              <label>Số lượng vật tư thu hồi ghi vào BBTHVT ({t.items[0]?.material.unit ?? ""}) *
                <input type="number" min={1} value={recoveryQuantity} disabled={!canEdit} onChange={(e) => setRecoveryQuantity(Number(e.target.value))} />
              </label>
              <label className={`recovery-return-check ${recoveryReturned ? "checked" : ""}`}>
                <input type="checkbox" disabled={!canEdit} checked={recoveryReturned} onChange={(e) => setRecoveryReturned(e.target.checked)} />
                <span><b>VHV xác nhận đã trả vật tư thu hồi xong</b>{recoveryReturned && <small>Ngày trả: {fmtDay(t.recoveryReturnedAt ?? new Date().toISOString())}</small>}</span>
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
          <label>Nội dung nghiệm thu *
            <textarea rows={3} value={completionNote} disabled={!canEdit} onChange={(e) => setCompletionNote(e.target.value)} />
          </label>
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
        <div className="frm-f"><button className="btn ghost" onClick={onClose}>Đóng</button>{canEdit && <button className="btn primary" disabled={act.isPending || (editStep === "confirm" && !reason.trim()) || (editStep === "accept" && (!pctNumber.trim() || !chiHuyName.trim() || !completionNote.trim() || !workStartedAt || !workEndedAt))} onClick={save}>{act.isPending ? <Loader2 className="spin" size={14} /> : <Pencil size={14} />} Lưu chỉnh sửa</button>}</div>
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
      <label className="lb">Phân bổ theo phiếu giao hàng — đã dùng {info.usedQuantity} {info.unit}</label>
      <table className="lot-table">
        <thead>
          <tr><th>Số phiếu giao hàng</th><th>Mã vật tư</th><th>Có thể lấy</th><th>Lấy</th></tr>
        </thead>
        <tbody>
          {info.lots.map((lot) => (
            <tr key={lot.id}>
              <td>{lot.label}</td>
              <td className="lot-code">{lot.erpCode || "—"}</td>
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
    </div>
  );
}

/* ================= hành động theo lượt ================= */
function ActionArea({ t, viewer }: { t: MaterialTicket; viewer: TicketViewer | null }) {
  const acts = actionsFor(t, viewer);
  const act = useTicketAction(t.id);
  const needItems = acts.includes("confirm") || acts.includes("receive") || acts.includes("propose") || acts.includes("stats") || acts.includes("accept") || acts.includes("statsExportDocuments");
  const { data: opts } = useTicketOptions(needItems);
  const [items, setItems] = useState([{ materialId: "", erpCode: "", deviceSeq: "", quantity: 1 }]);
  const [note, setNote] = useState("");
  // Tách riêng từng loại số chứng từ. Trước đây dùng chung một state `num`, nên
  // số ĐXVT vừa nhập có thể bị giữ lại và tự xuất hiện trong ô số biên bản kiểm tra ở bước sau.
  const [proposalNumberInput, setProposalNumberInput] = useState("");
  const [bbktNumberInput, setBbktNumberInput] = useState("");
  const [confirmReasonInput, setConfirmReasonInput] = useState(t.proposalNote ?? ""); // Lý do — bước Xác nhận yêu cầu (lưu vào proposalNote)
  const [repairRequestNumber, setRepairRequestNumber] = useState(t.repairRequestNumber ?? "");
  const [materialUserNameInput, setMaterialUserNameInput] = useState(t.materialUserName ?? "");
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
  const [receiverName, setReceiverName] = useState(viewer?.name ?? "");
  const [qty, setQty] = useState(() => Math.max(1, t.items[0]?.quantity ?? 1)); // số lượng xác nhận / lãnh / sử dụng
  const [method, setMethod] = useState(""); // hình thức lãnh
  const [receiptSource, setReceiptSource] = useState<"ERP" | "EXISTING">("ERP");
  const [workflowType, setWorkflowType] = useState<"DE_XUAT" | "UNG" | "SU_DUNG_HIEN_CO">("DE_XUAT");
  const [erpCode, setErpCode] = useState(t.items[0]?.erpCode ?? "");
  const [sccnRepresentative, setSccnRepresentative] = useState(t.sccnRepresentativeName ?? "");
  const [sccnPosition, setSccnPosition] = useState(t.sccnRepresentativePosition ?? "");
  const [bbntDoNumberInput, setBbntDoNumberInput] = useState(t.bbntDoNumber ?? "");
  const [settlementConfirmed, setSettlementConfirmed] = useState(false);
  const [recoveryQuantityInput, setRecoveryQuantityInput] = useState(() => String(t.recoveryQuantity ?? 1));
  const [recoveryReturned, setRecoveryReturned] = useState(!!t.recoveryReturnedAt);
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const confirmationMaterialOption = opts?.materials.find((material) => material.id === t.items[0]?.materialId);
  const confirmationErpInfoRows = confirmationMaterialOption?.erpCodes?.length
    ? confirmationMaterialOption.erpCodes
    : (t.items[0]?.material.erpCodes?.length ? t.items[0].material.erpCodes : [t.items[0]?.material.code].filter(Boolean) as string[])
        .map((code) => ({ code, name: t.items[0]?.material.name ?? "—", erpStock: 0 }));
  const isChemicalTicket = isChemicalFlowTicket(t.materialCategory);
  const proposalFlowAvailable = isChemicalTicket
    ? true
    : opts ? confirmationErpInfoRows.some((row) => row.erpStock > 0) : null;
  const repairRequestConflictsProposal =
    !!repairRequestNumber.trim() &&
    !!t.proposalNumber?.trim() &&
    repairRequestNumber.trim().toLocaleLowerCase("vi") === t.proposalNumber.trim().toLocaleLowerCase("vi");
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
    setRepairRequestNumber((current) => {
      if (t.repairRequestNumber) return t.repairRequestNumber;
      if (
        current.trim() &&
        t.proposalNumber?.trim() &&
        current.trim().toLocaleLowerCase("vi") === t.proposalNumber.trim().toLocaleLowerCase("vi")
      ) return "";
      return current;
    });
  }, [t.id, t.repairRequestNumber, t.proposalNumber]);

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
      CHO_PHIEU_YCSC: "Người được phân quyền Xác nhận vật tư lãnh nhập số yêu cầu sửa chữa",
      SU_DUNG_VAT_TU: "Người được phân quyền Xác nhận vật tư sử dụng",
      CHO_NGHIEM_THU: "Người được phân quyền Nghiệm thu",
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
        <div className="chem-grid">
          <div>
            <label className="lb">Khối lượng lãnh *{unit ? ` (${unit})` : ""}</label>
            <input type="number" min={1} value={receivedQty} onChange={(e) => setReceivedQty(e.target.value)} />
          </div>
          <div>
            <label className="lb">Ngày lãnh *</label>
            <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </div>
          <div>
            <label className="lb">VHV lãnh *</label>
            <input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="Họ tên người lãnh" />
          </div>
        </div>
        <button className="btn primary big"
          disabled={act.isPending || Number(receivedQty) <= 0 || !receivedDate || !receiverName.trim()}
          onClick={() => run({ action: "receive", receivedQuantity: Number(receivedQty), receivedAt: receivedDate, receivedByName: receiverName.trim() }, "Đã xác nhận lãnh, phiếu hoàn tất")}>
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
          <div className={`seg3 flow-toggle ${isChemicalTicket ? "single" : ""}`} aria-label="Chọn luồng vật tư">
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
            {!isChemicalTicket && <button type="button" className={workflowType === "UNG" ? "on" : ""} onClick={() => setWorkflowType("UNG")}>Ứng</button>}
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
        {isChemicalTicket && (
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
          <label className="field">Biên Bản Kiểm Tra
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
      <div className="vhv-receive-grid">
        <label className="field">Số lượng vật tư đã lãnh{unit ? ` (${unit})` : ""} *
          <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value)) || 1))} />
        </label>
        <label className="field">Số yêu cầu sửa chữa (nếu có)
          <input value={repairRequestNumber} onChange={(e) => setRepairRequestNumber(e.target.value)} placeholder="Nhập số yêu cầu sửa chữa hoặc để trống" />
        </label>
      </div>
      <p className="hint">Sau khi xác nhận, số lượng đã lãnh được cộng vào Hiện có để sử dụng ở bước sau. Số lượng ERP không thay đổi.</p>
      <button className="btn primary big" disabled={qty <= 0 || act.isPending} onClick={() => run({ action: "vhvReceive", quantity: qty, repairRequestNumber: repairRequestNumber.trim() || undefined }, "Đã ghi nhận VHV lãnh vật tư")}><Check size={15} /> Xác nhận</button>
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
              <input
                placeholder={advanceDocumentLocked ? "Xuất Phiếu ĐXVT trước khi nhập số" : "Số phiếu ĐXVT (vd: ĐXVT-051)"}
                disabled={advanceDocumentLocked}
                value={proposalNumberInput}
                onChange={(e) => setProposalNumberInput(e.target.value)}
              />
            </label>
          )}
          <label className="field">Số phiếu giao hàng *
            <input
              placeholder={advanceDocumentLocked ? "Xuất Phiếu ĐXVT trước khi nhập số" : "Nhập số phiếu giao hàng"}
              disabled={advanceDocumentLocked}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            />
          </label>
        </div>
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
          <button className="btn primary big" disabled={qty <= 0 || (isAdvance && (!erpCode || !proposalNumberInput.trim())) || !method.trim() || act.isPending}
            onClick={() => run({ action: "receive", receivedQuantity: qty, deliveryNoteNumber: method.trim(), receiptSource: isAdvance ? receiptSource : "ERP", ...(isAdvance ? { erpCode, proposalNumber: proposalNumberInput.trim() } : {}) }, isAdvance ? "Đã xác nhận ĐXVT, chuyển Quyết toán" : "Đã xác nhận số phiếu giao hàng")}>
            {act.isPending ? <Loader2 className="spin" size={15} /> : <Check size={15} />} {isAdvance ? "Xác nhận ĐXVT" : "Xác nhận số phiếu giao hàng"}
          </button>
        )}
      </div>
    );
  }

  if (acts.includes("repairRequest")) return (
    <div className="act">
      <label className="lb">Xác nhận vật tư lãnh</label>
      <div className="note"><Check size={15} /> Đã xác nhận số phiếu giao hàng <b>{t.deliveryNoteNumber ?? t.receivedMethod ?? "—"}</b>. Nhập số yêu cầu sửa chữa để hoàn tất bước này.</div>
      <div className="act-field-row">
        <label>Số yêu cầu sửa chữa *</label>
        <input value={repairRequestNumber} onChange={(e) => setRepairRequestNumber(e.target.value)} placeholder="Nhập số yêu cầu sửa chữa" />
      </div>
      {repairRequestConflictsProposal && (
        <div className="warnbox"><AlertTriangle size={15} /> Số yêu cầu sửa chữa phải nhập mới, không được trùng với số phiếu ĐXVT.</div>
      )}
      <button className="btn primary big" disabled={!repairRequestNumber.trim() || repairRequestConflictsProposal || act.isPending} onClick={() => run({ action: "repairRequest", repairRequestNumber: repairRequestNumber.trim() }, "Đã xác nhận số yêu cầu sửa chữa")}>
        <Check size={15}/> Xác nhận số yêu cầu sửa chữa
      </button>
    </div>
  );

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
        {recoveryRequired && (
          <div className="recovery-quantity-row">
            <label className="field">Số lượng vật tư thu hồi ghi vào BBTHVT{unit ? ` (${unit})` : ""} *
              <input type="number" min={1} value={recoveryQuantityInput} onChange={(e) => setRecoveryQuantityInput(e.target.value)} />
            </label>
            <label className={`recovery-return-check ${recoveryReturned ? "checked" : ""}`}>
              <input type="checkbox" checked={recoveryReturned} onChange={(e) => setRecoveryReturned(e.target.checked)} />
              <span>
                <b>VHV xác nhận đã trả vật tư thu hồi xong</b>
                {recoveryReturned && <small>Ngày trả: {fmtDay(t.recoveryReturnedAt ?? new Date().toISOString())}</small>}
              </span>
            </label>
          </div>
        )}
        {quantityExceedsStock && (
          <div className="warnbox"><AlertTriangle size={15} /> Số lượng vật tư sử dụng đã nhập vượt số lượng hiện có. Hiện còn {stock} {unit}; vui lòng nhập lại số lượng.</div>
        )}
        {quantityExceedsReceived && <div className="warnbox"><AlertTriangle size={15} /> Số lượng sử dụng vượt số lượng đã nhận từ Hiện có ({received} {unit}).</div>}
        <button className="btn primary big" disabled={!materialUserNameInput.trim() || qty <= 0 || quantityExceedsStock || quantityExceedsReceived || (recoveryRequired && (!Number.isFinite(recoveryQuantity) || recoveryQuantity <= 0)) || act.isPending}
          onClick={() => run({ action: "use", materialUserName: materialUserNameInput.trim(), usedQuantity: qty, ...(recoveryRequired ? { recoveryQuantity, recoveryReturned } : {}) }, "Đã xác nhận sử dụng vật tư")}>
          {act.isPending ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Xác nhận
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
    const selectedErp = codeOptions.find((option) => option.code === erpCode);
    const exportsRecoveryDocument = materialTicketRequiresRecovery(t);
    return (
      <div className="act">
          <>
            <div className="accept-two-grid">
              <label className="field">Mã vật tư dùng xuất biên bản *
                <select value={erpCode} onChange={(e) => setErpCode(e.target.value)}>
                  <option value="">— Chọn mã vật tư ERP —</option>
                  {codeOptions.map((option) => <option key={option.code} value={option.code}>{option.code} · ERP: {option.erpStock.toLocaleString("vi-VN")} {t.items[0]?.material.unit ?? ""}</option>)}
                </select>
              </label>
              <label className="field">Số BBNT ký tay
                <input name={`bbkt-accept-${t.id}`} autoComplete="off" placeholder="Nhập số BBNT ký tay" value={bbktNumberInput} onChange={(e) => setBbktNumberInput(e.target.value)} />
              </label>
            </div>
            <LotAllocationPicker ticketId={t.id} value={lotAllocation} onChange={setLotAllocation} />
            {selectedErp && (
              <p className="hint">
                Tất cả biên bản Word sẽ sử dụng mã <b>{selectedErp.code}</b> và tên <b>{selectedErp.name || t.items[0]?.material.name}</b>.
                {t.type === "UNG"
                  ? " BBNT D-Office sẽ được xuất cùng Phiếu ĐXVT ở bước Xác nhận ĐXVT."
                  : " BBNT D-Office sẽ được Thống kê xuất ở bước sau, sau khi chọn đại diện SCCN."}
              </p>
            )}
            <div className="accept-two-grid">
              <label className="field">Số PCT/LCT *
                <input placeholder="Nhập số PCT/LCT" value={pct} onChange={(e) => setPct(e.target.value)} />
              </label>
              <label className="field">Tên chỉ huy trực tiếp (SCCN) *
                <input placeholder="Nhập tên chỉ huy trực tiếp" value={chiHuy} onChange={(e) => setChiHuy(e.target.value)} />
              </label>
            </div>
            <textarea rows={3} placeholder="Nội dung nghiệm thu…" value={note} onChange={(e) => setNote(e.target.value)} />
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
              action: "accept", erpCode, completionNote: note.trim(), pctNumber: pct.trim(), chiHuyName: chiHuy.trim(),
              bbktNumber: bbktNumberInput.trim() || undefined, workStartedAt: startedAt, workEndedAt: endedAt,
              ...(lotAllocation ? { lotAllocation: Object.entries(lotAllocation).map(([lotId, quantity]) => ({ lotId, quantity })) } : {}),
            },
            t.type === "UNG"
              ? `Đã nghiệm thu và xuất BBNT ký tay${exportsRecoveryDocument ? " cùng BBTHVT" : ""}`
              : `Đã xuất BBNT ký tay${exportsRecoveryDocument ? " và BBTHVT" : ""}, chuyển Thống kê xuất BBNT D-Office`,
          )}>
          {act.isPending ? <Loader2 className="spin" size={15} /> : <FileText size={15} />}
          {exportsRecoveryDocument ? " Xác nhận và xuất BBNT ký tay + BBTHVT" : " Xác nhận và xuất BBNT ký tay"}
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
    const stepLabel = t.type === "DE_XUAT" ? "Thống kê xuất BBNT D-Office" : "Thống kê xác nhận mã vật tư";
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
            ? `BBNT ký tay${materialTicketRequiresRecovery(t) ? " và Biên bản vật tư thu hồi" : ""} đã được xuất ở bước Nghiệm thu. Chọn đại diện SCCN để xuất BBNT D-Office, sau đó chuyển sang bước Quyết toán.`
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
.mtw{font-family:Inter,system-ui,sans-serif;background:${C.cream};color:#1f2430;padding:20px;border-radius:20px;min-height:640px;position:relative;}
.mtw *{box-sizing:border-box;font-family:inherit;}
.step-review{width:100%;text-align:left;border:0;background:transparent;cursor:pointer;}
.step-review:disabled{cursor:default;}
.step-review:not(:disabled):hover{background:#f8fafc;border-radius:10px;}
.step.recovery-pending{color:${C.warn};background:${C.warnBg};}
.step-review-dialog{width:min(680px,calc(100vw - 32px));max-height:86vh;overflow-x:hidden;overflow-y:auto;}
.review-receive-row{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,.65fr);gap:12px;align-items:end;min-width:0;}
.review-receive-row.single{grid-template-columns:minmax(0,1fr) minmax(170px,1fr);}
.review-receive-source{display:flex;flex-direction:column;gap:6px;min-width:0;}
.fixed-receive-source{display:flex;height:40px;align-items:center;border:1px solid ${C.line};border-radius:9px;background:#f8fafc;padding:0 12px;color:${C.navy};font-size:12px;font-weight:700;}
.review-receive-toggle{display:grid;width:100%;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;}
.review-receive-toggle button{height:40px;min-width:0;padding:0 12px;font-size:12px;line-height:1.2;white-space:nowrap;}
.review-delivery-field{gap:6px;min-width:0;}
.review-delivery-field input{height:40px;margin:0;}
.review-use-grid,.review-recovery-grid,.review-accept-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:end;min-width:0;}
.head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px;}
.head-l{display:flex;gap:13px;align-items:center;}
.head-ic{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,${C.navy},${C.accent});}
.head h1{font-family:Poppins,Inter,sans-serif;font-size:21px;font-weight:700;color:${C.navy};margin:0;}
.head p{margin:2px 0 0;font-size:12.5px;color:${C.muted};}
.top-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;}
.turn-spacer{flex:1 1 auto;min-width:0;}
.month-filter{display:inline-flex;align-items:center;flex:0 0 auto;height:38px;border:1px solid #bfdbfe;background:linear-gradient(180deg,#fff 0%,#f8fbff 100%);border-radius:11px;padding:3px 5px 3px 10px;box-shadow:0 1px 2px rgba(15,23,42,.04);transition:border-color .15s,box-shadow .15s;}
.month-filter:focus-within{border-color:#60a5fa;box-shadow:0 0 0 3px rgba(37,99,235,.1);}
.month-filter>svg{flex:0 0 auto;color:${C.accent};}
.month-filter select{height:30px;min-width:114px;border:0;background:transparent;padding:0 18px 0 7px;color:${C.navy};font-size:12.5px;font-weight:800;outline:0;cursor:pointer;}
.month-count{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 6px;border-radius:8px;background:#e8f1ff;color:#1d4ed8;font-size:11.5px;font-weight:900;font-variant-numeric:tabular-nums;}
.bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
.filters{display:flex;gap:5px;flex:0 0 auto;background:#fff;border:1px solid ${C.line};border-radius:11px;padding:3px;}
.filters button{border:0;background:transparent;font-size:12.5px;font-weight:600;color:#64748b;padding:7px 12px;border-radius:8px;cursor:pointer;}
.filters button.on{background:${C.navy};color:#fff;}
.filters button.mine-tab{display:inline-flex;align-items:center;gap:6px;font-weight:700;color:${C.warn};}
.filters button.mine-tab.on{background:#f59e0b;color:#fff;}
.mine-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;font-size:10.5px;font-weight:800;background:${C.warnBg};color:${C.warn};}
.mine-tab.on .mine-count{background:rgba(255,255,255,.28);color:#fff;}
.btn{display:inline-flex;align-items:center;gap:6px;font-family:Poppins,Inter,sans-serif;font-weight:600;font-size:13px;border-radius:10px;padding:9px 14px;cursor:pointer;border:1px solid ${C.line};background:#fff;color:#475569;transition:.15s;}
.btn.primary{background:${C.accent};border-color:${C.accent};color:#fff;}
.btn.primary:disabled{opacity:.5;cursor:not-allowed;}
.btn.danger{background:${C.bad};border-color:${C.bad};color:#fff;}
.btn.ghost{background:#fff;}
.btn.big{width:100%;justify-content:center;padding:13px;font-size:14px;margin-top:8px;}
.btn.tiny{font-size:11.5px;padding:5px 9px;border-radius:8px;align-self:flex-start;}
.mini{border:1px solid ${C.line};background:#fff;border-radius:8px;cursor:pointer;color:#94a3b8;display:grid;place-items:center;width:30px;}
.list{background:#fff;border:1px solid ${C.line};border-radius:16px;overflow-x:auto;overflow-y:hidden;}
.row{display:grid;grid-template-columns:72px minmax(116px,.95fr) minmax(118px,.9fr) minmax(210px,1.55fr) minmax(132px,1fr) 92px minmax(190px,1.18fr) 72px 74px;gap:8px;align-items:center;min-width:1140px;width:100%;text-align:left;padding:12px 16px;border:0;border-bottom:1px solid ${C.line};background:#fff;cursor:pointer;font-size:13px;}
.code-cell{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:0;}
.code-cell .code{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ops{display:flex;gap:6px;justify-content:center;}
.op{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;border:1px solid ${C.line};background:#fff;color:${C.muted};cursor:pointer;transition:.15s;}
.op:hover{border-color:${C.accent};color:${C.accent};}
.op.del:hover{border-color:${C.bad};color:${C.bad};background:${C.badBg};}
.row>span:nth-child(1),.row>span:nth-child(2),.row>span:nth-child(3),.row>span:nth-child(4),.row>span:nth-child(5),.row>span:nth-child(6),.row>span:nth-child(7),.row>span:nth-child(8){text-align:center;justify-self:stretch;}
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
.lot-table .lot-code{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:#64748b;}
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
.rhead{background:#fbfbfa;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.soft};cursor:default;}
.rhead .type-head{display:flex;justify-content:center;}
.rhead .type-head select{border:0;background:transparent;font:inherit;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.soft};cursor:pointer;outline:0;padding:0;max-width:100%;text-align:center;text-align-last:center;}
.rhead .type-head select.filtering{color:${C.navy};}
.code{font-family:Poppins,Inter,sans-serif;font-weight:600;color:${C.navy};}
.proposal-cell{display:flex;min-width:0;flex-direction:column;align-items:center;gap:3px;text-align:center;}
.proposal-cell small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${C.muted};font-size:10.5px;font-weight:600;}
.nophieu{display:inline-block;background:${C.warnBg};color:${C.warn};font-size:11px;font-weight:600;padding:3px 8px;border-radius:7px;}
.soft{color:${C.soft};}
.tag{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:4px 9px;border-radius:8px;}
.tag.ung{background:${C.ungBg};color:${C.ung};}
.tag.dx{background:${C.accent}14;color:${C.accent};}
.kind-cell{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;text-align:center;}
.kind-top{display:inline-flex;align-items:center;gap:6px;min-width:0;}
.exp{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex:0 0 auto;border-radius:50%;background:#10b981;color:#fff;box-shadow:0 1px 2px rgba(15,23,42,.2);}
.exp.open{background:#f43f5e;}
.detail-inline{min-width:1132px;border-bottom:1px solid ${C.line};background:#f6f8fb;padding:12px 16px;}
.detail-inline .dwrap{position:relative;border:1px solid ${C.line};border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 8px 22px rgba(15,23,42,.07);}
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
.material-name{display:block;min-width:0;color:${C.navy};font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.d{width:9px;height:9px;border-radius:50%;background:#e2e8f0;}
.d.on{background:${C.ok};}
.d.cur{background:${C.accent};box-shadow:0 0 0 3px ${C.accent}30;}
.st{font-size:11.5px;font-weight:700;padding:5px 10px;border-radius:9px;text-align:center;white-space:nowrap;}
.status-stack{display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:5px;min-width:0;width:100%;}
.status-stack .st{display:block;width:100%;box-sizing:border-box;}
.status-stack .status-secondary{white-space:normal;line-height:1.25;}
.empty{padding:40px;text-align:center;color:${C.soft};display:flex;gap:8px;align-items:center;justify-content:center;}
.spin{animation:mtwspin 1s linear infinite;}@keyframes mtwspin{to{transform:rotate(360deg);}}
.ovl{position:fixed;inset:0;background:rgba(15,23,42,.38);z-index:40;}
.dlg{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:520px;max-width:94vw;background:#fff;border-radius:18px;z-index:41;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.3);}
.dlg-scroll{max-height:min(92vh,920px);display:flex;flex-direction:column;}
.dlg-h{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid ${C.line};font-family:Poppins,Inter,sans-serif;color:${C.navy};}
.x{border:0;background:#f1f5f9;border-radius:8px;width:28px;height:28px;display:grid;place-items:center;cursor:pointer;color:#64748b;}
.x.w{position:absolute;top:14px;right:14px;background:rgba(255,255,255,.18);color:#fff;}
.pick{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:18px;}
.card{border:1.5px solid ${C.line};border-radius:14px;padding:18px 14px;background:#fff;cursor:pointer;display:flex;flex-direction:column;gap:8px;align-items:flex-start;text-align:left;transition:.15s;}
.card b{font-family:Poppins,Inter,sans-serif;font-size:15px;color:${C.navy};}
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
.vhv-receive-grid .field{min-width:0;margin:0!important;}
.vhv-receive-grid .field input{width:100%;margin-top:6px;}
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
.erp-readonly-row b{color:${C.navy};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
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
.p-code{font-family:Poppins,Inter,sans-serif;font-weight:700;font-size:24px;}
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
.lb{display:flex;align-items:center;gap:6px;font-family:Poppins,Inter,sans-serif;font-weight:600;font-size:12.5px;color:${C.navy};margin-bottom:8px;}
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
.material-code-link{flex:0 0 auto;border-radius:7px;background:${C.accent}10;padding:3px 8px;font-family:Poppins,Inter,sans-serif;font-size:11px;font-weight:800;color:${C.accent};text-decoration:none;}
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
.pdf-inline{color:${C.navy};font-weight:700;text-decoration:underline;}
.ticket-note-row{display:flex;align-items:center;gap:6px 26px;min-width:0;margin-bottom:8px;flex-wrap:wrap;}
.ticket-note-row .meta-line{display:flex;align-items:baseline;gap:4px;min-width:0;margin:0;}
.ticket-note-row .repair-request-meta{flex:0 1 auto;}
.ticket-note-row b{overflow-wrap:anywhere;}
.completion-overview{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:stretch;min-width:0;}
.completion-overview.with-documents{grid-template-columns:minmax(0,1fr) minmax(250px,26%);}
.completion-details{display:flex;min-width:0;flex-direction:column;gap:12px;padding-top:1px;}
.completion-details>.act{margin-bottom:0;}
.completion-summary-card{display:flex;min-width:0;flex-direction:column;gap:9px;border:1px solid ${C.line};border-radius:12px;background:linear-gradient(145deg,#fff 0%,#fbfcfe 100%);padding:13px 14px;box-shadow:0 4px 14px rgba(30,64,175,.05);}
.completion-summary-card .ticket-note-row,.completion-summary-card .done-note,.completion-summary-card .meta-line{margin-bottom:0;}
.document-downloads{display:flex;min-width:0;min-height:100%;align-self:stretch;flex-direction:column;justify-content:flex-start;gap:12px;border:1px solid #c9ded7;border-radius:12px;background:linear-gradient(145deg,#f7fcfa 0%,#eef8f4 100%);padding:14px;box-shadow:0 4px 14px rgba(15,118,110,.07);}
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
.frm-item{display:grid;grid-template-columns:1.25fr 1.1fr 1.2fr 64px auto;gap:6px;}
.hint{font-size:11px;color:${C.soft};margin:2px 0 0;}
@media(max-width:700px){.receive-existing-row{grid-template-columns:1fr;}.receive-existing-hint{min-height:0;padding:0;}}
.loglist{border-top:1px dashed ${C.line};padding-top:12px;}
.p-top{display:grid;grid-template-columns:minmax(180px,.55fr) minmax(560px,2fr);gap:4px 20px;align-items:start;}
.p-top .top-items{border-left:1px dashed ${C.line};padding:4px 0 4px 16px;margin-bottom:0;}
.top-items-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:32px;margin:-4px 0 6px;}
.top-items-head .lb{min-width:0;margin:0;}
.p-top .loglist{border-top:0;border-left:1px dashed ${C.line};padding:4px 0 4px 16px;}
@media(max-width:1100px){.p-top{grid-template-columns:1fr;}.p-top .top-items,.p-top .loglist{border-left:0;padding-left:0;border-top:1px dashed ${C.line};padding-top:12px;margin-bottom:10px;}.completion-overview.with-documents{grid-template-columns:1fr;}.document-downloads{width:100%;}.activity-drawer{width:min(420px,70%);}}
.logrow{display:flex;align-items:baseline;gap:9px;font-size:12px;padding:5px 0;color:#475569;white-space:nowrap;}
.logrow span{color:${C.soft};white-space:nowrap;}
.logrow b{white-space:nowrap;}
.logrow em{font-style:normal;color:${C.muted};white-space:nowrap;}
@media(max-width:640px){.panel{width:100%;}.detail-inline{min-width:1040px;padding:10px 12px;}.row{min-width:1040px;grid-template-columns:64px minmax(108px,.9fr) minmax(108px,.86fr) minmax(188px,1.36fr) minmax(120px,.95fr) 82px minmax(168px,1fr) 66px 70px;padding:11px 12px;font-size:12.5px;}.tag{padding:4px 7px}.nophieu{padding:3px 6px}.st{padding:5px 8px}.material-cards{grid-template-columns:1fr;}.edit-field-grid,.bbkt-grid,.confirm-field-row,.stats-issue-grid,.accept-two-grid,.use-field-grid,.recovery-quantity-row,.receive-field-grid,.receive-field-grid.advance-receive-fields,.vhv-receive-grid,.review-receive-row,.review-use-grid,.review-recovery-grid,.review-accept-grid{grid-template-columns:1fr;gap:8px;}.erp-readonly-row{grid-template-columns:minmax(110px,.8fr) minmax(180px,1.5fr) minmax(110px,.7fr);}.review-receive-toggle{width:100%;}.review-receive-toggle button{flex:1;}.qty-field input{padding-left:8px;padding-right:8px;}}
@media(max-width:640px){.ticket-unit-field{grid-template-columns:58px minmax(0,1fr);gap:8px;}.ticket-unit-options{max-width:none;}.ticket-unit-options button{padding-left:6px;padding-right:6px;}.ticket-category-options{grid-template-columns:repeat(3,minmax(0,1fr));}}
@media(max-width:760px){.top-tools{align-items:stretch;flex-direction:column;}.turn{max-width:100%;min-width:0;}.turn-spacer{display:none;}.month-filter{align-self:flex-start;max-width:100%;}.month-filter select{max-width:calc(100vw - 108px);}.filters{align-self:flex-start;max-width:100%;overflow-x:auto;}.filters button{white-space:nowrap;}.act-title-row{align-items:stretch;flex-direction:column;gap:8px;}.receive-location{width:100%;align-items:flex-start;flex-direction:column;gap:3px;}.flow-toggle,.receive-source-toggle{width:100%;}.flow-toggle button,.receive-source-toggle button{flex:1;min-width:0;padding:0 8px;}.act-field-row,.advance-item-row{grid-template-columns:1fr;gap:6px;}.replacement-entry-row{grid-template-columns:24px minmax(0,1fr) 120px 30px;}.activity-drawer{width:86%;}}
`;
