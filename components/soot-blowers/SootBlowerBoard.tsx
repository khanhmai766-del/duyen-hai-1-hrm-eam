"use client";

import React, { useMemo, useState } from "react";
import { Factory, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useSootBlowers,
  useSetSootBlowerStatus,
  useAddSootBlowerDefect,
  useResolveSootBlowerDefect,
  type SootBlowerDefect,
} from "@/hooks/useSootBlowers";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import {
  SB_LEFT_RAW,
  SB_PAGES,
  SB_RIGHT_RAW,
  SB_TILE_H as H,
  SB_TILE_W as W,
  SOOT_BLOWER_DEPT_LABEL,
  SOOT_BLOWER_MACHINES,
  SOOT_BLOWER_TYPES,
  SOOT_BLOWER_TYPE_NAME,
  sootBlowerPageOf as pageOf,
  sootBlowerTypeOf as typeOf,
  sootBlowerZoneName as zoneName,
  type SootBlowerDept,
  type SootBlowerPage,
  type SootBlowerPageKey,
  type SootBlowerType,
} from "@/lib/soot-blower-layout";

/* Sơ đồ khiếm khuyết vòi thổi bụi — vẽ SVG theo màn DCS SOOT BLOW.
   - Ký hiệu theo loại: IR ▲, IK thanh có mũi tên, IKEL thanh rỗng, AH ✚
   - "Làm nổi bật" theo loại vòi, callout khi rê chuột, bản đồ toàn cảnh 98 vòi
   - Panel bên phải thay modal: vẫn nhìn sơ đồ khi nhập liệu */

const CSS = `
.vtb-root .tnum{font-variant-numeric:tabular-nums}
.vtb-root .mono{font-family:ui-monospace,"JetBrains Mono",Consolas,monospace}
.vtb-dot{cursor:pointer}
.vtb-dot:hover{stroke:#1d4ed8;stroke-width:4}
.vtb-tile{cursor:pointer;outline:none;transition:opacity .2s ease}
.vtb-tile:hover .vtb-body,.vtb-tile:focus-visible .vtb-body{stroke:#1d4ed8;stroke-width:2.2}
@keyframes vtbPulse{0%,100%{stroke-opacity:1}50%{stroke-opacity:.2}}
.vtb-sel{animation:vtbPulse 1.2s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.vtb-sel{animation:none}}
`;

const DCS_BG = "#c5c9cd";
const PIPE = "#b3261e";
const DASH = "#3a3f45";
const VALVE = "#4b5563"; // van vẽ theo DCS nhưng không có tín hiệu thật → màu trung tính

type Status = "OK" | "WARN" | "BAD";
const STATUS_UI: Record<Status, { label: string; fill: string; stroke: string; tag: string; icon: string; chip: string }> = {
  OK: { label: "Khả dụng", fill: "#eceef0", stroke: "#6b7280", tag: "#0b7a2a", icon: "#4b5563", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  WARN: { label: "Khả dụng · có khiếm khuyết", fill: "#fde68a", stroke: "#b45309", tag: "#78350f", icon: "#b45309", chip: "bg-amber-50 text-amber-800 border-amber-200" },
  BAD: { label: "Bất khả dụng", fill: "#dc2626", stroke: "#7f1d1d", tag: "#ffffff", icon: "#fecaca", chip: "bg-red-50 text-red-700 border-red-200" },
};
const DEPT_UI: Record<SootBlowerDept, string> = {
  "SCĐ": "text-orange-700 bg-orange-50 border-orange-200",
  SCCN: "text-sky-700 bg-sky-50 border-sky-200",
};

type Board = {
  open: Map<string, SootBlowerDefect[]>;
  history: Map<string, SootBlowerDefect[]>;
  unavail: Set<string>;
};
function statusOf(tag: string, b: Board): Status {
  if (b.unavail.has(tag)) return "BAD";
  return b.open.get(tag)?.length ? "WARN" : "OK";
}
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("vi-VN") : "");

