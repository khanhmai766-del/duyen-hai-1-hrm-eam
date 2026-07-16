"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, Minus, X, Check, FileText, Zap, ClipboardList, Package, Clock, ChevronRight,
  AlertTriangle, Ban, Download, CircleCheck, Circle, CircleDot, Loader2, Pencil, Trash2, UserCog, CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import {
  useMaterialTickets, useTicketOptions, useCreateTicket, useTicketAction, useDeleteTicket,
  useWorkflowRoles, useSaveWorkflowRoles, actionsFor,
  type MaterialTicket, type TicketViewer, type WorkflowRoleMap,
} from "@/hooks/useMaterialTickets";
import { usePositions } from "@/hooks/useUsers";
import { isPositionAllowedForDefectUnit, MATERIAL_CATEGORIES, TICKET_TO_MATERIAL_CATEGORY } from "@/lib/constants";
import { normalizeText } from "@/lib/nav";
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
  NHAN_TU_HIEN_CO: { label: "Nhận vật tư từ Hiện có", c: "#0891b2" },
  NHAN_VAT_TU: { label: "Xác nhận vật tư lãnh", c: "#0891b2" },
  CHO_PHIEU_YCSC: { label: "Xác nhận vật tư lãnh", c: "#0891b2" },
  SU_DUNG_VAT_TU: { label: "Sử dụng vật tư", c: "#6d28d9" },
  CHO_NGHIEM_THU: { label: "Chờ nghiệm thu", c: C.warn },
  CHO_QUYET_TOAN: { label: "Chờ quyết toán", c: "#7c3aed" },
  CHO_THONG_KE_XUAT_BIEN_BAN: { label: "Chờ Thống kê xuất biên bản", c: "#0f766e" },
  CHO_NHAP_LIEU: { label: "Chờ nhập số lượng ứng", c: C.ung },
  CHO_NHAP_LIEU_THAY_THE: { label: "Chờ nhập liệu thay thế", c: C.ung },
  CHO_XAC_NHAN_PDF: { label: "Chờ xác nhận xuất file", c: C.ung },
  CHO_HOAN_THIEN: { label: "Chờ hoàn thiện hồ sơ", c: C.ung },
  HOAN_TAT: { label: "Hoàn tất", c: C.ok },
  TU_CHOI: { label: "Từ chối", c: C.bad },
};
const FLOW: Record<string, { key: string; label: string; who: string }[]> = {
  CHUA_CHON: [
    { key: "B0", label: "VHV tạo phiếu", who: "VHV" },
    { key: "CHO_XAC_NHAN", label: "Xác nhận yêu cầu", who: "Trưởng ca/Trưởng kíp" },
  ],
  DE_XUAT: [
    { key: "B0", label: "VHV tạo phiếu", who: "VHV" },
    { key: "CHO_THONG_KE", label: "Trưởng ca/Trưởng kíp xác nhận", who: "Trưởng ca/Trưởng kíp" },
    { key: "CHO_PHIEU__XUAT_KHO", label: "Thống Kê xác nhận ĐXVT", who: "Thống kê" },
    { key: "NHAN_VAT_TU", label: "Xác nhận vật tư lãnh", who: "Theo phân quyền quy trình" },
    { key: "SU_DUNG_VAT_TU", label: "Xác nhận sử dụng vật tư", who: "Theo phân quyền quy trình" },
    { key: "CHO_NGHIEM_THU", label: "Nghiệm thu + BBNT ký tay + BBNT DO", who: "Theo phân quyền quy trình" },
    { key: "CHO_QUYET_TOAN", label: "Quyết toán vật tư", who: "Thống kê" },
  ],
  UNG: [
    { key: "B0", label: "VHV tạo phiếu", who: "VHV" },
    { key: "VHV_LANH_VAT_TU", label: "VHV lãnh vật tư", who: "VHV được giao thực hiện" },
    { key: "SU_DUNG_VAT_TU", label: "Xác nhận sử dụng vật tư", who: "Theo phân quyền quy trình" },
    { key: "CHO_NGHIEM_THU", label: "Nghiệm thu", who: "Theo phân quyền quy trình" },
    { key: "NHAN_VAT_TU", label: "Xác nhận vật tư lãnh + xuất biên bản", who: "Theo phân quyền quy trình" },
    { key: "CHO_PHIEU__XUAT_KHO", label: "Thống Kê xác nhận ĐXVT", who: "Thống kê" },
    { key: "CHO_QUYET_TOAN", label: "Quyết toán vật tư", who: "Thống kê" },
  ],
  SU_DUNG_HIEN_CO: [
    { key: "B0", label: "VHV tạo phiếu", who: "VHV" },
    { key: "XAC_NHAN_HIEN_CO", label: "Trưởng ca/Trưởng kíp xác nhận", who: "Trưởng ca/Trưởng kíp" },
    { key: "NHAN_TU_HIEN_CO", label: "Nhận vật tư từ Hiện có", who: "Theo phân quyền quy trình" },
    { key: "SU_DUNG_VAT_TU", label: "Xác nhận sử dụng vật tư", who: "Theo phân quyền quy trình" },
    { key: "CHO_NGHIEM_THU", label: "Nghiệm thu", who: "Theo phân quyền quy trình" },
    { key: "CHO_THONG_KE_XUAT_BIEN_BAN", label: "Thống kê xác nhận và xuất biên bản", who: "Thống kê" },
    { key: "CHO_QUYET_TOAN", label: "Quyết toán vật tư", who: "Thống kê" },
  ],
};
const ORDER: Record<string, string[]> = {
  CHUA_CHON: ["B0", "CHO_XAC_NHAN"],
  DE_XUAT: ["B0", "CHO_THONG_KE", "CHO_PHIEU__XUAT_KHO", "NHAN_VAT_TU", "SU_DUNG_VAT_TU", "CHO_NGHIEM_THU", "CHO_QUYET_TOAN", "HOAN_TAT"],
  UNG: ["B0", "VHV_LANH_VAT_TU", "SU_DUNG_VAT_TU", "CHO_NGHIEM_THU", "NHAN_VAT_TU", "CHO_PHIEU__XUAT_KHO", "CHO_QUYET_TOAN", "HOAN_TAT"],
  SU_DUNG_HIEN_CO: ["B0", "XAC_NHAN_HIEN_CO", "NHAN_TU_HIEN_CO", "SU_DUNG_VAT_TU", "CHO_NGHIEM_THU", "CHO_THONG_KE_XUAT_BIEN_BAN", "CHO_QUYET_TOAN", "HOAN_TAT"],
};
const flowStatusKey = (status: string) =>
  status === "CHO_THONG_KE" ? "CHO_PHIEU__XUAT_KHO"
  : status === "CHO_XAC_NHAN_PHAT" ? "CHO_PHIEU__XUAT_KHO"
  : status === "CHO_PHIEU_YCSC" ? "NHAN_VAT_TU"
  : status;
const fmt = (s?: string | null) =>
  s ? new Date(s).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";
const normalizeReceiptSource = (source?: string | null): "ERP" | "EXISTING" =>
  source === "EXISTING" || source === "OUTSIDE" ? "EXISTING" : "ERP";
