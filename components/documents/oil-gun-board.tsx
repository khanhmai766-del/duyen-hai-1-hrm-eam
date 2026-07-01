"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  Droplet,
  Factory,
  FileSpreadsheet,
  Flame,
  Printer,
  RotateCcw,
  Save,
  Search,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type OilGunStatus = "available" | "unavailable";
type OilGunState = {
  status: OilGunStatus;
  defect: string;
  updatedBy: string;
  updatedAt: string;
};
type OilGunMap = Record<string, OilGunState>;

const REAR_GROUPS = [
  ["D1", "E1", "F1"],
  ["D2", "E2", "F2"],
  ["D3", "E3", "F3"],
  ["A3", "B3", "C3"],
  ["A2", "B2", "C2"],
  ["A1", "B1", "C1"],
];
const FRONT_GROUPS = [
  ["C4", "B4", "A4"],
  ["C5", "B5", "A5"],
  ["C6", "B6", "A6"],
  ["F6", "E6", "D6"],
  ["F5", "E5", "D5"],
  ["F4", "E4", "D4"],
];
const ALL_CODES = [...REAR_GROUPS, ...FRONT_GROUPS].flat();

const OPERATOR = "Mai Đoàn Kim Khánh";
const UPDATED_AT = "01/07/2026 13:26";

const SEED: Partial<OilGunMap> = {
  D1: {
    status: "unavailable",
    defect: "Bít khả dụng - thiếu sensor phát hiện lửa vòi dầu. Đầu mồi lửa mòn, cần thay.",
    updatedBy: OPERATOR,
    updatedAt: UPDATED_AT,
  },
  F2: {
    status: "unavailable",
    defect: "Không khả dụng - sensor phát hiện ngọn lửa báo lỗi, chưa reset được.",
    updatedBy: OPERATOR,
    updatedAt: UPDATED_AT,
  },
  A2: {
    status: "unavailable",
    defect: "Bít khả dụng - khe cửa thăm dò không đóng kín, thiếu đầu mồi lửa.",
    updatedBy: OPERATOR,
    updatedAt: UPDATED_AT,
  },
  D4: {
    status: "unavailable",
    defect: "Không khả dụng - van sensor kẹt, chờ vật tư thay thế.",
    updatedBy: OPERATOR,
    updatedAt: UPDATED_AT,
  },
  C1: {
    status: "available",
    defect: "Thiếu đầu B1 - theo dõi khi vận hành.",
    updatedBy: OPERATOR,
    updatedAt: UPDATED_AT,
  },
  B3: {
    status: "available",
    defect: "Đầu dò force - kiểm tra định kỳ.",
    updatedBy: OPERATOR,
    updatedAt: UPDATED_AT,
  },
  E5: {
    status: "available",
    defect: "Van sensor kẹt nhẹ, đã ghi nhận, vẫn khả dụng.",
    updatedBy: OPERATOR,
    updatedAt: UPDATED_AT,
  },
};

const COLOR = {
  navy: "#1E3A5F",
  accent: "#2563eb",
  cream: "#f7f6f2",
  line: "#e3e1da",
  ok: "#16a34a",
  okBg: "#e9f7ef",
  okLine: "#bfe6cd",
  bad: "#dc2626",
  badBg: "#fdecec",
  badLine: "#f6c9c9",
  warn: "#d97706",
  warnBg: "#fdf3e3",
  warnLine: "#f0dcae",
  chamber1: "#f59e0b",
  chamber2: "#dc2626",
};

function initOilGuns(): OilGunMap {
  return Object.fromEntries(
    ALL_CODES.map((code) => [
      code,
      SEED[code] ?? {
        status: "available",
        defect: "",
        updatedBy: "",
        updatedAt: "",
      },
    ])
  ) as OilGunMap;
}

