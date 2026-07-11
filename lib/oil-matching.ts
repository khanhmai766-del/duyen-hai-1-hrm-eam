// =====================================================================
// ENGINE GOM NHÓM DẦU — lib/oil-matching.ts
// Thuần logic, không phụ thuộc Prisma — dễ viết unit test.
// =====================================================================

export interface MaterialLike {
  id: string;
  erpCode: string; // "1.31.53.018.SIN.00.000"
  name: string; // "Dầu Shell Turbo T32"
}

export interface OilTypeLike {
  id: string;
  code: string;
  name: string;
  members: MaterialLike[]; // các mã đã CONFIRMED thuộc nhóm này
}

export interface MatchSuggestion {
  oilTypeId: string;
  score: number; // 0..1
  reason: string; // giải thích hiển thị cho người duyệt
}

/* ---------------- Chuẩn hóa chuỗi ---------------- */

// Bỏ dấu tiếng Việt (NFD không tách được đ/Đ nên xử lý riêng)
export function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

// Từ thương hiệu / từ đệm không mang thông tin phân loại
const NOISE_WORDS = new Set([
  "DAU", "OIL", "NHOT", "LOAI", "HANG",
  "SHELL", "CALTEX", "CASTROL", "TOTAL", "MOBIL", "BP",
  "PETROLIMEX", "PLC", "VALVOLINE", "CHEVRON", "FUCHS", "SINOPEC",
]);

export function normalizeOilName(name: string): string {
  return stripDiacritics(name)
    .toUpperCase()
    .replace(/[^A-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE_WORDS.has(w))
    .join(" ")
    .trim();
}
// "Dầu Turbo T32"       → "TURBO T32"
// "Dầu Shell Turbo T32" → "TURBO T32"   ⇒ trùng nhau

/* ---------------- Phân tích mã ERP ---------------- */

const ORIGIN_CODES = new Set(["SIN", "HKG", "THA", "VNM", "CHN", "JPN", "KOR", "USA", "GER", "IND", "MYS"]);

export interface ParsedErpCode {
  itemPrefix: string; // "1.31.53.018" — phần định danh vật tư
  origin: string | null; // "SIN" | "HKG" | ...
}

export function parseErpCode(erpCode: string): ParsedErpCode {
  const segs = erpCode.split(".").map((s) => s.trim()).filter(Boolean);
  const originIdx = segs.findIndex((s) => ORIGIN_CODES.has(s.toUpperCase()));
  if (originIdx > 0) {
    return { itemPrefix: segs.slice(0, originIdx).join("."), origin: segs[originIdx].toUpperCase() };
  }
  // không nhận diện được xuất xứ → bỏ các segment "00"/"000" ở đuôi
  let end = segs.length;
  while (end > 1 && /^0+$/.test(segs[end - 1])) end--;
  return { itemPrefix: segs.slice(0, end).join("."), origin: null };
}

/* ---------------- Trích token cấp dầu ---------------- */

// T32, VG46, ISO VG 68, 15W40, L-TSA 32, NLGI 2...
const VISCOSITY_PATTERNS: RegExp[] = [
  /\b(\d{1,2}W-?\d{2})\b/, // 15W40, 5W-30
  /\bISO\s*VG\s*(\d{2,4})\b/, // ISO VG 68
  /\bVG\s*-?(\d{2,4})\b/, // VG46
  /\bL-?TSA\s*-?(\d{2,3})\b/, // L-TSA 32
  /\bNLGI\s*-?(\d)\b/, // NLGI 2 (mỡ)
  /\bT\s*-?(\d{2,3})\b/, // T32, T46
  /\b(\d{2,3})\b/, // số trần cuối cùng: 68, 100
];

export function extractGradeToken(normName: string): string | null {
  for (const re of VISCOSITY_PATTERNS) {
    const m = normName.match(re);
    if (m) return m[0].replace(/\s+/g, "");
  }
  return null;
}

/* ---------------- Độ tương đồng chuỗi (Dice bigram) ---------------- */

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/\s+/g, " ");
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

export function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ba = bigrams(a), bb = bigrams(b);
  let overlap = 0;
  for (const [g, ca] of ba) overlap += Math.min(ca, bb.get(g) ?? 0);
  const total = [...ba.values()].reduce((x, y) => x + y, 0) + [...bb.values()].reduce((x, y) => x + y, 0);
  return total === 0 ? 0 : (2 * overlap) / total;
}

/* ---------------- Chấm điểm gợi ý ---------------- */

