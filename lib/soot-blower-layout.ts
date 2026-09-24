// Bố trí vòi thổi bụi theo màn DCS SOOT BLOW — dùng chung cho sơ đồ (client) và
// kiểm tra tag hợp lệ (server). Tọa độ là pixel ảnh DCS gốc, nhân hệ số S khi vẽ,
// nên vị trí vòi khớp DCS; khung nét đứt và ống góp TỰ TÍNH từ vị trí vòi.

export const SB_SCALE = 1.55; // hệ số phóng từ tọa độ ảnh DCS
export const SB_TILE_W = 58; // kích thước ô vòi (đơn vị SVG)
export const SB_TILE_H = 46;
const PAD = 12; // lề khung nét đứt

export type SootBlowerType = "IR" | "IK" | "IKEL" | "AH";
export type SootBlowerPageKey = "left" | "right";
type XY = [number, number];

type Zone =
  | { kind: "box"; tags: string[]; name: string }
  | { kind: "slope"; top: string[]; bottom?: string[]; name: string };

type RawPage = {
  key: SootBlowerPageKey;
  label: string;
  x0: number;
  y0: number;
  vb: XY;
  tiles: Record<string, XY>;
  zones: Zone[];
  labels: { t: string; sub?: string; x: number; y: number; size: number }[];
  pipes: XY[][];
  valves: XY[];
};

export const SB_LEFT_RAW: RawPage = {
  key: "left",
  label: "Vách trái",
  x0: 20,
  y0: 15,
  vb: [1200, 985],
  tiles: {
    IK13: [495, 48], IK15: [495, 110], IK19: [365, 128], IK17: [432, 128], IK23: [365, 200], IK21: [432, 200],
    IK07: [588, 65], IK01: [640, 65], IK09: [588, 132], IK03: [640, 132], IK11: [588, 198], IK05: [640, 198],
    IKEL09: [75, 215], IKEL07: [130, 225], IKEL05: [185, 238], IKEL03: [240, 248], IKEL01: [296, 258],
    IR48: [52, 425], IR46: [98, 432], IR44: [144, 440], IR42: [190, 448], IR40: [236, 456], IR38: [282, 464],
    IR31: [350, 470], IR33: [396, 470], IR35: [450, 470],
    IR37: [518, 464], IR39: [563, 456], IR41: [610, 448], IR43: [655, 440], IR45: [700, 432], IR47: [745, 425],
    IR18: [52, 515], IR16: [98, 522], IR14: [144, 530], IR12: [190, 538], IR10: [236, 546], IR08: [282, 554],
    IR01: [350, 560], IR03: [396, 560], IR05: [450, 560],
    IR07: [518, 554], IR09: [563, 546], IR11: [610, 538], IR13: [655, 530], IR15: [700, 522], IR17: [745, 515],
  },
  zones: [
    { kind: "box", name: "Left side", tags: ["IK13", "IK15", "IK19", "IK17", "IK23", "IK21", "IK07", "IK01", "IK09", "IK03", "IK11", "IK05"] },
    { kind: "slope", name: "Left side · IKEL", top: ["IKEL09", "IKEL07", "IKEL05", "IKEL03", "IKEL01"] },
    { kind: "slope", name: "Left reverse wall", top: ["IR48", "IR46", "IR44", "IR42", "IR40", "IR38"], bottom: ["IR18", "IR16", "IR14", "IR12", "IR10", "IR08"] },
    { kind: "slope", name: "Giữa · nhánh trái", top: ["IR31", "IR33", "IR35"], bottom: ["IR01", "IR03", "IR05"] },
    { kind: "slope", name: "Front wall · nửa trái", top: ["IR37", "IR39", "IR41", "IR43", "IR45", "IR47"], bottom: ["IR07", "IR09", "IR11", "IR13", "IR15", "IR17"] },
  ],
  labels: [
    { t: "LEFT SIDE", sub: "Vòi dài IK · IKEL", x: 135, y: 110, size: 24 },
    { t: "LEFT REVERSE WALL", sub: "Vòi thổi tường IR", x: 38, y: 618, size: 20 },
    { t: "FRONT WALL · NỬA TRÁI", sub: "Vòi thổi tường IR", x: 520, y: 618, size: 20 },
  ],
  pipes: [
    [[560, 15], [560, 375], [420, 375], [420, 625]],
    [[75, 245], [75, 318]],
  ],
  valves: [[420, 598], [75, 318]],
};

