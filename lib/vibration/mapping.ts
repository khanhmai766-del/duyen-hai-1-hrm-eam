import type { PrismaClient } from "@prisma/client";
import { unitOfArea } from "./classify";
import { foldVn } from "./parse";

/** Ánh xạ tự động thiết bị đo độ rung → nút cây thiết bị (EquipmentNode). Ưu tiên bỏ trống hơn gán sai. */

export const AUTO_THRESHOLD = 0.8; // điểm tối thiểu để đánh dấu "auto"
/** Khu vực/hệ thống của thiết bị đo phải có từ chung với các thư mục cha của nút (chống nhầm hệ thống khác cùng tên bơm). */
export const SYS_MIN = 0.25;
export const AUTO_MARGIN = 0.06; // phải hơn ứng viên thứ hai ít nhất chừng này (trừ khi tên trùng hẳn)

export type Unit = "S1" | "S2" | null;
export interface NodeLite { seq: string; name: string; parentSeq: string | null }
export interface MatchInput { id: string; area: string; system: string; name: string }
export interface Suggestion { seq: string; name: string; score: number; exact?: boolean }
export interface MatchResult { deviceId: string; unit: Unit; best: Suggestion | null; top: Suggestion[]; auto: boolean }

const STOP = new Set(["cua", "he", "thong", "va", "cho", "tren", "khu", "vuc", "phia", "tu", "mot", "hai"]);
const WEAK = new Set(["dong", "co"]);
/** Chỉ xét nút là máy quay (bơm/quạt/động cơ/máy…); bỏ van, đồng hồ, điểm đo nhiệt/áp, thư mục "Hệ thống …". */
const ROTATING_RE = /^(bom|quat|dong co|may|motor|mill|hop giam toc|bo giam toc|truc|cum bom|cum quat)( |$)/;
const isCode = (t: string) => /^\d+[a-z]?$/.test(t) || /^[a-z]\d*$/.test(t) || /^\d+[a-z]\d*$/.test(t);

/** Tách token không dấu; "số 3"/"#3" → "3"; "1 A" → thêm token ghép "1a". */
export function tokenize(text: string): string[] {
  const raw = foldVn(text)
    .replace(/\bso\s+(\d+)/g, "$1")
    .replace(/#\s*(\d+)/g, " $1 ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (STOP.has(t)) continue;
    out.push(t);
    const next = raw[i + 1];
    if (/^\d+$/.test(t) && next && /^[a-z]$/.test(next)) out.push(t + next);
  }
  return [...new Set(out)];
}

const weight = (t: string) => (isCode(t) ? 3 : WEAK.has(t) ? 0.3 : 1);
const sum = (tokens: Iterable<string>) => { let s = 0; for (const t of tokens) s += weight(t); return s; };

/** Tổ máy suy từ tên khu vực → hệ thống → tên (S1/S2 hoặc mã 1A…/2B… trong tên). null = dùng chung/không rõ. */
export function inferUnit(d: MatchInput): Unit {
  const fromArea = unitOfArea(d.area);
  if (fromArea) return fromArea;
  const text = `${d.system} ${d.name}`;
  const hits = new Set<string>();
  for (const m of text.matchAll(/\bS([12])\b/gi)) hits.add(m[1]);
  if (!hits.size) for (const m of text.matchAll(/(?:^|[^0-9A-Za-z])([12])\s?[A-Fa-f](?![0-9A-Za-z])/g)) hits.add(m[1]);
  return hits.size === 1 ? (`S${[...hits][0]}` as "S1" | "S2") : null;
}

export interface NodeIndex {
  nodes: NodeLite[];
  tokens: Set<string>[];
  context: Set<string>[];
  inverted: Map<string, number[]>;
}

export function buildNodeIndex(nodes: NodeLite[]): NodeIndex {
  const bySeq = new Map(nodes.map((n) => [n.seq, n]));
  const tokens = nodes.map((n) => new Set(tokenize(n.name)));
  const context = nodes.map((n) => {
    const set = new Set<string>();
    let p = n.parentSeq ? bySeq.get(n.parentSeq) : undefined;
    for (let i = 0; i < 4 && p; i++) {
      for (const t of tokenize(p.name)) set.add(t);
      p = p.parentSeq ? bySeq.get(p.parentSeq) : undefined;
    }
    return set;
  });
  const inverted = new Map<string, number[]>();
  tokens.forEach((set, i) => {
    if (!ROTATING_RE.test(foldVn(nodes[i].name).trim())) return;
    for (const t of set) if (!WEAK.has(t) && !isCode(t)) (inverted.get(t) ?? inverted.set(t, []).get(t)!).push(i);
  });
  return { nodes, tokens, context, inverted };
}