/* ---------------- Ký hiệu vòi theo loại (dùng chung sơ đồ + chú giải) ---------------- */
function Glyph({ type, cx, cy, color }: { type: SootBlowerType; cx: number; cy: number; color: string }) {
  if (type === "IR") return <polygon points={`${cx},${cy - 6} ${cx + 8},${cy + 6} ${cx - 8},${cy + 6}`} fill={color} />;
  if (type === "AH") return <path d={`M${cx - 2.5} ${cy - 7}h5v4.5h4.5v5h-4.5v4.5h-5v-4.5h-4.5v-5h4.5z`} fill={color} />;
  const hollow = type === "IKEL";
  return (
    <g>
      <rect
        x={cx - 11}
        y={cy - 3}
        width={17}
        height={6}
        fill={hollow ? "none" : color}
        stroke={hollow ? color : undefined}
        strokeWidth={hollow ? 1.6 : undefined}
      />
      <polygon points={`${cx + 6},${cy - 5} ${cx + 12},${cy} ${cx + 6},${cy + 5}`} fill={color} />
    </g>
  );
}

/* ==================== BOARD ==================== */
export default function SootBlowerBoard() {
  const [machine, setMachine] = useState<string>("S1");
  const [pageKey, setPageKey] = useState<SootBlowerPageKey>("left");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [typeFocus, setTypeFocus] = useState<SootBlowerType | null>(null);

  const { data, isLoading, error } = useSootBlowers(machine);
  const rbac = useRbacAccess();
  const canManage = rbac.can("archive-oil-gun-data", ["manage", "full"]);

  const board = useMemo<Board>(() => {
    const open = new Map<string, SootBlowerDefect[]>();
    const history = new Map<string, SootBlowerDefect[]>();
    for (const d of data?.defects ?? []) {
      const target = d.resolvedAt ? history : open;
      target.set(d.tag, [...(target.get(d.tag) ?? []), d]);
    }
    const unavail = new Set((data?.blowers ?? []).filter((b) => b.status === "unavailable").map((b) => b.tag));
    return { open, history, unavail };
  }, [data]);

  const page = SB_PAGES[pageKey];
  const openCount = (key: SootBlowerPageKey) => SB_PAGES[key].tags.filter((t) => statusOf(t, board) !== "OK").length;

  const totals = useMemo(() => {
    const c: Record<Status, number> = { OK: 0, WARN: 0, BAD: 0 };
    const all = [...SB_PAGES.left.tags, ...SB_PAGES.right.tags];
    all.forEach((t) => c[statusOf(t, board)]++);
    return { ...c, total: all.length };
  }, [board]);

  const select = (tag: string) => {
    const pk = pageOf(tag);
    if (!pk) return;
    setPageKey(pk);
    setSelected(tag);
  };
  const switchPage = (k: SootBlowerPageKey) => {
    setPageKey(k);
    setSelected(null);
  };

  const runSearch = () => {
    const tag = query.trim().toUpperCase().replace(/\s+/g, "");
    if (!tag) return;
    if (pageOf(tag)) {
      select(tag);
      setSearchMsg(null);
    } else {
      setSearchMsg(`Không có vòi "${tag}" trên sơ đồ.`);
    }
  };

  return (
    <div className="vtb-root text-slate-800">
      <style>{CSS}</style>

      {/* ===== Header ===== */}
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Khiếm khuyết vòi thổi bụi · Tổ máy {machine}</h1>
          <p className="mt-0.5 text-sm text-slate-500">Sơ đồ theo màn DCS SOOT BLOW · chọn vòi để ghi nhận khiếm khuyết</p>
        </div>
        <div className="ml-auto flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <Stat n={totals.OK} label="khả dụng" color="text-emerald-700" />
          <Stat n={totals.WARN} label="có khiếm khuyết" color="text-amber-600" />
          <Stat n={totals.BAD} label="bất khả dụng" color="text-red-600" />
          <span className="tnum text-xs text-slate-400">/ {totals.total} vòi</span>
        </div>
      </div>

      {/* ===== Thanh điều khiển ===== */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented>
          {SOOT_BLOWER_MACHINES.map((m) => (
            <SegButton
              key={m}
              active={machine === m}
              onClick={() => {
                setMachine(m);
                setSelected(null);
              }}
            >
              <Factory className="h-3.5 w-3.5" /> {m}
            </SegButton>
          ))}
        </Segmented>
        <Segmented>
          {(["left", "right"] as const).map((k) => (
            <SegButton key={k} active={pageKey === k} onClick={() => switchPage(k)}>
              {SB_PAGES[k].label}
              {openCount(k) > 0 && (
                <span
                  className={`tnum min-w-5 rounded-full px-1.5 text-[11px] font-bold ${pageKey === k ? "bg-amber-400 text-slate-900" : "bg-amber-100 text-amber-800"}`}
                >
                  {openCount(k)}
                </span>
              )}
            </SegButton>
          ))}
        </Segmented>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Tìm tag vòi, VD: IR15"
            aria-label="Tìm tag vòi"
            className="mono w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <button
            type="button"
            onClick={runSearch}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Tìm
          </button>
          {searchMsg && <span className="text-sm text-red-600">{searchMsg}</span>}
        </div>
        <TypeFocus page={page} value={typeFocus} onChange={setTypeFocus} />
      </div>

      {/* ===== Sơ đồ + panel ===== */}
      <div className="flex flex-col items-start gap-4 xl:flex-row">
        <div className="relative w-full min-w-0 flex-1 overflow-x-auto rounded-xl border border-slate-300" style={{ background: DCS_BG }}>
          <Schematic page={page} board={board} selected={selected} typeFocus={typeFocus} onSelect={setSelected} />
          {(isLoading || error) && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white/60 text-sm font-semibold text-slate-600">
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Đang tải dữ liệu vòi thổi bụi…
                </>
              ) : (
                <span className="text-red-600">{error instanceof Error ? error.message : "Không tải được dữ liệu"}</span>
              )}
            </div>
          )}
        </div>

        <aside className="w-full shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:w-[370px]">
          <Minimap pageKey={pageKey} board={board} selected={selected} onPage={switchPage} onPick={select} />
          {selected ? (
            <DetailPanel key={`${machine}-${selected}`} machine={machine} tag={selected} board={board} canManage={canManage} onBack={() => setSelected(null)} />
          ) : (
            <OpenList board={board} onPick={select} />
          )}
        </aside>
      </div>
    </div>
  );
}

