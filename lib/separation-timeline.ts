/**
 * Bóc tách "Tiến trình tách lưới" / "Tiến trình khởi động" từ văn bản tự do
 * thành danh sách mốc thời gian có cấu trúc.
 *
 * Nguyên tắc: KHÔNG bịa dữ liệu. Dòng nào máy không chắc thì gắn cờ `needsReview`
 * kèm lý do để người dùng xác nhận trên giao diện, thay vì âm thầm đoán bừa.
 * Văn bản gốc luôn được giữ nguyên ở `DigitalDocument.progress`.
 */

export type TimelineSection = "boiler" | "turbine" | "elec";

export const TIMELINE_SECTIONS: Record<TimelineSection, string> = {
  boiler: "Lò hơi",
  turbine: "Tuabin",
  elec: "Điện",
};

export const TIMELINE_SECTION_ORDER: TimelineSection[] = ["boiler", "turbine", "elec"];

export type TimelineMeasurement = {
  caption: string;
  rows: Array<{ label: string; cells: Array<{ key: string; value: string }> }>;
};

export type TimelineEvent = {
  seq: number;
  section: TimelineSection | null;
  sectionConfidence: number;
  sectionGuess: TimelineSection | null;
  /** ISO 8601 giờ địa phương, không hậu tố timezone. */
  occurredAt: string;
  timeText: string;
  dateText: string;
  /** Nhật ký không ghi ngày ở đâu cả — người dùng phải điền một lần. */
  missingDate: boolean;
  actor: string | null;
  content: string;
  subItems: string[];
  measurements: TimelineMeasurement[];
  values: string[];
  chip: TimelineChip | null;
  isKey: boolean;
  needsReview: boolean;
  possibleDuplicate?: number;
  raw: string;
};

export type TimelineParseResult = {
  events: TimelineEvent[];
  orphans: Array<{ line: string; reason: string }>;
  stats: {
    total: number;
    bySection: Record<TimelineSection | "unknown", number>;
    needsReview: number;
    orphanLines: number;
    duplicates: number;
    days: number;
    measurements: number;
  };
};

/* ------------------------------------------------------------------ *
 * 1. Từ điển                                                          *
 * ------------------------------------------------------------------ */

// Tiêu đề phần — nhật ký cũ ghi "PHẦN MÁY", bản mới ghi "PHẦN ĐIỆN".
const SECTION_HEADERS: Array<{ re: RegExp; section: TimelineSection | null }> = [
  { re: /^\s*PH[ẦA]N\s+L[ÒO]\s*H[ƠO]I\s*:?\s*$/iu, section: "boiler" },
  { re: /^\s*PH[ẦA]N\s+M[ÁA]Y\s*:?\s*$/iu, section: "turbine" },
  { re: /^\s*PH[ẦA]N\s+(TUABIN|TU[ỐO]C\s*BIN|TURBINE)\s*:?\s*$/iu, section: "turbine" },
  { re: /^\s*PH[ẦA]N\s+[ĐD]I[ỆE]N\s*:?\s*$/iu, section: "elec" },
  // Không phải tiêu đề phần, chỉ là mốc chuyển ngữ cảnh — giữ nguyên phần hiện tại.
  { re: /^\s*QU[ÁA]\s+TR[ÌI]NH\s+X[ỬU]\s*L[ÝY]\s*:?\s*$/iu, section: null },
];

// Cương vị thực hiện. Xếp cụm dài trước để khớp ưu tiên.
const ACTORS = [
  "VHV Trực chính điện", "VHV Trực phụ điện", "VHV Máy trưởng", "VHV Máy phó",
  "VHV Lò trưởng", "VHV Lò phó", "VHV Máy nghiền", "VHV Thải xỉ", "VHV TBTH",
  "Trưởng ca", "Trợ thủ", "Nhóm công tác", "PX.SCĐTĐ", "PX.SCCN", "SCĐTĐ", "SCCN",
];