export const SUGGEST_THRESHOLD = 0.6; // dưới ngưỡng này → giữ UNMAPPED

export function suggestOilType(material: MaterialLike, oilTypes: OilTypeLike[]): MatchSuggestion | null {
  const parsed = parseErpCode(material.erpCode);
  const normName = normalizeOilName(material.name);
  const grade = extractGradeToken(normName);

  const candidates: MatchSuggestion[] = [];
  const consider = (s: MatchSuggestion) => {
    candidates.push(s);
  };

  for (const ot of oilTypes) {
    const otNorm = normalizeOilName(ot.name);
    const otGrade = extractGradeToken(otNorm) ?? extractGradeToken(normalizeOilName(ot.code));

    for (const mem of ot.members) {
      const memParsed = parseErpCode(mem.erpCode);
      const memNorm = normalizeOilName(mem.name);

      // R1 — trùng mã gốc, chỉ khác xuất xứ: gần như chắc chắn
      if (parsed.itemPrefix && parsed.itemPrefix === memParsed.itemPrefix) {
        consider({
          oilTypeId: ot.id,
          score: 0.95,
          reason: `Trùng mã gốc ${parsed.itemPrefix} với ${mem.erpCode} (khác xuất xứ)`,
        });
        continue;
      }

      // R2 — tên chuẩn hóa trùng khớp hoàn toàn
      if (normName && normName === memNorm) {
        consider({
          oilTypeId: ot.id,
          score: 0.9,
          reason: `Tên chuẩn hóa trùng khớp "${normName}" với ${mem.erpCode}`,
        });
        continue;
      }

      // R3 — cùng token cấp dầu + tên tương đồng
      const sim = diceSimilarity(normName, memNorm);
      const memGrade = extractGradeToken(memNorm);
      if (grade && memGrade && grade === memGrade && sim >= 0.6) {
        consider({
          oilTypeId: ot.id,
          score: 0.75,
          reason: `Cùng cấp ${grade}, tên tương đồng ${(sim * 100).toFixed(0)}% với "${mem.name}"`,
        });
        continue;
      }

      // R4 — tên rất giống nhưng thiếu token rõ ràng
      if (sim >= 0.85) {
        consider({
          oilTypeId: ot.id,
          score: 0.7,
          reason: `Tên tương đồng ${(sim * 100).toFixed(0)}% với "${mem.name}"`,
        });
      }
    }

    // R5 — nhóm chưa có thành viên: so trực tiếp với tên/mã nhóm
    if (ot.members.length === 0) {
      if (normName === otNorm || (grade && otGrade && grade === otGrade)) {
        consider({
          oilTypeId: ot.id,
          score: 0.65,
          reason: `Khớp với tên/cấp của loại dầu "${ot.name}"`,
        });
      }
    }
  }

  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
  return best.score >= SUGGEST_THRESHOLD ? best : null;
}

/* ---------------- Gợi ý tạo nhóm mới từ các mã mồ côi ---------------- */
// Các mã UNMAPPED không khớp nhóm nào, nhưng giống NHAU → gợi ý tạo OilType mới.

export interface NewGroupProposal {
  suggestedCode: string; // token cấp dầu, vd "T46"
  suggestedName: string; // tên chuẩn hóa dài nhất trong cụm
  materialIds: string[];
}

export function proposeNewGroups(unmapped: MaterialLike[]): NewGroupProposal[] {
  const clusters = new Map<string, MaterialLike[]>();
  for (const m of unmapped) {
    const norm = normalizeOilName(m.name);
    const key = extractGradeToken(norm) ? `${extractGradeToken(norm)}|${norm}` : norm;
    if (!key) continue;
    // gộp cluster theo tên chuẩn hóa trùng hoặc rất giống
    let placed = false;
    for (const [k, arr] of clusters) {
      if (k === key || diceSimilarity(k.split("|").pop()!, norm) >= 0.85) {
        arr.push(m);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.set(key, [m]);
  }

  const out: NewGroupProposal[] = [];
  for (const [key, arr] of clusters) {
    if (arr.length < 2) continue; // chỉ gợi ý khi có >= 2 mã giống nhau
    const norms = arr.map((m) => normalizeOilName(m.name));
    const longest = norms.reduce((a, b) => (b.length > a.length ? b : a), "");
    out.push({
      suggestedCode: extractGradeToken(longest) ?? key.split("|")[0],
      suggestedName: longest,
      materialIds: arr.map((m) => m.id),
    });
  }
  return out;
}