const receiptSourceLabel = (source?: string | null) =>
  normalizeReceiptSource(source) === "ERP" ? "Lãnh kho DH1" : 'Lãnh vật tư "Hiện có"';
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
const compactSelectWidth = (label: string, minCh: number, maxCh: number) =>
  `${Math.min(maxCh, Math.max(minCh, label.length + 3))}ch`;
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
  rolesOpen: controlledRolesOpen,
  onOpenRoles,
  onCloseRoles,
}: {
  creating?: boolean;
  searchQ?: string;
  onCloseCreate?: () => void;
  rolesOpen?: boolean;
  onOpenRoles?: () => void;
  onCloseRoles?: () => void;
} = {}) {
  const [monthFilter, setMonthFilter] = useState(() => materialTicketMonthKey());
  const { data, isLoading } = useMaterialTickets(monthFilter);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState("ALL");
  const [unitFilter, setUnitFilter] = useState("ALL");
  const [editTicket, setEditTicket] = useState<MaterialTicket | null>(null);
  const [delTicket, setDelTicket] = useState<MaterialTicket | null>(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const del = useDeleteTicket();
  const isRolesControlled = controlledRolesOpen !== undefined;
  const isRolesOpen = isRolesControlled ? controlledRolesOpen : rolesOpen;
  const openRoles = onOpenRoles ?? (() => setRolesOpen(true));
  const closeRoles = onCloseRoles ?? (() => setRolesOpen(false));

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
        : t.status === filter;
      const ticketCategory = t.materialCategory ? TICKET_TO_MATERIAL_CATEGORY[t.materialCategory] ?? t.materialCategory : "";
      const matchesMaterialCategory = materialCategoryFilter === "ALL" || ticketCategory === materialCategoryFilter;
      const matchesUnit = unitFilter === "ALL" || t.unit === unitFilter;
      const searchable = normalizeText([
        t.proposalNumber,
        ...t.items.flatMap((it) => [it.erpName, it.material.name, it.material.code]),
      ].filter(Boolean).join(" "));
      const matchesSearch = !searchText || searchable.includes(searchText);
      return matchesStatus && matchesMaterialCategory && matchesUnit && matchesSearch;
    });
    // Tháng mới nhất đứng trước; trong từng tháng, STT cao nhất là phiếu mới nhất.
    return list.sort((a, b) =>
      b.sequenceMonth.localeCompare(a.sequenceMonth)
      || b.sequenceNumber - a.sequenceNumber
      || b.createdAt.localeCompare(a.createdAt)
    );
  }, [tickets, filter, myTurnIds, materialCategoryFilter, unitFilter, searchText]);
  const selectedCategoryLabel = materialCategoryFilter === "ALL" ? "Tất cả loại" : materialCategoryFilter;
  const selectedUnitLabel = unitFilter === "ALL" ? "Tất cả tổ máy" : unitFilter;

  return (
    <div className="mtw">
      <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="top-tools">
        <div className="filters">
          <button className={`mine-tab ${filter === "MINE" ? "on" : ""}`} onClick={() => setFilter("MINE")}>
            <Zap size={13} /> Đến lượt bạn
            <span className="mine-count">{myTurn.length}</span>
          </button>
          {[["ALL", "Tất cả"], ["RUNNING", "Đang thực hiện"], ["HOAN_TAT", "Hoàn tất"], ["TU_CHOI", "Từ chối"]].map(([k, l]) => (
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
        <label className="unit-filter category-filter">
          <select
            value={materialCategoryFilter}
            onChange={(e) => setMaterialCategoryFilter(e.target.value)}
            aria-label="Lọc theo loại vật tư"
            style={{ width: compactSelectWidth(selectedCategoryLabel, 10, 19) }}
          >
            <option value="ALL">Tất cả loại</option>
            {MATERIAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="unit-filter">
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            aria-label="Lọc theo tổ máy"
            style={{ width: compactSelectWidth(selectedUnitLabel, 7, 13) }}
          >
            <option value="ALL">Tất cả tổ máy</option>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        {viewer?.isAdmin && !isRolesControlled && (
          <button className="btn ghost" onClick={openRoles}>
            <UserCog size={14} /> Phân quyền quy trình
          </button>
        )}
      </div>

      <div className="list">
        <div className="row rhead">
          <span>Số thứ tự</span><span>Yêu cầu</span><span>Cương vị</span><span>Tên vật tư</span><span>Phiếu đề xuất</span><span>Số lượng</span><span>Trạng thái</span><span>Chờ</span><span>Thao tác</span>
        </div>
        {isLoading && <div className="empty"><Loader2 className="spin" size={18} /> Đang tải…</div>}
	        {!isLoading && shown.map((t) => {
		          const baseMeta = t.type === "UNG" && t.status === "CHO_XAC_NHAN_PHAT"
		            ? { label: "Chưa xác nhận trả phiếu", c: C.warn }
		            : STATUS[t.status] ?? { label: t.status, c: C.soft };
		          const recoveryPending = t.recoveryRequired && (!t.recoveryReturnedAt || !t.recoveryDocUrl);
	          const mine = actionsFor(t, viewer).length > 0;
	          // Sửa/Xoá: Admin hoặc cương vị được phân quyền bước "Sửa/Xoá phiếu";
	          // khi admin CHƯA cấu hình bước này → người tạo phiếu (mặc định cũ).
	          const canEdit =
	            !!viewer &&
	            (viewer.isAdmin ||
	              viewer.steps?.manage ||
	              (!viewer.steps?.manageConfigured && viewer.id === t.createdById));
          const materialNames = Array.from(new Set(t.items.map((i) => i.erpName || i.material?.name).filter(Boolean)));
          const materialText = materialNames.length ? materialNames.join(", ") : "—";
          const isOpen = openId === t.id;
          return (
            <React.Fragment key={t.id}>
            <button className={`row ${mine ? "mine" : ""}`} onClick={() => setOpenId(isOpen ? null : t.id)}>
              <span className="code-cell">
                <span className={`exp ${isOpen ? "open" : ""}`} title={isOpen ? "Thu gọn" : "Mở chi tiết"}>
                  {isOpen ? <Minus size={12} /> : <Plus size={12} />}
                </span>
                <span className="code">{t.sequenceNumber}</span>
              </span>
              <span className="kind-cell">
                {t.type === "UNG"
                  ? <span className="tag ung"><Zap size={11} /> Ứng</span>
                  : t.type === "CHUA_CHON"
                    ? <span className="tag"><Clock size={11} /> Chờ chọn luồng</span>
                    : t.type === "SU_DUNG_HIEN_CO"
                      ? <span className="tag dx"><Package size={11} /> Sử dụng hiện có</span>
                    : <span className="tag dx"><ClipboardList size={11} /> Đề xuất</span>}
                <small className="kind-sub">{t.unit}{t.materialCategory ? ` · ${t.materialCategory}` : ""}</small>
              </span>
              <span>{t.assignedPosition}</span>
              <span className="material-name" title={materialText}>{materialText}</span>
              <span className="proposal-cell">
                {t.proposalNumber
                  ? <span className="code">{t.proposalNumber}</span>
                  : <span className="nophieu">Chưa có phiếu đề xuất</span>}
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
                {canEdit ? (
                  <>
                    <span role="button" tabIndex={0} title="Sửa phiếu" className="op"
                      onClick={(e) => { e.stopPropagation(); setEditTicket(t); }}><Pencil size={14} /></span>
                    <span role="button" tabIndex={0} title="Xóa phiếu" className="op del"
                      onClick={(e) => { e.stopPropagation(); setDelTicket(t); }}><Trash2 size={14} /></span>
                  </>
                ) : <span className="soft">—</span>}
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

      {isRolesOpen && <WorkflowRolesDialog onClose={closeRoles} />}

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
const CATEGORIES = ["Dầu bôi trơn", "Lọc dầu", "Hóa chất", "Bi nghiền"];
const UNITS = ["S1", "S2", "COMMON"];
const positionKey = (value?: string | null) => (value ?? "").trim().toLocaleLowerCase("vi");

function CreateDialog({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const [type, setType] = useState<"DE_XUAT" | "UNG" | null>("DE_XUAT");
  const [unit, setUnit] = useState("S1");
  const [note, setNote] = useState("");
  const [assigned, setAssigned] = useState("");
  const [category, setCategory] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [selectedErpCode, setSelectedErpCode] = useState("");
  const [proposedQuantity, setProposedQuantity] = useState(1);
  const [replacementDeviceSeq, setReplacementDeviceSeq] = useState("");
  const { data: opts } = useTicketOptions(true); // lấy danh sách cương vị
  const create = useCreateTicket();
  const materialCategoryLabel = category ? TICKET_TO_MATERIAL_CATEGORY[category] ?? category : "";
  const assignedKey = positionKey(assigned);
  const positionOptions = useMemo(
    () => (opts?.positions ?? []).filter((p) => isPositionAllowedForDefectUnit(unit, p)),
    [opts?.positions, unit]
  );
  const materialCards = useMemo(() => {
    if (!materialCategoryLabel) return [];
    return (opts?.materials ?? []).filter((m) => {
      const matchesCategory = m.category === materialCategoryLabel;
      const matchesUnit = m.machine === unit;
      const matchesPosition = !assignedKey || m.managingPositions.length === 0 || m.managingPositions.some((p) => positionKey(p) === assignedKey);
      return matchesCategory && matchesUnit && matchesPosition;
    });
  }, [assignedKey, materialCategoryLabel, opts?.materials, unit]);
  const isProposalType = false; // mã vật tư chỉ được chọn ở bước Trưởng ca/Trưởng kíp
  const selectedMaterial = materialCards.find((m) => m.id === selectedMaterialId) ?? null;
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
      return;
    }
    if (!materialCards.some((m) => m.id === selectedMaterialId)) {
      setSelectedMaterialId(materialCards[0].id);
    }
  }, [materialCards, selectedMaterialId, selectedErpCode]);

  React.useEffect(() => {
    if (!selectedErpOptions.length) {
      if (selectedErpCode) setSelectedErpCode("");
      return;
    }
    if (!selectedErpOptions.some((item) => item.code === selectedErpCode)) {
      setSelectedErpCode(selectedErpOptions[0].code);
    }
  }, [selectedErpCode, selectedErpOptions]);

  function selectUnit(nextUnit: string) {
    setUnit(nextUnit);
    setSelectedMaterialId("");
    setSelectedErpCode("");
    setReplacementDeviceSeq("");
    setAssigned((current) => current && !isPositionAllowedForDefectUnit(nextUnit, current) ? "" : current);
  }

  async function submit() {
    try {
      const res = await create.mutateAsync({
        unit, note: note.trim() || undefined,
        assignedPosition: assigned, materialCategory: category,
        materialId: selectedMaterialId || undefined,
        proposedQuantity,
        replacementDeviceSeq: replacementDeviceSeq || undefined,
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
            <label>Tổ máy</label>
            <div className="seg2">{UNITS.map((u) => (
              <button key={u} className={unit === u ? "on" : ""} onClick={() => selectUnit(u)}>{u}</button>
            ))}</div>

            <label>Cương vị được giao thực hiện *</label>
            <select value={assigned} onChange={(e) => { setAssigned(e.target.value); setSelectedMaterialId(""); setSelectedErpCode(""); }}>
              <option value="">— Chọn cương vị (chỉ cương vị này thấy phiếu) —</option>
              {positionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            <label>Loại vật tư *</label>
            <div className="cats">
              {CATEGORIES.map((c) => (
                <button key={c} type="button" className={category === c ? "on" : ""} onClick={() => { setCategory(c); setSelectedMaterialId(""); setSelectedErpCode(""); }}>{c}</button>
              ))}
            </div>

            {type && (
              <>
                <label>Tên vật tư</label>
                <div className="material-cards">
                  {!category ? (
                    <div className="material-empty">Chọn loại vật tư để hiện danh sách tên vật tư</div>
                  ) : materialCards.length ? (
                    materialCards.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={selectedMaterialId === m.id ? "on" : ""}
                        onClick={() => { setSelectedMaterialId(m.id); setSelectedErpCode(""); setReplacementDeviceSeq(""); }}
                        title={`${m.code} - ${m.name}`}
                      >
                        <span>{m.name}</span>
                        <small>Hiện có: {m.quantity} {m.unit}</small>
                      </button>
                    ))
                  ) : (
                    <div className="material-empty">
                      {assigned
                        ? "Chưa có mã vật tư đã link với cương vị này trong danh mục"
                        : "Chưa có vật tư thuộc loại này trong danh mục"}
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
                <div className="bbkt-grid"><div className="field">
                    <label>Ghi chú lý do *</label>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: thay định kỳ / hư hỏng đột xuất…" />
                  </div><div className="field qty-field">
                    <label>Số lượng đề xuất *</label>
                    <input type="number" min={1} value={proposedQuantity} onChange={(e) => setProposedQuantity(Math.max(1, Number(e.target.value) || 1))} />
                  </div></div>
                <label>Thiết bị thay thế *</label>
                <select value={replacementDeviceSeq} disabled={!selectedMaterialId} onChange={(e) => setReplacementDeviceSeq(e.target.value)}>
                  <option value="">{selectedMaterialId ? "— Chọn thiết bị từ Chi tiết điểm thay thế —" : "— Chọn tên vật tư trước —"}</option>
                  {(selectedMaterial?.devices ?? []).map((device) => <option key={device.seq} value={device.seq}>{device.label}</option>)}
                </select>
                {selectedMaterialId && !(selectedMaterial?.devices?.length) && <p className="hint">Vật tư này chưa có thiết bị trong Chi tiết điểm thay thế. Vui lòng khai báo thiết bị tại Danh mục vận hành 1 trước.</p>}
                <p className="hint">Luồng Đề xuất/Ứng, mã vật tư và số biên bản kiểm tra sẽ do Trưởng ca/Trưởng kíp xác nhận ở bước tiếp theo.</p>
              </>
            ) : (
              <p className="note ung"><Zap size={13} /> Luồng Ứng: số biên bản kiểm tra sẽ bổ sung sau bước xác nhận xuất file.</p>
            )}
            <div className="frm-f">
              <button className="btn ghost" onClick={onClose}>Hủy</button>
              <button className="btn primary"
                disabled={
                  create.isPending ||
                  !assigned ||
                  !category ||
                  !selectedMaterialId ||
                  !note.trim() || proposedQuantity <= 0 || !replacementDeviceSeq
                }
                onClick={submit}>
                {create.isPending ? <Loader2 className="spin" size={14} /> : <Plus size={14} />} Tạo phiếu
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ================= phân quyền quy trình (ADMIN) ================= */
const WF_STEPS: { key: keyof WorkflowRoleMap; label: string; hint: string }[] = [
  { key: "create", label: "Tạo phiếu / Đề xuất vật tư (B0)", hint: "Trống = mặc định: Quản trị, Kỹ thuật viên, Trưởng Ca/Trưởng Kíp" },
  { key: "confirm", label: "Xác nhận phiếu đề xuất", hint: "Trống = mặc định: Trưởng Ca/Trưởng Kíp" },
  { key: "vhvReceive", label: "Ứng — VHV lãnh vật tư", hint: "Trống = chỉ cương vị được giao phiếu; nếu cấu hình = đúng các cương vị được chọn" },
  { key: "stats", label: "Thống kê xác nhận ĐXVT (nhập số + xác nhận giao/trả phiếu)", hint: "Trống = mặc định: cương vị Thống kê" },
  { key: "receive", label: "Xác nhận vật tư lãnh (khối lượng lãnh + nguồn lãnh)", hint: "Trống = mặc định: Trưởng Ca/Trưởng Kíp" },
  { key: "use", label: "Sử dụng vật tư (PCT/LCT + khối lượng dùng)", hint: "Trống = mặc định: Trưởng Ca/Trưởng Kíp" },
  { key: "accept", label: "Nghiệm thu + BBNT ký tay + xuất BBNT DO", hint: "Trống = mặc định: Trưởng Ca/Trưởng Kíp" },
  { key: "settle", label: "Quyết toán vật tư", hint: "Trống = mặc định: cương vị Thống kê" },
  { key: "manage", label: "Sửa / Xoá phiếu", hint: "Trống = người tạo phiếu; nếu cấu hình = đúng các cương vị được chọn (Quản trị luôn được)" },
];

function WorkflowRolesDialog({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useWorkflowRoles(true);
  const save = useSaveWorkflowRoles();
  const positions = usePositions();
  const [roles, setRoles] = useState<WorkflowRoleMap | null>(null);

  React.useEffect(() => {
    if (data?.data && !roles) setRoles(data.data);
  }, [data, roles]);

  function toggle(step: keyof WorkflowRoleMap, position: string) {
    setRoles((r) => {
      if (!r) return r;
      const list = r[step];
      return { ...r, [step]: list.includes(position) ? list.filter((p) => p !== position) : [...list, position] };
    });
  }

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
      <div className="ovl" onClick={onClose} />
      <div className="dlg" style={{ width: 560, maxHeight: "86vh", overflowY: "auto" }}>
        <div className="dlg-h"><b>Phân quyền quy trình thay thế vật tư</b>
          <button className="x" onClick={onClose}><X size={16} /></button></div>
        <div className="frm">
          <p className="note"><UserCog size={13} /> Chọn CƯƠNG VỊ được thao tác ở từng bước. Bước để trống sẽ dùng nhóm mặc định. Quản trị luôn thao tác được mọi bước.</p>
          {isLoading || !roles ? (
            <div className="empty"><Loader2 className="spin" size={16} /> Đang tải cấu hình…</div>
          ) : (
            WF_STEPS.map((s) => (
              <div key={s.key}>
                <label>{s.label}</label>
                <div className="wfchips">
                  {positions.map((p) => (
                    <button key={p} type="button" className={roles[s.key].includes(p) ? "on" : ""} onClick={() => toggle(s.key, p)}>
                      {p}
                    </button>
                  ))}
                </div>
                <p className="hint">{s.hint}</p>
              </div>
            ))
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
  const [unit, setUnit] = useState(t.unit);
  const [bbkt, setBbkt] = useState(t.bbktNumber ?? "");
  const [assigned, setAssigned] = useState(t.assignedPosition);
  const [category, setCategory] = useState(t.materialCategory ?? "");
  const [selectedMaterialId, setSelectedMaterialId] = useState(t.items[0]?.materialId ?? "");
  const [selectedErpCode, setSelectedErpCode] = useState(t.items[0]?.erpCode ?? "");
  const [proposedQuantity, setProposedQuantity] = useState(t.items[0]?.quantity ?? 1);
  const [note, setNote] = useState(t.proposalNote ?? "");
  const [replacementDeviceSeq, setReplacementDeviceSeq] = useState(t.items[0]?.deviceSeq ?? "");
  const { data: opts } = useTicketOptions(true);
  const act = useTicketAction(t.id);
  const materialCategoryLabel = category ? TICKET_TO_MATERIAL_CATEGORY[category] ?? category : "";
  const assignedKey = positionKey(assigned);
  const positionOptions = useMemo(
    () => (opts?.positions ?? []).filter((p) => isPositionAllowedForDefectUnit(unit, p)),
    [opts?.positions, unit]
  );
  const materialCards = useMemo(() => {
    if (!materialCategoryLabel) return [];
    return (opts?.materials ?? []).filter((m) => {
      const matchesCategory = m.category === materialCategoryLabel;
      const matchesUnit = m.machine === unit;
      const matchesPosition = !assignedKey || m.managingPositions.length === 0 || m.managingPositions.some((p) => positionKey(p) === assignedKey);
      return matchesCategory && matchesUnit && matchesPosition;
    });
  }, [assignedKey, materialCategoryLabel, opts?.materials, unit]);
  const selectedMaterial = materialCards.find((m) => m.id === selectedMaterialId) ?? null;
  const selectedErpOptions = useMemo(
    () => selectedMaterial?.erpCodes?.length
      ? selectedMaterial.erpCodes
      : selectedMaterial
        ? [{ code: selectedMaterial.code, erpStock: 0 }]
        : [],
    [selectedMaterial]
  );

  React.useEffect(() => {
    if (!['DE_XUAT', 'UNG'].includes(t.type)) return;
    if (!materialCards.length) {
      if (selectedMaterialId) setSelectedMaterialId("");
      if (selectedErpCode) setSelectedErpCode("");
      if (replacementDeviceSeq) setReplacementDeviceSeq("");
      return;
    }
    if (!materialCards.some((m) => m.id === selectedMaterialId)) {
      setSelectedMaterialId(materialCards[0].id);
      setReplacementDeviceSeq("");
    }
  }, [materialCards, selectedMaterialId, selectedErpCode, replacementDeviceSeq, t.type]);

  React.useEffect(() => {
    if (!['DE_XUAT', 'UNG'].includes(t.type)) return;
    if (!selectedErpOptions.length) {
      if (selectedErpCode) setSelectedErpCode("");
      return;
    }
    if (!selectedErpOptions.some((item) => item.code === selectedErpCode)) {
      setSelectedErpCode(selectedErpOptions[0].code);
    }
  }, [selectedErpCode, selectedErpOptions, t.type]);

  React.useEffect(() => {
    if (!["DE_XUAT", "UNG"].includes(t.type)) return;
    if (!selectedMaterial) {
      if (replacementDeviceSeq) setReplacementDeviceSeq("");
      return;
    }
    if (replacementDeviceSeq && !selectedMaterial.devices.some((device) => device.seq === replacementDeviceSeq)) {
      setReplacementDeviceSeq("");
    }
  }, [replacementDeviceSeq, selectedMaterial, t.type]);

  function selectUnit(nextUnit: string) {
    setUnit(nextUnit);
    setSelectedMaterialId("");
    setSelectedErpCode("");
    setReplacementDeviceSeq("");
    setAssigned((current) => current && !isPositionAllowedForDefectUnit(nextUnit, current) ? "" : current);
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
        replacementDeviceSeq: replacementDeviceSeq || undefined,
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
          <label>Tổ máy</label>
          <div className="seg2">{UNITS.map((u) => (
            <button key={u} className={unit === u ? "on" : ""} onClick={() => selectUnit(u)}>{u}</button>
          ))}</div>

          <label>Cương vị được giao thực hiện *</label>
          <select value={assigned} onChange={(e) => { setAssigned(e.target.value); setSelectedMaterialId(""); setSelectedErpCode(""); setReplacementDeviceSeq(""); }}>
            <option value="">— Chọn cương vị (chỉ cương vị này thấy phiếu) —</option>
            {positionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <label>Loại vật tư *</label>
          <div className="cats">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" className={category === c ? "on" : ""} onClick={() => { setCategory(c); setSelectedMaterialId(""); setSelectedErpCode(""); setReplacementDeviceSeq(""); }}>{c}</button>
            ))}
          </div>

          {["DE_XUAT", "UNG"].includes(t.type) && (
            <>
              <label>Tên vật tư</label>
              <div className="material-cards">
                {!category ? (
                  <div className="material-empty">Chọn loại vật tư để hiện danh sách tên vật tư</div>
                ) : materialCards.length ? (
                  materialCards.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={selectedMaterialId === m.id ? "on" : ""}
                      onClick={() => { setSelectedMaterialId(m.id); setSelectedErpCode(""); setReplacementDeviceSeq(""); }}
                      title={`${m.code} - ${m.name}`}
                    >
                      <span>{m.name}</span>
                      <small>Hiện có: {m.quantity} {m.unit}</small>
                    </button>
                  ))
                ) : (
                  <div className="material-empty">
                    {assigned
                      ? "Chưa có mã vật tư đã link với cương vị này trong danh mục"
                      : "Chưa có vật tư thuộc loại này trong danh mục"}
                  </div>
                )}
                </div>

              <label>Mã vật tư *</label>
              <select value={selectedErpCode} disabled={!selectedMaterialId} onChange={(e) => setSelectedErpCode(e.target.value)}>
                <option value="">{selectedMaterialId ? "— Chọn mã vật tư —" : "— Chọn tên vật tư trước —"}</option>
                {selectedErpOptions.map((item) => (
                  <option key={item.code} value={item.code}>{item.code} · Số liệu ERP: {item.erpStock}</option>
                ))}
              </select>

              <div className="bbkt-grid">
                <div className="field">
                  <label>Ghi chú *</label>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: thay định kỳ / hư hỏng đột xuất..." />
                </div>
                <div className="field qty-field">
                  <label>Số lượng đề xuất *</label>
                  <input
                    type="number"
                    min={1}
                    value={proposedQuantity}
                    onChange={(e) => setProposedQuantity(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              </div>

              <label>Thiết bị thay thế *</label>
              <select value={replacementDeviceSeq} disabled={!selectedMaterialId} onChange={(e) => setReplacementDeviceSeq(e.target.value)}>
                <option value="">{selectedMaterialId ? "— Chọn thiết bị từ Chi tiết điểm thay thế —" : "— Chọn tên vật tư trước —"}</option>
                {(selectedMaterial?.devices ?? []).map((device) => <option key={device.seq} value={device.seq}>{device.label}</option>)}
              </select>
              {selectedMaterialId && !(selectedMaterial?.devices?.length) && <p className="hint">Vật tư này chưa có thiết bị trong Chi tiết điểm thay thế. Vui lòng khai báo thiết bị tại Danh mục vận hành 1 trước.</p>}
            </>
          )}

          <label>Số biên bản kiểm tra (nếu có)</label>
          <input value={bbkt} onChange={(e) => setBbkt(e.target.value)} placeholder="Nhập số biên bản kiểm tra" />

          <div className="frm-f">
            <button className="btn ghost" onClick={onClose}>Hủy</button>
            <button className="btn primary"
              disabled={
                act.isPending ||
                !assigned ||
                !category ||
                (["DE_XUAT", "UNG"].includes(t.type) && (!selectedMaterialId || !selectedErpCode || proposedQuantity <= 0 || !note.trim() || !replacementDeviceSeq))
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

/* ================= chi tiết ================= */
function Detail({ t, viewer, onClose }: { t: MaterialTicket; viewer: TicketViewer | null; onClose: () => void }) {
  const [showActivity, setShowActivity] = useState(false);
  const [reviewStep, setReviewStep] = useState<string | null>(null);
  const flow = FLOW[t.type];
  const order = ORDER[t.type];
  const flowStatus = flowStatusKey(t.status);
  const idx = t.status === "TU_CHOI" ? 99 : t.status === "VAT_TU_KHONG_CO" ? 1 : order.indexOf(flowStatus);
  const currentReceiptSourceLabel = receiptSourceLabel(t.receiptSource);
  const replacementDeviceName = Array.from(new Set(t.items
    .map((item) => item.deviceNameManual || item.device?.name || "")
    .filter(Boolean)))
    .join(", ");
  const handwrittenBbntUrl = t.bbktDocUrl ? bbntDownloadUrl(t.bbktDocUrl, replacementDeviceName) : null;
  const exportedDocumentCount = [t.docUrl, handwrittenBbntUrl, t.recoveryDocUrl].filter(Boolean).length;
  const activityLogs = [
    t.createdAt && { at: t.createdAt, who: t.createdByName, what: "Tạo phiếu" },
    t.proposedAt && { at: t.proposedAt, who: t.proposedByName, pos: t.proposedByPosition, what: t.type === "UNG" ? "Nhập liệu thay thế" : "Đề xuất vật tư" },
    t.confirmedAt && { at: t.confirmedAt, who: t.confirmedByName, pos: t.confirmedByPosition, what: "Xác nhận — kho đủ" },
    t.vhvReceivedAt && { at: t.vhvReceivedAt, who: t.vhvReceivedByName, pos: t.vhvReceivedByPosition, what: `VHV lãnh ${t.vhvReceivedQuantity ?? ""}${t.vhvMaterialCode ? ` · Mã ${t.vhvMaterialCode}` : " · Không có mã vật tư"}` },
    t.statsAt && { at: t.statsAt, who: t.statsByName, pos: t.statsByPosition, what: `Xác nhận ĐXVT: ${t.proposalNumber ?? ""}${t.proposalReceiverName ? ` · VHV nhận: ${t.proposalReceiverName}` : ""}` },
    t.proposalIssuedAt && !t.statsAt && { at: t.proposalIssuedAt, who: t.statsByName, pos: t.statsByPosition, what: `Xác nhận ĐXVT${t.proposalReceiverName ? ` · VHV nhận: ${t.proposalReceiverName}` : ""}` },
    t.receivedAt && { at: t.receivedAt, who: t.receivedByName, pos: t.receivedByPosition, what: `Xác nhận vật tư lãnh: ${t.receivedQuantity ?? ""} · ${receiptSourceLabel(t.receiptSource)} · Phiếu giao hàng ${t.deliveryNoteNumber ?? t.receivedMethod ?? "—"}` },
    t.usedAt && { at: t.usedAt, who: t.usedByName, pos: t.usedByPosition, what: `Sử dụng vật tư${t.materialUserName ? ` — VHV: ${t.materialUserName}` : ""}: dùng ${t.usedQuantity ?? ""}, còn lại ${t.remainingQuantity ?? ""}` },
    t.completedAt && { at: t.completedAt, who: t.completedByName, pos: t.completedByPosition, what: t.type === "UNG" ? "Đã nghiệm thu, chuyển xác nhận vật tư lãnh" : "Nghiệm thu, xuất Biên Bản Nghiệm Thu" },
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
	            const recoveryPending = s.key === "SU_DUNG_VAT_TU" && !!t.recoveryRequired && (!t.recoveryReturnedAt || !t.recoveryDocUrl);
	            const reviewable = done || (t.type === "UNG" && s.key === "CHO_HOAN_THIEN" && !!t.bbktNumber);
	            const caption = s.key === "CHO_PHIEU__XUAT_KHO" && t.proposalReceiverName
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
              const short = ["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"].includes(t.type) && it.quantity > it.material.quantity;
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
            {(t.pctNumber || t.repairRequestNumber) && (
              <div className="ticket-note-row">
                {t.pctNumber && <div className="meta-line">Số PCT/LCT: <b>{t.pctNumber}</b></div>}
                {t.repairRequestNumber && <div className="meta-line repair-request-meta">Số phiếu yêu cầu sửa chữa: <b>{t.repairRequestNumber}</b></div>}
              </div>
            )}
            <div className={`completion-overview ${exportedDocumentCount > 0 ? "with-documents" : ""}`}>
              <div className="completion-details">
                {t.completionNote && <div className="done-note"><Check size={13} /> {t.completionNote}</div>}
                {t.receivedQuantity != null && (
                  <div className="meta-line received-summary">
                    <span>Vật tư lãnh: <b>{t.receivedQuantity} {t.items[0]?.material.unit ?? ""}</b></span>
                    <span>Nguồn lãnh: <b className="source-badge">{currentReceiptSourceLabel}</b></span>
                    <em>đã cộng vào số lượng hiện có</em>
                  </div>
                )}
                {t.vhvReceivedQuantity != null && <div className="meta-line">VHV đã lãnh: <b>{t.vhvReceivedQuantity} {t.items[0]?.material.unit ?? ""}</b> · Mã vật tư nhập tay: <b>{t.vhvMaterialCode || "Không có"}</b></div>}
                {t.usedQuantity != null && (
                  <div className="meta-line">
                    {t.materialUserName && <>VHV sử dụng: <b>{t.materialUserName}</b> · </>}Đã sử dụng: <b>{t.usedQuantity} {t.items[0]?.material.unit ?? ""}</b> · Còn lại: <b>{t.remainingQuantity} {t.items[0]?.material.unit ?? ""}</b>
                    {" — số đã sử dụng đã trừ khỏi số lượng hiện có"}
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
                  {handwrittenBbntUrl && <a className="pdf" href={handwrittenBbntUrl} target="_blank" rel="noreferrer"><Download size={14} /> Biên Bản Nghiệm Thu Ký Tay</a>}
                  {t.docUrl && <a className="pdf" href={t.docUrl} target="_blank" rel="noreferrer"><Download size={14} /> Biên Bản Nghiệm Thu D-Office</a>}
                  {t.recoveryDocUrl && <a className="pdf recovery-download" href={t.recoveryDocUrl} target="_blank" rel="noreferrer"><Download size={14} /> Biên Bản Vật Tư Thu Hồi</a>}
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
  const [pctNumber, setPctNumber] = useState(t.pctNumber ?? "");
  const [chiHuyName, setChiHuyName] = useState(t.chiHuyName ?? "");
  const [completionNote, setCompletionNote] = useState(t.completionNote ?? "");
  const [bbktNumber, setBbktNumber] = useState(t.bbktNumber ?? "");
  const [recoveryRequired, setRecoveryRequired] = useState(t.recoveryRequired === true);
  const [recoveryQuantity, setRecoveryQuantity] = useState(t.recoveryQuantity ?? 1);
  const [recoveryReturned, setRecoveryReturned] = useState(!!t.recoveryReturnedAt);

  const label = FLOW[t.type].find((step) => step.key === stepKey)?.label ?? "Chi tiết bước";
  async function save() {
    if (!editStep) return;
    const payload: Record<string, unknown> = { action: "editStep", step: editStep };
    if (editStep === "confirm") payload.bbktNumber = bbktNumber;
    if (editStep === "stats") Object.assign(payload, { proposalNumber, proposalReceiverName: proposalReceiverNameReview });
    if (editStep === "receive") Object.assign(payload, { receivedQuantity, deliveryNoteNumber: receivedMethod, receiptSource });
    if (editStep === "use") Object.assign(payload, {
      usedQuantity,
      materialUserName: materialUserName.trim(),
      recoveryRequired,
      recoveryQuantity: recoveryRequired ? recoveryQuantity : null,
      recoveryReturned: recoveryRequired && recoveryReturned,
    });
    if (editStep === "accept") Object.assign(payload, { pctNumber, chiHuyName, completionNote });
    try { await act.mutateAsync(payload); toast.success("Đã chỉnh sửa bước và cập nhật hoạt động"); onClose(); }
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
          <label>Số biên bản kiểm tra (nếu có)<input value={bbktNumber} disabled={!canEdit} onChange={(e) => setBbktNumber(e.target.value)} placeholder="Chưa nhập số biên bản kiểm tra" /></label>
        </>}
        {editStep === "stats" && <>
          <label>Số phiếu ĐXVT<input value={proposalNumber} disabled={!canEdit} onChange={(e) => setProposalNumber(e.target.value)} /></label>
          {t.type !== "UNG" && <label>Tên VHV nhận phiếu ĐXVT (không bắt buộc)<input value={proposalReceiverNameReview} disabled={!canEdit} onChange={(e) => setProposalReceiverNameReview(e.target.value)} /></label>}
        </>}
        {editStep === "receive" && <>
          <label>Khối lượng lãnh<input type="number" min={1} value={receivedQuantity} disabled={!canEdit} onChange={(e) => setReceivedQuantity(Number(e.target.value))} /></label>
          <div className={`review-receive-row ${t.type !== "UNG" ? "single" : ""}`}>
            <div className="review-receive-source">
              <label>Nguồn lãnh vật tư</label>
              {t.type === "UNG" ? (
                <div className="seg2 review-receive-toggle">
                  <button type="button" disabled={!canEdit} className={receiptSource === "ERP" ? "on" : ""} onClick={() => setReceiptSource("ERP")}>Lãnh kho DH1</button>
                  <button type="button" disabled={!canEdit} className={receiptSource === "EXISTING" ? "on" : ""} onClick={() => setReceiptSource("EXISTING")}>Lãnh vật tư "Hiện có"</button>
                </div>
              ) : <div className="fixed-receive-source">Lãnh kho DH1</div>}
            </div>
            <label className="field review-delivery-field">Số phiếu giao hàng
              <input value={receivedMethod} disabled={!canEdit} onChange={(e) => setReceivedMethod(e.target.value)} />
            </label>
          </div>
        </>}
        {(editStep === "use") && <>
          <label>Tên VHV sử dụng vật tư<input value={materialUserName} disabled={!canEdit} onChange={(e) => setMaterialUserName(e.target.value)} placeholder="Nhập tên VHV sử dụng vật tư" /></label>
          <label>Số lượng sử dụng ({t.items[0]?.material.unit ?? ""})<input type="number" min={1} value={usedQuantity} disabled={!canEdit} onChange={(e) => setUsedQuantity(Number(e.target.value))} /></label>
          <label>Có vật tư thu hồi hay không?</label>
          <div className="seg2"><button type="button" disabled={!canEdit} className={!recoveryRequired ? "on" : ""} onClick={() => { setRecoveryRequired(false); setRecoveryReturned(false); }}>Không</button><button type="button" disabled={!canEdit} className={recoveryRequired ? "on" : ""} onClick={() => setRecoveryRequired(true)}>Có</button></div>
          {recoveryRequired && <>
            <label>Số lượng vật tư thu hồi ({t.items[0]?.material.unit ?? ""})<input type="number" min={1} value={recoveryQuantity} disabled={!canEdit} onChange={(e) => setRecoveryQuantity(Number(e.target.value))} /></label>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800"><input className="!h-5 !w-5 shrink-0 cursor-pointer accent-blue-600" type="checkbox" disabled={!canEdit} checked={recoveryReturned} onChange={(e) => setRecoveryReturned(e.target.checked)} /><span>Xác nhận đã trả vật tư thu hồi</span></label>
            {!recoveryReturned && <p className="recovery-review-warning"><AlertTriangle size={15} /> Bước này vẫn hiển thị màu vàng cho đến khi xác nhận đã trả vật tư.</p>}
          </>}
        </>}
        {editStep === "accept" && <><label>Số PCT/LCT<input value={pctNumber} disabled={!canEdit} onChange={(e) => setPctNumber(e.target.value)} /></label><label>Chỉ huy trực tiếp<input value={chiHuyName} disabled={!canEdit} onChange={(e) => setChiHuyName(e.target.value)} /></label><label>Nội dung<textarea rows={3} value={completionNote} disabled={!canEdit} onChange={(e) => setCompletionNote(e.target.value)} /></label></>}
        {permission && !canEdit && <p className="hint">Bạn có thể xem lại nhưng chưa được phân quyền chỉnh sửa bước này.</p>}
        <div className="frm-f"><button className="btn ghost" onClick={onClose}>Đóng</button>{canEdit && <button className="btn primary" disabled={act.isPending} onClick={save}>{act.isPending ? <Loader2 className="spin" size={14} /> : <Pencil size={14} />} Lưu chỉnh sửa</button>}</div>
      </div>
    </div>
  </>;
}

/* ================= hành động theo lượt ================= */
function ActionArea({ t, viewer }: { t: MaterialTicket; viewer: TicketViewer | null }) {
  const acts = actionsFor(t, viewer);
  const act = useTicketAction(t.id);
  const needItems = acts.includes("confirm") || acts.includes("receive") || acts.includes("propose") || acts.includes("stats") || acts.includes("statsExportDocuments");
  const { data: opts } = useTicketOptions(needItems);
  const [items, setItems] = useState([{ materialId: "", erpCode: "", deviceSeq: "", quantity: 1 }]);
  const [note, setNote] = useState("");
  // Tách riêng từng loại số chứng từ. Trước đây dùng chung một state `num`, nên
  // số ĐXVT vừa nhập có thể bị giữ lại và tự xuất hiện trong ô số biên bản kiểm tra ở bước sau.
  const [proposalNumberInput, setProposalNumberInput] = useState("");
  const [bbktNumberInput, setBbktNumberInput] = useState("");
  const [repairRequestNumber, setRepairRequestNumber] = useState(t.repairRequestNumber ?? "");
  const [materialUserNameInput, setMaterialUserNameInput] = useState(t.materialUserName ?? "");
  const [pct, setPct] = useState("");
  const [chiHuy, setChiHuy] = useState("");
  const [proposalReceiverName, setProposalReceiverName] = useState(t.proposalReceiverName ?? "");
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState(() => Math.max(1, t.items[0]?.quantity ?? 1)); // số lượng xác nhận / lãnh / sử dụng
  const [method, setMethod] = useState(""); // hình thức lãnh
  const [manualMaterialCode, setManualMaterialCode] = useState("");
  const [receiptSource, setReceiptSource] = useState<"ERP" | "EXISTING">("ERP");
  const [workflowType, setWorkflowType] = useState<"DE_XUAT" | "UNG" | "SU_DUNG_HIEN_CO">("DE_XUAT");
  const [erpCode, setErpCode] = useState(t.items[0]?.erpCode ?? "");
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [recoveryReturned, setRecoveryReturned] = useState(false);
  const [recoveryQuantityInput, setRecoveryQuantityInput] = useState("1");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
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
      CHO_XAC_NHAN_PHAT: "Người được phân quyền Thống Kê xác nhận ĐXVT",
      VHV_LANH_VAT_TU: `Cương vị VHV được giao "${t.assignedPosition}"`,
      NHAN_TU_HIEN_CO: `Cương vị được giao "${t.assignedPosition}" nhận vật tư từ Hiện có`,
      NHAN_VAT_TU: "Người được phân quyền Xác nhận vật tư lãnh",
      SU_DUNG_VAT_TU: "Người được phân quyền Xác nhận sử dụng vật tư",
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
  const materialOptions = (opts?.materials ?? []).filter((m) => (!wantCategory || m.category === wantCategory) && m.machine === t.unit);
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
        const deviceOptions = rowMat?.devices ?? [];
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
              <option key={d.seq} value={d.seq}>{d.label}</option>
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

  if (acts.includes("confirm")) {
    if (t.type === "CHUA_CHON") {
      const selectedMaterialOption = opts?.materials.find((material) => material.id === t.items[0]?.materialId);
      const erpInfoRows = selectedMaterialOption?.erpCodes?.length
        ? selectedMaterialOption.erpCodes
        : (t.items[0]?.material.erpCodes?.length ? t.items[0].material.erpCodes : [t.items[0]?.material.code].filter(Boolean) as string[])
            .map((code) => ({ code, name: t.items[0]?.material.name ?? "—", erpStock: 0 }));
      const existingStockShortages = t.items.filter((item, index) => (index === 0 ? qty : item.quantity) > item.material.quantity);
      const canUseExistingStock = existingStockShortages.length === 0;
      return <div className="act">
        <div className="act-title-row">
          <label className="lb">Xác nhận yêu cầu</label>
          <div className="seg3 flow-toggle" aria-label="Chọn luồng vật tư">
            <button
              type="button"
              className={workflowType === "DE_XUAT" ? "on" : ""}
              onClick={() => setWorkflowType("DE_XUAT")}
            >
              Đề xuất
            </button>
            <button type="button" className={workflowType === "UNG" ? "on" : ""} onClick={() => setWorkflowType("UNG")}>Ứng</button>
            <button
              type="button"
              className={workflowType === "SU_DUNG_HIEN_CO" ? "on" : ""}
              disabled={!canUseExistingStock}
              title={canUseExistingStock ? "Sử dụng số lượng vật tư hiện có" : "Số lượng hiện có không đủ"}
              onClick={() => setWorkflowType("SU_DUNG_HIEN_CO")}
            >
              Sử dụng hiện có
            </button>
          </div>
        </div>
        {!canUseExistingStock && (
          <div className="warnbox">
            <AlertTriangle size={15} />
            Không thể chọn <b>Sử dụng hiện có</b>: {existingStockShortages.map((item) => `${item.material.name} cần ${item.id === t.items[0]?.id ? qty : item.quantity}, hiện có ${item.material.quantity} ${item.material.unit}`).join("; ")}. Bạn vẫn có thể chọn <b>Đề xuất</b> hoặc <b>Ứng</b>.
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
              {erpInfoRows.map((row) => (
                <div className="erp-readonly-row" key={row.code}>
                  <b>{row.code}</b>
                  <span>{row.name || t.items[0]?.material.name || "—"}</span>
                  <strong>{row.erpStock.toLocaleString("vi-VN")} {t.items[0]?.material.unit ?? ""}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="confirm-field-row two-even">
          <label className="field qty-field">Xác nhận lại số lượng {workflowType === "DE_XUAT" ? "đề xuất" : workflowType === "UNG" ? "ứng" : "sử dụng hiện có"} *
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label className="field">Số biên bản kiểm tra (nếu có)
            <input name={`bbkt-confirm-${t.id}`} autoComplete="off" value={bbktNumberInput} onChange={(e) => setBbktNumberInput(e.target.value)} placeholder="Nhập số biên bản kiểm tra" />
          </label>
        </div>
        <button className="btn primary big" disabled={qty <= 0 || (workflowType === "SU_DUNG_HIEN_CO" && !canUseExistingStock) || act.isPending} onClick={() => run({ action: "confirm", workflowType, proposedQuantity: qty, bbktNumber: bbktNumberInput.trim() || undefined }, `Đã chọn luồng ${workflowType === "DE_XUAT" ? "Đề xuất" : workflowType === "UNG" ? "Ứng" : "Sử dụng hiện có"}`)}><Check size={15} /> Xác nhận</button>
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
    const selectedMaterialOption = opts?.materials.find((material) => material.id === t.items[0]?.materialId);
    const statsCodeOptions = selectedMaterialOption?.erpCodes?.length
      ? selectedMaterialOption.erpCodes
      : (t.items[0]?.material.erpCodes?.length ? t.items[0].material.erpCodes : [t.items[0]?.material.code].filter(Boolean) as string[])
          .map((code) => ({ code, name: t.items[0]?.material.name ?? "", erpStock: 0 }));
    const selectedStatsErp = statsCodeOptions.find((option) => option.code === erpCode);
    return (
      <div className="act">
        <div className={`stats-issue-grid ${asksForErpCode ? "" : "single"}`}>
          {!isReceiverPhase ? (
            <>
              {asksForErpCode && (
                <label className="field">Mã vật tư *
                  <select value={erpCode} onChange={(e) => setErpCode(e.target.value)}>
                    <option value="">— Chọn mã vật tư ERP —</option>
                    {statsCodeOptions.map((option) => <option key={option.code} value={option.code}>{option.code} · ERP: {option.erpStock.toLocaleString("vi-VN")} {t.items[0]?.material.unit ?? ""}</option>)}
                  </select>
                </label>
              )}
              <label className="field">Số phiếu ĐXVT *
                <input name={`proposal-number-${t.id}`} autoComplete="off" placeholder="Số phiếu ĐXVT (vd: ĐXVT-051)" value={proposalNumberInput} onChange={(e) => setProposalNumberInput(e.target.value)} />
              </label>
            </>
          ) : asksForReceiver ? (
            <label className="field">Tên VHV nhận phiếu ĐXVT (không bắt buộc)
              <input
                value={proposalReceiverName}
                onChange={(e) => setProposalReceiverName(e.target.value)}
                placeholder="Nhập tên VHV nhận phiếu ĐXVT"
              />
            </label>
          ) : <div className="warnbox"><AlertTriangle size={15} /> Chưa xác nhận đã trả phiếu.</div>}
        </div>
        {asksForErpCode && selectedStatsErp && (
          <div className="note"><Package size={14} /><span><b>Tên vật tư ERP:</b> {selectedStatsErp.name} · <b>Số lượng ERP:</b> {selectedStatsErp.erpStock.toLocaleString("vi-VN")} {t.items[0]?.material.unit ?? ""}</span></div>
        )}
        <button
          className="btn primary big"
          disabled={(!isReceiverPhase && (!proposalNumberInput.trim() || (asksForErpCode && !erpCode))) || act.isPending}
          onClick={() => run(
            asksForReceiver
              ? { action: "stats", proposalNumber: t.proposalNumber, proposalReceiverName: proposalReceiverName.trim() }
              : isReceiverPhase
                ? { action: "stats", proposalNumber: t.proposalNumber }
              : { action: "stats", proposalNumber: proposalNumberInput.trim(), ...(asksForErpCode ? { erpCode } : {}) },
            asksForReceiver ? "Đã xác nhận VHV nhận phiếu ĐXVT" : isReceiverPhase ? "Đã xác nhận trả phiếu" : "Đã xác nhận số phiếu ĐXVT"
          )}
        >
          <Check size={15} /> {asksForReceiver ? "Xác nhận VHV nhận phiếu ĐXVT" : isReceiverPhase ? "Xác nhận đã trả phiếu" : "Xác nhận số phiếu ĐXVT"}
        </button>
      </div>
    );
  }

  if (acts.includes("vhvReceive")) {
    const unit = t.items[0]?.material.unit ?? "";
    return <div className="act">
      <label className="lb">VHV lãnh vật tư</label>
      <label>Số lượng vật tư đã lãnh{unit ? ` (${unit})` : ""} *</label>
      <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value)) || 1))} />
      <label>Mã vật tư (nếu có)</label>
      <input value={manualMaterialCode} onChange={(e) => setManualMaterialCode(e.target.value)} placeholder="Nhập tay mã vật tư hoặc để trống" />
      <p className="hint">Sau khi xác nhận, số lượng đã lãnh được cộng vào Hiện có để sử dụng ở bước sau. Số lượng ERP không thay đổi.</p>
      <button className="btn primary big" disabled={qty <= 0 || act.isPending} onClick={() => run({ action: "vhvReceive", quantity: qty, materialCode: manualMaterialCode.trim() || undefined }, "Đã ghi nhận VHV lãnh vật tư")}><Check size={15} /> Xác nhận</button>
    </div>;
  }

  if (acts.includes("receiveExisting")) {
    const unit = t.items[0]?.material.unit ?? "";
    const stock = t.items[0]?.material.quantity ?? 0;
    return <div className="act">
      <label className="lb">Nhận vật tư từ Hiện có</label>
      <p className="hint">Hiện có: <b>{stock} {unit}</b>. Bước này chỉ ghi nhận số lượng nhận, chưa trừ Hiện có.</p>
      <label>Số lượng nhận{unit ? ` (${unit})` : ""} *</label>
      <input type="number" min={1} max={stock} value={qty} onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value)) || 1))} />
      {qty > stock && <div className="warnbox"><AlertTriangle size={15} /> Số lượng nhận vượt quá Hiện có.</div>}
      <button className="btn primary big" disabled={qty <= 0 || qty > stock || act.isPending} onClick={() => run({ action: "receiveExisting", quantity: qty }, "Đã ghi nhận nhận vật tư từ Hiện có")}><Check size={15} /> Xác nhận</button>
    </div>;
  }

  if (acts.includes("receive")) {
    const unit = t.items[0]?.material.unit ?? "";
    const isAdvance = t.type === "UNG";
    const selectedMaterialOption = opts?.materials.find((material) => material.id === t.items[0]?.materialId);
    const receiveCodeOptions = selectedMaterialOption?.erpCodes?.length
      ? selectedMaterialOption.erpCodes
      : (t.items[0]?.material.erpCodes ?? []).map((code) => ({ code, name: "", erpStock: 0 }));
    const selectedReceiveErp = receiveCodeOptions.find((option) => option.code === erpCode);
    return (
      <div className="act">
        {isAdvance && <div className="act-title-row receive-title-row">
          <div className="receive-location">
            <span>Vị trí lãnh vật tư:</span>
            <em>{receiptSource === "ERP" ? "Số lượng lãnh sẽ được trừ khỏi số lượng ERP." : 'Lãnh vật tư "Hiện có" không làm thay đổi số lượng ERP.'}</em>
          </div>
          <div className="seg2 receive-source-toggle" aria-label="Nguồn lãnh vật tư">
            <button type="button" className={receiptSource === "ERP" ? "on" : ""} onClick={() => setReceiptSource("ERP")}>Lãnh kho DH1</button>
            <button type="button" className={receiptSource === "EXISTING" ? "on" : ""} onClick={() => setReceiptSource("EXISTING")}>Lãnh vật tư "Hiện có"</button>
          </div>
        </div>}
        {isAdvance && <>
          <label>Mã vật tư *</label>
          <select value={erpCode} onChange={(e) => setErpCode(e.target.value)}><option value="">— Chọn mã vật tư ERP —</option>{receiveCodeOptions.map((option) => <option key={option.code} value={option.code}>{option.code} · ERP: {option.erpStock} {unit}</option>)}</select>
          {selectedReceiveErp && <div className="note"><b>Tên vật tư ERP:</b> {selectedReceiveErp.name}<br/><b>Số lượng ERP:</b> {selectedReceiveErp.erpStock} {unit}</div>}
        </>}
        <div className={`receive-field-grid ${isAdvance ? "two-cols" : ""}`}>
          <label className="field">Khối lượng vật tư lãnh
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value)) || 1))} />
          </label>
          <label className="field">Số phiếu giao hàng *
            <input placeholder="Nhập số phiếu giao hàng" value={method} onChange={(e) => setMethod(e.target.value)} />
          </label>
          {!isAdvance && (
            <label className="field">Số phiếu yêu cầu sửa chữa *
              <input placeholder="Nhập số phiếu yêu cầu sửa chữa" value={repairRequestNumber} onChange={(e) => setRepairRequestNumber(e.target.value)} />
            </label>
          )}
        </div>
        {!isAdvance && repairRequestConflictsProposal && (
          <div className="warnbox"><AlertTriangle size={15} /> Số phiếu yêu cầu sửa chữa phải nhập mới, không được trùng với số phiếu ĐXVT.</div>
        )}
        {isAdvance && <div className="note"><FileText size={15} /><span>Sau khi xác nhận, hệ thống sẽ xuất <b>BBNT ký tay</b>, <b>BBNT DO</b>{t.recoveryRequired ? <> và <b>Biên bản vật tư thu hồi</b></> : ""} bằng thông tin ERP đã chọn.</span></div>}
        <button className="btn primary big" disabled={qty <= 0 || (isAdvance && !erpCode) || !method.trim() || (!isAdvance && (!repairRequestNumber.trim() || repairRequestConflictsProposal)) || act.isPending}
          onClick={() => run({ action: "receive", receivedQuantity: qty, deliveryNoteNumber: method.trim(), receiptSource: isAdvance ? receiptSource : "ERP", ...(isAdvance ? { erpCode } : { repairRequestNumber: repairRequestNumber.trim() }) }, isAdvance ? "Đã xác nhận vật tư lãnh và xuất các biên bản" : "Đã xác nhận vật tư lãnh")}>
          {act.isPending ? <Loader2 className="spin" size={15} /> : isAdvance ? <FileText size={15} /> : <Check size={15} />} {isAdvance ? "Xác nhận & xuất biên bản" : "Xác nhận"}
        </button>
      </div>
    );
  }

  if (acts.includes("repairRequest")) return (
    <div className="act">
      <label className="lb">Xác nhận vật tư lãnh</label>
      <div className="note"><FileText size={15} /> Phiếu đang ở trạng thái cũ, vui lòng bổ sung số phiếu yêu cầu sửa chữa để chuyển sang bước Sử dụng vật tư.</div>
      <div className="act-field-row">
        <label>Số phiếu yêu cầu sửa chữa *</label>
        <input value={repairRequestNumber} onChange={(e) => setRepairRequestNumber(e.target.value)} placeholder="Nhập số phiếu yêu cầu sửa chữa" />
      </div>
      {repairRequestConflictsProposal && (
        <div className="warnbox"><AlertTriangle size={15} /> Số phiếu yêu cầu sửa chữa phải nhập mới, không được trùng với số phiếu ĐXVT.</div>
      )}
      <button className="btn primary big" disabled={!repairRequestNumber.trim() || repairRequestConflictsProposal || act.isPending} onClick={() => run({ action: "repairRequest", repairRequestNumber: repairRequestNumber.trim() }, "Đã xác nhận vật tư lãnh")}>
        <Check size={15}/> Xác nhận
      </button>
    </div>
  );

  if (acts.includes("use")) {
    const unit = t.items[0]?.material.unit ?? "";
    const stock = t.items[0]?.material.quantity ?? 0;
    const received = t.receivedQuantity ?? (t.type === "UNG" ? t.vhvReceivedQuantity ?? t.items[0]?.quantity ?? 0 : 0);
    const remaining = received - qty;
    const quantityExceedsStock = qty > stock;
    const quantityExceedsReceived = t.type === "SU_DUNG_HIEN_CO" && qty > received;
	            return (
	              <div className="act">
	        <label className="field">Tên VHV sử dụng vật tư *
	          <input value={materialUserNameInput} onChange={(e) => setMaterialUserNameInput(e.target.value)} placeholder="Nhập tên VHV sử dụng vật tư" />
	        </label>
	        <div className="use-field-grid">
	          <label className="field">Khối lượng vật tư sử dụng{unit ? ` (${unit})` : ""} *
	            <input type="number" min={1} max={stock} value={qty} onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value)) || 1))} />
	          </label>
	          <label className="field recovery-toggle-field">Có vật tư thu hồi hay không?
	            <div className="seg2"><button type="button" className={!recoveryRequired ? "on" : ""} onClick={() => setRecoveryRequired(false)}>Không</button><button type="button" className={recoveryRequired ? "on" : ""} onClick={() => setRecoveryRequired(true)}>Có</button></div>
	          </label>
	        </div>
		        {recoveryRequired && <>
		          <div className="recovery-detail-grid">
		            <label className="field">Số lượng vật tư thu hồi{unit ? ` (${unit})` : ""} *
		              <input type="number" min={1} value={recoveryQuantityInput} onChange={(e) => setRecoveryQuantityInput(e.target.value)} />
		            </label>
		            <label className="recovery-return-check">
		              <input type="checkbox" checked={recoveryReturned} onChange={(e) => setRecoveryReturned(e.target.checked)} />
		              <span>Xác nhận đã trả vật tư thu hồi</span>
		            </label>
		          </div>
	          {t.type !== "DE_XUAT" && <div className="note"><FileText size={15}/> {t.type === "UNG" ? "Biên bản vật tư thu hồi sẽ được tạo sau bước Xác nhận vật tư lãnh." : "Biên bản vật tư thu hồi sẽ được tạo tại bước Thống kê xác nhận và xuất biên bản."}</div>}
		        </>}
        {quantityExceedsStock && (
          <div className="warnbox"><AlertTriangle size={15} /> Số lượng vật tư sử dụng đã nhập vượt số lượng hiện có. Hiện còn {stock} {unit}; vui lòng nhập lại số lượng.</div>
        )}
        {quantityExceedsReceived && <div className="warnbox"><AlertTriangle size={15} /> Số lượng sử dụng vượt số lượng đã nhận từ Hiện có ({received} {unit}).</div>}
        <p className="hint">
          {t.type === "UNG" ? <>Số lượng ứng đã xác nhận: {received} {unit}</> : <>Đã lãnh: {received} {unit} đã cộng vào số lượng hiện có</>} · Sau khi xác nhận, hệ thống trừ <b>{qty} {unit}</b> khỏi số lượng hiện có. Còn lại theo phiếu: <b>{remaining} {unit}</b>.
        </p>
        <button className="btn primary big" disabled={!materialUserNameInput.trim() || qty <= 0 || quantityExceedsStock || quantityExceedsReceived || (recoveryRequired && Number(recoveryQuantityInput) <= 0) || act.isPending}
          onClick={() => run({ action: "use", materialUserName: materialUserNameInput.trim(), usedQuantity: qty, recoveryRequired, recoveryQuantity: recoveryRequired ? Number(recoveryQuantityInput) : undefined, recoveryReturned }, "Đã xác nhận sử dụng vật tư")}>
          {act.isPending ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Xác nhận
        </button>
      </div>
    );
  }

  if (acts.includes("accept")) {
    // Phiếu theo luồng mới đã có PCT/chỉ huy/nội dung từ bước Sử dụng vật tư;
    // phiếu cũ (trước khi thêm bước) vẫn nhập tại đây để tương thích.
    return (
      <div className="act">
        <label className="lb">{t.type === "UNG" ? "Nghiệm thu — chuyển xác nhận vật tư lãnh" : t.type === "SU_DUNG_HIEN_CO" ? "Nghiệm thu — chuyển Thống kê xác nhận" : "Nghiệm thu — biên bản ký tay (nếu có) & xuất Biên Bản (Word)"}</label>
          <>
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
        <input name={`bbkt-accept-${t.id}`} autoComplete="off" placeholder="Số BBNT ký tay (nếu có)" value={bbktNumberInput} onChange={(e) => setBbktNumberInput(e.target.value)} />
        <button className="btn primary big" disabled={act.isPending || !note.trim() || !pct.trim() || !chiHuy.trim() || !startedAt || !endedAt}
          onClick={() => run({ action: "accept", completionNote: note.trim(), pctNumber: pct.trim(), chiHuyName: chiHuy.trim(), bbktNumber: bbktNumberInput.trim() || undefined, workStartedAt: startedAt, workEndedAt: endedAt }, t.type === "UNG" ? "Đã nghiệm thu, chuyển xác nhận vật tư lãnh" : t.type === "SU_DUNG_HIEN_CO" ? "Đã nghiệm thu, chuyển Thống kê xác nhận và xuất biên bản" : "Đã nghiệm thu, chờ Thống kê quyết toán")}>
          {act.isPending ? <Loader2 className="spin" size={15} /> : <FileText size={15} />} {t.type === "UNG" ? "Xác nhận nghiệm thu" : t.type === "SU_DUNG_HIEN_CO" ? "Xác nhận nghiệm thu" : "Nghiệm thu & xuất BBNT D-Office"}
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
    return (
      <div className="act">
        <label className="lb">Thống kê xác nhận và xuất biên bản</label>
        <label className="field">Mã vật tư *
          <select value={erpCode} onChange={(e) => setErpCode(e.target.value)}>
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
        <p className="hint">Mã và tên vật tư đã chọn sẽ được lưu vào phiếu và dùng để xuất biên bản{t.recoveryRequired ? ", bao gồm Biên bản vật tư thu hồi" : ""}.</p>
        <button className="btn primary big" disabled={!erpCode || act.isPending}
          onClick={() => run({ action: "statsExportDocuments", erpCode }, "Đã xác nhận mã vật tư và xuất biên bản")}>
          {act.isPending ? <Loader2 className="spin" size={15} /> : <FileText size={15} />} Xác nhận & xuất biên bản
        </button>
      </div>
    );
  }

  if (acts.includes("settle")) return (
    <div className="act">
      <label className="lb">Thống kê — quyết toán vật tư</label>
      <label className={`settlement-check ${recoveryReturned ? "checked" : ""}`}>
        <input
          type="checkbox"
          checked={recoveryReturned}
          onChange={(e) => setRecoveryReturned(e.target.checked)}
        />
        <span className="settlement-check-box" aria-hidden="true">
          {recoveryReturned && <Check size={14} strokeWidth={3} />}
        </span>
        <span className="settlement-check-label">Xác nhận đã quyết toán vật tư</span>
      </label>
      <button className="btn primary big" disabled={!recoveryReturned || act.isPending} onClick={() => run({ action: "settle" }, "Phiếu đã hoàn thành")}>
        <CircleCheck size={15}/> Hoàn tất phiếu
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
.recovery-review-warning{display:flex;align-items:center;gap:8px;margin:0;color:${C.warn};font-size:13px;font-weight:650;}
.step-review-dialog{width:min(560px,calc(100vw - 32px));max-height:86vh;overflow-x:hidden;overflow-y:auto;}
.review-receive-row{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,.65fr);gap:12px;align-items:end;min-width:0;}
.review-receive-row.single{grid-template-columns:minmax(0,1fr) minmax(170px,1fr);}
.review-receive-source{display:flex;flex-direction:column;gap:6px;min-width:0;}
.fixed-receive-source{display:flex;height:40px;align-items:center;border:1px solid ${C.line};border-radius:9px;background:#f8fafc;padding:0 12px;color:${C.navy};font-size:12px;font-weight:700;}
.review-receive-toggle{display:grid;width:100%;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;}
.review-receive-toggle button{height:40px;min-width:0;padding:0 12px;font-size:12px;line-height:1.2;white-space:nowrap;}
.review-delivery-field{gap:6px;min-width:0;}
.review-delivery-field input{height:40px;margin:0;}
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
.unit-filter{display:inline-flex;align-items:center;flex:0 0 auto;height:38px;border:1px solid ${C.line};background:#fff;border-radius:11px;padding:3px 5px;box-shadow:0 1px 2px rgba(15,23,42,.04);}
.unit-filter select{height:30px;min-width:0;border:0;background:#fff;padding:0 20px 0 6px;color:${C.navy};font-size:12.5px;font-weight:800;outline:0;cursor:pointer;box-sizing:content-box;}
.category-filter select{min-width:0;}
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
.row.mine:hover{background:#fef3c7;}
.row.mine .d.cur{background:#f59e0b;box-shadow:0 0 0 3px #f59e0b30;animation:mtwpulse 1.3s ease-in-out infinite;}
.pd{display:inline-block;width:7px;height:7px;border-radius:50%;background:#f59e0b;margin-right:5px;vertical-align:middle;animation:mtwpulse 1.3s ease-in-out infinite;}
@keyframes mtwpulse{0%,100%{opacity:1;}50%{opacity:.35;}}
.wait-cell{display:flex;align-items:center;justify-content:center;min-width:0;white-space:nowrap;}
.wait-badge{display:inline-flex;align-items:center;justify-content:center;min-width:58px;max-width:100%;height:28px;border-radius:8px;background:#eef2f7;padding:0 7px;font-size:12px;font-weight:700;line-height:1;color:${C.soft};white-space:nowrap;}
.wait-badge.warm{color:${C.warn};}
.wait-badge.hot{color:${C.bad};}
.rhead{background:#fbfbfa;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.soft};cursor:default;}
.code{font-family:Poppins,Inter,sans-serif;font-weight:600;color:${C.navy};}
.proposal-cell{display:flex;min-width:0;flex-direction:column;align-items:flex-start;gap:3px;}
.proposal-cell small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${C.muted};font-size:10.5px;font-weight:600;}
.nophieu{display:inline-block;background:${C.warnBg};color:${C.warn};font-size:11px;font-weight:600;padding:3px 8px;border-radius:7px;}
.soft{color:${C.soft};}
.tag{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:4px 9px;border-radius:8px;}
.tag.ung{background:${C.ungBg};color:${C.ung};}
.tag.dx{background:${C.accent}14;color:${C.accent};}
.kind-cell{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;}
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
.frm{padding:18px;display:flex;flex-direction:column;gap:9px;}
.frm-scroll{min-height:0;overflow-y:auto;padding-bottom:14px;}
.frm label{font-size:12.5px;font-weight:600;color:${C.navy};}
.field{display:flex;flex-direction:column;gap:7px;min-width:0;}
.bbkt-grid{display:grid;grid-template-columns:minmax(0,1fr) 142px;gap:10px;align-items:end;}
.qty-field input{text-align:center;font-weight:800;color:${C.navy};}
.frm input,.frm select,.act input,.act select,.act textarea,.frm-item select,.frm-item input{border:1.5px solid ${C.line};border-radius:10px;padding:10px 12px;font-size:13px;outline:0;width:100%;background:#fff;}
.cats{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.cats button{padding:10px;border-radius:10px;border:1.5px solid ${C.line};background:#fff;font-weight:600;font-size:13px;cursor:pointer;color:#64748b;transition:.15s;}
.cats button.on{border-color:${C.accent};background:${C.accent}10;color:${C.accent};}
.wfchips{display:flex;flex-wrap:wrap;gap:6px;}
.wfchips button{padding:6px 10px;border-radius:999px;border:1.5px solid ${C.line};background:#fff;font-weight:600;font-size:12px;cursor:pointer;color:#64748b;transition:.15s;}
.wfchips button.on{border-color:${C.accent};background:${C.accent}12;color:${C.accent};}
.material-cards{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.material-cards button{min-height:50px;padding:9px 11px;border-radius:10px;border:1.5px solid ${C.line};background:#fff;text-align:left;color:${C.navy};cursor:pointer;transition:.15s;overflow:hidden;}
.material-cards button:hover{border-color:${C.accent};box-shadow:0 8px 18px rgba(37,99,235,.08);}
.material-cards button.on{border-color:${C.accent};background:${C.accent}0f;box-shadow:0 0 0 1px ${C.accent}22;}
.material-cards button span{display:block;font-size:12.5px;font-weight:800;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.material-cards button small{display:block;margin-top:3px;font-size:10.5px;font-weight:700;color:${C.soft};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.material-empty{grid-column:1/-1;border:1px dashed ${C.line};background:#fbfbfa;border-radius:10px;padding:11px 12px;text-align:center;font-size:12px;font-weight:600;color:${C.soft};}
.frm input:focus,.act input:focus,.act textarea:focus{border-color:${C.accent};}
.seg2{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
.seg2 button{padding:10px;border-radius:10px;border:1.5px solid ${C.line};background:#fff;font-weight:600;cursor:pointer;color:#64748b;}
.seg2 button.on{border-color:${C.navy};background:${C.navy};color:#fff;}
.seg3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
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
.receive-location{display:flex;align-items:center;gap:8px;min-width:0;flex:1;}
.receive-location span{font-size:12px;font-weight:850;color:${C.navy};letter-spacing:-.01em;white-space:nowrap;}
.receive-location em{min-width:0;font-style:normal;font-size:11px;font-weight:600;color:${C.soft};line-height:1.35;}
.receive-source-toggle{display:inline-flex;grid-template-columns:none;align-items:center;gap:3px;width:auto;max-width:100%;padding:4px;border:1px solid ${C.accent};border-radius:12px;background:${C.accent};box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 8px 18px ${C.accent}26;}
.receive-source-toggle button{min-width:148px;height:34px;padding:0 16px;border:0;border-radius:9px;background:transparent;color:#dbeafe;font-size:12.5px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;transition:background .16s ease,color .16s ease;}
.receive-source-toggle button:hover{background:rgba(255,255,255,.1);color:#fff;}
.receive-source-toggle button.on{background:rgba(255,255,255,.18);color:#fff;box-shadow:0 1px 0 rgba(255,255,255,.12),inset 0 0 0 1px rgba(255,255,255,.08);}
.receive-field-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:end;}
.receive-field-grid.two-cols{grid-template-columns:repeat(2,minmax(0,1fr));}
.receive-field-grid .field{min-width:0;margin:0!important;}
.receive-field-grid .field input{margin-top:6px;}
.confirm-field-row{display:grid;grid-template-columns:minmax(280px,1.45fr) minmax(150px,.65fr) minmax(220px,1fr);gap:10px;align-items:end;}
.confirm-field-row.two-even{grid-template-columns:repeat(2,minmax(0,1fr));}
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
.frm-f{display:flex;justify-content:flex-end;gap:8px;margin-top:6px;}
.frm-scroll .frm-f{position:sticky;bottom:-14px;z-index:2;margin:8px -18px -14px;padding:12px 18px;background:linear-gradient(180deg,rgba(255,255,255,.92),#fff 34%);border-top:1px solid ${C.line};}
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
.ticket-note-row{display:flex;align-items:center;gap:6px 26px;min-width:0;margin-bottom:8px;flex-wrap:wrap;}
.ticket-note-row .meta-line{display:flex;align-items:baseline;gap:4px;min-width:0;margin:0;}
.ticket-note-row .repair-request-meta{flex:0 1 auto;}
.ticket-note-row b{overflow-wrap:anywhere;}
.completion-overview{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:stretch;min-width:0;}
.completion-overview.with-documents{grid-template-columns:minmax(0,1fr) minmax(320px,35%);}
.completion-details{display:flex;min-width:0;flex-direction:column;padding-top:1px;}
.completion-details>.act{margin-bottom:0;}
.document-downloads{display:flex;min-width:0;min-height:100%;align-self:stretch;flex-direction:column;justify-content:flex-start;gap:12px;border:1px solid #c9ded7;border-radius:12px;background:linear-gradient(145deg,#f7fcfa 0%,#eef8f4 100%);padding:14px;box-shadow:0 4px 14px rgba(15,118,110,.07);}
.document-downloads-head{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;}
.document-downloads-label{display:flex;align-items:center;gap:7px;min-width:0;color:#0f766e;font-size:12.5px;font-weight:800;}
.document-downloads-count{flex:0 0 auto;border-radius:999px;background:#dff3eb;color:#0f766e;padding:3px 7px;font-size:10.5px;font-weight:800;line-height:1.2;}
.document-download-links{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;}
.document-download-links .pdf{justify-content:center;min-width:0;margin:0;padding:8px 9px;border-width:1px;border-color:#8fa7ba;border-radius:9px;font-size:11.5px;line-height:1.25;text-align:center;white-space:normal;transition:border-color .16s ease,background .16s ease,transform .16s ease;}
.document-download-links .pdf:hover{border-color:#0f766e;background:#fff;transform:translateY(-1px);}
.document-download-links .recovery-download{border-color:#0f766e;background:#ecfdf5;color:#0f766e;}
.meta-line{font-size:12.5px;color:${C.muted};margin-bottom:8px;}
.received-summary{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;}
.received-summary span{display:inline-flex;align-items:center;gap:4px;}
.received-summary em{font-style:normal;color:#94a3b8;}
.source-badge{display:inline-flex;align-items:center;border-radius:999px;background:#e0f2fe;color:#0369a1;padding:2px 8px;font-size:12px;line-height:1.3;}
.act{border:1.5px dashed ${C.accent}66;background:linear-gradient(180deg,#f8fbff 0%,${C.accent}08 100%);border-radius:16px;padding:14px;margin-bottom:16px;display:flex;flex-direction:column;gap:11px;box-shadow:inset 0 1px 0 rgba(255,255,255,.85);}
.act label:not(.lb){display:block;font-size:11.5px;font-weight:600;color:#64748b;margin-bottom:-4px;}
.act label.settlement-check{position:relative;display:flex;align-items:center;gap:12px;min-height:52px;margin:0;padding:12px 16px;border:1px solid #dbe3ee;border-radius:12px;background:#fff;color:${C.navy};font-size:13px;font-weight:600;line-height:1.4;cursor:pointer;box-shadow:0 1px 2px rgba(15,35,64,.04);transition:border-color .16s ease,background .16s ease,box-shadow .16s ease;}
.act .settlement-check:hover{border-color:${C.accent}66;background:#fafdff;box-shadow:0 3px 10px rgba(15,35,64,.06);}
.act .settlement-check.checked{border-color:${C.accent}80;background:${C.accent}08;}
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
.use-field-grid{display:grid;grid-template-columns:minmax(260px,1fr) minmax(340px,1.08fr);gap:12px;align-items:end;}
.use-field-grid .field{min-width:0;margin:0!important;}
.use-field-grid .field input{height:42px;margin-top:6px;}
.recovery-toggle-field .seg2{height:42px;margin-top:6px;background:#fff;border-color:${C.line};}
.recovery-toggle-field .seg2 button{min-height:38px;}
.recovery-detail-grid{display:grid;grid-template-columns:minmax(260px,1fr) minmax(340px,1.08fr);gap:12px;align-items:end;}
.recovery-detail-grid .field{min-width:0;margin:0!important;}
.recovery-detail-grid .field input{height:42px;margin-top:6px;}
.recovery-return-check{display:flex!important;min-height:42px;align-items:center;gap:9px;margin:0!important;border:1px solid ${C.line};border-radius:10px;background:#fff;padding:0 13px;font-size:12px;font-weight:700;color:${C.navy};box-shadow:0 1px 0 rgba(15,23,42,.03);}
.recovery-return-check input{height:18px!important;width:18px!important;min-width:18px;margin:0;accent-color:${C.accent};}
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
@media(max-width:640px){.panel{width:100%;}.detail-inline{min-width:1040px;padding:10px 12px;}.row{min-width:1040px;grid-template-columns:64px minmax(108px,.9fr) minmax(108px,.86fr) minmax(188px,1.36fr) minmax(120px,.95fr) 82px minmax(168px,1fr) 66px 70px;padding:11px 12px;font-size:12.5px;}.tag{padding:4px 7px}.nophieu{padding:3px 6px}.st{padding:5px 8px}.material-cards{grid-template-columns:1fr;}.bbkt-grid,.confirm-field-row,.stats-issue-grid,.accept-two-grid,.use-field-grid,.recovery-detail-grid,.receive-field-grid,.receive-field-grid.two-cols,.review-receive-row{grid-template-columns:1fr;gap:8px;}.erp-readonly-row{grid-template-columns:minmax(110px,.8fr) minmax(180px,1.5fr) minmax(110px,.7fr);}.review-receive-toggle{width:100%;}.review-receive-toggle button{flex:1;}.qty-field input{padding-left:8px;padding-right:8px;}}
@media(max-width:760px){.top-tools{align-items:stretch;flex-direction:column;}.turn{max-width:100%;min-width:0;}.turn-spacer{display:none;}.month-filter,.unit-filter{align-self:flex-start;max-width:100%;}.month-filter select,.unit-filter select,.category-filter select{max-width:calc(100vw - 108px);}.filters{align-self:flex-start;max-width:100%;overflow-x:auto;}.filters button{white-space:nowrap;}.act-title-row{align-items:stretch;flex-direction:column;gap:8px;}.receive-location{width:100%;align-items:flex-start;flex-direction:column;gap:3px;}.flow-toggle,.receive-source-toggle{width:100%;}.flow-toggle button,.receive-source-toggle button{flex:1;min-width:0;padding:0 8px;}.act-field-row,.advance-item-row{grid-template-columns:1fr;gap:6px;}.replacement-entry-row{grid-template-columns:24px minmax(0,1fr) 120px 30px;}.activity-drawer{width:86%;}}
`;