// Từ khoá phân loại phần khi thiếu tiêu đề. Trọng số cao = tín hiệu mạnh.
const KEYWORDS: Record<TimelineSection, Array<[RegExp, number]>> = {
  boiler: [
    [/\bbao h[ơo]i\b/iu, 3], [/\bl[òo] h[ơo]i\b/iu, 3], [/\bMFT\b/u, 3],
    [/\bAPH\b/u, 3], [/\bFGD\b/u, 2], [/\bPCV\b/u, 2], [/\bdamper\b/iu, 2],
    [/\bkh[óo]i\s*[–\-]?\s*gi[óo]\b/iu, 2], [/\bqu[áa] nhi[ệe]t\b/iu, 2],
    [/\bt[áa]i nhi[ệe]t\b/iu, 2], [/\bv[òo]i d[ầa]u\b/iu, 2], [/\bNH3\b/u, 2],
    [/\bx[ảa] [đd][ịi]nh k[ỳy]\b/iu, 2], [/\bthuy[ềe]n x[ỉi]\b/iu, 2],
    [/\bth[ôo]ng th[ổo]i l[òo]\b/iu, 3], [/\b[ủu] l[òo]\b/iu, 2], [/\bnghe l[òo]\b/iu, 2],
    [/\bm[áa]y nghi[ềe]n\b/iu, 1], [/\bb[ơo]m c[ấa]p [đd]i[ệe]n\b/iu, 1],
    // Bổ sung sau khi chạy thử trên toàn bộ nhật ký thật: nhật ký "tách lưới có
    // kế hoạch" là danh sách phẳng, không có tiêu đề PHẦN nào, nên phải dựa hẳn
    // vào từ khoá. Các thao tác dưới đây đều thuộc phía lò.
    [/\bSCR\b/u, 3], [/\bkh[ửu] NOx\b/iu, 3], [/\bth[ổo]i b[ụu]i\b/iu, 3],
    [/\bmill\b/iu, 3], [/\bm[áa]y c[ấa]p\b/iu, 2], [/\bb[ăa]ng t[ảa]i\b/iu, 2],
    [/\bqu[ạa]t kh[óo]i\b/iu, 3], [/\bIDF\b|\bFDF\b|\bPAF\b/u, 3],
    [/\bgi[óo] c[ấa]p\b/iu, 2], [/\bESP\b/u, 2], [/\bth[ảa]i x[ỉi]\b/iu, 2],
    [/\bkh[óo]i\s*\/\s*gi[óo]\b/iu, 2], [/\bl[ửu]a\b/iu, 2], [/\bthan\b/iu, 1],
  ],
  turbine: [
    [/\btuabin\b|\bturbine\b|\btu[ốo]c\s*bin\b/iu, 3], [/\bb[ìi]nh ng[ưu]ng\b/iu, 3],
    [/\bch[âa]n kh[ôo]ng\b/iu, 3], [/\bBFPT\b/u, 3], [/\bAOP\b|\bMSP\b|\bJOP\b/u, 3],
    [/\bMSV\b|\bRSV\b|\bICV\b/u, 3], [/\bd[ầa]u b[ôo]i tr[ơo]n\b/iu, 2],
    [/\bn[ưu][ớo]c tu[ầa]n ho[àa]n\b/iu, 2], [/\btr[ởo] tr[ụu]c\b/iu, 3],
    [/\bh[ơo]i ch[èe]n\b/iu, 2], [/\bc[ửu]a tr[íi]ch\b/iu, 2], [/\bPGO\b/u, 2],
    [/\bb[ơo]m ch[âa]n kh[ôo]ng\b/iu, 2], [/\bkh[íi] H2\b/u, 2],
    [/\bph[áa] ch[âa]n kh[ôo]ng\b/iu, 2], [/\bBDV\b/u, 2],
  ],
  elec: [
    [/\bc[áa]ch [đd]i[ệe]n\b/iu, 4], [/\bELEC\s*FAULT\b/iu, 4], [/\bRatio\s*Dif\b/iu, 4],
    [/\bOver[\s-]?curr\b/iu, 4], [/\bPCT\s*[đd]i[ệe]n\b/iu, 4], [/\bStator\b/iu, 4],
    [/\bl[ỗo]i [đd]i[ệe]n\b/iu, 3], [/\bm[áa]y c[ắa]t\b/iu, 3], [/\bMC\b(?!\w)/u, 2],
    [/\bb[ảa]o v[ệe] so l[ệe]ch\b/iu, 4], [/\bqu[áa] d[òo]ng\b/iu, 3],
    [/MΩ|GΩ|mΩ/u, 3], [/\bR15\b|\bR60\b/u, 4],
    [/\b[đd]i[ệe]n tr[ởo] 1 chi[ềe]u\b/iu, 4], [/\bcu[ộo]n d[âa]y\b/iu, 3],
    [/\bh[ộo]p [đd][ấa]u n[ốo]i\b/iu, 3], [/\b[đd][èe]n s[ấa]y\b/iu, 3],
    [/\b[đd][ộo]ng c[ơo]\b/iu, 1], [/\bTr[ựu]c ch[íi]nh [đd]i[ệe]n\b/iu, 4],
  ],
};

