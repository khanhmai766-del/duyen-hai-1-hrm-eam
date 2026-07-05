"use client";

import React, { useMemo, useState } from "react";
import {
  Plus, X, Check, FileText, Zap, ClipboardList, Package, Clock, ChevronRight,
  AlertTriangle, Ban, Download, Timer, CircleCheck, Circle, CircleDot, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useMaterialTickets, useTicketOptions, useCreateTicket, useTicketAction,
  actionsFor, type MaterialTicket, type TicketViewer,
} from "@/hooks/useMaterialTickets";
import { TICKET_TO_MATERIAL_CATEGORY } from "@/lib/constants";

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
  CHO_THONG_KE: { label: "Chờ thống kê", c: "#7c3aed" },
  CHO_NGHIEM_THU: { label: "Chờ nghiệm thu", c: C.warn },
  CHO_NHAP_LIEU: { label: "Chờ nhập liệu", c: C.ung },
  CHO_XAC_NHAN_PDF: { label: "Chờ xác nhận xuất file", c: C.ung },
  CHO_HOAN_THIEN: { label: "Chờ hoàn thiện hồ sơ", c: C.ung },
  HOAN_TAT: { label: "Hoàn tất", c: C.ok },
  TU_CHOI: { label: "Từ chối", c: C.bad },
};
const FLOW: Record<string, { key: string; label: string; who: string }[]> = {
  DE_XUAT: [
    { key: "B0", label: "Tạo phiếu + BBKT", who: "Trưởng Ca/TK" },
    { key: "CHO_DE_XUAT", label: "Đề xuất vật tư", who: "Cương vị phân giao" },
    { key: "CHO_XAC_NHAN", label: "Xác nhận (kho)", who: "Trưởng Ca/TK" },
    { key: "CHO_THONG_KE", label: "Thống kê (≥2 ngày)", who: "Thống kê" },
    { key: "CHO_NGHIEM_THU", label: "Nghiệm thu + Word", who: "Trưởng Ca/TK" },
  ],
  UNG: [
    { key: "B0", label: "Tạo phiếu Ứng", who: "Trưởng Ca/TK" },
    { key: "CHO_NHAP_LIEU", label: "Nhập liệu thay thế", who: "Cương vị phân giao" },
    { key: "CHO_XAC_NHAN_PDF", label: "Xác nhận + xuất Word", who: "Trưởng Ca/TK" },
    { key: "CHO_HOAN_THIEN", label: "BBKT + Thống kê (song song)", who: "TC/TK + Thống kê" },
  ],
};
const ORDER: Record<string, string[]> = {
  DE_XUAT: ["B0", "CHO_DE_XUAT", "CHO_XAC_NHAN", "CHO_THONG_KE", "CHO_NGHIEM_THU", "HOAN_TAT"],
  UNG: ["B0", "CHO_NHAP_LIEU", "CHO_XAC_NHAN_PDF", "CHO_HOAN_THIEN", "HOAN_TAT"],
};
const fmt = (s?: string | null) =>
  s ? new Date(s).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";

