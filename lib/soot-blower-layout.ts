// Bố trí vòi thổi bụi theo màn DCS SOOT BLOW, chỉnh theo bản vẽ hệ thống thổi bụi — dùng chung cho
// sơ đồ (client) và kiểm tra tag hợp lệ (server). Tọa độ là pixel ảnh DCS gốc, nhân hệ số S khi vẽ;
// khung nét đứt TỰ TÍNH từ vị trí vòi. Không vẽ đường hơi / van (bỏ 12/10/2026 — không có tín hiệu thật).

export const SB_SCALE = 1.55; // hệ số phóng từ tọa độ ảnh DCS
export const SB_TILE_W = 58; // kích thước ô vòi (đơn vị SVG)
export const SB_TILE_H = 46;
const PAD = 12; // lề khung nét đứt

// IKAH = vòi bộ sấy không khí; tag trong DB vẫn là AH01–AH04 (không đổi dữ liệu).
// IKSL = vòi dài trên hai vách bên khối SCR, 6 vòi mỗi vách: nhánh A = vách trái IKSL-A1…A6, nhánh B = vách phải
// IKSL-B1…B6 (đánh số lại 17/10/2026 theo hình người dùng, thay IKSL01–12 lẻ trái/chẵn phải). Mỗi vách: hàng dưới 1-2-3,
// hàng trên 4-5-6, từ phía trước lò ra sau; B cùng vị trí vật lý với A (B1 đối diện A1). Ô trên sơ đồ DCS đặt vào chỗ
// trống, chưa theo màn DCS thật — hàng trên 4-5-6, hàng dưới 1-2-3, trái→phải.
export type SootBlowerType = "IK" | "IR" | "IKEL" | "IKSL" | "IKAH";
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
};

export const SB_LEFT_RAW: RawPage = {
  key: "left",
  label: "Vách trái",
  x0: 20,
  y0: 15,
  vb: [1200, 985],
  tiles: {
    // Vị trí theo bản vẽ hệ thống thổi bụi (người dùng gửi 12/10/2026): hàng IK thẳng hàng, IR ba vùng
    // "IR-3Z" — vùng trái dốc xuống, vùng giữa nằm ngang, vùng phải dốc lên.
    IK19: [365, 107], IK17: [450, 107], IK23: [365, 187], IK21: [450, 187], IK13: [516, 50], IK15: [516, 107],
    IK07: [610, 50], IK01: [659, 50], IK09: [610, 107], IK03: [659, 107], IK11: [610, 172], IK05: [659, 172],
    IKEL09: [75, 220], IKEL07: [130, 229], IKEL05: [185, 240], IKEL03: [240, 248], IKEL01: [296, 258],
    IR48: [52, 425], IR46: [98, 434], IR44: [144, 442], IR42: [190, 452], IR40: [236, 461], IR38: [282, 472],
    IR31: [350, 468], IR33: [396, 468], IR35: [450, 468],
    IR37: [518, 472], IR39: [563, 463], IR41: [610, 455], IR43: [655, 446], IR45: [700, 438], IR47: [745, 429],
    IR18: [52, 514], IR16: [98, 522], IR14: [144, 530], IR12: [190, 538], IR10: [236, 545], IR08: [282, 553],
    IR01: [350, 553], IR03: [396, 553], IR05: [450, 553],
    IR07: [518, 556], IR09: [563, 548], IR11: [610, 539], IR13: [655, 531], IR15: [700, 522], IR17: [745, 514],
    "IKSL-A4": [150, 330], "IKSL-A5": [205, 330], "IKSL-A6": [260, 330], "IKSL-A1": [150, 375], "IKSL-A2": [205, 375], "IKSL-A3": [260, 375],
  },
  zones: [
    { kind: "box", name: "Left side", tags: ["IK13", "IK15", "IK19", "IK17", "IK23", "IK21", "IK07", "IK01", "IK09", "IK03", "IK11", "IK05"] },
    { kind: "slope", name: "Left side · IKEL", top: ["IKEL09", "IKEL07", "IKEL05", "IKEL03", "IKEL01"] },
    { kind: "box", name: "Left side · IKSL (SCR)", tags: ["IKSL-A4", "IKSL-A5", "IKSL-A6", "IKSL-A1", "IKSL-A2", "IKSL-A3"] },
    { kind: "slope", name: "Left reverse wall", top: ["IR48", "IR46", "IR44", "IR42", "IR40", "IR38"], bottom: ["IR18", "IR16", "IR14", "IR12", "IR10", "IR08"] },
    { kind: "slope", name: "Giữa · nhánh trái", top: ["IR31", "IR33", "IR35"], bottom: ["IR01", "IR03", "IR05"] },
    { kind: "slope", name: "Front wall · nửa trái", top: ["IR37", "IR39", "IR41", "IR43", "IR45", "IR47"], bottom: ["IR07", "IR09", "IR11", "IR13", "IR15", "IR17"] },
  ],
  labels: [
    { t: "LEFT SIDE", sub: "Vòi dài IK · IKEL", x: 135, y: 110, size: 24 },
    { t: "LEFT REVERSE WALL", sub: "Vòi thổi tường IR", x: 38, y: 618, size: 20 },
    { t: "FRONT WALL · NỬA TRÁI", sub: "Vòi thổi tường IR", x: 520, y: 618, size: 20 },
  ],
};