// Mốc quan trọng — hiển thị nổi bật trên dòng thời gian.
const KEY_PATTERNS = [
  /\bTrip\b/iu, /\bMFT t[áa]c [đd][ộo]ng\b/iu, /\bs[ựu] c[ốo]\b/iu,
  /\bELEC\s*FAULT\b/iu, /\bb[ảa]o v[ệe] .{0,30}t[áa]c [đd][ộo]ng\b/iu,
  /\bng[ừu]ng m[áa]y\b/iu, /\bt[áa]ch l[ưu][ớo]i\b/iu, /\bh[òo]a l[ưu][ớo]i\b/iu,
];

export type TimelineChip = "pct" | "trip" | "cmd" | "ok";

const CHIP_RULES: Array<[RegExp, TimelineChip]> = [
  [/\bPCT\b|\bphi[ếe]u c[ôo]ng t[áa]c\b/iu, "pct"],
  [/\bTrip\b/iu, "trip"],
  [/\bl[ệe]nh\b|\bnh[ậa]n l[ệe]nh\b/iu, "cmd"],
  [/\bki[ểe]m tra\b|\bki[ểe]m nh[ậa]n\b|\bb[ìi]nh th[ưu][ờo]ng\b/iu, "ok"],
];

export const CHIP_LABELS: Record<TimelineChip, string> = {
  pct: "PCT",
  trip: "Trip",
  cmd: "Lệnh",
  ok: "Kiểm tra",
};

/* ------------------------------------------------------------------ *
 * 2. Biểu thức bắt thời gian                                          *
 * ------------------------------------------------------------------ */

// Giờ: 09h07'16" | 09h04’15’’ | 09h07' | 09h07 | 09:16 | 8h30
// Word tự đổi dấu nháy thẳng thành dấu nháy cong, và giây hay được ghi bằng HAI
// dấu nháy đơn (’’) thay vì một dấu nháy kép. Chỉ nhận ASCII thì mất trắng cả
// phần Máy của nhật ký 07/07/2026 — 15 mốc chỉ còn 1.
const QUOTE = String.raw`['’‘´′]`;
const DQUOTE = String.raw`(?:['’‘"”″]{1,2})`;
const HH = String.raw`(\d{1,2})\s*[h:]\s*(\d{1,2})\s*(?:${QUOTE}{1,2}\s*(\d{1,2})\s*${DQUOTE})?\s*${QUOTE}?`;
// Ngày: 07/07/2026 | 8/7/2026 | 07-07-2026
const DD = String.raw`(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?:\s*[\/\-.]\s*(\d{2,4}))?`;

const TIME_PATTERNS: Array<{ re: RegExp; order: "dt" | "td" | "t" }> = [
  // "- 07/07/2026 09:16 Ngừng hệ thống..."  → ngày trước, giờ sau
  { re: new RegExp(String.raw`^\s*[-–—•*]?\s*${DD}\s+${HH}\s*[:\-–]?\s*`, "u"), order: "dt" },
  // "Vào lúc 09h04'15" ngày 07/07/2026: ..." → giờ trước, ngày sau
  { re: new RegExp(String.raw`^\s*[-–—•*]?\s*(?:v[àa]o\s+)?l[úu]c\s*[:,]?\s*${HH}\s*[,;]?\s*(?:ng[àa]y)?\s*${DD}\s*[:\-–,]?\s*`, "iu"), order: "td" },
  // "09h07'16" ngày 07/07/2026 ..." (không có chữ "lúc")
  { re: new RegExp(String.raw`^\s*[-–—•*]?\s*${HH}\s*[,;]?\s*(?:ng[àa]y)?\s*${DD}\s*[:\-–,]?\s*`, "u"), order: "td" },
  // Chỉ có giờ, kế thừa ngày của mốc trước: "- 09:33 Đóng van PCV nhánh B"
  { re: new RegExp(String.raw`^\s*[-–—•*]?\s*(?:v[àa]o\s+)?(?:l[úu]c)?\s*[:,]?\s*${HH}\s*[:\-–]?\s+`, "iu"), order: "t" },
];

/* ------------------------------------------------------------------ *
 * 3. Tiện ích                                                         *
 * ------------------------------------------------------------------ */

const BULLET_SUB = /^\s*(?:[-]|[▪▫◦‣·]|\+|o\s)\s*/u;
const BULLET_MAIN = /^\s*[-–—•*]\s*/u;

