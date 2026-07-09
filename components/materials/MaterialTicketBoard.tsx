"use client";

import React, { useMemo, useState } from "react";
import {
  Plus, Minus, X, Check, FileText, Zap, ClipboardList, Package, Clock, ChevronRight,
  AlertTriangle, Ban, Download, CircleCheck, Circle, CircleDot, Loader2, Pencil, Trash2, UserCog,
} from "lucide-react";
import { toast } from "sonner";
import {
  useMaterialTickets, useTicketOptions, useCreateTicket, useTicketAction, useDeleteTicket,
  useWorkflowRoles, useSaveWorkflowRoles, actionsFor,
  type MaterialTicket, type TicketViewer, type WorkflowRoleMap,
} from "@/hooks/useMaterialTickets";
import { usePositions } from "@/hooks/useUsers";
import { isPositionAllowedForDefectUnit, TICKET_TO_MATERIAL_CATEGORY } from "@/lib/constants";

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
  CHO_PHIEU__XUAT_KHO: { label: "Chờ phiếu xuất kho", c: "#0f766e" },
  VAT_TU_KHONG_CO: { label: "Vật tư không có", c: C.bad },
  CHO_THONG_KE: { label: "Chờ thống kê", c: "#7c3aed" },
  NHAN_VAT_TU: { label: "Nhận vật tư", c: "#0891b2" },
  SU_DUNG_VAT_TU: { label: "Sử dụng vật tư", c: "#6d28d9" },
  CHO_NGHIEM_THU: { label: "Chờ nghiệm thu", c: C.warn },
  CHO_NHAP_LIEU: { label: "Chờ nhập liệu", c: C.ung },
  CHO_XAC_NHAN_PDF: { label: "Chờ xác nhận xuất file", c: C.ung },
  CHO_HOAN_THIEN: { label: "Chờ hoàn thiện hồ sơ", c: C.ung },
  HOAN_TAT: { label: "Hoàn tất", c: C.ok },
  TU_CHOI: { label: "Từ chối", c: C.bad },
};
const FLOW: Record<string, { key: string; label: string; who: string }[]> = {
  DE_XUAT: [
    { key: "B0", label: "Tạo phiếu + Đề xuất vật tư", who: "Theo phân quyền quy trình" },
    { key: "CHO_PHIEU__XUAT_KHO", label: "Thống kê", who: "Thống kê" },
    { key: "NHAN_VAT_TU", label: "Nhận vật tư", who: "Theo phân quyền quy trình" },
    { key: "SU_DUNG_VAT_TU", label: "Sử dụng vật tư", who: "Theo phân quyền quy trình" },
    { key: "CHO_NGHIEM_THU", label: "Nghiệm thu + BBKT + Word", who: "Theo phân quyền quy trình" },
  ],
  UNG: [
    { key: "B0", label: "Tạo phiếu Ứng", who: "Trưởng Ca/TK" },
    { key: "CHO_NHAP_LIEU", label: "Nhập liệu thay thế", who: "Cương vị phân giao" },
    { key: "CHO_XAC_NHAN_PDF", label: "Xác nhận + xuất Word", who: "Trưởng Ca/TK" },
    { key: "CHO_HOAN_THIEN", label: "BBKT + Thống kê (song song)", who: "TC/TK + Thống kê" },
  ],
};
const ORDER: Record<string, string[]> = {
  DE_XUAT: ["B0", "CHO_PHIEU__XUAT_KHO", "NHAN_VAT_TU", "SU_DUNG_VAT_TU", "CHO_NGHIEM_THU", "HOAN_TAT"],
  UNG: ["B0", "CHO_NHAP_LIEU", "CHO_XAC_NHAN_PDF", "CHO_HOAN_THIEN", "HOAN_TAT"],
};
const flowStatusKey = (status: string) => status === "CHO_THONG_KE" ? "CHO_PHIEU__XUAT_KHO" : status;
const fmt = (s?: string | null) =>
  s ? new Date(s).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";