export default function MaterialTicketBoard({
  creating = false,
  onCloseCreate,
}: {
  creating?: boolean;
  onCloseCreate?: () => void;
} = {}) {
  const { data, isLoading } = useMaterialTickets();
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");

  const tickets = data?.tickets ?? [];
  const viewer = data?.viewer ?? null;
  const open = tickets.find((t) => t.id === openId) ?? null;
  const myTurn = useMemo(() => tickets.filter((t) => actionsFor(t, viewer).length > 0), [tickets, viewer]);
  const shown = tickets.filter((t) =>
    filter === "ALL" ? true : filter === "RUNNING" ? !["HOAN_TAT", "TU_CHOI"].includes(t.status) : t.status === filter
  );

  return (
    <div className="mtw">
      <style>{CSS}</style>

      {myTurn.length > 0 && (
        <div className="turn">
          <span className="turn-badge">Đến lượt bạn ({myTurn.length})</span>
          {myTurn.map((t) => (
            <button key={t.id} className="turn-chip" onClick={() => setOpenId(t.id)}>
              {t.type === "UNG" ? <Zap size={13} /> : <ClipboardList size={13} />} {t.code} <ChevronRight size={13} />
            </button>
          ))}
        </div>
      )}

      <div className="bar">
        <div className="filters">
          {[["ALL", "Tất cả"], ["RUNNING", "Đang chạy"], ["HOAN_TAT", "Hoàn tất"], ["TU_CHOI", "Từ chối"]].map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="list">
        <div className="row rhead">
          <span>Phiếu</span><span>Loại</span><span>Tổ máy</span><span>Số BBKT</span><span>Tiến trình</span><span>Trạng thái</span>
        </div>
        {isLoading && <div className="empty"><Loader2 className="spin" size={18} /> Đang tải…</div>}
        {!isLoading && shown.map((t) => {
          const meta = STATUS[t.status] ?? { label: t.status, c: C.soft };
          const order = ORDER[t.type];
          const idx = t.status === "TU_CHOI" ? -1 : order.indexOf(t.status);
          const done = t.status === "HOAN_TAT" ? order.length : idx;
          const mine = actionsFor(t, viewer).length > 0;
          return (
            <button key={t.id} className={`row ${mine ? "mine" : ""}`} onClick={() => setOpenId(t.id)}>
              <span><span className="code">{t.code}</span><br />
                <small className="soft">{t.assignedPosition}{t.materialCategory ? ` · ${t.materialCategory}` : ""}</small></span>
              <span>{t.type === "UNG"
                ? <span className="tag ung"><Zap size={11} /> Ứng</span>
                : <span className="tag dx"><ClipboardList size={11} /> Đề xuất</span>}</span>
              <span>{t.unit}</span>
              <span className="soft">{t.bbktNumber || "—"}</span>
              <span className="dots">{order.slice(0, order.length - 1).map((s, i) => (
                <i key={s} className={i < done ? "d on" : i === done && t.status !== "HOAN_TAT" ? "d cur" : "d"} />
              ))}</span>
              <span className="st" style={{ color: meta.c, background: meta.c + "16" }}>{meta.label}</span>
            </button>
          );
        })}
        {!isLoading && shown.length === 0 && <div className="empty">Không có phiếu nào.</div>}
      </div>

      {creating && <CreateDialog onClose={() => onCloseCreate?.()} onOpen={setOpenId} />}

      {open && (
        <>
          <div className="ovl" onClick={() => setOpenId(null)} />
          <aside className="panel">
            <Detail t={open} viewer={viewer} onClose={() => setOpenId(null)} />
          </aside>
        </>
      )}
    </div>
  );
}

/* ================= tạo phiếu ================= */
const CATEGORIES = ["Dầu bôi trơn", "Lọc dầu", "Hóa chất", "Bi nghiền"];

function CreateDialog({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const [type, setType] = useState<"DE_XUAT" | "UNG" | null>(null);
  const [unit, setUnit] = useState("S1");
  const [bbkt, setBbkt] = useState("");
  const [assigned, setAssigned] = useState("");
  const [category, setCategory] = useState("");
  const { data: opts } = useTicketOptions(true); // lấy danh sách cương vị
  const create = useCreateTicket();

  async function submit() {
    try {
      const res = await create.mutateAsync({
        type: type!, unit, bbktNumber: bbkt.trim() || undefined,
        assignedPosition: assigned, materialCategory: category,
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
              <ClipboardList size={26} /><b>Đề xuất vật tư</b>
              <span>Quy trình chuẩn: BBKT → Đề xuất → duyệt kho → thống kê (≥2 ngày) → nghiệm thu</span>
            </button>
            <button className="card ung" onClick={() => setType("UNG")}>
              <Zap size={26} /><b>Ứng vật tư</b>
              <span>Xử lý gấp: thay thế trước → hoàn tất BBKT &amp; thống kê song song sau</span>
            </button>
          </div>
        ) : (
          <div className="frm">
            <label>Tổ máy</label>
            <div className="seg2">{["S1", "S2"].map((u) => (
              <button key={u} className={unit === u ? "on" : ""} onClick={() => setUnit(u)}>{u}</button>
            ))}</div>

            <label>Cương vị được giao thực hiện *</label>
            <select value={assigned} onChange={(e) => setAssigned(e.target.value)}>
              <option value="">— Chọn cương vị (chỉ cương vị này thấy phiếu) —</option>
              {(opts?.positions ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            <label>Loại vật tư *</label>
            <div className="cats">
              {CATEGORIES.map((c) => (
                <button key={c} type="button" className={category === c ? "on" : ""} onClick={() => setCategory(c)}>{c}</button>
              ))}
            </div>

            {type === "DE_XUAT" ? (
              <>
                <label>Số Biên Bản Kiểm Tra (BBKT) *</label>
                <input value={bbkt} onChange={(e) => setBbkt(e.target.value)} placeholder="VD: BBKT-120/VH1" />
              </>
            ) : (
              <p className="note ung"><Zap size={13} /> Luồng Ứng: số BBKT sẽ bổ sung sau bước xác nhận xuất file.</p>
            )}
            <div className="frm-f">
              <button className="btn ghost" onClick={() => setType(null)}>Quay lại</button>
              <button className="btn primary"
                disabled={create.isPending || !assigned || !category || (type === "DE_XUAT" && !bbkt.trim())}
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

/* ================= chi tiết ================= */
function Detail({ t, viewer, onClose }: { t: MaterialTicket; viewer: TicketViewer | null; onClose: () => void }) {
  const meta = STATUS[t.status] ?? { label: t.status, c: C.soft };
  const flow = FLOW[t.type];
  const order = ORDER[t.type];
  const idx = t.status === "TU_CHOI" ? 99 : order.indexOf(t.status);

  return (
    <>
      <div className="p-h" style={{ background: t.type === "UNG" ? C.ung : C.navy }}>
        <button className="x w" onClick={onClose}><X size={17} /></button>
        <div>
          <span className="p-code">{t.code}</span>
          <span className="p-sub">
            {t.type === "UNG" ? "⚡ Phiếu ỨNG vật tư (xử lý gấp)" : "📋 Phiếu Đề xuất vật tư"} · Tổ máy {t.unit}
            {t.bbktNumber ? ` · ${t.bbktNumber}` : ""}
          </span>
          <span className="p-sub">Giao: <b>{t.assignedPosition}</b>{t.materialCategory ? ` · Loại vật tư: ${t.materialCategory}` : ""}</span>
        </div>
        <span className="p-badge" style={{ background: meta.c }}>{meta.label}</span>
      </div>

      <div className="p-body">
        <div className="steps">
          {flow.map((s) => {
            const si = order.indexOf(s.key);
            const done = t.status === "HOAN_TAT" || si < idx;
            const cur = s.key === t.status;
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
        </div>

        {t.items.length > 0 && (
          <div className="items">
            <label className="lb"><Package size={13} /> Vật tư trong phiếu</label>
            {t.items.map((it) => {
              const short = it.quantity > it.material.quantity;
              return (
                <div key={it.id} className={`item ${short ? "short" : ""}`}>
                  <b>{it.material.name}</b>
                  <span>SL: {it.quantity} {it.material.unit} · Tồn kho: {it.material.quantity}{short ? " — THIẾU" : ""}</span>
                  <span className="soft">{it.device.seq} · {it.device.name}</span>
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
        {t.pctNumber && <div className="meta-line">Số PCT/LCT: <b>{t.pctNumber}</b></div>}

        <ActionArea t={t} viewer={viewer} />

        <div className="loglist">
          <label className="lb"><Clock size={13} /> Dấu vết</label>
          {[
            t.createdAt && { at: t.createdAt, who: t.createdByName, what: "Tạo phiếu" },
            t.proposedAt && { at: t.proposedAt, who: t.proposedByName, what: t.type === "UNG" ? "Nhập liệu thay thế" : "Gửi đề xuất" },
            t.confirmedAt && { at: t.confirmedAt, who: t.confirmedByName, what: "Xác nhận — kho đủ" },
            t.statsAt && { at: t.statsAt, who: t.statsByName, what: `Nhập số phiếu ${t.proposalNumber ?? ""}` },
            t.completedAt && { at: t.completedAt, who: t.completedByName, what: "Xuất Biên Bản Nghiệm Thu" },
          ].filter(Boolean).map((l: any, i) => (
            <div key={i} className="logrow"><span>{fmt(l.at)}</span><b>{l.who}</b><em>{l.what}</em></div>
          ))}
        </div>
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

  if (["HOAN_TAT", "TU_CHOI"].includes(t.status)) return null;

  if (acts.length === 0) {
    const waitMap: Record<string, string> = {
      CHO_DE_XUAT: `Cương vị "${t.assignedPosition}"`,
      CHO_XAC_NHAN: "Trưởng Ca / Trưởng Kíp",
      CHO_THONG_KE: "Thống kê",
      CHO_NGHIEM_THU: "Trưởng Ca / Trưởng Kíp",
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

  const ItemsForm = (
    <div className="frm-items">
      {items.map((it, i) => (
        <div key={i} className="frm-item">
          <select value={it.deviceSeq} onChange={(e) => edit(i, "deviceSeq", e.target.value)}>
            <option value="">— Thiết bị (theo cương vị) —</option>
            {(opts?.devices ?? []).map((d) => (
              <option key={d.seq} value={d.seq}>{" ".repeat(Math.min(d.depth ?? 0, 6) * 2)}{d.seq} · {d.name}</option>
            ))}
          </select>
          <select value={it.materialId} onChange={(e) => edit(i, "materialId", e.target.value)}>
            <option value="">{wantCategory ? `— Vật tư (${wantCategory}) —` : "— Vật tư —"}</option>
            {materialOptions.map((m) => (
              <option key={m.id} value={m.id}>{m.name} (tồn: {m.quantity} {m.unit})</option>
            ))}
          </select>
          <input type="number" min={1} value={it.quantity}
            onChange={(e) => edit(i, "quantity", Math.max(1, +e.target.value || 1))} />
          {items.length > 1 && <button className="mini" onClick={() => setItems((a) => a.filter((_, j) => j !== i))}><X size={13} /></button>}
        </div>
      ))}
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
    const left = t.confirmedAt ? 2 * 86400e3 - (Date.now() - new Date(t.confirmedAt).getTime()) : 0;
    const locked = left > 0;
    const h = Math.ceil(left / 3600e3);
    return (
      <div className="act">
        <label className="lb">Bước 2 — Nhập số phiếu đề xuất vật tư</label>
        {locked ? (
          <div className="lockbox"><Timer size={15} /> Còn khóa <b>{Math.floor(h / 24)} ngày {h % 24} giờ</b> (tối thiểu 2 ngày sau xác nhận).</div>
        ) : (
          <>
            <input placeholder="Số phiếu ĐXVT (vd: ĐXVT-051)" value={num} onChange={(e) => setNum(e.target.value)} />
            <button className="btn primary big" disabled={!num.trim() || act.isPending}
              onClick={() => run({ action: "stats", proposalNumber: num }, "Đã nhập số phiếu")}>
              <Check size={15} /> Xác nhận → chuyển Nghiệm thu
            </button>
          </>
        )}
      </div>
    );
  }

  if (acts.includes("accept")) return (
    <div className="act">
      <label className="lb">Bước 3 — Nghiệm thu &amp; xuất Biên Bản (Word)</label>
      <input placeholder="Số PCT/LCT *" value={pct} onChange={(e) => setPct(e.target.value)} />
      <input placeholder="Tên chỉ huy trực tiếp (SCCN) *" value={chiHuy} onChange={(e) => setChiHuy(e.target.value)} />
      <textarea rows={3} placeholder="Thông tin xác nhận thay thế vật tư xong…" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn primary big" disabled={!note.trim() || !pct.trim() || !chiHuy.trim() || act.isPending}
        onClick={() => run({ action: "accept", completionNote: note, pctNumber: pct, chiHuyName: chiHuy }, "Đã nghiệm thu, file Word sẵn sàng")}>
        {act.isPending ? <Loader2 className="spin" size={15} /> : <FileText size={15} />} Nghiệm thu &amp; xuất Word
      </button>
    </div>
  );

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
.turn{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#fff;border:1.5px solid ${C.accent}44;border-radius:13px;padding:10px 13px;margin-bottom:12px;}
.turn-badge{font-family:Poppins,Inter,sans-serif;font-weight:700;font-size:13px;color:${C.accent};}
.turn-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid ${C.accent}55;background:${C.accent}0e;color:${C.navy};font-weight:600;font-size:12.5px;border-radius:9px;padding:6px 10px;cursor:pointer;}
.bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
.filters{display:flex;gap:5px;background:#fff;border:1px solid ${C.line};border-radius:11px;padding:3px;}
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
.list{background:#fff;border:1px solid ${C.line};border-radius:16px;overflow:hidden;}
.row{display:grid;grid-template-columns:1.2fr .8fr .5fr .9fr 1fr .95fr;gap:8px;align-items:center;width:100%;text-align:left;padding:12px 16px;border:0;border-bottom:1px solid ${C.line};background:#fff;cursor:pointer;font-size:13px;}
.row:hover{background:#fafaf8;}
.row.mine{background:${C.accent}08;box-shadow:inset 3px 0 0 ${C.accent};}
.rhead{background:#fbfbfa;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.soft};cursor:default;}
.code{font-family:Poppins,Inter,sans-serif;font-weight:600;color:${C.navy};}
.soft{color:${C.soft};}
.tag{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:4px 9px;border-radius:8px;}
.tag.ung{background:${C.ungBg};color:${C.ung};}
.tag.dx{background:${C.accent}14;color:${C.accent};}
.dots{display:flex;gap:4px;}
.d{width:9px;height:9px;border-radius:50%;background:#e2e8f0;}
.d.on{background:${C.ok};}
.d.cur{background:${C.accent};box-shadow:0 0 0 3px ${C.accent}30;}
.st{font-size:11.5px;font-weight:700;padding:5px 10px;border-radius:9px;text-align:center;}
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
.frm input,.frm select,.act input,.act select,.act textarea,.frm-item select,.frm-item input{border:1.5px solid ${C.line};border-radius:10px;padding:10px 12px;font-size:13px;outline:0;width:100%;background:#fff;}
.cats{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.cats button{padding:10px;border-radius:10px;border:1.5px solid ${C.line};background:#fff;font-weight:600;font-size:13px;cursor:pointer;color:#64748b;transition:.15s;}
.cats button.on{border-color:${C.accent};background:${C.accent}10;color:${C.accent};}
.frm input:focus,.act input:focus,.act textarea:focus{border-color:${C.accent};}
.seg2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
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
.item{border:1px solid ${C.line};border-radius:11px;padding:10px 12px;margin-bottom:7px;display:flex;flex-direction:column;gap:2px;font-size:12.5px;}
.item b{font-size:13px;color:${C.navy};}
.item.short{border-color:${C.bad};background:${C.badBg};}
.done-note{display:flex;gap:7px;align-items:flex-start;background:${C.okBg};color:${C.ok};border-radius:10px;padding:10px 12px;font-size:12.5px;margin-bottom:10px;}
.pdf{display:inline-flex;align-items:center;gap:7px;border:1.5px solid ${C.navy};color:${C.navy};background:#fff;border-radius:10px;padding:9px 13px;font-weight:600;font-size:13px;cursor:pointer;margin-bottom:12px;text-decoration:none;}
.meta-line{font-size:12.5px;color:${C.muted};margin-bottom:8px;}
.act{border:1.5px dashed ${C.accent}66;background:${C.accent}07;border-radius:14px;padding:14px;margin-bottom:16px;display:flex;flex-direction:column;gap:9px;}
.wait{display:flex;align-items:center;gap:7px;background:#f1f5f9;color:#64748b;border-radius:11px;padding:11px 13px;font-size:12.5px;margin-bottom:16px;flex-wrap:wrap;}
.warnbox{display:flex;gap:8px;align-items:flex-start;background:${C.badBg};color:${C.bad};border-radius:10px;padding:10px 12px;font-size:12.5px;}
.lockbox{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:${C.warnBg};color:${C.warn};border-radius:10px;padding:10px 12px;font-size:12.5px;}
.frm-items{display:flex;flex-direction:column;gap:7px;}
.frm-item{display:grid;grid-template-columns:1.2fr 1.4fr 64px auto;gap:6px;}
.hint{font-size:11px;color:${C.soft};margin:2px 0 0;}
.loglist{border-top:1px dashed ${C.line};padding-top:12px;}
.logrow{display:flex;gap:9px;font-size:12px;padding:5px 0;color:#475569;}
.logrow span{color:${C.soft};white-space:nowrap;}
.logrow em{font-style:normal;color:${C.muted};}
@media(max-width:640px){.panel{width:100%;}.row{grid-template-columns:1fr .7fr .9fr;}.row span:nth-child(3),.row span:nth-child(4),.row span:nth-child(5){display:none;}}
`;