export const SB_RIGHT_RAW: RawPage = {
  key: "right",
  label: "Vách phải",
  x0: 790,
  y0: 15,
  vb: [1420, 985],
  tiles: {
    IK02: [933, 70], IK08: [985, 70], IK14: [1078, 50], IK04: [933, 135], IK10: [985, 135], IK16: [1078, 112],
    IK06: [933, 200], IK12: [985, 200], IK18: [1140, 130], IK20: [1207, 130], IK22: [1140, 205], IK24: [1207, 205],
    IKEL02: [1278, 258], IKEL04: [1330, 248], IKEL06: [1385, 238], IKEL08: [1442, 225], IKEL10: [1497, 215],
    AH01: [1593, 258], AH02: [1668, 258], AH03: [1593, 335], AH04: [1668, 335],
    IR49: [825, 425], IR51: [871, 432], IR53: [918, 440], IR55: [963, 448], IR57: [1009, 456], IR59: [1055, 464],
    IR36: [1125, 470], IR34: [1175, 470], IR32: [1222, 470],
    IR60: [1292, 464], IR58: [1340, 456], IR56: [1385, 448], IR54: [1430, 440], IR52: [1475, 432], IR50: [1520, 425],
    IR19: [825, 515], IR21: [871, 522], IR23: [918, 530], IR25: [963, 538], IR27: [1009, 546], IR29: [1055, 554],
    IR06: [1125, 560], IR04: [1175, 560], IR02: [1222, 560],
    IR30: [1292, 554], IR28: [1340, 546], IR26: [1385, 538], IR24: [1430, 530], IR22: [1475, 522], IR20: [1520, 515],
  },
  zones: [
    { kind: "box", name: "Right side", tags: ["IK02", "IK08", "IK14", "IK04", "IK10", "IK16", "IK06", "IK12", "IK18", "IK20", "IK22", "IK24"] },
    { kind: "slope", name: "Right side · IKEL", top: ["IKEL02", "IKEL04", "IKEL06", "IKEL08", "IKEL10"] },
    { kind: "box", name: "Air heater", tags: ["AH01", "AH02", "AH03", "AH04"] },
    { kind: "slope", name: "Front wall · nửa phải", top: ["IR49", "IR51", "IR53", "IR55", "IR57", "IR59"], bottom: ["IR19", "IR21", "IR23", "IR25", "IR27", "IR29"] },
    { kind: "slope", name: "Giữa · nhánh phải", top: ["IR36", "IR34", "IR32"], bottom: ["IR06", "IR04", "IR02"] },
    { kind: "slope", name: "Right reverse wall", top: ["IR60", "IR58", "IR56", "IR54", "IR52", "IR50"], bottom: ["IR30", "IR28", "IR26", "IR24", "IR22", "IR20"] },
  ],
  labels: [
    { t: "RIGHT SIDE", sub: "Vòi dài IK · IKEL", x: 1265, y: 110, size: 24 },
    { t: "FRONT WALL · NỬA PHẢI", sub: "Vòi thổi tường IR", x: 815, y: 618, size: 20 },
    { t: "RIGHT REVERSE WALL", sub: "Vòi thổi tường IR", x: 1285, y: 618, size: 20 },
    { t: "AUX STEAM", x: 1480, y: 62, size: 13 },
  ],
  pipes: [
    [[1015, 15], [1015, 375], [1155, 375], [1155, 625]],
    [[1630, 15], [1630, 405]],
    [[1540, 75], [1630, 75]],
    [[1497, 245], [1497, 318]],
  ],
  valves: [[1155, 598], [1630, 150], [1575, 75], [1630, 395], [1497, 318]],
};

const zoneTags = (z: Zone) => (z.kind === "box" ? z.tags : [...z.top, ...(z.bottom ?? [])]);

export type SootBlowerPage = ReturnType<typeof buildPage>;