function Segmented({ children }: { children: React.ReactNode }) {
  return <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white text-sm font-semibold">{children}</div>;
}
function SegButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`tnum text-2xl font-extrabold ${color}`}>{n}</span>
      <span className="text-sm text-slate-500">{label}</span>
    </span>
  );
}

/* Làm nổi bật theo loại vòi — kiêm luôn chú giải ký hiệu */
function TypeFocus({
  page,
  value,
  onChange,
}: {
  page: SootBlowerPage;
  value: SootBlowerType | null;
  onChange: (v: SootBlowerType | null) => void;
}) {
  const count = (t: SootBlowerType) => page.tags.filter((g) => typeOf(g) === t).length;
  return (
    <div className="flex min-w-0 max-w-full items-center gap-2 xl:ml-auto">
      <span className="shrink-0 text-xs text-slate-500">Làm nổi bật</span>
      <div className="flex min-w-0 overflow-x-auto whitespace-nowrap rounded-lg border border-slate-300 bg-white text-xs font-semibold">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`px-3 py-2 ${value === null ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          Tất cả
        </button>
        {SOOT_BLOWER_TYPES.filter((t) => count(t) > 0).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => onChange(value === t ? null : t)}
            title={SOOT_BLOWER_TYPE_NAME[t]}
            aria-pressed={value === t}
            className={`flex items-center gap-1.5 border-l border-slate-200 px-3 py-2 ${value === t ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            <svg width="26" height="16" aria-hidden="true">
              <Glyph type={t} cx={13} cy={8} color={value === t ? "#ffffff" : "#4b5563"} />
            </svg>
            <span className="mono">{t}</span>
            <span className={`tnum ${value === t ? "text-slate-300" : "text-slate-400"}`}>{count(t)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* Bản đồ toàn cảnh: 98 vòi theo tọa độ DCS gốc, vòi có vấn đề nổi to */
function Minimap({
  pageKey,
  board,
  selected,
  onPage,
  onPick,
}: {
  pageKey: SootBlowerPageKey;
  board: Board;
  selected: string | null;
  onPage: (k: SootBlowerPageKey) => void;
  onPick: (tag: string) => void;
}) {
  const SPLIT = 795;
  const dots = [...Object.entries(SB_LEFT_RAW.tiles), ...Object.entries(SB_RIGHT_RAW.tiles)];
  const COLOR: Record<Status, string> = { OK: "#94a3b8", WARN: "#f59e0b", BAD: "#dc2626" };
  return (
    <div className="border-b border-slate-100 px-4 pb-3 pt-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-bold text-slate-800">Toàn cảnh lò</span>
        <span className="text-[11px] text-slate-400">Bấm vào vách để chuyển trang</span>
      </div>
      <svg viewBox="0 0 1740 660" className="h-auto w-full rounded-lg" style={{ background: "#e7e9ec" }} role="img" aria-label="Bản đồ toàn cảnh vòi thổi bụi hai vách">
        {(["left", "right"] as const).map((k) => (
          <rect
            key={k}
            x={k === "left" ? 0 : SPLIT}
            y={0}
            width={k === "left" ? SPLIT : 1740 - SPLIT}
            height={660}
            fill={pageKey === k ? "rgba(29,78,216,0.12)" : "transparent"}
            stroke={pageKey === k ? "#1d4ed8" : "none"}
            strokeWidth="6"
            style={{ cursor: "pointer" }}
            onClick={() => onPage(k)}
          />
        ))}
        <line x1={SPLIT} y1={20} x2={SPLIT} y2={640} stroke="#94a3b8" strokeWidth="3" strokeDasharray="14 10" pointerEvents="none" />
        {dots.map(([tag, [x, y]]) => {
          const st = statusOf(tag, board);
          return (
            <circle
              key={tag}
              className="vtb-dot"
              cx={x}
              cy={y}
              r={st !== "OK" ? 17 : 8}
              fill={COLOR[st]}
              stroke={selected === tag ? "#1d4ed8" : "none"}
              strokeWidth={selected === tag ? 7 : 0}
              onClick={() => onPick(tag)}
            >
              <title>{`${tag} — ${STATUS_UI[st].label}`}</title>
            </circle>
          );
        })}
        <text x={30} y={640} fontSize="34" fontWeight="700" fill="#64748b" pointerEvents="none">VÁCH TRÁI</text>
        <text x={1490} y={640} fontSize="34" fontWeight="700" fill="#64748b" pointerEvents="none">VÁCH PHẢI</text>
      </svg>
    </div>
  );
}

/* ==================== SƠ ĐỒ SVG ==================== */
function Schematic({
  page,
  board,
  selected,
  typeFocus,
  onSelect,
}: {
  page: SootBlowerPage;
  board: Board;
  selected: string | null;
  typeFocus: SootBlowerType | null;
  onSelect: (tag: string) => void;
}) {
  const [vw, vh] = page.vb;
  const [hover, setHover] = useState<string | null>(null);
  return (
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      className="block h-auto w-full min-w-[720px]"
      role="img"
      aria-label={`Sơ đồ vòi thổi bụi ${page.label}`}
      onMouseLeave={() => setHover(null)}
    >
      {/* nền lưới chấm nhẹ như mặt HMI */}
      <defs>
        <pattern id="vtbDots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="#aeb3b8" />
        </pattern>
      </defs>
      <rect width={vw} height={vh} fill="url(#vtbDots)" />
      {page.pipes.map((pts, i) => (
        <polyline key={"p" + i} points={pts} fill="none" stroke={PIPE} strokeWidth="3" />
      ))}
      {page.rowPipes.map((pts, i) => (
        <polyline key={"r" + i} points={pts} fill="none" stroke={PIPE} strokeWidth="2" />
      ))}
      {page.tags
        .filter((t) => page.slopeTags.has(t))
        .map((t) => {
          const [x, y] = page.pos[t];
          return <line key={"s" + t} x1={x} y1={y + H / 2} x2={x} y2={y + H / 2 + 9} stroke={PIPE} strokeWidth="2" />;
        })}
      {page.outlines.map((pts, i) => (
        <polygon key={"o" + i} points={pts} fill="none" stroke={DASH} strokeWidth="1.8" strokeDasharray="8 6" />
      ))}
      {page.valves.map(([x, y], i) => (
        <g key={"v" + i}>
          <polygon points={`${x - 11},${y - 9} ${x},${y} ${x - 11},${y + 9}`} fill={VALVE} />
          <polygon points={`${x + 11},${y - 9} ${x},${y} ${x + 11},${y + 9}`} fill={VALVE} />
        </g>
      ))}
      {page.labels.map((l) => (
        <g key={l.t}>
          <text x={l.p[0]} y={l.p[1]} fontSize={l.size} fontWeight="600" letterSpacing="3" fill="#1f2328" className="mono">
            {l.t}
          </text>
          {l.sub && (
            <text x={l.p[0]} y={l.p[1] + l.size + 4} fontSize="15" fontWeight="500" fill="#4b5563">
              {l.sub}
            </text>
          )}
        </g>
      ))}
      {page.tags.map((t) => {
        const [x, y] = page.pos[t];
        const open = board.open.get(t) ?? [];
        return (
          <Tile
            key={t}
            tag={t}
            x={x}
            y={y}
            status={statusOf(t, board)}
            scd={open.filter((d) => d.dept === "SCĐ").length}
            sccn={open.filter((d) => d.dept === "SCCN").length}
            selected={selected === t}
            dimmed={typeFocus !== null && typeOf(t) !== typeFocus}
            onClick={() => onSelect(t)}
            onHover={setHover}
          />
        );
      })}
      {hover && <Callout tag={hover} page={page} status={statusOf(hover, board)} vw={vw} />}
    </svg>
  );
}

/* Callout khi rê chuột: nói rõ đây là vòi gì, nằm đâu, đang thế nào */
function Callout({ tag, page, status, vw }: { tag: string; page: SootBlowerPage; status: Status; vw: number }) {
  const [x, y] = page.pos[tag];
  const CW = 260, CH = 62;
  const left = Math.min(Math.max(x - CW / 2, 6), vw - CW - 6);
  const above = y - H / 2 - CH - 12 > 0;
  const top = above ? y - H / 2 - CH - 12 : y + H / 2 + 12;
  return (
    <g pointerEvents="none">
      <rect x={left} y={top} width={CW} height={CH} rx="8" fill="#0f172a" opacity="0.94" />
      <text x={left + 14} y={top + 24} fontSize="17" fontWeight="700" fill="#ffffff" className="mono">
        {tag}
      </text>
      <text x={left + 14 + tag.length * 11 + 10} y={top + 24} fontSize="13" fill="#cbd5e1">
        {SOOT_BLOWER_TYPE_NAME[typeOf(tag)]}
      </text>
      <circle cx={left + 19} cy={top + 45} r="5" fill={status === "OK" ? "#22c55e" : status === "WARN" ? "#f59e0b" : "#ef4444"} />
      <text x={left + 30} y={top + 50} fontSize="13" fill="#e2e8f0">
        {STATUS_UI[status].label} · {zoneName(tag)}
      </text>
    </g>
  );
}

function Tile({
  tag,
  x,
  y,
  status,
  scd,
  sccn,
  selected,
  dimmed,
  onClick,
  onHover,
}: {
  tag: string;
  x: number;
  y: number;
  status: Status;
  scd: number;
  sccn: number;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
  onHover: (tag: string) => void;
}) {
  const ui = STATUS_UI[status];
  const cx = W / 2;
  const marks = [scd ? `Đ${scd}` : null, sccn ? `CN${sccn}` : null].filter(Boolean).join(" ");
  return (
    <g
      className="vtb-tile"
      transform={`translate(${x - W / 2},${y - H / 2})`}
      opacity={dimmed ? 0.18 : 1}
      onMouseEnter={() => onHover(tag)}
      onFocus={() => onHover(tag)}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${tag} — ${ui.label}`}
    >
      <title>{`${tag} — ${ui.label}`}</title>
      {selected && <rect className="vtb-sel" x={-5} y={-5} width={W + 10} height={H + 10} rx={8} fill="none" stroke="#1d4ed8" strokeWidth="3" />}
      <rect className="vtb-body" width={W} height={H} rx={4} fill={ui.fill} stroke={ui.stroke} strokeWidth="1.2" />
      <Glyph type={typeOf(tag)} cx={cx} cy={11} color={ui.icon} />
      <text x={cx} y={30} textAnchor="middle" fontSize={tag.length > 4 ? 10 : 12} fontWeight="700" fill={ui.tag} className="mono">
        {tag}
      </text>
      {marks && (
        <text x={cx} y={41} textAnchor="middle" fontSize="9" fontWeight="700" fill={ui.tag} className="mono">
          {marks}
        </text>
      )}
    </g>
  );
}

/* ==================== PANEL: DANH SÁCH ĐANG MỞ ==================== */
type ListFilter = "ALL" | "BAD" | SootBlowerDept;
function OpenList({ board, onPick }: { board: Board; onPick: (tag: string) => void }) {
  const [filter, setFilter] = useState<ListFilter>("ALL");
  const rows = useMemo(() => {
    const tags = new Set([...board.open.keys(), ...board.unavail]);
    return [...tags]
      .map((tag) => ({ tag, open: board.open.get(tag) ?? [], status: statusOf(tag, board), page: pageOf(tag) }))
      .filter((r) => {
        if (filter === "BAD") return r.status === "BAD";
        if (filter === "SCĐ" || filter === "SCCN") return r.open.some((d) => d.dept === filter);
        return true;
      })
      .sort((a, b) => (a.status === b.status ? a.tag.localeCompare(b.tag) : a.status === "BAD" ? -1 : 1));
  }, [board, filter]);

  const FILTERS: [ListFilter, string][] = [
    ["ALL", "Tất cả"],
    ["BAD", "Bất khả dụng"],
    ["SCĐ", "SCĐ"],
    ["SCCN", "SCCN"],
  ];

  return (
    <div className="p-4">
      <div className="text-sm font-bold text-slate-800">Vòi cần xử lý</div>
      <p className="mb-3 text-xs text-slate-500">Chọn một dòng để mở vòi trên sơ đồ.</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(([k, l]) => (
          <button
            type="button"
            key={k}
            onClick={() => setFilter(k)}
            aria-pressed={filter === k}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">Không có vòi nào khớp bộ lọc.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <button
              type="button"
              key={r.tag}
              onClick={() => onPick(r.tag)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:border-blue-400 hover:bg-blue-50/40"
            >
              <div className="flex items-center gap-2">
                <span className="mono font-bold text-slate-900">{r.tag}</span>
                <span className="text-[11px] text-slate-400">{r.page === "left" ? "Vách trái" : "Vách phải"}</span>
                <span className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_UI[r.status].chip}`}>
                  {r.status === "BAD" ? "Bất khả dụng" : "Có khiếm khuyết"}
                </span>
              </div>
              {r.open.map((d) => (
                <div key={d.id} className="mt-1.5 flex gap-1.5 text-xs text-slate-600">
                  <span className={`mono shrink-0 rounded border px-1 text-[10px] font-bold ${DEPT_UI[d.dept]}`}>{d.dept}</span>
                  <span className="line-clamp-2">{d.description}</span>
                </div>
              ))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================== PANEL: CHI TIẾT VÒI ==================== */
function DetailPanel({
  machine,
  tag,
  board,
  canManage,
  onBack,
}: {
  machine: string;
  tag: string;
  board: Board;
  canManage: boolean;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<SootBlowerDept | "LS">("SCĐ");
  const [desc, setDesc] = useState("");
  const [by, setBy] = useState("");
  const setStatus = useSetSootBlowerStatus();
  const addDefect = useAddSootBlowerDefect();
  const resolve = useResolveSootBlowerDefect();

  const status = statusOf(tag, board);
  const isUnavail = board.unavail.has(tag);
  const open = board.open.get(tag) ?? [];
  const list = open.filter((d) => d.dept === tab);
  const hist = board.history.get(tag) ?? [];

  const run = async (p: Promise<unknown>, success: string) => {
    try {
      await p;
      toast.success(success);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cập nhật thất bại");
      return false;
    }
  };

  const changeAvail = (unavailable: boolean) => {
    if (unavailable === isUnavail || setStatus.isPending) return;
    void run(
      setStatus.mutateAsync({ machine, tag, status: unavailable ? "unavailable" : "available" }),
      `Đã chuyển ${tag} sang ${unavailable ? "bất khả dụng" : "khả dụng"}`
    );
  };

  const submit = async () => {
    if (tab === "LS" || !desc.trim()) return;
    const okDone = await run(
      addDefect.mutateAsync({ machine, tag, dept: tab, description: desc.trim(), reportedBy: by.trim() || undefined }),
      `Đã ghi nhận khiếm khuyết ${tab} cho ${tag}`
    );
    if (okDone) {
      setDesc("");
      setBy("");
    }
  };

  const TABS: [SootBlowerDept | "LS", string][] = [
    ["SCĐ", `SCĐ (${open.filter((d) => d.dept === "SCĐ").length})`],
    ["SCCN", `SCCN (${open.filter((d) => d.dept === "SCCN").length})`],
    ["LS", `Lịch sử (${hist.length})`],
  ];

  return (
    <div>
      <div className="border-b border-slate-100 p-4">
        <button type="button" onClick={onBack} className="mb-2 text-xs font-semibold text-slate-500 hover:text-slate-800">
          ← Vòi cần xử lý
        </button>
        <div className="flex items-center gap-2.5">
          <span className="mono text-2xl font-bold text-slate-900">{tag}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_UI[status].chip}`}>{STATUS_UI[status].label}</span>
        </div>
        <div className="mt-0.5 text-xs text-slate-400">
          Tổ máy {machine} · {pageOf(tag) === "left" ? "Vách trái" : "Vách phải"} · {zoneName(tag)} · {SOOT_BLOWER_TYPE_NAME[typeOf(tag)]}
        </div>

        <div className="mb-1.5 mt-4 text-xs font-semibold text-slate-500">Trạng thái vận hành</div>
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-300 text-sm font-semibold">
          <button
            type="button"
            disabled={!canManage || setStatus.isPending}
            onClick={() => changeAvail(false)}
            className={`py-2 disabled:cursor-not-allowed ${!isUnavail ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            Khả dụng
          </button>
          <button
            type="button"
            disabled={!canManage || setStatus.isPending}
            onClick={() => changeAvail(true)}
            className={`py-2 disabled:cursor-not-allowed ${isUnavail ? "bg-red-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            Bất khả dụng
          </button>
        </div>
      </div>

      <div className="flex border-b border-slate-200 px-2">
        {TABS.map(([k, l]) => (
          <button
            type="button"
            key={k}
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === k ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab !== "LS" ? (
          <>
            {canManage ? (
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-1.5 text-xs font-semibold text-slate-500">Ghi nhận khiếm khuyết {SOOT_BLOWER_DEPT_LABEL[tab]}</div>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Mô tả hiện tượng, vị trí hư hỏng…"
                  aria-label="Mô tả khiếm khuyết"
                  className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <input
                  value={by}
                  onChange={(e) => setBy(e.target.value)}
                  placeholder="Người ghi nhận / Ca (bỏ trống = tên bạn)"
                  aria-label="Người ghi nhận / Ca"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={!desc.trim() || addDefect.isPending}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  {addDefect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Ghi nhận khiếm khuyết
                </button>
              </div>
            ) : (
              <p className="mb-4 rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">
                Bạn chỉ có quyền xem. Cần quyền quản lý dữ liệu vòi đốt để ghi nhận khiếm khuyết.
              </p>
            )}
            {list.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400">Không có khiếm khuyết {tab} đang mở.</div>
            ) : (
              list.map((d) => (
                <div key={d.id} className="mb-2 rounded-lg border border-l-4 border-slate-200 border-l-amber-400 p-3">
                  <div className="whitespace-pre-wrap text-sm text-slate-800">{d.description}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="mono text-[11px] text-slate-400">
                      {fmtDate(d.createdAt)} · {d.reportedBy ?? "—"}
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        disabled={resolve.isPending}
                        onClick={() => void run(resolve.mutateAsync({ machine, id: d.id }), `Đã đóng khiếm khuyết ${d.dept} của ${tag}`)}
                        className="ml-auto rounded-md border border-emerald-300 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                      >
                        Đã xử lý
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        ) : hist.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">Chưa có lịch sử sửa chữa.</div>
        ) : (
          <ol className="relative ml-2 border-l-2 border-slate-200">
            {hist.map((d) => (
              <li key={d.id} className="mb-4 ml-4">
                <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                <div className="flex items-center gap-1.5">
                  <span className={`mono rounded border px-1 text-[10px] font-bold ${DEPT_UI[d.dept]}`}>{d.dept}</span>
                  <span className="mono text-[11px] text-slate-400">
                    {fmtDate(d.createdAt)} → {fmtDate(d.resolvedAt)}
                  </span>
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{d.description}</div>
                <div className="text-[11px] text-slate-400">
                  Ghi nhận: {d.reportedBy ?? "—"}
                  {d.resolvedBy ? ` · Đóng: ${d.resolvedBy}` : ""}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
