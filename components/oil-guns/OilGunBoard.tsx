"use client";

import React, { useState, useMemo } from "react";
import {
  Flame, Wrench, Check, X, Save, AlertTriangle,
  FileSpreadsheet, Printer, Droplet, Factory, Search, RotateCcw, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useOilGuns, useUpdateOilGun, type OilGun } from "@/hooks/useOilGuns";

/* Bố trí vòi theo bảng vận hành: mỗi cụm 3 vòi (1 cột trên sơ đồ) */
const REAR_GROUPS = [
  ["D1", "E1", "F1"], ["D2", "E2", "F2"], ["D3", "E3", "F3"],
  ["A3", "B3", "C3"], ["A2", "B2", "C2"], ["A1", "B1", "C1"],
];
const FRONT_GROUPS = [
  ["C4", "B4", "A4"], ["C5", "B5", "A5"], ["C6", "B6", "A6"],
  ["F6", "E6", "D6"], ["F5", "E5", "D5"], ["F4", "E4", "D4"],
];

const C = {
  navy: "#1E3A5F", accent: "#2563eb", cream: "#f6f4ef", line: "#e3e1da",
  ok: "#16a34a", okBg: "#e9f7ef", okLine: "#bfe6cd",
  bad: "#dc2626", badBg: "#fdecec", badLine: "#f6c9c9",
  warn: "#d97706", warnBg: "#fdf3e3", warnLine: "#f0dcae",
  chamber1: "#f59e0b", chamber2: "#dc2626",
};

type Tone = { key: "ok" | "warn" | "bad"; c: string; bg: string; line: string; label: string };
function tone(g?: OilGun): Tone {
  if (!g || g.status === "unavailable")
    return { key: "bad", c: C.bad, bg: C.badBg, line: C.badLine, label: "Không khả dụng" };
  if (g.defect?.trim())
    return { key: "warn", c: C.warn, bg: C.warnBg, line: C.warnLine, label: "Khả dụng · có khiếm khuyết" };
  return { key: "ok", c: C.ok, bg: C.okBg, line: C.okLine, label: "Khả dụng" };
}