function buildPage(raw: RawPage) {
  const P = ([x, y]: XY): XY => [(x - raw.x0) * SB_SCALE, (y - raw.y0) * SB_SCALE];
  const W = SB_TILE_W;
  const H = SB_TILE_H;
  const pos: Record<string, XY> = {};
  for (const [tag, xy] of Object.entries(raw.tiles)) pos[tag] = P(xy);

  const outlines = raw.zones.map((z) => {
    if (z.kind === "box") {
      const xs = z.tags.map((t) => pos[t][0]);
      const ys = z.tags.map((t) => pos[t][1]);
      const l = Math.min(...xs) - W / 2 - PAD, r = Math.max(...xs) + W / 2 + PAD;
      const tp = Math.min(...ys) - H / 2 - PAD, b = Math.max(...ys) + H / 2 + PAD;
      return `${l},${tp} ${r},${tp} ${r},${b} ${l},${b}`;
    }
    // khung nghiêng bám theo hàng trên / hàng dưới
    const top = z.top, bottom = z.bottom ?? z.top;
    const [tlx, tly] = pos[top[0]], [trx, tryy] = pos[top[top.length - 1]];
    const [blx, bly] = pos[bottom[0]], [brx, bry] = pos[bottom[bottom.length - 1]];
    const l = Math.min(tlx, blx) - W / 2 - PAD, r = Math.max(trx, brx) + W / 2 + PAD;
    const extra = 14; // chừa chỗ cho ống góp dưới hàng
    return `${l},${tly - H / 2 - PAD} ${r},${tryy - H / 2 - PAD} ${r},${bry + H / 2 + PAD + extra} ${l},${bly + H / 2 + PAD + extra}`;
  });

  // ống góp chạy dưới mỗi hàng của vùng nghiêng
  const rowPipes: string[] = [];
  const slopeTags = new Set<string>();
  for (const z of raw.zones) {
    if (z.kind !== "slope") continue;
    for (const row of [z.top, z.bottom]) {
      if (!row) continue;
      rowPipes.push(row.map((t) => `${pos[t][0]},${pos[t][1] + H / 2 + 9}`).join(" "));
      row.forEach((t) => slopeTags.add(t));
    }
  }

  const zoneOf: Record<string, string> = {};
  for (const z of raw.zones) for (const t of zoneTags(z)) zoneOf[t] = z.name;

  return {
    key: raw.key,
    label: raw.label,
    vb: raw.vb,
    pos,
    tags: Object.keys(raw.tiles),
    outlines,
    rowPipes,
    slopeTags,
    zoneOf,
    pipes: raw.pipes.map((line) => line.map(P).map((p) => p.join(",")).join(" ")),
    valves: raw.valves.map(P),
    labels: raw.labels.map((l) => ({ ...l, p: P([l.x, l.y]) })),
  };
}

export const SB_PAGES: Record<SootBlowerPageKey, SootBlowerPage> = {
  left: buildPage(SB_LEFT_RAW),
  right: buildPage(SB_RIGHT_RAW),
};

/** Toàn bộ 98 tag vòi trên hai vách — server dùng để chặn tag lạ. */
export const SOOT_BLOWER_TAGS: ReadonlySet<string> = new Set([...SB_PAGES.left.tags, ...SB_PAGES.right.tags]);

export const SOOT_BLOWER_MACHINES = ["S1", "S2"] as const;

/** Chuẩn hoá tổ máy từ request; thiếu thì mặc định S1, sai thì null. */
export function parseSootBlowerMachine(value: unknown): string | null {
  const machine = String(value || "S1").trim().toUpperCase();
  return (SOOT_BLOWER_MACHINES as readonly string[]).includes(machine) ? machine : null;
}

export const SOOT_BLOWER_DEPTS = ["SCĐ", "SCCN"] as const;
export type SootBlowerDept = (typeof SOOT_BLOWER_DEPTS)[number];
export const SOOT_BLOWER_DEPT_LABEL: Record<SootBlowerDept, string> = {
  "SCĐ": "Sửa chữa Điện",
  SCCN: "Sửa chữa Cơ nhiệt",
};

export function sootBlowerPageOf(tag: string): SootBlowerPageKey | null {
  return SB_PAGES.left.pos[tag] ? "left" : SB_PAGES.right.pos[tag] ? "right" : null;
}

export function sootBlowerTypeOf(tag: string): SootBlowerType {
  return tag.startsWith("IKEL") ? "IKEL" : tag.startsWith("IR") ? "IR" : tag.startsWith("AH") ? "AH" : "IK";
}

export const SOOT_BLOWER_TYPES: SootBlowerType[] = ["IR", "IK", "IKEL", "AH"];
export const SOOT_BLOWER_TYPE_NAME: Record<SootBlowerType, string> = {
  IR: "Vòi thổi tường IR",
  IK: "Vòi dài IK",
  IKEL: "Vòi dài IKEL",
  AH: "Vòi bộ sấy không khí AH",
};

export function sootBlowerZoneName(tag: string): string {
  const pk = sootBlowerPageOf(tag);
  return pk ? SB_PAGES[pk].zoneOf[tag] ?? "" : "";
}