export function matchDevice(index: NodeIndex, d: MatchInput): MatchResult {
  const unit = inferUnit(d);
  const prefix = unit ? `DH1.${unit}.` : null;
  const v = tokenize(d.name);
  const vCodes = v.filter(isCode);
  const vTotal = sum(v);
  const sys = tokenize(`${d.system} ${d.area.replace(/\bS[12]\b/gi, "")}`).filter((t) => !isCode(t));
  const sysTotal = sum(sys);

  const strongV = v.filter((t) => !WEAK.has(t));
  const candidates = new Set<number>();
  for (const t of v) for (const i of index.inverted.get(t) ?? []) candidates.add(i);

  const scored: Suggestion[] = [];
  for (const i of candidates) {
    const node = index.nodes[i];
    if (prefix && !node.seq.startsWith(prefix)) continue;
    const n = index.tokens[i];
    let matched = 0;
    for (const t of v) if (n.has(t)) matched += weight(t);
    if (!matched) continue;
    const cov = matched / vTotal;
    const prec = matched / sum(n);
    let nameScore = 0.75 * cov + 0.25 * prec;
    // Mã máy (1A, #1, số 3…) trong tên thiết bị đo phải có đủ trong tên nút, nếu không thì rất có thể là máy khác.
    if (vCodes.some((c) => !n.has(c))) nameScore *= 0.45;
    // Nút có mã máy mà thiết bị đo không có (vd "1A" so với tên không mã) cũng bị trừ nhẹ.
    if (!vCodes.length && [...n].some(isCode)) nameScore *= 0.8;
    const ctx = index.context[i];
    let sysScore = 0.5;
    if (sysTotal > 0) {
      let m = 0;
      for (const t of sys) if (ctx.has(t) || n.has(t)) m += weight(t);
      sysScore = m / sysTotal;
    }
    const score = 0.85 * nameScore + 0.15 * sysScore;
    // Khớp "gần như chính xác": mọi từ chính của thiết bị đo có trong tên nút và tên nút không thừa từ chính nào.
    const strongN = [...n].filter((t) => !WEAK.has(t));
    const exact = strongV.every((t) => n.has(t)) && strongN.filter((t) => !v.includes(t)).length <= (strongN.length > 3 ? 1 : 0);
    scored.push({ seq: node.seq, name: node.name, score: Math.round(score * 1000) / 1000, exact: exact && (sysTotal === 0 || sysScore >= SYS_MIN) });
  }
  scored.sort((a, b) => b.score - a.score || a.seq.localeCompare(b.seq));
  const top = scored.slice(0, 3);
  const best = top[0] ?? null;
  const second = top[1]?.score ?? 0;
  const auto = !!best && !!best.exact && best.score >= AUTO_THRESHOLD && (best.score - second >= AUTO_MARGIN || best.score >= 0.97);
  return { deviceId: d.id, unit, best, top, auto };
}

export function suggestionNote(top: Suggestion[]) {
  return top.length ? "Gợi ý: " + top.map((s, i) => `${i + 1}) ${s.name} (${s.seq}) ${s.score.toFixed(2)}`).join("; ") : "Chưa có gợi ý";
}

export interface AutoMapStats {
  considered: number;
  auto: number;
  none: number;
  skippedConfirmed: number;
  samples: { device: string; area: string; node: string | null; seq: string | null; score: number | null; status: string }[];
}

/** Chạy ánh xạ cho mọi thiết bị đang hoạt động CHƯA xác nhận. dryRun=true: không ghi DB. */
export async function runAutoMapping(prisma: PrismaClient, opts: { dryRun?: boolean } = {}): Promise<AutoMapStats> {
  const [nodes, devices] = await Promise.all([
    prisma.equipmentNode.findMany({ select: { seq: true, name: true, parentSeq: true } }),
    prisma.vibrationDevice.findMany({ where: { active: true } }),
  ]);
  const index = buildNodeIndex(nodes);
  const stats: AutoMapStats = { considered: 0, auto: 0, none: 0, skippedConfirmed: 0, samples: [] };
  const updates = [];
  for (const d of devices) {
    if (d.mapStatus === "confirmed") { stats.skippedConfirmed++; continue; }
    stats.considered++;
    const r = matchDevice(index, d);
    const status = r.auto ? "auto" : "none";
    if (r.auto) stats.auto++; else stats.none++;
    stats.samples.push({ device: d.name, area: d.area, node: r.best?.name ?? null, seq: r.best?.seq ?? null, score: r.best?.score ?? null, status });
    updates.push(
      prisma.vibrationDevice.update({
        where: { id: d.id },
        data: {
          equipmentSeq: r.auto ? r.best!.seq : null,
          mapStatus: status,
          mapScore: r.best?.score ?? null,
          suggestSeq: r.auto ? null : r.best?.seq ?? null,
          suggestScore: r.auto ? null : r.best?.score ?? null,
          mapNote: r.auto ? `Tự động ${r.best!.score.toFixed(2)}. ${suggestionNote(r.top.slice(1))}` : suggestionNote(r.top),
        },
      })
    );
  }
  if (!opts.dryRun) for (let i = 0; i < updates.length; i += 200) await prisma.$transaction(updates.slice(i, i + 200));
  return stats;
}