export default function OilGunBoard() {
  const [machine, setMachine] = useState("S1");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ status: "available" | "unavailable"; defect: string } | null>(null);

  const { data, isLoading } = useOilGuns(machine);
  const update = useUpdateOilGun();

  const byCode = useMemo(() => {
    const m = new Map<string, OilGun>();
    data?.guns.forEach((g) => m.set(g.code, g));
    return m;
  }, [data]);

  const summary = data?.summary ?? { total: 0, available: 0, defective: 0, unavailable: 0 };
  const selectedGun = selected ? byCode.get(selected) : undefined;

  function openGun(code: string) {
    const g = byCode.get(code);
    setSelected(code);
    setDraft({ status: g?.status ?? "available", defect: g?.defect ?? "" });
  }
  function closePanel() { setSelected(null); setDraft(null); }

  async function saveDraft() {
    if (!selected || !draft) return;
    try {
      await update.mutateAsync({
        machine, code: selected,
        status: draft.status,
        defect: draft.defect.trim() || null,
      });
      toast.success(`Đã cập nhật vòi ${selected}`);
      closePanel();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cập nhật thất bại");
    }
  }

  const q = query.trim().toUpperCase();

  return (
    <div className="ogb-root">
      <style>{CSS}</style>

      <header className="ogb-head">
        <div className="ogb-head-left">
          <div className="ogb-head-icon"><Droplet size={20} /></div>
          <div>
            <h1>Dữ liệu vòi dầu</h1>
            <p>Sơ đồ khả dụng vòi dầu buồng đốt · tổ máy {machine}</p>
          </div>
        </div>
        <div className="ogb-head-actions">
          <div className="ogb-machine">
            {["S1", "S2"].map((m) => (
              <button key={m} className={machine === m ? "on" : ""} onClick={() => setMachine(m)}>
                <Factory size={14} /> {m}
              </button>
            ))}
          </div>
          <button className="ogb-btn ghost"><FileSpreadsheet size={15} /> Excel</button>
          <button className="ogb-btn ghost"><Printer size={15} /> PDF</button>
        </div>
      </header>

      <div className="ogb-stats">
        <Stat label="Tổng vòi dầu" value={summary.total} c={C.navy} icon={<Droplet size={16} />} />
        <Stat label="Khả dụng" value={summary.available} c={C.ok} icon={<Check size={16} />} />
        <Stat label="Có khiếm khuyết" value={summary.defective} c={C.warn} icon={<Wrench size={16} />} />
        <Stat label="Không khả dụng" value={summary.unavailable} c={C.bad} icon={<X size={16} />} />
        <div className="ogb-search">
          <Search size={15} />
          <input placeholder="Tìm vòi (vd D1, A3…)" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="ogb-board-wrap">
        {isLoading ? (
          <div className="ogb-loading"><Loader2 className="spin" size={22} /> Đang tải sơ đồ vòi dầu…</div>
        ) : summary.total === 0 ? (
          <div className="ogb-empty">
            <Droplet size={30} />
            <b>Chưa có dữ liệu vòi dầu cho tổ máy {machine}</b>
            <span>Chạy <code>node prisma/seed-oil-guns.mjs</code> để khởi tạo 36 vòi.</span>
          </div>
        ) : (
          <>
            <div className="ogb-board">
              <div className="ogb-wall-label">Tường sau</div>
              <Wall groups={REAR_GROUPS} byCode={byCode} onOpen={openGun} highlight={q} selected={selected} />
              <div className="ogb-chamber">
                <Flame size={22} /><span>BUỒNG ĐỐT {machine}</span><Flame size={22} />
              </div>
              <Wall groups={FRONT_GROUPS} byCode={byCode} onOpen={openGun} highlight={q} selected={selected} />
              <div className="ogb-wall-label">Tường trước</div>
            </div>
            <div className="ogb-legend">
              <span><i style={{ background: C.ok }} /> Khả dụng</span>
              <span><i style={{ background: C.warn }} /> Có khiếm khuyết</span>
              <span><i style={{ background: C.bad }} /> Không khả dụng</span>
              <span className="hint">Bấm vào một vòi để cập nhật trạng thái &amp; khiếm khuyết</span>
            </div>
          </>
        )}
      </div>

      {selected && draft && (
        <>
          <div className="ogb-overlay" onClick={closePanel} />
          <aside className="ogb-panel" role="dialog" aria-label={`Cập nhật vòi ${selected}`}>
            <div className="ogb-panel-head" style={{ background: C.navy }}>
              <button className="ogb-panel-x" onClick={closePanel} aria-label="Đóng"><X size={18} /></button>
              <div className="ogb-panel-title">
                <span className="ogb-panel-code">{selected}</span>
                <span className="ogb-panel-sub">Vòi dầu · Buồng đốt {machine}</span>
              </div>
              <span className="ogb-panel-badge" style={{ background: tone({ ...(selectedGun as OilGun), status: draft.status, defect: draft.defect } as OilGun).c }}>
                {tone({ ...(selectedGun as OilGun), status: draft.status, defect: draft.defect } as OilGun).label}
              </span>
            </div>

            <div className="ogb-panel-body">
              <label className="ogb-field-label">Trạng thái khả dụng</label>
              <div className="ogb-seg">
                <button className={draft.status === "available" ? "on ok" : ""}
                  onClick={() => setDraft({ ...draft, status: "available" })}>
                  <Check size={16} /> Khả dụng
                </button>
                <button className={draft.status === "unavailable" ? "on bad" : ""}
                  onClick={() => setDraft({ ...draft, status: "unavailable" })}>
                  <X size={16} /> Không khả dụng
                </button>
              </div>

              <label className="ogb-field-label" style={{ marginTop: 18 }}>
                <Wrench size={14} /> Khiếm khuyết vòi dầu
              </label>
              <textarea className="ogb-textarea" rows={5}
                placeholder="Mô tả khiếm khuyết của vòi (thiếu sensor, mòn đầu mồi lửa, kẹt van…). Để trống nếu vòi không có khiếm khuyết."
                value={draft.defect}
                onChange={(e) => setDraft({ ...draft, defect: e.target.value })} />
              {draft.status === "available" && draft.defect.trim() && (
                <p className="ogb-note warn">
                  <AlertTriangle size={13} /> Vòi vẫn khả dụng nhưng có khiếm khuyết — sẽ hiển thị màu cam để theo dõi.
                </p>
              )}

              {selectedGun?.updatedBy && (
                <div className="ogb-meta">
                  Cập nhật gần nhất: <b>{selectedGun.updatedBy}</b>
                  {selectedGun.updatedAt ? " · " + new Date(selectedGun.updatedAt).toLocaleString("vi-VN") : ""}
                </div>
              )}
            </div>

            <div className="ogb-panel-foot">
              <button className="ogb-btn ghost"
                onClick={() => setDraft({ status: selectedGun?.status ?? "available", defect: selectedGun?.defect ?? "" })}>
                <RotateCcw size={15} /> Hoàn tác
              </button>
              <button className="ogb-btn primary" onClick={saveDraft} disabled={update.isPending}>
                {update.isPending ? <Loader2 className="spin" size={15} /> : <Save size={15} />} Lưu thay đổi
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, c, icon }: { label: string; value: number; c: string; icon: React.ReactNode }) {
  return (
    <div className="ogb-stat">
      <span className="ogb-stat-ic" style={{ color: c, background: c + "18" }}>{icon}</span>
      <div>
        <div className="ogb-stat-val" style={{ color: c }}>{value}</div>
        <div className="ogb-stat-lb">{label}</div>
      </div>
    </div>
  );
}

function Wall({ groups, byCode, onOpen, highlight, selected }: {
  groups: string[][]; byCode: Map<string, OilGun>; onOpen: (c: string) => void; highlight: string; selected: string | null;
}) {
  return (
    <div className="ogb-wall">
      {groups.map((group, i) => (
        <div className="ogb-col" key={i}>
          {group.map((code) => {
            const g = byCode.get(code);
            const t = tone(g);
            const hasDefect = g?.defect?.trim();
            const dim = highlight && !code.includes(highlight);
            return (
              <button key={code}
                className={`ogb-gun ${selected === code ? "active" : ""} ${dim ? "dim" : ""}`}
                style={{ background: t.bg, borderColor: selected === code ? C.accent : t.line }}
                onClick={() => onOpen(code)}
                title={`${code} — ${t.label}${hasDefect ? " · " + g!.defect : ""}`}>
                <span className="ogb-gun-dot" style={{ background: t.c }} />
                <span className="ogb-gun-code" style={{ color: C.navy }}>{code}</span>
                <span className="ogb-gun-line" style={{ color: t.c }}>
                  {g?.status === "unavailable" ? "Không khả dụng" : "Khả dụng"}
                </span>
                {hasDefect && <Wrench className="ogb-gun-wrench" size={12} style={{ color: t.c }} />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
.ogb-root{--navy:${C.navy};--accent:${C.accent};font-family:Inter,system-ui,sans-serif;color:#1f2430;background:${C.cream};padding:20px;border-radius:20px;position:relative;min-height:640px;}
.ogb-root *{box-sizing:border-box;}
.ogb-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:18px;}
.ogb-head-left{display:flex;align-items:center;gap:13px;}
.ogb-head-icon{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,${C.navy},${C.accent});box-shadow:0 6px 16px rgba(30,58,95,.28);}
.ogb-head h1{font-family:Poppins;font-weight:700;font-size:22px;margin:0;color:${C.navy};letter-spacing:-.01em;}
.ogb-head p{margin:2px 0 0;font-size:13px;color:#6b7280;}
.ogb-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.ogb-machine{display:flex;background:#fff;border:1px solid ${C.line};border-radius:11px;padding:3px;gap:2px;}
.ogb-machine button{display:flex;align-items:center;gap:5px;border:0;background:transparent;cursor:pointer;font-family:Poppins;font-weight:600;font-size:13px;color:#64748b;padding:7px 13px;border-radius:8px;}
.ogb-machine button.on{background:${C.navy};color:#fff;box-shadow:0 3px 8px rgba(30,58,95,.25);}
.ogb-btn{display:inline-flex;align-items:center;gap:6px;font-family:Poppins;font-weight:600;font-size:13px;border-radius:10px;padding:9px 14px;cursor:pointer;border:1px solid ${C.line};transition:.15s;}
.ogb-btn.ghost{background:#fff;color:#475569;}
.ogb-btn.ghost:hover{border-color:#c7ccd6;color:${C.navy};}
.ogb-btn.primary{background:${C.accent};color:#fff;border-color:${C.accent};}
.ogb-btn.primary:hover{background:#1d4fd8;}
.ogb-btn.primary:disabled{opacity:.55;cursor:not-allowed;}
.ogb-stats{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;}
.ogb-stat{display:flex;align-items:center;gap:11px;background:#fff;border:1px solid ${C.line};border-radius:14px;padding:12px 16px;min-width:150px;flex:1 1 150px;}
.ogb-stat-ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex-shrink:0;}
.ogb-stat-val{font-family:Poppins;font-weight:700;font-size:22px;line-height:1;}
.ogb-stat-lb{font-size:12px;color:#6b7280;margin-top:3px;}
.ogb-search{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid ${C.line};border-radius:14px;padding:0 14px;flex:1 1 200px;color:#94a3b8;}
.ogb-search input{border:0;outline:0;background:transparent;font-size:13px;padding:13px 0;width:100%;color:#1f2430;}
.ogb-board-wrap{background:#fff;border:1px solid ${C.line};border-radius:18px;padding:20px;box-shadow:0 8px 30px rgba(20,40,70,.05);overflow-x:auto;}
.ogb-loading,.ogb-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:60px 20px;color:#64748b;text-align:center;}
.ogb-loading{flex-direction:row;color:#64748b;}
.ogb-empty code{background:#f1f5f9;padding:2px 7px;border-radius:6px;font-size:12px;}
.spin{animation:spin 1s linear infinite;}@keyframes spin{to{transform:rotate(360deg);}}
.ogb-board{min-width:720px;display:flex;flex-direction:column;gap:10px;}
.ogb-wall-label{font-family:Poppins;font-weight:600;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8;text-align:center;}
.ogb-wall{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;}
.ogb-col{display:flex;flex-direction:column;gap:8px;}
.ogb-chamber{display:flex;align-items:center;justify-content:center;gap:14px;height:64px;border-radius:12px;margin:4px 0;font-family:Poppins;font-weight:700;font-size:22px;letter-spacing:.14em;color:#fff;background:linear-gradient(100deg,${C.chamber2},${C.chamber1});box-shadow:inset 0 0 40px rgba(0,0,0,.18);position:relative;overflow:hidden;}
.ogb-chamber::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 30% 120%,rgba(255,255,255,.35),transparent 60%);}
.ogb-chamber svg{opacity:.9;}
.ogb-gun{position:relative;border:1.5px solid;border-radius:11px;padding:10px 8px 9px;cursor:pointer;text-align:left;transition:transform .12s,box-shadow .12s;display:flex;flex-direction:column;gap:2px;font-family:inherit;}
.ogb-gun:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(20,40,70,.12);}
.ogb-gun:focus-visible{outline:2px solid ${C.accent};outline-offset:2px;}
.ogb-gun.active{box-shadow:0 0 0 3px rgba(37,99,235,.25);}
.ogb-gun.dim{opacity:.32;filter:grayscale(.4);}
.ogb-gun-dot{position:absolute;top:10px;right:9px;width:9px;height:9px;border-radius:50%;}
.ogb-gun-code{font-family:Poppins;font-weight:700;font-size:17px;line-height:1.1;}
.ogb-gun-line{font-size:10.5px;font-weight:600;}
.ogb-gun-wrench{position:absolute;bottom:8px;right:8px;}
.ogb-legend{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px dashed ${C.line};font-size:12.5px;color:#475569;}
.ogb-legend span{display:inline-flex;align-items:center;gap:7px;}
.ogb-legend i{width:11px;height:11px;border-radius:3px;display:inline-block;}
.ogb-legend .hint{margin-left:auto;color:#94a3b8;font-style:italic;}
.ogb-overlay{position:fixed;inset:0;background:rgba(15,23,42,.35);z-index:40;animation:fade .2s;}
.ogb-panel{position:fixed;top:0;right:0;height:100%;width:400px;max-width:92vw;background:#fff;z-index:41;display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(15,23,42,.22);animation:slide .22s ease;}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes slide{from{transform:translateX(30px);opacity:.4}to{transform:translateX(0);opacity:1}}
.ogb-panel-head{position:relative;padding:22px 22px 20px;color:#fff;display:flex;align-items:center;gap:12px;}
.ogb-panel-x{position:absolute;top:14px;right:14px;background:rgba(255,255,255,.15);border:0;color:#fff;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;cursor:pointer;}
.ogb-panel-x:hover{background:rgba(255,255,255,.28);}
.ogb-panel-code{font-family:Poppins;font-weight:700;font-size:30px;line-height:1;}
.ogb-panel-sub{display:block;font-size:12px;opacity:.8;margin-top:3px;}
.ogb-panel-badge{margin-left:auto;color:#fff;font-size:11.5px;font-weight:600;padding:5px 11px;border-radius:20px;}
.ogb-panel-body{padding:22px;flex:1;overflow-y:auto;}
.ogb-field-label{display:flex;align-items:center;gap:6px;font-family:Poppins;font-weight:600;font-size:13px;color:${C.navy};margin-bottom:9px;}
.ogb-seg{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.ogb-seg button{display:flex;align-items:center;justify-content:center;gap:7px;padding:13px;border-radius:11px;border:1.5px solid ${C.line};background:#fff;cursor:pointer;font-family:Poppins;font-weight:600;font-size:13.5px;color:#64748b;transition:.15s;}
.ogb-seg button.on.ok{background:${C.okBg};border-color:${C.ok};color:${C.ok};}
.ogb-seg button.on.bad{background:${C.badBg};border-color:${C.bad};color:${C.bad};}
.ogb-textarea{width:100%;border:1.5px solid ${C.line};border-radius:12px;padding:12px 14px;font-family:inherit;font-size:13.5px;resize:vertical;outline:0;line-height:1.5;color:#1f2430;}
.ogb-textarea:focus{border-color:${C.accent};box-shadow:0 0 0 3px rgba(37,99,235,.12);}
.ogb-note{display:flex;align-items:center;gap:6px;font-size:12px;margin:10px 0 0;padding:8px 11px;border-radius:9px;}
.ogb-note.warn{background:${C.warnBg};color:${C.warn};}
.ogb-meta{margin-top:20px;font-size:12px;color:#94a3b8;border-top:1px dashed ${C.line};padding-top:14px;}
.ogb-panel-foot{padding:16px 22px;border-top:1px solid ${C.line};display:flex;gap:10px;justify-content:flex-end;background:#fbfbfa;}
@media (max-width:640px){.ogb-root{padding:14px;}.ogb-chamber{font-size:16px;height:52px;}.ogb-panel{width:100%;}}
@media (prefers-reduced-motion:reduce){.ogb-gun,.ogb-panel,.ogb-overlay{transition:none;animation:none;}}
`;