export default function MaterialTicketBoard({
  creating = false,
  onCloseCreate,
  rolesOpen: controlledRolesOpen,
  onOpenRoles,
  onCloseRoles,
}: {
  creating?: boolean;
  onCloseCreate?: () => void;
  rolesOpen?: boolean;
  onOpenRoles?: () => void;
  onCloseRoles?: () => void;
} = {}) {
  const { data, isLoading } = useMaterialTickets();
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
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
  const myTurn = useMemo(() => tickets.filter((t) => actionsFor(t, viewer).length > 0), [tickets, viewer]);
  const shown = tickets.filter((t) =>
    filter === "ALL" ? true : filter === "RUNNING" ? !["HOAN_TAT", "TU_CHOI"].includes(t.status) : t.status === filter
  );

  return (
    <div className="mtw">
      <style>{CSS}</style>

      <div className="top-tools">
        {myTurn.length > 0 ? (
          <div className="turn">
            <span className="turn-badge">Đến lượt bạn ({myTurn.length})</span>
            {myTurn.map((t) => (
              <button key={t.id} className="turn-chip" onClick={() => setOpenId(t.id)}>
                {t.type === "UNG" ? <Zap size={13} /> : <ClipboardList size={13} />} {t.code} <ChevronRight size={13} />
              </button>
            ))}
          </div>
        ) : <div className="turn-spacer" />}
        <div className="filters">
          {[["ALL", "Tất cả"], ["RUNNING", "Đang chạy"], ["HOAN_TAT", "Hoàn tất"], ["TU_CHOI", "Từ chối"]].map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        {viewer?.isAdmin && !isRolesControlled && (
          <button className="btn ghost" onClick={openRoles}>
            <UserCog size={14} /> Phân quyền quy trình
          </button>
        )}
      </div>

      <div className="list">
        <div className="row rhead">
          <span>Mã phiếu</span><span>Yêu cầu</span><span>Cương vị</span><span>Tên vật tư</span><span>Phiếu đề xuất</span><span>Số lượng</span><span>Trạng thái</span><span>Tiến trình</span><span>Thao tác</span>
        </div>
        {isLoading && <div className="empty"><Loader2 className="spin" size={18} /> Đang tải…</div>}
        {!isLoading && shown.map((t) => {
          const meta = STATUS[t.status] ?? { label: t.status, c: C.soft };
          const order = ORDER[t.type];
          const flowStatus = flowStatusKey(t.status);
          const idx = t.status === "TU_CHOI" ? -1 : order.indexOf(flowStatus);
          const done = t.status === "HOAN_TAT" ? order.length : idx;
          const mine = actionsFor(t, viewer).length > 0;
          // Sửa/Xoá: Admin hoặc cương vị được phân quyền bước "Sửa/Xoá phiếu";
          // khi admin CHƯA cấu hình bước này → người tạo phiếu (mặc định cũ).
          const canEdit =
            !!viewer &&
            (viewer.isAdmin ||
              viewer.steps?.manage ||
              (!viewer.steps?.manageConfigured && viewer.id === t.createdById));
          const materialNames = Array.from(new Set(t.items.map((i) => i.material?.name).filter(Boolean)));
          const materialText = materialNames.length ? materialNames.join(", ") : "—";
          const isOpen = openId === t.id;
          return (
            <React.Fragment key={t.id}>
            <button className={`row ${mine ? "mine" : ""}`} onClick={() => setOpenId(isOpen ? null : t.id)}>
              <span className="code-cell">
                <span className={`exp ${isOpen ? "open" : ""}`} title={isOpen ? "Thu gọn" : "Mở chi tiết"}>
                  {isOpen ? <Minus size={12} /> : <Plus size={12} />}
                </span>
                <span className="code">{t.code}</span>
              </span>
              <span className="kind-cell">
                {t.type === "UNG"
                  ? <span className="tag ung"><Zap size={11} /> Ứng</span>
                  : <span className="tag dx"><ClipboardList size={11} /> Đề xuất</span>}
                <small className="kind-sub">{t.unit}{t.materialCategory ? ` · ${t.materialCategory}` : ""}</small>
              </span>
              <span>{t.assignedPosition}</span>
              <span className="material-name" title={materialText}>{materialText}</span>
              <span>
                {t.proposalNumber
                  ? <span className="code">{t.proposalNumber}</span>
                  : <span className="nophieu">Chưa có phiếu đề xuất</span>}
              </span>
              <span>{t.items.length ? t.items.map((i) => `${i.quantity} ${i.material.unit}`).join(", ") : "—"}</span>
              <span className="st" style={{ color: meta.c, background: meta.c + "16" }}>{meta.label}</span>
              <span className="dots">{order.slice(0, order.length - 1).map((s, i) => (
                <i key={s} className={i < done ? "d on" : i === done && t.status !== "HOAN_TAT" ? "d cur" : "d"} />
              ))}</span>
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
        {!isLoading && shown.length === 0 && <div className="empty">Không có phiếu nào.</div>}
      </div>

      {creating && <CreateDialog onClose={() => onCloseCreate?.()} onOpen={setOpenId} />}

      {isRolesOpen && <WorkflowRolesDialog onClose={closeRoles} />}

      {editTicket && <EditDialog t={editTicket} onClose={() => setEditTicket(null)} />}

      {delTicket && (
        <>
          <div className="ovl" onClick={() => setDelTicket(null)} />
          <div className="dlg" style={{ width: 420 }}>
            <div className="dlg-h"><b>Xóa phiếu {delTicket.code}?</b>
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
                      toast.success(`Đã xóa phiếu ${delTicket.code}`);
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
  const [type, setType] = useState<"DE_XUAT" | "UNG" | null>(null);
  const [unit, setUnit] = useState("S1");
  const [note, setNote] = useState("");
  const [assigned, setAssigned] = useState("");
  const [category, setCategory] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [proposedQuantity, setProposedQuantity] = useState(1);
  const [replacementDeviceName, setReplacementDeviceName] = useState("");
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
      const matchesPosition = !assignedKey || m.managingPositions.some((p) => positionKey(p) === assignedKey);
      return matchesCategory && matchesPosition;
    });
  }, [assignedKey, materialCategoryLabel, opts?.materials]);

  React.useEffect(() => {
    if (!materialCards.length) {
      if (selectedMaterialId) setSelectedMaterialId("");
      return;
    }
    if (!materialCards.some((m) => m.id === selectedMaterialId)) {
      setSelectedMaterialId(materialCards[0].id);
    }
  }, [materialCards, selectedMaterialId]);

  function selectUnit(nextUnit: string) {
    setUnit(nextUnit);
    setSelectedMaterialId("");
    setAssigned((current) => current && !isPositionAllowedForDefectUnit(nextUnit, current) ? "" : current);
  }

  async function submit() {
    try {
      const res = await create.mutateAsync({
        type: type!, unit, note: note.trim() || undefined,
        assignedPosition: assigned, materialCategory: category,
        materialId: selectedMaterialId || undefined,
        proposedQuantity,
        replacementDeviceName: replacementDeviceName.trim() || undefined,
      });
      toast.success(`Đã tạo phiếu ${res.code}`);
      onClose();
      onOpen(res.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tạo phiếu thất bại");
    }
  }

  return (
    <>
      <div className="ovl" onClick={onClose} />
      <div className="dlg">
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
          <div className="frm">
            <label>Tổ máy</label>
            <div className="seg2">{UNITS.map((u) => (
              <button key={u} className={unit === u ? "on" : ""} onClick={() => selectUnit(u)}>{u}</button>
            ))}</div>

            <label>Cương vị được giao thực hiện *</label>
            <select value={assigned} onChange={(e) => { setAssigned(e.target.value); setSelectedMaterialId(""); }}>
              <option value="">— Chọn cương vị (chỉ cương vị này thấy phiếu) —</option>
              {positionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            <label>Loại vật tư *</label>
            <div className="cats">
              {CATEGORIES.map((c) => (
                <button key={c} type="button" className={category === c ? "on" : ""} onClick={() => { setCategory(c); setSelectedMaterialId(""); }}>{c}</button>
              ))}
            </div>

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
                    onClick={() => setSelectedMaterialId(m.id)}
                    title={`${m.code} - ${m.name}`}
                  >
                    <span>{m.name}</span>
                    <small>{m.code}</small>
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

            {type === "DE_XUAT" ? (
              <>
                <div className="bbkt-grid">
                  <div className="field">
                    <label>Ghi chú *</label>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: thay định kỳ / hư hỏng đột xuất…" />
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
                <label>Tên thiết bị thay thế *</label>
                <input
                  value={replacementDeviceName}
                  onChange={(e) => setReplacementDeviceName(e.target.value)}
                  placeholder="Nhập tên thiết bị thay thế"
                />
                <p className="hint">Số BBKT sẽ bổ sung ở bước Nghiệm thu (nếu có).</p>
              </>
            ) : (
              <p className="note ung"><Zap size={13} /> Luồng Ứng: số BBKT sẽ bổ sung sau bước xác nhận xuất file.</p>
            )}
            <div className="frm-f">
              <button className="btn ghost" onClick={() => setType(null)}>Quay lại</button>
              <button className="btn primary"
                disabled={
                  create.isPending ||
                  !assigned ||
                  !category ||
                  (type === "DE_XUAT" && (!note.trim() || !selectedMaterialId || proposedQuantity <= 0 || !replacementDeviceName.trim()))
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
  { key: "confirm", label: "Xác nhận", hint: "Trống = mặc định: Trưởng Ca/Trưởng Kíp" },
  { key: "receive", label: "Nhận vật tư (khối lượng lãnh + hình thức)", hint: "Trống = mặc định: Trưởng Ca/Trưởng Kíp" },
  { key: "use", label: "Sử dụng vật tư (PCT/LCT + khối lượng dùng)", hint: "Trống = mặc định: Trưởng Ca/Trưởng Kíp" },
  { key: "accept", label: "Nghiệm thu + BBKT + xuất BBNT", hint: "Trống = mặc định: Trưởng Ca/Trưởng Kíp" },
  { key: "manage", label: "Sửa / Xoá phiếu", hint: "Trống = mặc định: người tạo phiếu (Quản trị luôn được)" },
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
  const { data: opts } = useTicketOptions(true);
  const act = useTicketAction(t.id);
  const positionOptions = useMemo(
    () => (opts?.positions ?? []).filter((p) => isPositionAllowedForDefectUnit(unit, p)),
    [opts?.positions, unit]
  );

  function selectUnit(nextUnit: string) {
    setUnit(nextUnit);
    setAssigned((current) => current && !isPositionAllowedForDefectUnit(nextUnit, current) ? "" : current);
  }

  async function submit() {
    try {
      await act.mutateAsync({
        action: "editInfo", unit, bbktNumber: bbkt.trim() || undefined,
        assignedPosition: assigned, materialCategory: category,
      });
      toast.success(`Đã cập nhật phiếu ${t.code}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cập nhật thất bại");
    }
  }

  return (
    <>
      <div className="ovl" onClick={onClose} />
      <div className="dlg">
        <div className="dlg-h"><b>Sửa phiếu {t.code}</b>
          <button className="x" onClick={onClose}><X size={16} /></button></div>
        <div className="frm">
          <label>Tổ máy</label>
          <div className="seg2">{UNITS.map((u) => (
            <button key={u} className={unit === u ? "on" : ""} onClick={() => selectUnit(u)}>{u}</button>
          ))}</div>

          <label>Cương vị được giao thực hiện *</label>
          <select value={assigned} onChange={(e) => setAssigned(e.target.value)}>
            <option value="">— Chọn cương vị (chỉ cương vị này thấy phiếu) —</option>
            {positionOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <label>Loại vật tư *</label>
          <div className="cats">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" className={category === c ? "on" : ""} onClick={() => setCategory(c)}>{c}</button>
            ))}
          </div>

          <label>Số Biên Bản Kiểm Tra (BBKT) (nếu có)</label>
          <input value={bbkt} onChange={(e) => setBbkt(e.target.value)} placeholder="VD: BBKT-120/VH1" />

          <div className="frm-f">
            <button className="btn ghost" onClick={onClose}>Hủy</button>
            <button className="btn primary"
              disabled={act.isPending || !assigned || !category}
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
  const flow = FLOW[t.type];
  const order = ORDER[t.type];
  const flowStatus = flowStatusKey(t.status);
  const idx = t.status === "TU_CHOI" ? 99 : t.status === "VAT_TU_KHONG_CO" ? 1 : order.indexOf(flowStatus);

  return (
    <>
      {/* Thông tin phiếu (mã, loại, giao, trạng thái...) đã hiện ở dòng bảng — chi tiết chỉ còn tiến trình + nội dung */}
      <button className="dclose" onClick={onClose} title="Thu gọn"><X size={15} /></button>

      <div className="p-body">
        {/* Hàng trên: tiến trình (trái) + Dấu vết (phải) */}
        <div className="p-top">
        <div className="steps">
          {flow.map((s) => {
            const si = order.indexOf(s.key);
            const done = t.status === "HOAN_TAT" || si < idx;
            const cur = s.key === flowStatus;
            return (
              <div key={s.key} className={`step ${done ? "done" : ""} ${cur ? "cur" : ""}`}>
                {done ? <CircleCheck size={17} /> : cur ? <CircleDot size={17} /> : <Circle size={17} />}
                <div><b>{s.label}</b><span>{s.who}</span></div>
              </div>
            );
          })}
          {t.status === "TU_CHOI" && (
            <div className="step rejected"><Ban size={17} /><div><b>Phiếu bị từ chối</b><span>{t.rejectedReason}</span></div></div>
          )}
          {t.status === "VAT_TU_KHONG_CO" && (
            <div className="step rejected"><AlertTriangle size={17} /><div><b>Vật tư không có/không đủ</b><span>Chỉ có thể từ chối phiếu này.</span></div></div>
          )}
        </div>

        {t.items.length > 0 && (
          <div className="items top-items">
            <label className="lb"><Package size={13} /> Vật tư trong phiếu</label>
            {t.items.map((it) => {
              const short = it.quantity > it.material.quantity;
              return (
                <div key={it.id} className={`item ${short ? "short" : ""}`}>
                  <b>{it.material.name}</b>
                  <span>SL: {it.quantity} {it.material.unit} · Tồn kho: {it.material.quantity}{short ? " — THIẾU" : ""}</span>
                  <span className="soft">{it.device ? `${it.device.seq} · ${it.device.name}` : it.deviceNameManual || "Thiết bị nhập tay"}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="loglist">
          <label className="lb"><Clock size={13} /> Dấu vết</label>
          {[
            t.createdAt && { at: t.createdAt, who: t.createdByName, what: "Tạo phiếu" },
            t.proposedAt && { at: t.proposedAt, who: t.proposedByName, pos: t.proposedByPosition, what: t.type === "UNG" ? "Nhập liệu thay thế" : "Đề xuất vật tư" },
            t.confirmedAt && { at: t.confirmedAt, who: t.confirmedByName, pos: t.confirmedByPosition, what: "Xác nhận — kho đủ" },
            t.statsAt && { at: t.statsAt, who: t.statsByName, pos: t.statsByPosition, what: `Nhập số phiếu ${t.proposalNumber ?? ""}` },
            t.receivedAt && { at: t.receivedAt, who: t.receivedByName, pos: t.receivedByPosition, what: `Nhận vật tư: lãnh ${t.receivedQuantity ?? ""} (${t.receivedMethod ?? ""})` },
            t.usedAt && { at: t.usedAt, who: t.usedByName, pos: t.usedByPosition, what: `Sử dụng vật tư: dùng ${t.usedQuantity ?? ""}, còn lại ${t.remainingQuantity ?? ""}` },
            t.completedAt && { at: t.completedAt, who: t.completedByName, pos: t.completedByPosition, what: "Nghiệm thu, xuất Biên Bản Nghiệm Thu" },
          ].filter(Boolean).map((l: any, i) => (
            <div key={i} className="logrow"><span>{fmt(l.at)}</span><b>{l.who}{l.pos ? ` · ${l.pos}` : ""}</b><em>{l.what}</em></div>
          ))}
        </div>
        </div>

        {t.items.length > 0 && (
          <div className="items old-items">
            <label className="lb"><Package size={13} /> Vật tư trong phiếu</label>
            {t.items.map((it) => {
              const short = it.quantity > it.material.quantity;
              return (
                <div key={it.id} className={`item ${short ? "short" : ""}`}>
                  <b>{it.material.name}</b>
                  <span>SL: {it.quantity} {it.material.unit} · Tồn kho: {it.material.quantity}{short ? " — THIẾU" : ""}</span>
                  <span className="soft">{it.device ? `${it.device.seq} · ${it.device.name}` : it.deviceNameManual || "Thiết bị nhập tay"}</span>
                </div>
              );
            })}
          </div>
        )}

        {t.completionNote && <div className="done-note"><Check size={13} /> {t.completionNote}</div>}
        {t.docUrl && (
          <a className="pdf" href={t.docUrl} target="_blank" rel="noreferrer">
            <Download size={14} /> Biên Bản Nghiệm Thu (Word)
          </a>
        )}
        {t.proposalNumber && <div className="meta-line">Số phiếu ĐXVT: <b>{t.proposalNumber}</b> · {t.statsByName}</div>}
        {t.receivedQuantity != null && (
          <div className="meta-line">Vật tư lãnh: <b>{t.receivedQuantity} {t.items[0]?.material.unit ?? ""}</b> · Hình thức: {t.receivedMethod}</div>
        )}
        {t.usedQuantity != null && (
          <div className="meta-line">
            Đã sử dụng: <b>{t.usedQuantity} {t.items[0]?.material.unit ?? ""}</b> · Còn lại: <b>{t.remainingQuantity} {t.items[0]?.material.unit ?? ""}</b>
            {(t.remainingQuantity ?? 0) === 0 ? " — sử dụng hết vật tư lãnh" : (t.remainingQuantity ?? 0) > 0 ? " — phần dư đã cộng vào tồn kho" : " — phần dùng vượt đã trừ tồn kho"}
          </div>
        )}
        {t.pctNumber && <div className="meta-line">Số PCT/LCT: <b>{t.pctNumber}</b></div>}

        <ActionArea t={t} viewer={viewer} />
      </div>
    </>
  );
}

/* ================= hành động theo lượt ================= */
function ActionArea({ t, viewer }: { t: MaterialTicket; viewer: TicketViewer | null }) {
  const acts = actionsFor(t, viewer);
  const act = useTicketAction(t.id);
  const needItems = acts.includes("propose") || acts.includes("ungEntry");
  const { data: opts } = useTicketOptions(needItems);
  const [items, setItems] = useState([{ materialId: "", deviceSeq: "", quantity: 1 }]);
  const [note, setNote] = useState("");
  const [num, setNum] = useState("");
  const [pct, setPct] = useState("");
  const [chiHuy, setChiHuy] = useState("");
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState(1); // khối lượng lãnh / sử dụng
  const [method, setMethod] = useState(""); // hình thức lãnh

  React.useEffect(() => {
    if (!needItems) return;
    try {
      const raw = sessionStorage.getItem(`material-ticket-draft:${t.id}`);
      if (!raw) return;
      const draft = JSON.parse(raw) as { materialId?: string; quantity?: number };
      setItems([{
        materialId: draft.materialId ?? "",
        deviceSeq: "",
        quantity: Math.max(1, Number(draft.quantity) || 1),
      }]);
      sessionStorage.removeItem(`material-ticket-draft:${t.id}`);
    } catch {
      // Bỏ qua nháp tạm nếu dữ liệu sessionStorage không hợp lệ.
    }
  }, [needItems, t.id]);

  if (["HOAN_TAT", "TU_CHOI"].includes(t.status)) return null;

  if (acts.length === 0) {
    const waitMap: Record<string, string> = {
      CHO_DE_XUAT: `Cương vị "${t.assignedPosition}"`,
      CHO_XAC_NHAN: "Trưởng Ca / Trưởng Kíp",
      CHO_PHIEU__XUAT_KHO: "Thống kê",
      VAT_TU_KHONG_CO: "Người tạo phiếu / Trưởng Ca / Quản trị từ chối",
      CHO_THONG_KE: "Thống kê",
      NHAN_VAT_TU: "Người được phân quyền Nhận vật tư",
      SU_DUNG_VAT_TU: "Người được phân quyền Sử dụng vật tư",
      CHO_NGHIEM_THU: "Người được phân quyền Nghiệm thu",
      CHO_NHAP_LIEU: `Cương vị "${t.assignedPosition}"`,
      CHO_XAC_NHAN_PDF: "Trưởng Ca / Trưởng Kíp",
    };
    const waiting = t.status === "CHO_HOAN_THIEN"
      ? [!t.bbktNumber && "Trưởng Ca (bổ sung BBKT)", !t.proposalNumber && "Thống kê (số phiếu ĐXVT)"].filter(Boolean).join(" + ")
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
  const itemsValid = items.every((i) => i.materialId && i.deviceSeq && i.quantity >= 1);

  // Lọc vật tư theo LOẠI của phiếu: loại phiếu (Dầu bôi trơn/Lọc dầu/Hóa chất/Bi nghiền)
  // ánh xạ sang loại trong Danh mục vật tư (Material.category) rồi chỉ hiện đúng loại đó.
  const wantCategory = t.materialCategory ? TICKET_TO_MATERIAL_CATEGORY[t.materialCategory] ?? null : null;
  const materialOptions = (opts?.materials ?? []).filter((m) => !wantCategory || m.category === wantCategory);

  if (acts.includes("reject")) return (
    <div className="act">
      <label className="lb">Vật tư không có/không đủ</label>
      <div className="warnbox"><AlertTriangle size={15} /> Tồn kho không đủ cho số lượng đề xuất. Phiếu này chỉ có thể từ chối.</div>
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
        const deviceOptions = rowMat?.devices ?? [];
        return (
        <div key={i} className="frm-item">
          <select value={it.deviceSeq} disabled={!it.materialId}
            onChange={(e) => edit(i, "deviceSeq", e.target.value)}>
            <option value="">{it.materialId ? "— Thiết bị —" : "— Chọn vật tư trước —"}</option>
            {deviceOptions.map((d) => (
              <option key={d.seq} value={d.seq}>{d.label}</option>
            ))}
          </select>
          <select value={it.materialId}
            onChange={(e) => setItems((a) => a.map((x, j) => (j === i ? { ...x, materialId: e.target.value, deviceSeq: "" } : x)))}>
            <option value="">{wantCategory ? `— Vật tư (${wantCategory}) —` : "— Vật tư —"}</option>
            {materialOptions.map((m) => (
              <option key={m.id} value={m.id}>{m.name} (tồn: {m.quantity} {m.unit})</option>
            ))}
          </select>
          <input type="number" min={1} value={it.quantity}
            onChange={(e) => edit(i, "quantity", Math.max(1, +e.target.value || 1))} />
          {items.length > 1 && <button className="mini" onClick={() => setItems((a) => a.filter((_, j) => j !== i))}><X size={13} /></button>}
        </div>
      );
      })}
      <button className="btn tiny" onClick={() => setItems((a) => [...a, { materialId: "", deviceSeq: "", quantity: 1 }])}>
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
    const short = t.items.some((it) => it.quantity > it.material.quantity);
    return (
      <div className="act">
        <label className="lb">Bước 1&apos; — Xác nhận đề xuất (kiểm tra kho)</label>
        {short ? (
          <>
            <div className="warnbox"><AlertTriangle size={15} /> Tồn kho <b>không đủ</b> — chỉ có thể Từ chối (chờ mua sắm ngoài hệ thống, sau đó tạo phiếu mới).</div>
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
    return (
      <div className="act">
        <label className="lb">Bước 2 — Nhập số phiếu đề xuất vật tư</label>
        <input placeholder="Số phiếu ĐXVT (vd: ĐXVT-051)" value={num} onChange={(e) => setNum(e.target.value)} />
        <button className="btn primary big" disabled={!num.trim() || act.isPending}
          onClick={() => run({ action: "stats", proposalNumber: num }, "Đã nhập số phiếu")}>
          <Check size={15} /> Xác nhận → chuyển Nghiệm thu
        </button>
      </div>
    );
  }

  if (acts.includes("receive")) {
    const unit = t.items[0]?.material.unit ?? "";
    return (
      <div className="act">
        <label className="lb">Nhận vật tư — khối lượng lãnh &amp; hình thức lãnh</label>
        <label>Khối lượng vật tư lãnh{unit ? ` (${unit})` : ""} *</label>
        <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value)) || 1))} />
        <label>Hình thức lãnh *</label>
        <div className="cats">
          {["Phiếu giao hàng", "Nhập hóa chất vận hành"].map((m) => (
            <button key={m} type="button" className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{m}</button>
          ))}
        </div>
        <button className="btn primary big" disabled={qty <= 0 || !method || act.isPending}
          onClick={() => run({ action: "receive", receivedQuantity: qty, receivedMethod: method }, "Đã xác nhận nhận vật tư")}>
          {act.isPending ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Xác nhận
        </button>
      </div>
    );
  }

  if (acts.includes("use")) {
    const unit = t.items[0]?.material.unit ?? "";
    const received = t.receivedQuantity ?? 0;
    const remaining = received - qty;
    return (
      <div className="act">
        <label className="lb">Sử dụng vật tư — kết quả thay thế</label>
        <input placeholder="Số PCT/LCT *" value={pct} onChange={(e) => setPct(e.target.value)} />
        <input placeholder="Tên chỉ huy trực tiếp (SCCN) *" value={chiHuy} onChange={(e) => setChiHuy(e.target.value)} />
        <textarea rows={3} placeholder="Nội dung xác nhận thay thế xong…" value={note} onChange={(e) => setNote(e.target.value)} />
        <label>Khối lượng vật tư sử dụng{unit ? ` (${unit})` : ""} *</label>
        <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value)) || 1))} />
        <p className="hint">
          Đã lãnh: {received} {unit} · Còn lại sau sử dụng: <b>{remaining} {unit}</b> —{" "}
          {remaining > 0
            ? "phần dư sẽ cộng dồn vào tồn kho cùng mã vật tư."
            : remaining === 0
              ? "sử dụng hết vật tư lãnh, tồn kho giữ nguyên."
              : "phần dùng vượt sẽ trừ vào tồn kho (không âm dưới 0)."}
        </p>
        <button className="btn primary big" disabled={!pct.trim() || !chiHuy.trim() || !note.trim() || qty <= 0 || act.isPending}
          onClick={() => run({ action: "use", pctNumber: pct, chiHuyName: chiHuy, completionNote: note, usedQuantity: qty }, "Đã xác nhận sử dụng vật tư")}>
          {act.isPending ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Xác nhận
        </button>
      </div>
    );
  }

  if (acts.includes("accept")) {
    // Phiếu theo luồng mới đã có PCT/chỉ huy/nội dung từ bước Sử dụng vật tư;
    // phiếu cũ (trước khi thêm bước) vẫn nhập tại đây để tương thích.
    const legacy = !t.pctNumber || !t.chiHuyName || !t.completionNote;
    return (
      <div className="act">
        <label className="lb">Nghiệm thu — BBKT (nếu có) &amp; xuất Biên Bản (Word)</label>
        {legacy && (
          <>
            <input placeholder="Số PCT/LCT *" value={pct} onChange={(e) => setPct(e.target.value)} />
            <input placeholder="Tên chỉ huy trực tiếp (SCCN) *" value={chiHuy} onChange={(e) => setChiHuy(e.target.value)} />
            <textarea rows={3} placeholder="Thông tin xác nhận thay thế vật tư xong…" value={note} onChange={(e) => setNote(e.target.value)} />
          </>
        )}
        <input placeholder="Số BBKT (nếu có) — VD: BBKT-120/VH1" value={num} onChange={(e) => setNum(e.target.value)} />
        <button className="btn primary big" disabled={act.isPending || (legacy && (!note.trim() || !pct.trim() || !chiHuy.trim()))}
          onClick={() => run({ action: "accept", completionNote: note.trim() || undefined, pctNumber: pct.trim() || undefined, chiHuyName: chiHuy.trim() || undefined, bbktNumber: num.trim() || undefined }, "Đã nghiệm thu, file Word sẵn sàng")}>
          {act.isPending ? <Loader2 className="spin" size={15} /> : <FileText size={15} />} Nghiệm thu &amp; xuất Word
        </button>
      </div>
    );
  }

  if (acts.includes("ungEntry")) return (
    <div className="act">
      <label className="lb">Ứng — Nhập liệu thay thế (đã/đang thay gấp)</label>
      {ItemsForm}
      <textarea rows={2} placeholder="Thông tin thay thế (thời điểm, tình trạng sau thay…)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn primary big" disabled={!itemsValid || !note.trim() || act.isPending}
        onClick={() => run({ action: "ungEntry", items, completionNote: note }, "Đã gửi thông tin thay thế")}>
        <ChevronRight size={15} /> Gửi thông tin thay thế
      </button>
    </div>
  );

  if (acts.includes("ungConfirmDoc")) return (
    <div className="act">
      <label className="lb">Ứng — Xác nhận &amp; xuất Biên Bản (Word)</label>
      <input placeholder="Số PCT/LCT *" value={pct} onChange={(e) => setPct(e.target.value)} />
      <input placeholder="Tên chỉ huy trực tiếp (SCCN) *" value={chiHuy} onChange={(e) => setChiHuy(e.target.value)} />
      <button className="btn primary big" disabled={!pct.trim() || !chiHuy.trim() || act.isPending}
        onClick={() => run({ action: "ungConfirmDoc", pctNumber: pct, chiHuyName: chiHuy }, "Đã xuất Word — chờ BBKT + Thống kê")}>
        {act.isPending ? <Loader2 className="spin" size={15} /> : <FileText size={15} />} Xác nhận &amp; xuất Word
      </button>
      <p className="hint">File Word in &quot;(bổ sung sau)&quot; tại chỗ số BBKT — khi bổ sung, hệ thống tự sinh lại file với số thật.</p>
    </div>
  );

  if (acts.includes("ungBbkt")) return (
    <div className="act">
      <label className="lb">Ứng — Bổ sung số BBKT (song song)</label>
      <input placeholder="Số BBKT (vd: BBKT-121/VH1)" value={num} onChange={(e) => setNum(e.target.value)} />
      <button className="btn primary big" disabled={!num.trim() || act.isPending}
        onClick={() => run({ action: "ungBbkt", bbktNumber: num }, "Đã lưu số BBKT — file Word đã cập nhật")}>
        <Check size={15} /> Lưu số BBKT
      </button>
    </div>
  );

  if (acts.includes("ungStats")) return (
    <div className="act">
      <label className="lb">Ứng — Thống kê nhập số phiếu ĐXVT (không chờ 2 ngày)</label>
      <input placeholder="Số phiếu ĐXVT" value={num} onChange={(e) => setNum(e.target.value)} />
      <button className="btn primary big" disabled={!num.trim() || act.isPending}
        onClick={() => run({ action: "ungStats", proposalNumber: num }, "Đã nhập số phiếu")}>
        <Check size={15} /> Lưu số phiếu
      </button>
    </div>
  );

  return null;
}

/* ============================== CSS ============================== */
const CSS = `
.mtw{font-family:Inter,system-ui,sans-serif;background:${C.cream};color:#1f2430;padding:20px;border-radius:20px;min-height:640px;position:relative;}
.mtw *{box-sizing:border-box;font-family:inherit;}
.head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px;}
.head-l{display:flex;gap:13px;align-items:center;}
.head-ic{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,${C.navy},${C.accent});}
.head h1{font-family:Poppins,Inter,sans-serif;font-size:21px;font-weight:700;color:${C.navy};margin:0;}
.head p{margin:2px 0 0;font-size:12.5px;color:${C.muted};}
.top-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;}
.turn{display:flex;align-items:center;gap:8px;flex:0 1 auto;max-width:min(58%,720px);min-width:0;flex-wrap:wrap;background:#fff;border:1.5px solid ${C.accent}44;border-radius:13px;padding:10px 13px;}
.turn-spacer{flex:1 1 auto;min-width:0;}
.turn-badge{font-family:Poppins,Inter,sans-serif;font-weight:700;font-size:13px;color:${C.accent};}
.turn-chip{display:inline-flex;align-items:center;gap:5px;max-width:210px;border:1px solid ${C.accent}55;background:${C.accent}0e;color:${C.navy};font-weight:600;font-size:12.5px;border-radius:9px;padding:6px 10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
.filters{display:flex;gap:5px;flex:0 0 auto;background:#fff;border:1px solid ${C.line};border-radius:11px;padding:3px;}
.filters button{border:0;background:transparent;font-size:12.5px;font-weight:600;color:#64748b;padding:7px 12px;border-radius:8px;cursor:pointer;}
.filters button.on{background:${C.navy};color:#fff;}
.btn{display:inline-flex;align-items:center;gap:6px;font-family:Poppins,Inter,sans-serif;font-weight:600;font-size:13px;border-radius:10px;padding:9px 14px;cursor:pointer;border:1px solid ${C.line};background:#fff;color:#475569;transition:.15s;}
.btn.primary{background:${C.accent};border-color:${C.accent};color:#fff;}
.btn.primary:disabled{opacity:.5;cursor:not-allowed;}
.btn.danger{background:${C.bad};border-color:${C.bad};color:#fff;}
.btn.ghost{background:#fff;}
.btn.big{width:100%;justify-content:center;padding:13px;font-size:14px;margin-top:8px;}
.btn.tiny{font-size:11.5px;padding:5px 9px;border-radius:8px;align-self:flex-start;}
.mini{border:1px solid ${C.line};background:#fff;border-radius:8px;cursor:pointer;color:#94a3b8;display:grid;place-items:center;width:30px;}
.list{background:#fff;border:1px solid ${C.line};border-radius:16px;overflow-x:auto;overflow-y:hidden;}
.row{display:grid;grid-template-columns:.95fr .85fr .95fr 1.25fr 1fr .6fr 1fr .76fr 74px;gap:8px;align-items:center;min-width:1160px;width:100%;text-align:left;padding:12px 16px;border:0;border-bottom:1px solid ${C.line};background:#fff;cursor:pointer;font-size:13px;}
.code-cell{display:inline-flex;align-items:center;gap:7px;min-width:0;}
.code-cell .code{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ops{display:flex;gap:6px;justify-content:center;}
.op{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;border:1px solid ${C.line};background:#fff;color:${C.muted};cursor:pointer;transition:.15s;}
.op:hover{border-color:${C.accent};color:${C.accent};}
.op.del:hover{border-color:${C.bad};color:${C.bad};background:${C.badBg};}
.row>span:nth-child(1),.row>span:nth-child(2),.row>span:nth-child(3),.row>span:nth-child(4),.row>span:nth-child(6),.row>span:nth-child(7),.row>span:nth-child(8){text-align:center;justify-self:stretch;}
.row:hover{background:#fafaf8;}
.row.mine{background:${C.accent}08;box-shadow:inset 3px 0 0 ${C.accent};}
.rhead{background:#fbfbfa;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.soft};cursor:default;}
.code{font-family:Poppins,Inter,sans-serif;font-weight:600;color:${C.navy};}
.nophieu{display:inline-block;background:${C.warnBg};color:${C.warn};font-size:11px;font-weight:600;padding:3px 8px;border-radius:7px;}
.soft{color:${C.soft};}
.tag{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:4px 9px;border-radius:8px;}
.tag.ung{background:${C.ungBg};color:${C.ung};}
.tag.dx{background:${C.accent}14;color:${C.accent};}
.kind-cell{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;}
.kind-top{display:inline-flex;align-items:center;gap:6px;min-width:0;}
.exp{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex:0 0 auto;border-radius:50%;background:#10b981;color:#fff;box-shadow:0 1px 2px rgba(15,23,42,.2);}
.exp.open{background:#f43f5e;}
.detail-inline{min-width:1160px;border-bottom:1px solid ${C.line};background:#f6f8fb;padding:12px 16px;}
.detail-inline .dwrap{position:relative;border:1px solid ${C.line};border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 8px 22px rgba(15,23,42,.07);}
.dclose{position:absolute;top:10px;right:10px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;border:1px solid ${C.line};background:#f8fafc;color:#64748b;cursor:pointer;}
.dclose:hover{background:#eef2f7;color:#0f172a;}
.kind-sub{display:block;max-width:100%;color:${C.soft};font-size:10.5px;font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.material-name{display:block;min-width:0;color:${C.navy};font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dots{display:flex;justify-content:center;gap:4px;}
.d{width:9px;height:9px;border-radius:50%;background:#e2e8f0;}
.d.on{background:${C.ok};}
.d.cur{background:${C.accent};box-shadow:0 0 0 3px ${C.accent}30;}
.st{font-size:11.5px;font-weight:700;padding:5px 10px;border-radius:9px;text-align:center;white-space:nowrap;}
.empty{padding:40px;text-align:center;color:${C.soft};display:flex;gap:8px;align-items:center;justify-content:center;}
.spin{animation:mtwspin 1s linear infinite;}@keyframes mtwspin{to{transform:rotate(360deg);}}
.ovl{position:fixed;inset:0;background:rgba(15,23,42,.38);z-index:40;}
.dlg{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:520px;max-width:94vw;background:#fff;border-radius:18px;z-index:41;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.3);}
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
.note{display:flex;align-items:center;gap:6px;font-size:12px;border-radius:9px;padding:9px 11px;}
.note.ung{background:${C.ungBg};color:${C.ung};}
.frm-f{display:flex;justify-content:flex-end;gap:8px;margin-top:6px;}
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
.old-items{display:none;}
.item{border:1px solid ${C.line};border-radius:11px;padding:10px 12px;margin-bottom:7px;display:flex;flex-direction:column;gap:2px;font-size:12.5px;}
.item b{font-size:13px;color:${C.navy};}
.item.short{border-color:${C.bad};background:${C.badBg};}
.done-note{display:flex;gap:7px;align-items:flex-start;background:${C.okBg};color:${C.ok};border-radius:10px;padding:10px 12px;font-size:12.5px;margin-bottom:10px;}
.pdf{display:inline-flex;align-items:center;gap:7px;border:1.5px solid ${C.navy};color:${C.navy};background:#fff;border-radius:10px;padding:9px 13px;font-weight:600;font-size:13px;cursor:pointer;margin-bottom:12px;text-decoration:none;}
.meta-line{font-size:12.5px;color:${C.muted};margin-bottom:8px;}
.act{border:1.5px dashed ${C.accent}66;background:${C.accent}07;border-radius:14px;padding:14px;margin-bottom:16px;display:flex;flex-direction:column;gap:9px;}
.act label:not(.lb){display:block;font-size:11.5px;font-weight:600;color:#64748b;margin-bottom:-4px;}
.wait{display:flex;align-items:center;gap:7px;background:#f1f5f9;color:#64748b;border-radius:11px;padding:11px 13px;font-size:12.5px;margin-bottom:16px;flex-wrap:wrap;}
.warnbox{display:flex;gap:8px;align-items:flex-start;background:${C.badBg};color:${C.bad};border-radius:10px;padding:10px 12px;font-size:12.5px;}
.lockbox{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:${C.warnBg};color:${C.warn};border-radius:10px;padding:10px 12px;font-size:12.5px;}
.frm-items{display:flex;flex-direction:column;gap:7px;}
.frm-item{display:grid;grid-template-columns:1.2fr 1.4fr 64px auto;gap:6px;}
.hint{font-size:11px;color:${C.soft};margin:2px 0 0;}
.loglist{border-top:1px dashed ${C.line};padding-top:12px;}
.p-top{display:grid;grid-template-columns:minmax(250px,.95fr) minmax(260px,1.05fr) minmax(320px,1fr);gap:4px 18px;align-items:start;}
.p-top .top-items{border-left:1px dashed ${C.line};padding:4px 0 4px 16px;margin-bottom:0;}
.p-top .loglist{border-top:0;border-left:1px dashed ${C.line};padding:4px 0 4px 16px;}
@media(max-width:1100px){.p-top{grid-template-columns:1fr;}.p-top .top-items,.p-top .loglist{border-left:0;padding-left:0;border-top:1px dashed ${C.line};padding-top:12px;margin-bottom:10px;}}
.logrow{display:flex;gap:9px;font-size:12px;padding:5px 0;color:#475569;}
.logrow span{color:${C.soft};white-space:nowrap;}
.logrow em{font-style:normal;color:${C.muted};}
@media(max-width:640px){.panel{width:100%;}.detail-inline{min-width:1060px;padding:10px 12px;}.row{min-width:1060px;grid-template-columns:.95fr .8fr .9fr 1.15fr .95fr .6fr .9fr .7fr 70px;padding:11px 12px;font-size:12.5px;}.tag{padding:4px 7px}.nophieu{padding:3px 6px}.st{padding:5px 8px}.material-cards{grid-template-columns:1fr;}.bbkt-grid{grid-template-columns:1fr 118px;gap:8px;}.qty-field input{padding-left:8px;padding-right:8px;}}
@media(max-width:760px){.top-tools{align-items:stretch;flex-direction:column;}.turn{max-width:100%;}.turn-spacer{display:none;}.filters{align-self:flex-start;max-width:100%;overflow-x:auto;}.filters button{white-space:nowrap;}}
`;