export const SB_RIGHT_RAW: RawPage = {
  key: "right",
  label: "Vách phải",
  x0: 790,
  y0: 15,
  vb: [1420, 985],
  tiles: {
    IK02: [933, 50], IK08: [1016, 50], IK14: [1115, 50], IK04: [933, 107], IK10: [1016, 107], IK16: [1115, 107],
    IK06: [933, 172], IK12: [1016, 172], IK18: [1220, 107], IK20: [1309, 107], IK22: [1220, 187], IK24: [1309, 187],
    IKEL02: [1278, 258], IKEL04: [1330, 248], IKEL06: [1385, 240], IKEL08: [1442, 229], IKEL10: [1497, 220],
    AH01: [1593, 258], AH02: [1668, 258], AH03: [1593, 335], AH04: [1668, 335],
    IR49: [825, 425], IR51: [871, 434], IR53: [918, 442], IR55: [963, 452], IR57: [1009, 461], IR59: [1055, 472],
    IR36: [1125, 468], IR34: [1175, 468], IR32: [1222, 468],
    IR60: [1292, 472], IR58: [1340, 463], IR56: [1385, 455], IR54: [1430, 446], IR52: [1475, 438], IR50: [1520, 429],
    IR19: [825, 514], IR21: [871, 522], IR23: [918, 530], IR25: [963, 538], IR27: [1009, 545], IR29: [1055, 553],
    IR06: [1125, 553], IR04: [1175, 553], IR02: [1222, 553],
    IR30: [1292, 556], IR28: [1340, 548], IR26: [1385, 539], IR24: [1430, 531], IR22: [1475, 522], IR20: [1520, 514],
    "IKSL-B4": [1330, 330], "IKSL-B5": [1385, 330], "IKSL-B6": [1440, 330], "IKSL-B1": [1330, 375], "IKSL-B2": [1385, 375], "IKSL-B3": [1440, 375],
  },
  zones: [
    { kind: "box", name: "Right side", tags: ["IK02", "IK08", "IK14", "IK04", "IK10", "IK16", "IK06", "IK12", "IK18", "IK20", "IK22", "IK24"] },
    { kind: "slope", name: "Right side · IKEL", top: ["IKEL02", "IKEL04", "IKEL06", "IKEL08", "IKEL10"] },
    { kind: "box", name: "Right side · IKSL (SCR)", tags: ["IKSL-B4", "IKSL-B5", "IKSL-B6", "IKSL-B1", "IKSL-B2", "IKSL-B3"] },
    { kind: "box", name: "Air heater", tags: ["AH01", "AH02", "AH03", "AH04"] },
    { kind: "slope", name: "Front wall · nửa phải", top: ["IR49", "IR51", "IR53", "IR55", "IR57", "IR59"], bottom: ["IR19", "IR21", "IR23", "IR25", "IR27", "IR29"] },
    { kind: "slope", name: "Giữa · nhánh phải", top: ["IR36", "IR34", "IR32"], bottom: ["IR06", "IR04", "IR02"] },
    { kind: "slope", name: "Right reverse wall", top: ["IR60", "IR58", "IR56", "IR54", "IR52", "IR50"], bottom: ["IR30", "IR28", "IR26", "IR24", "IR22", "IR20"] },
  ],
  labels: [
    { t: "RIGHT SIDE", sub: "Vòi dài IK · IKEL", x: 1400, y: 110, size: 24 },
    { t: "FRONT WALL · NỬA PHẢI", sub: "Vòi thổi tường IR", x: 815, y: 618, size: 20 },
    { t: "RIGHT REVERSE WALL", sub: "Vòi thổi tường IR", x: 1285, y: 618, size: 20 },
  ],
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
    return `${l},${tly - H / 2 - PAD} ${r},${tryy - H / 2 - PAD} ${r},${bry + H / 2 + PAD} ${l},${bly + H / 2 + PAD}`;
  });

  const zoneOf: Record<string, string> = {};
  for (const z of raw.zones) for (const t of zoneTags(z)) zoneOf[t] = z.name;

  return {
    key: raw.key,
    label: raw.label,
    vb: raw.vb,
    pos,
    tags: Object.keys(raw.tiles),
    outlines,
    zoneOf,
    labels: raw.labels.map((l) => ({ ...l, p: P([l.x, l.y]) })),
  };
}

export const SB_PAGES: Record<SootBlowerPageKey, SootBlowerPage> = {
  left: buildPage(SB_LEFT_RAW),
  right: buildPage(SB_RIGHT_RAW),
};

/** Toàn bộ 110 tag vòi trên hai vách — server dùng để chặn tag lạ. */
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
  if (tag.startsWith("IKEL")) return "IKEL";
  if (tag.startsWith("IKSL")) return "IKSL";
  if (tag.startsWith("IKAH") || tag.startsWith("AH")) return "IKAH";
  return tag.startsWith("IR") ? "IR" : "IK";
}

export const SOOT_BLOWER_TYPES: SootBlowerType[] = ["IK", "IR", "IKEL", "IKSL", "IKAH"];
export const SOOT_BLOWER_TYPE_NAME: Record<SootBlowerType, string> = {
  IK: "Vòi dài IK",
  IR: "Vòi thổi tường IR",
  IKEL: "Vòi dài IKEL",
  IKSL: "Vòi dài IKSL",
  IKAH: "Vòi bộ sấy không khí IKAH",
};

export function sootBlowerZoneName(tag: string): string {
  const pk = sootBlowerPageOf(tag);
  return pk ? SB_PAGES[pk].zoneOf[tag] ?? "" : "";
}