// Dòng CHỈ có ngày, đứng riêng làm tiêu đề: "18/02/2025" hoặc "14/06/2025:".
// Nhật ký thật dùng kiểu này rất nhiều, rồi các dòng dưới chỉ ghi giờ. Không nhận
// ra thì mọi dòng chỉ-có-giờ đều thiếu mốc ngày và bị bỏ sót toàn bộ.
const DATE_ONLY_LINE = /^\s*[-–—•*]?\s*(?:ng[àa]y\s*)?(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})\s*[:.]?\s*$/iu;

function normalize(text: string): string[] {
  return String(text)
    // Văn bản trong DB chứa LITERAL "\n" (hai ký tự \ và n) do từng bị escape khi
    // dán vào. Không tách ra thì cả nhật ký thành một dòng và parser chỉ bắt được
    // mốc đầu tiên — bản 07/07/2026 ra 23 mốc thay vì 42.
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i, a) => l !== "" || (a[i - 1] || "") !== "");
}

const pad = (n: number) => String(n).padStart(2, "0");

type DateParts = { d: number; mo: number; y: number };

/** Bắt mốc thời gian ở đầu dòng. */
function extractTime(line: string, prevDate: DateParts | null, defaultYear: number) {
  for (const { re, order } of TIME_PATTERNS) {
    const m = line.match(re);
    if (!m) continue;

    let h: number, mi: number, s: number, d: number, mo: number, y: number | undefined;
    if (order === "dt") {
      d = +m[1]; mo = +m[2]; y = m[3] ? +m[3] : undefined; h = +m[4]; mi = +m[5]; s = m[6] ? +m[6] : 0;
    } else if (order === "td") {
      h = +m[1]; mi = +m[2]; s = m[3] ? +m[3] : 0; d = +m[4]; mo = +m[5]; y = m[6] ? +m[6] : undefined;
    } else {
      h = +m[1]; mi = +m[2]; s = m[3] ? +m[3] : 0;
      if (prevDate) {
        d = prevDate.d; mo = prevDate.mo; y = prevDate.y;
      } else {
        // Nhật ký chỉ liệt kê giờ, không ghi ngày ở đâu cả. KHÔNG bịa ngày —
        // vẫn giữ mốc lại và để trống ngày, gắn cờ cho người dùng điền một lần.
        // Bỏ hẳn dòng như trước thì mất trắng nội dung, tệ hơn nhiều.
        d = 0; mo = 0; y = undefined;
      }
    }
    const missingDate = d === 0;

    if (h > 23 || mi > 59 || s > 59) continue;
    if (!missingDate && (d < 1 || d > 31 || mo < 1 || mo > 12)) continue;

    const rest = line.slice(m[0].length).trim();
    if (!rest) continue; // dòng chỉ có giờ, không có nội dung

    const year = y == null ? (prevDate?.y ?? defaultYear) : y < 100 ? 2000 + y : y;
    return {
      rest,
      missingDate,
      date: { d, mo, y: year } as DateParts,
      timeText: s ? `${pad(h)}:${pad(mi)}'${pad(s)}"` : `${pad(h)}:${pad(mi)}`,
      // Thiếu ngày thì để rỗng thay vì chế ra một ngày giả để sắp xếp.
      occurredAt: missingDate ? "" : `${year}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}`,
    };
  }
  return null;
}