function tone(gun: OilGunState) {
  if (gun.status === "unavailable") {
    return { key: "bad", color: COLOR.bad, bg: COLOR.badBg, line: COLOR.badLine, label: "Không khả dụng" };
  }
  if (gun.defect.trim()) {
    return { key: "warn", color: COLOR.warn, bg: COLOR.warnBg, line: COLOR.warnLine, label: "Khả dụng · có khiếm khuyết" };
  }
  return { key: "ok", color: COLOR.ok, bg: COLOR.okBg, line: COLOR.okLine, label: "Khả dụng" };
}

export function OilGunBoard() {
  const [guns, setGuns] = React.useState<OilGunMap>(() => initOilGuns());
  const [selected, setSelected] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<OilGunState | null>(null);
  const [query, setQuery] = React.useState("");
  const [machine, setMachine] = React.useState("S1");

  const stats = React.useMemo(() => {
    let ok = 0;
    let bad = 0;
    let warn = 0;
    for (const code of ALL_CODES) {
      const key = tone(guns[code]).key;
      if (key === "ok") ok += 1;
      else if (key === "bad") bad += 1;
      else warn += 1;
    }
    return { total: ALL_CODES.length, ok, bad, warn };
  }, [guns]);

  function openGun(code: string) {
    setSelected(code);
    setDraft({ ...guns[code] });
  }

  function closePanel() {
    setSelected(null);
    setDraft(null);
  }

  function saveDraft() {
    if (!selected || !draft) return;
    setGuns((current) => ({
      ...current,
      [selected]: {
        ...draft,
        updatedBy: OPERATOR,
        updatedAt: new Intl.DateTimeFormat("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date()),
      },
    }));
    closePanel();
  }

  const highlight = query.trim().toUpperCase();

  return (
    <section className="ogb-root">
      <style>{OIL_GUN_CSS}</style>
      <header className="ogb-head">
        <div className="ogb-head-left">
          <div className="ogb-head-icon">
            <Droplet size={20} />
          </div>
          <div>
            <h2>Dữ liệu vòi dầu</h2>
            <p>Sơ đồ khả dụng vòi dầu buồng đốt · tổ máy {machine}</p>
          </div>
        </div>
        <div className="ogb-head-actions">
          <div className="ogb-machine">
            {["S1", "S2"].map((item) => (
              <button key={item} type="button" className={machine === item ? "on" : ""} onClick={() => setMachine(item)}>
                <Factory size={14} />
                {item}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" className="h-9 rounded-[8px] bg-white">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Excel
          </Button>
          <Button type="button" variant="outline" className="h-9 rounded-[8px] bg-white">
            <Printer className="h-4 w-4 text-orange-500" />
            PDF
          </Button>
        </div>
      </header>

      <div className="ogb-stats">
        <Stat label="Tổng vòi dầu" value={stats.total} color={COLOR.navy} icon={<Droplet size={16} />} />
        <Stat label="Khả dụng" value={stats.ok} color={COLOR.ok} icon={<Check size={16} />} />
        <Stat label="Có khiếm khuyết" value={stats.warn} color={COLOR.warn} icon={<Wrench size={16} />} />
        <Stat label="Không khả dụng" value={stats.bad} color={COLOR.bad} icon={<X size={16} />} />
        <div className="ogb-search">
          <Search size={15} />
          <input placeholder="Tìm vòi (VD: D1, A3...)" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>

      <div className="ogb-board-wrap">
        <div className="ogb-board">
          <WallLabel label="Tường sau" />
          <Wall groups={REAR_GROUPS} guns={guns} onOpen={openGun} highlight={highlight} selected={selected} />
          <div className="ogb-chamber">
            <Flame size={22} />
            <span>BUỒNG ĐỐT {machine}</span>
            <Flame size={22} />
          </div>
          <Wall groups={FRONT_GROUPS} guns={guns} onOpen={openGun} highlight={highlight} selected={selected} />
          <WallLabel label="Tường trước" />
        </div>

        <div className="ogb-legend">
          <span><i style={{ background: COLOR.ok }} /> Khả dụng</span>
          <span><i style={{ background: COLOR.warn }} /> Có khiếm khuyết</span>
          <span><i style={{ background: COLOR.bad }} /> Không khả dụng</span>
          <span className="hint">Bấm vào một vòi để cập nhật trạng thái và khiếm khuyết</span>
        </div>
      </div>

      {selected && draft && (
        <>
          <div className="ogb-overlay" onClick={closePanel} />
          <aside className="ogb-panel" role="dialog" aria-label={`Cập nhật vòi ${selected}`}>
            <PanelBody
              code={selected}
              draft={draft}
              setDraft={setDraft}
              original={guns[selected]}
              onClose={closePanel}
              onSave={saveDraft}
            />
          </aside>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="ogb-stat">
      <span className="ogb-stat-ic" style={{ color, background: `${color}18` }}>{icon}</span>
      <div>
        <div className="ogb-stat-val" style={{ color }}>{value}</div>
        <div className="ogb-stat-lb">{label}</div>
      </div>
    </div>
  );
}

function WallLabel({ label }: { label: string }) {
  return <div className="ogb-wall-label">{label}</div>;
}

function Wall({
  groups,
  guns,
  onOpen,
  highlight,
  selected,
}: {
  groups: string[][];
  guns: OilGunMap;
  onOpen: (code: string) => void;
  highlight: string;
  selected: string | null;
}) {
  return (
    <div className="ogb-wall">
      {groups.map((group, index) => (
        <div className="ogb-col" key={index}>
          {group.map((code) => (
            <Gun
              key={code}
              code={code}
              gun={guns[code]}
              onOpen={onOpen}
              dim={Boolean(highlight && !code.includes(highlight))}
              active={selected === code}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Gun({
  code,
  gun,
  onOpen,
  dim,
  active,
}: {
  code: string;
  gun: OilGunState;
  onOpen: (code: string) => void;
  dim: boolean;
  active: boolean;
}) {
  const currentTone = tone(gun);
  const hasDefect = gun.defect.trim();
  return (
    <button
      type="button"
      className={`ogb-gun ${active ? "active" : ""} ${dim ? "dim" : ""}`}
      style={{ background: currentTone.bg, borderColor: active ? COLOR.accent : currentTone.line }}
      onClick={() => onOpen(code)}
      title={`${code} - ${currentTone.label}${hasDefect ? ` · ${gun.defect}` : ""}`}
    >
      <span className="ogb-gun-dot" style={{ background: currentTone.color }} />
      <span className="ogb-gun-code" style={{ color: COLOR.navy }}>{code}</span>
      <span className="ogb-gun-line" style={{ color: currentTone.color }}>
        {gun.status === "unavailable" ? "Không khả dụng" : "Khả dụng"}
      </span>
      {hasDefect && <Wrench className="ogb-gun-wrench" size={12} style={{ color: currentTone.color }} />}
    </button>
  );
}

function PanelBody({
  code,
  draft,
  setDraft,
  original,
  onClose,
  onSave,
}: {
  code: string;
  draft: OilGunState;
  setDraft: React.Dispatch<React.SetStateAction<OilGunState | null>>;
  original: OilGunState;
  onClose: () => void;
  onSave: () => void;
}) {
  const currentTone = tone(draft);
  const changed = draft.status !== original.status || draft.defect !== original.defect;

  function updateDraft(next: Partial<OilGunState>) {
    setDraft((current) => (current ? { ...current, ...next } : current));
  }

  return (
    <>
      <div className="ogb-panel-head">
        <button type="button" className="ogb-panel-x" onClick={onClose} aria-label="Đóng">
          <X size={18} />
        </button>
        <div className="ogb-panel-title">
          <span className="ogb-panel-code">{code}</span>
          <span className="ogb-panel-sub">Vòi dầu · Buồng đốt</span>
        </div>
        <span className="ogb-panel-badge" style={{ background: currentTone.color }}>{currentTone.label}</span>
      </div>

      <div className="ogb-panel-body">
        <label className="ogb-field-label">Trạng thái khả dụng</label>
        <div className="ogb-seg">
          <button type="button" className={draft.status === "available" ? "on ok" : ""} onClick={() => updateDraft({ status: "available" })}>
            <Check size={16} />
            Khả dụng
          </button>
          <button type="button" className={draft.status === "unavailable" ? "on bad" : ""} onClick={() => updateDraft({ status: "unavailable" })}>
            <X size={16} />
            Không khả dụng
          </button>
        </div>

        <label className="ogb-field-label mt-5">
          <Wrench size={14} />
          Khiếm khuyết vòi dầu
        </label>
        <textarea
          className="ogb-textarea"
          rows={5}
          placeholder="Mô tả khiếm khuyết của vòi: thiếu sensor, mòn đầu mồi lửa, kẹt van... Để trống nếu vòi không có khiếm khuyết."
          value={draft.defect}
          onChange={(event) => updateDraft({ defect: event.target.value })}
        />
        {draft.status === "available" && draft.defect.trim() && (
          <p className="ogb-note warn">
            <AlertTriangle size={13} />
            Vòi vẫn khả dụng nhưng có khiếm khuyết, hệ thống hiển thị màu cam để theo dõi.
          </p>
        )}

        {original.updatedAt && (
          <div className="ogb-meta">
            Cập nhật gần nhất: <b>{original.updatedBy}</b> · {original.updatedAt}
          </div>
        )}
      </div>

      <div className="ogb-panel-foot">
        <button type="button" className="ogb-btn ghost" onClick={() => setDraft({ ...original })}>
          <RotateCcw size={15} />
          Hoàn tác
        </button>
        <button type="button" className="ogb-btn primary" onClick={onSave} disabled={!changed}>
          <Save size={15} />
          Lưu thay đổi
        </button>
      </div>
    </>
  );
}

const OIL_GUN_CSS = `
.ogb-root{color:#1f2430;background:${COLOR.cream};border:1px solid #e5e7eb;border-radius:16px;padding:clamp(10px,1.2vw,18px);position:relative;min-height:620px;overflow:hidden;}
.ogb-root *{box-sizing:border-box;}
.ogb-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px;}
.ogb-head-left{display:flex;align-items:center;gap:13px;}
.ogb-head-icon{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,${COLOR.navy},${COLOR.accent});box-shadow:0 6px 16px rgba(30,58,95,.22);}
.ogb-head h2{font-weight:800;font-size:22px;margin:0;color:${COLOR.navy};letter-spacing:0;}
.ogb-head p{margin:2px 0 0;font-size:13px;color:#64748b;}
.ogb-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.ogb-machine{display:flex;background:#fff;border:1px solid ${COLOR.line};border-radius:10px;padding:3px;gap:2px;}
.ogb-machine button{display:flex;align-items:center;gap:5px;border:0;background:transparent;cursor:pointer;font-weight:700;font-size:13px;color:#64748b;padding:7px 12px;border-radius:8px;}
.ogb-machine button.on{background:${COLOR.navy};color:#fff;box-shadow:0 3px 8px rgba(30,58,95,.22);}
.ogb-stats{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
.ogb-stat{display:flex;align-items:center;gap:11px;background:#fff;border:1px solid ${COLOR.line};border-radius:12px;padding:12px 14px;min-width:150px;flex:1 1 150px;}
.ogb-stat-ic{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex-shrink:0;}
.ogb-stat-val{font-weight:900;font-size:22px;line-height:1;}
.ogb-stat-lb{font-size:12px;color:#64748b;margin-top:3px;}
.ogb-search{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid ${COLOR.line};border-radius:12px;padding:0 14px;flex:1 1 220px;color:#94a3b8;}
.ogb-search input{border:0;outline:0;background:transparent;font-size:13px;padding:13px 0;width:100%;color:#1f2430;}
.ogb-board-wrap{background:#fff;border:1px solid ${COLOR.line};border-radius:14px;padding:clamp(10px,1.4vw,20px);box-shadow:0 8px 28px rgba(20,40,70,.05);overflow:hidden;}
.ogb-board{width:100%;min-width:0;display:flex;flex-direction:column;gap:10px;}
.ogb-wall-label{font-weight:800;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8;text-align:center;}
.ogb-wall{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:clamp(6px,.8vw,12px);}
.ogb-col{min-width:0;display:flex;flex-direction:column;gap:clamp(5px,.6vw,8px);}
.ogb-chamber{display:flex;align-items:center;justify-content:center;gap:14px;height:64px;border-radius:12px;margin:4px 0;font-weight:900;font-size:22px;letter-spacing:.12em;color:#fff;background:linear-gradient(100deg,${COLOR.chamber2},${COLOR.chamber1});box-shadow:inset 0 0 40px rgba(0,0,0,.16);position:relative;overflow:hidden;}
.ogb-chamber::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 30% 120%,rgba(255,255,255,.35),transparent 60%);}
.ogb-chamber span,.ogb-chamber svg{position:relative;z-index:1;}
.ogb-gun{position:relative;min-width:0;min-height:52px;border:1.5px solid;border-radius:10px;padding:10px 8px 9px;cursor:pointer;text-align:left;transition:transform .12s,box-shadow .12s;display:flex;flex-direction:column;gap:2px;font-family:inherit;}
.ogb-gun:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(20,40,70,.12);}
.ogb-gun:focus-visible{outline:2px solid ${COLOR.accent};outline-offset:2px;}
.ogb-gun.active{box-shadow:0 0 0 3px rgba(37,99,235,.24);}
.ogb-gun.dim{opacity:.32;filter:grayscale(.4);}
.ogb-gun-dot{position:absolute;top:10px;right:9px;width:9px;height:9px;border-radius:50%;}
.ogb-gun-code{font-weight:900;font-size:clamp(14px,1.1vw,17px);line-height:1.1;}
.ogb-gun-line{font-size:clamp(9px,.7vw,10.5px);font-weight:700;line-height:1.15;}
.ogb-gun-wrench{position:absolute;bottom:8px;right:8px;}
.ogb-legend{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px dashed ${COLOR.line};font-size:12.5px;color:#475569;}
.ogb-legend span{display:inline-flex;align-items:center;gap:7px;}
.ogb-legend i{width:11px;height:11px;border-radius:3px;display:inline-block;}
.ogb-legend .hint{margin-left:auto;color:#94a3b8;font-style:italic;}
.ogb-overlay{position:fixed;inset:0;background:rgba(15,23,42,.35);z-index:40;animation:ogb-fade .2s;}
.ogb-panel{position:fixed;top:0;right:0;height:100%;width:400px;max-width:92vw;background:#fff;z-index:41;display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(15,23,42,.22);animation:ogb-slide .22s ease;}
@keyframes ogb-fade{from{opacity:0}to{opacity:1}}
@keyframes ogb-slide{from{transform:translateX(30px);opacity:.4}to{transform:translateX(0);opacity:1}}
.ogb-panel-head{position:relative;padding:22px 22px 20px;color:#fff;background:${COLOR.navy};display:flex;align-items:center;gap:12px;}
.ogb-panel-x{position:absolute;top:14px;right:14px;background:rgba(255,255,255,.15);border:0;color:#fff;width:30px;height:30px;border-radius:8px;display:grid;place-items:center;cursor:pointer;}
.ogb-panel-x:hover{background:rgba(255,255,255,.28);}
.ogb-panel-code{font-weight:900;font-size:30px;line-height:1;}
.ogb-panel-sub{display:block;font-size:12px;opacity:.8;margin-top:3px;}
.ogb-panel-badge{margin-left:auto;color:#fff;font-size:11.5px;font-weight:700;padding:5px 11px;border-radius:20px;}
.ogb-panel-body{padding:22px;flex:1;overflow-y:auto;}
.ogb-field-label{display:flex;align-items:center;gap:6px;font-weight:800;font-size:13px;color:${COLOR.navy};margin-bottom:9px;}
.ogb-seg{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.ogb-seg button{display:flex;align-items:center;justify-content:center;gap:7px;padding:13px;border-radius:10px;border:1.5px solid ${COLOR.line};background:#fff;cursor:pointer;font-weight:800;font-size:13.5px;color:#64748b;transition:.15s;}
.ogb-seg button.on.ok{background:${COLOR.okBg};border-color:${COLOR.ok};color:${COLOR.ok};}
.ogb-seg button.on.bad{background:${COLOR.badBg};border-color:${COLOR.bad};color:${COLOR.bad};}
.ogb-textarea{width:100%;border:1.5px solid ${COLOR.line};border-radius:12px;padding:12px 14px;font-family:inherit;font-size:13.5px;resize:vertical;outline:0;line-height:1.5;color:#1f2430;}
.ogb-textarea:focus{border-color:${COLOR.accent};box-shadow:0 0 0 3px rgba(37,99,235,.12);}
.ogb-note{display:flex;align-items:center;gap:6px;font-size:12px;margin:10px 0 0;padding:8px 11px;border-radius:9px;}
.ogb-note.warn{background:${COLOR.warnBg};color:${COLOR.warn};}
.ogb-meta{margin-top:20px;font-size:12px;color:#94a3b8;border-top:1px dashed ${COLOR.line};padding-top:14px;}
.ogb-panel-foot{padding:16px 22px;border-top:1px solid ${COLOR.line};display:flex;gap:10px;justify-content:flex-end;background:#fbfbfa;}
.ogb-btn{display:inline-flex;align-items:center;gap:6px;font-weight:800;font-size:13px;border-radius:9px;padding:9px 13px;cursor:pointer;border:1px solid ${COLOR.line};transition:.15s;}
.ogb-btn.ghost{background:#fff;color:#475569;}
.ogb-btn.primary{background:${COLOR.accent};color:#fff;border-color:${COLOR.accent};}
.ogb-btn.primary:disabled{opacity:.45;cursor:not-allowed;}
@media (max-width:900px){
  .ogb-head{align-items:flex-start}
  .ogb-head-actions{width:100%;justify-content:flex-start}
  .ogb-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));}
  .ogb-stat,.ogb-search{min-width:0}
}
@media (max-width:640px){
  .ogb-root{border-radius:12px}
  .ogb-head-left{align-items:flex-start}
  .ogb-head-icon{width:38px;height:38px;border-radius:10px}
  .ogb-head h2{font-size:19px}
  .ogb-head p{font-size:12px}
  .ogb-head-actions{gap:6px}
  .ogb-machine button{padding:6px 10px}
  .ogb-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .ogb-stat{padding:10px}
  .ogb-stat-ic{width:30px;height:30px}
  .ogb-stat-val{font-size:18px}
  .ogb-stat-lb{font-size:11px}
  .ogb-search{grid-column:1/-1}
  .ogb-wall{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .ogb-col{gap:6px}
  .ogb-gun{min-height:48px;padding:8px 7px}
  .ogb-gun-dot{top:8px;right:7px;width:8px;height:8px}
  .ogb-gun-wrench{bottom:7px;right:7px}
  .ogb-chamber{font-size:16px;height:52px;letter-spacing:.08em}
  .ogb-legend{gap:10px;font-size:11.5px}
  .ogb-legend .hint{width:100%;margin-left:0}
  .ogb-panel{width:100%}
}
@media (max-width:390px){
  .ogb-stats{grid-template-columns:1fr}
  .ogb-wall{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (prefers-reduced-motion:reduce){.ogb-gun,.ogb-panel,.ogb-overlay{transition:none;animation:none}}
`;