/** Tách cương vị đứng đầu nội dung. */
function extractActor(text: string): { actor: string | null; content: string } {
  for (const a of ACTORS) {
    const re = new RegExp("^" + a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b\\s*[:\\-–]?\\s*", "iu");
    if (re.test(text)) return { actor: a, content: text.replace(re, "").trim() || text };
  }
  return { actor: null, content: text };
}

/** Chấm điểm để đoán phần khi thiếu tiêu đề. */
function scoreSection(text: string) {
  const score: Record<TimelineSection, number> = { boiler: 0, turbine: 0, elec: 0 };
  for (const sec of TIMELINE_SECTION_ORDER) {
    for (const [re, w] of KEYWORDS[sec]) if (re.test(text)) score[sec] += w;
  }
  const ranked = TIMELINE_SECTION_ORDER.map((s) => [s, score[s]] as const).sort((a, b) => b[1] - a[1]);
  const [top, topScore] = ranked[0];
  const [, secondScore] = ranked[1];
  if (topScore === 0) return { section: null as TimelineSection | null, confidence: 0, score };
  // Khoảng cách với á quân càng lớn thì càng chắc.
  return { section: top, confidence: Math.min(1, (topScore - secondScore + 1) / 5), score };
}

/** Bóc bảng đo cách điện: "Xanh + Đỏ (R15: 188MΩ, R60: 244 MΩ); ..." */
export function extractMeasurements(text: string): TimelineMeasurement[] {
  const out: TimelineMeasurement[] = [];
  const blocks = text.split(/(?=\+\s*[ĐD]o\b)/u).filter((b) => /[ĐD]o\b/u.test(b));
  for (const b of blocks) {
    const capM = b.match(/\+?\s*([ĐD]o[^:]{0,60}):/u);
    if (!capM || capM.index == null) continue;
    const caption = capM[1].trim();
    const body = b.slice(capM.index + capM[0].length);
    const rows: TimelineMeasurement["rows"] = [];
    let m: RegExpExecArray | null;

    // Dạng A: "Nhãn (R15: x, R60: y)"
    const reA = /([^();]+?)\s*\(([^)]*R\s*15[^)]*)\)/giu;
    while ((m = reA.exec(body))) {
      const label = m[1].replace(/^[;,\s]+/, "").trim();
      const nums = [...m[2].matchAll(/R\s*(\d{2})\s*:\s*([\d.,]+\s*[GMkm]?Ω)/giu)]
        .map((x) => ({ key: "R" + x[1], value: x[2].replace(/\s+/g, " ").trim() }));
      if (label && nums.length) rows.push({ label, cells: nums });
    }
    // Dạng B: "Nhãn (R15: a, R15: b, R15: c)" — đo lặp nhiều lần
    if (!rows.length) {
      const reB = /([^();]+?)\s*\(([^)]+)\)/gu;
      while ((m = reB.exec(body))) {
        const label = m[1].replace(/^[;,\s]+/, "").trim();
        const nums = [...m[2].matchAll(/([\d.,]+\s*[GMkm]?Ω)/giu)]
          // Một giá trị thì không phải đo lặp — "UV(160.69 MΩ)" là trị số duy nhất,
          // gắn nhãn "Lần 1" sẽ làm người đọc tưởng còn lần 2, lần 3 bị thiếu.
          .map((x, i, arr) => ({
            key: arr.length > 1 ? "Lần " + (i + 1) : "Giá trị",
            value: x[1].replace(/\s+/g, " ").trim(),
          }));
        if (label && nums.length) rows.push({ label, cells: nums });
      }
    }
    // Dạng C: "UV(160.69 MΩ), UW(160.99 MΩ)" — không có R15/R60
    if (!rows.length) {
      const reC = /([A-ZĐ][A-Za-zĐđ\s\-–+]{0,20}?)\s*\(?\s*([\d.,]+\s*[GMkm]?Ω)\s*\)?/gu;
      while ((m = reC.exec(body))) {
        rows.push({ label: m[1].trim(), cells: [{ key: "Giá trị", value: m[2].trim() }] });
      }
    }
    if (rows.length) out.push({ caption, rows });
  }
  return out;
}

// Trị số kỹ thuật: "15,9 MPa", "-85.82 KPa", "+300mm"… Dùng chung cho việc liệt kê
// trị số lẫn việc tô nổi ngay trong câu, nên phải tạo RegExp mới mỗi lần gọi —
// cờ /g mang theo `lastIndex`, dùng lại một đối tượng sẽ bỏ sót match.
const VALUE_SOURCE =
  String.raw`(?<![A-Za-z0-9])([+\-–]?\d+(?:[.,]\d+)?)\s*(MPa|kPa|KPa|Pa|mm|MΩ|GΩ|mΩ|kV|kW|MW|A|V|°C|%|v\/p|V\/P|t\/h)(?![A-Za-z0-9]|\s*\/\s*\d)`;

export function valueMatcher(): RegExp {
  return new RegExp(VALUE_SOURCE, "gu");
}

/** Bắt các trị số kỹ thuật để tô nổi trên giao diện. */
export function extractValues(text: string): string[] {
  const re = valueMatcher();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(`${m[1]} ${m[2]}`.replace(/\s+/g, " ").trim());
  return [...new Set(out)];
}

export function chipFor(text: string): TimelineChip | null {
  for (const [re, chip] of CHIP_RULES) if (re.test(text)) return chip;
  return null;
}

/** Tìm mốc thời gian nằm giữa dòng (khi bullet bị dính vào lúc copy từ Word). */
function findEmbeddedTime(line: string): number {
  const m = line.match(/(?:v[àa]o\s+)?l[úu]c\s*[:,]?\s*\d{1,2}\s*[h:]/iu);
  return m && m.index != null && m.index > 0 && m.index < 200 ? m.index : -1;
}

/** Quyết định phần (lò hơi / tuabin / điện) cho một sự kiện. */
function decideSection(text: string, curSection: TimelineSection | null) {
  const guess = scoreSection(text);
  const gScore = guess.section ? guess.score[guess.section] : 0;
  const cScore = curSection ? guess.score[curSection] : 0;

  // Không có tiêu đề phần → hoàn toàn dựa vào từ khoá.
  if (!curSection) {
    if (!guess.section) return { section: null, confidence: 0, needsReview: true, guess: guess.section };
    return { section: guess.section, confidence: guess.confidence, needsReview: guess.confidence < 0.5, guess: guess.section };
  }
  // Có tiêu đề nhưng từ khoá phần khác mạnh hơn hẳn → chuyển theo từ khoá, đánh dấu cần soát.
  // Đây là trường hợp nhật ký cũ không tách "PHẦN ĐIỆN": nội dung điện nằm lẫn trong "PHẦN MÁY".
  if (guess.section && guess.section !== curSection && gScore >= 6 && gScore - cScore >= 3) {
    return { section: guess.section, confidence: 0.55, needsReview: true, guess: guess.section };
  }
  // Lệch nhẹ → giữ tiêu đề nhưng vẫn nhắc soát.
  if (guess.section && guess.section !== curSection && gScore >= 6) {
    return { section: curSection, confidence: 0.7, needsReview: true, guess: guess.section };
  }
  return { section: curSection, confidence: 1, needsReview: false, guess: guess.section };
}

function makeEvent(
  seq: number,
  stamp: NonNullable<ReturnType<typeof extractTime>>,
  curSection: TimelineSection | null,
  rawLine: string,
  fromEmbedded: boolean
): TimelineEvent {
  const { actor, content } = extractActor(stamp.rest);
  const d = decideSection(stamp.rest, curSection);
  return {
    seq,
    section: d.section,
    sectionConfidence: +d.confidence.toFixed(2),
    sectionGuess: d.guess,
    occurredAt: stamp.occurredAt,
    timeText: stamp.timeText,
    dateText: stamp.missingDate ? "" : `${pad(stamp.date.d)}/${pad(stamp.date.mo)}/${stamp.date.y}`,
    missingDate: stamp.missingDate,
    actor,
    content,
    subItems: [],
    measurements: extractMeasurements(stamp.rest),
    values: extractValues(stamp.rest),
    chip: chipFor(stamp.rest),
    isKey: KEY_PATTERNS.some((re) => re.test(stamp.rest)),
    needsReview: d.needsReview || fromEmbedded || stamp.missingDate,
    raw: rawLine,
  };
}

/* ------------------------------------------------------------------ *
 * 4. Hàm chính                                                        *
 * ------------------------------------------------------------------ */

export function parseSeparationLog(
  raw: string,
  opts: { defaultYear?: number; defaultDate?: Date | string | null } = {}
): TimelineParseResult {
  const defaultYear = opts.defaultYear || new Date().getFullYear();
  const lines = normalize(raw);

  const events: TimelineEvent[] = [];
  const orphans: TimelineParseResult["orphans"] = [];
  let curSection: TimelineSection | null = null;
  // Nhiều nhật ký không ghi ngày ở đâu cả, chỉ liệt kê giờ — ngày nằm ở trường
  // "Ngày ghi nhận" của thư mục. Lấy nó làm mốc khởi điểm, nếu không thì toàn bộ
  // các dòng chỉ-có-giờ đều bị bỏ sót.
  let prevDate: DateParts | null = null;
  if (opts.defaultDate) {
    const seed = new Date(opts.defaultDate);
    if (!Number.isNaN(seed.getTime())) {
      prevDate = { d: seed.getDate(), mo: seed.getMonth() + 1, y: seed.getFullYear() };
    }
  }
  let seq = 0;

  for (const line of lines) {
    if (!line) continue;

    // 4.1 Tiêu đề phần
    let isHeader = false;
    for (const h of SECTION_HEADERS) {
      if (h.re.test(line)) {
        if (h.section) curSection = h.section;
        isHeader = true;
        break;
      }
    }
    if (isHeader) continue;

    // 4.1b Dòng chỉ có ngày → đặt mốc ngày cho các dòng chỉ-có-giờ phía dưới
    const dateOnly = line.match(DATE_ONLY_LINE);
    if (dateOnly) {
      const d = +dateOnly[1];
      const mo = +dateOnly[2];
      const rawY = +dateOnly[3];
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
        prevDate = { d, mo, y: rawY < 100 ? 2000 + rawY : rawY };
        continue;
      }
    }

    // 4.2 Dòng con (gạch đầu dòng phụ, không có giờ)
    const isSub = BULLET_SUB.test(line);
    const stamp = extractTime(line.replace(BULLET_SUB, ""), prevDate, defaultYear);

    if (isSub && !stamp) {
      const body = line.replace(BULLET_SUB, "").trim();
      const last = events[events.length - 1];
      if (last) {
        last.subItems.push(body);
        last.measurements.push(...extractMeasurements(body));
        last.values.push(...extractValues(body));
      } else {
        orphans.push({ line, reason: "Dòng con nhưng chưa có mốc thời gian nào trước đó" });
      }
      continue;
    }

    // 4.3 Dòng có mốc thời gian
    if (stamp) {
      if (!stamp.missingDate) prevDate = stamp.date;
      events.push(makeEvent(++seq, stamp, curSection, line, false));
      continue;
    }

    // 4.4 Mốc thời gian nằm giữa dòng (bullet bị mất khi copy từ Word)
    const midIdx = findEmbeddedTime(line);
    if (midIdx > 0) {
      const st2 = extractTime(line.slice(midIdx).trim(), prevDate, defaultYear);
      if (st2) {
        if (!st2.missingDate) prevDate = st2.date;
        events.push(makeEvent(++seq, st2, curSection, line, true));
        continue;
      }
    }

    // 4.5 Dòng không có giờ: nối vào sự kiện gần nhất
    const last = events[events.length - 1];
    if (last) {
      // Chữ thường ở đầu → gần như chắc chắn là câu bị ngắt dòng
      const isWrap = !BULLET_MAIN.test(line) && /^[a-zà-ỹ("]/u.test(line);
      if (isWrap) {
        if (last.subItems.length) last.subItems[last.subItems.length - 1] += " " + line;
        else last.content += " " + line;
      } else {
        last.subItems.push(line);
      }
      last.measurements.push(...extractMeasurements(line));
      last.values.push(...extractValues(line));
      continue;
    }

    orphans.push({ line, reason: "Không tìm thấy mốc thời gian" });
  }

  // 4.6 Dọn dẹp
  for (const e of events) {
    e.values = [...new Set(e.values)];
    const merged: TimelineMeasurement[] = [];
    for (const m of e.measurements) {
      const hit = merged.find((x) => x.caption === m.caption);
      if (hit) hit.rows.push(...m.rows);
      else merged.push(m);
    }
    e.measurements = merged;
  }

  // Cùng thời điểm + nội dung mở đầu giống nhau → nhiều khả năng là mốc bị chép lặp
  const seen = new Map<string, number>();
  for (const e of events) {
    const k = e.occurredAt + "|" + e.content.slice(0, 40).toLowerCase();
    const hit = seen.get(k);
    if (hit != null) {
      e.possibleDuplicate = hit;
      e.needsReview = true;
    } else seen.set(k, e.seq);
  }

  const bySection = { boiler: 0, turbine: 0, elec: 0, unknown: 0 };
  for (const e of events) bySection[e.section ?? "unknown"]++;

  return {
    events,
    orphans,
    stats: {
      total: events.length,
      bySection,
      needsReview: events.filter((e) => e.needsReview).length,
      orphanLines: orphans.length,
      duplicates: events.filter((e) => e.possibleDuplicate).length,
      days: [...new Set(events.map((e) => e.dateText))].length,
      measurements: events.reduce((n, e) => n + e.measurements.length, 0),
    },
  };
}

/** Lý do cần soát, hiển thị cạnh dòng có cờ vàng. */
export function reviewNote(e: TimelineEvent): string {
  if (e.missingDate) return "Nhật ký không ghi ngày — vui lòng điền ngày cho mốc này.";
  if (e.possibleDuplicate) return `Có thể trùng với mốc #${e.possibleDuplicate} (cùng giờ, nội dung gần giống).`;
  if (!e.section) return "Không đoán được thuộc phần nào — chọn giúp Lò hơi / Tuabin / Điện.";
  if (e.sectionGuess && e.sectionGuess !== e.section) {
    return `Nằm dưới tiêu đề "${TIMELINE_SECTIONS[e.section]}" nhưng nội dung giống phần ${TIMELINE_SECTIONS[e.sectionGuess]}.`;
  }
  return `Đoán là phần ${TIMELINE_SECTIONS[e.section]} với độ tin cậy ${Math.round(e.sectionConfidence * 100)}%.`;
}

/* ------------------------------------------------------------------ *
 * 5. Dạng lưu trong DigitalDocument.timelineJson                      *
 * ------------------------------------------------------------------ */

/** Một mốc đã được người dùng soát và xác nhận. */
export type TimelineEntry = {
  section: TimelineSection;
  date: string;   // dd/mm/yyyy
  time: string;   // hh:mm hoặc hh:mm'ss"
  actor: string;
  content: string;
  key: boolean;
};

export type TimelineDocument = { version: 1; entries: TimelineEntry[] };

export function parseTimelineJson(value?: string | null): TimelineEntry[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as TimelineDocument;
    if (!parsed || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.filter((e) => e && e.content?.trim());
  } catch {
    // JSON hỏng thì coi như chưa bóc tách — giao diện lùi về hiện văn bản gốc.
    return [];
  }
}

export function stringifyTimeline(entries: TimelineEntry[]): string | null {
  const clean = entries.filter((e) => e.content?.trim());
  if (!clean.length) return null;
  return JSON.stringify({ version: 1, entries: clean } satisfies TimelineDocument);
}

/** Mốc thời gian thực của một dòng, dùng để sắp xếp và tính khoảng thời gian. */
export function entryTimestamp(entry: { date: string; time: string }): number | null {
  const [d, mo, y] = entry.date.split("/").map(Number);
  const [h, mi] = entry.time.split(/[:'"]/).map(Number);
  if (!d || !mo || !y) return null;
  return new Date(y, mo - 1, d, h || 0, mi || 0).getTime();
}

/** Sắp mốc theo thời gian thực để hiển thị. Dòng thiếu ngày dồn xuống cuối. */
export function sortEntries(entries: TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort(
    (a, b) => (entryTimestamp(a) ?? Number.MAX_SAFE_INTEGER) - (entryTimestamp(b) ?? Number.MAX_SAFE_INTEGER)
  );
}

/** "51h10'" — độ dài toàn bộ tiến trình, hiển thị ở đầu popup. */
export function formatSpan(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h${pad(mins % 60)}'` : `${mins}'`;
}

/* ------------------------------------------------------------------ *
 * 6. Dựng dữ liệu hiển thị từ nội dung một mốc                        *
 * ------------------------------------------------------------------ */

/**
 * Nội dung một mốc được lưu thành một khối chữ: dòng đầu là thao tác chính,
 * các dòng sau (gạch đầu dòng) là ý phụ. Giữ nguyên cách này thay vì tách cột
 * riêng trong JSON — người soạn chỉ phải gõ vào một ô, và bản đã lưu vẫn dựng
 * lại được đầy đủ bảng đo / trị số như bản bóc tách tự động.
 */
export function splitContent(content: string): { main: string; subItems: string[] } {
  const lines = String(content ?? "")
    // Gồm cả "•" — đây là dấu mà trình nhập gắn vào đầu mỗi ý phụ khi chèn.
    .split("\n")
    .map((l) => l.replace(/^\s*[•▪▫◦‣·*]\s*/u, "").replace(BULLET_SUB, "").trim())
    .filter(Boolean);
  return { main: lines[0] ?? "", subItems: lines.slice(1) };
}

export type TimelineDisplay = {
  main: string;
  subItems: string[];
  measurements: TimelineMeasurement[];
  values: string[];
  chip: TimelineChip | null;
};

/** Bóc phần hiển thị (ý phụ, bảng đo, trị số, chip) ra khỏi nội dung một mốc. */
export function deriveDisplay(content: string): TimelineDisplay {
  const { main, subItems } = splitContent(content);
  const measurements: TimelineMeasurement[] = extractMeasurements(main);
  const rest: string[] = [];

  // Ý phụ nào bóc ra được bảng đo thì chỉ hiện dưới dạng bảng — để nguyên cả hai
  // thì cùng một dãy số bị lặp hai lần, rất khó soát.
  for (const s of subItems) {
    const m = extractMeasurements(s);
    if (m.length) measurements.push(...m);
    else rest.push(s);
  }

  const merged: TimelineMeasurement[] = [];
  for (const m of measurements) {
    const hit = merged.find((x) => x.caption === m.caption);
    if (hit) hit.rows.push(...m.rows);
    else merged.push(m);
  }

  const whole = [main, ...subItems].join("\n");
  return { main, subItems: rest, measurements: merged, values: extractValues(whole), chip: chipFor(whole) };
}
