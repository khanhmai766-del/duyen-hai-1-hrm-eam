// Đặt 110 vòi thổi bụi lên mô hình 3D lò hơi. Vị trí TƯƠNG ĐỐI: suy từ tọa độ màn DCS
// SOOT BLOW (lib/soot-blower-layout.ts) — giữ thứ tự hàng/cột như DCS, chỉ đưa lên đúng
// vách. Chưa phải cao độ thật; khi có bảng cao độ thì thay `y` của từng nhóm.
//
// Chia IR theo vách (người dùng xác nhận 12/10/2026): Front wall (hai nửa, 24 vòi) → vách trước ·
//   Left + Right reverse wall (24 vòi) → vách sau · nhóm "Giữa" trang trái → vách trái, trang phải → vách phải (6 + 6).

import { SB_LEFT_RAW, SB_RIGHT_RAW, sootBlowerTypeOf, type SootBlowerType } from "@/lib/soot-blower-layout";

/* ==================== Mặt cắt dọc lò (hình dạng vách trái / vách phải) ====================
   Đồ theo bản vẽ mặt đứng lò người dùng gửi 12/10/2026 (ảnh 609×658, x sang phải = từ trước
   ra sau, y xuống dưới), đối chiếu thêm bản vẽ chi tiết buồng đốt dưới + ảnh mô hình 3D.
   Ảnh bản vẽ bị kéo dãn theo chiều đứng: thân dưới trên bản chi tiết có tỉ lệ cao/sâu ≈ 0,6,
   trên ảnh mặt đứng ≈ 1,1 → nén trục đứng (KY < KX) cho về tỉ lệ thật. Đơn vị sau quy đổi ≈ mét.

   Buồng đốt kiểu chữ W (lửa đi xuống): thân trên hẹp; ở vai là vòm trước/sau có vòi đốt chĩa
   xuống, hai bên vai là hộp gió; thân dưới rộng ≈ 1,8 lần thân trên, đáy phễu trong hình chữ V
   (vẽ bằng nét trong), bên ngoài là vỏ bao hình hộp, dưới cùng là phễu xỉ. Sau buồng đốt: mũi
   lò, đường khói ngang trên đỉnh, đường khói lùi có phễu đáy, ống ra đi lên rồi sang SCR, xuống
   bộ sấy không khí. Ống trên đùn đều theo bề rộng lò. */
const KX = 0.164;
const KY = 0.125;
const X0 = 95.3; // mép ngoài hộp gió trước
const Y0 = 580; // mặt đất (đáy phễu xỉ ở y = 570)
const px = (x: number, y: number): [d: number, h: number] => [(x - X0) * KX, (Y0 - y) * KY];
const pxD = (x: number) => (x - X0) * KX;
const pxH = (y: number) => (Y0 - y) * KY;

export const BOILER_PROFILE: readonly [d: number, h: number][] = (
  [
    // Đoạn sau mũi lò vẽ lại theo nét đỏ người dùng 12/10/2026: vách sau đường khói lùi thẳng từ mái
    // xuống (x 318); khói ra ở ĐÁY đường khói lùi, đi ngang ra sau, lên ống đứng (x 362–398, đáy có phễu
    // tro nhỏ), lên đỉnh rồi ngang sang chụp SCR. Các mép ngang/đứng giữ thẳng hàng với nhau.
    [104, 39], [318, 39], // mái bao trên đỉnh (nhô ra trước buồng đốt)
    [318, 262], [362, 262], [362, 176], [470, 176], [550, 201], // vách sau đường khói lùi → mép trước ống đứng → chụp SCR
    // SCR → bộ sấy không khí vẽ lại theo nét đỏ 12/10/2026: vách SCR đứng thẳng, thu hẹp ngắn hai bên đều
    // nhau (25), bộ sấy hai vách song song — cùng trục x 498.
    // Cả cụm thu hẹp + bộ sấy + phễu dời lên 70 (người dùng chỉ 12/10/2026) → thân SCR ngắn lại.
    // Bộ sấy đáy phẳng — bỏ phễu đáy (người dùng 12/10/2026).
    [550, 345], [525, 367], [525, 435], [471, 435], [471, 367], [446, 345],
    [446, 215], [398, 215], [398, 297], // mép dưới ống ngang sang SCR → mép sau ống đứng (nới từ 385, 12/10)
    [390, 320], [376, 320], [368, 297], // phễu tro dưới ống đứng — thu hẹp theo nét đỏ 12/10, cân trục x 383
    [310, 297], [302, 329], [287, 329], [276, 268], [260, 250], [260, 166], // đáy ống nối → phễu + vách trước đường khói lùi
    [222, 185], [199, 201], [221, 216], // mũi lò
    [221, 348], [277.7, 348], [277.7, 381], [271.6, 381], [271.6, 543], // vách sau thân trên → hộp gió sau → vỏ bao sau
    [208.7, 543], [197, 570], [176, 570], [164.3, 543], // phễu xỉ
    [101.4, 543], [101.4, 381], [95.3, 381], [95.3, 348], [152, 348], // vỏ bao trước → hộp gió trước
    [152, 115], [104, 115], // vách trước thân trên
  ] as const
).map(([x, y]) => px(x, y));

export const BOILER_PROFILE_DEPTH = pxD(550);
export const BOILER_PROFILE_HEIGHT = pxH(39);

/** Trục đối xứng buồng đốt (giữa vách trước 152 và vách sau 221 thân trên). Thân dưới đo theo bản
    vẽ chi tiết buồng đốt dưới, quy đổi 1 điểm ảnh bản chi tiết = 0,3067 điểm ảnh mặt đứng: vách
    trong thân dưới ±60,6 · hộp gió ±91,2 · vỏ bao ±85,1 · cổ phễu ±14,6 · miệng phễu xỉ ±22,2. */
const FURNACE_AXIS = 186.5;

/** Nét trong (không phải vỏ): vòm + vách thân dưới + đáy phễu chữ V — vẽ lên hai vách bên. */
export const BOILER_INNER_LINES: readonly [d: number, h: number][][] = [
  [px(152, 348), px(125.9, 369), px(125.9, 439.5), px(171.9, 525), px(201.1, 525), px(247.1, 439.5), px(247.1, 369), px(221, 348)],
];

/** Vòi đốt trên vòm: điểm gốc (đầu vòi) và điểm mũi (chĩa xuống buồng đốt). */
export const BOILER_BURNERS: readonly { from: [number, number]; to: [number, number] }[] = [
  { from: px(FURNACE_AXIS - 49.5, 336), to: px(FURNACE_AXIS - 44.5, 366) },
  { from: px(FURNACE_AXIS + 49.5, 336), to: px(FURNACE_AXIS + 44.5, 366) },
];

/** Ngọn lửa chữ W: lửa từ hai vòm đi xuống sát vách thân dưới, quặt ở đáy rồi cùng bốc lên giữa. */
// [lệch khỏi trục buồng đốt, y] — nửa trước; nửa sau lấy đối xứng để chữ W cân hai bên
const FLAME_HALF: [number, number][] = [[44.5, 366], [43, 410], [38.5, 445], [24.5, 458], [9.5, 432]];
export const BOILER_FLAME_W: readonly [d: number, h: number][] = [
  ...FLAME_HALF.map(([o, y]) => px(FURNACE_AXIS - o, y)),
  px(FURNACE_AXIS, 398),
  ...[...FLAME_HALF].reverse().map(([o, y]) => px(FURNACE_AXIS + o, y)),
];
export const BOILER_FLAME_PLUME: readonly [d: number, h: number][] = (
  [[-14, 418], [14, 418], [10, 340], [5, 280], [0, 245], [-5, 280], [-10, 340]] as const
).map(([o, y]) => px(FURNACE_AXIS + o, y));

/** Đường khói thải (người dùng vẽ mũi tên 17/10/2026): từ đỉnh lửa W đi lên thân trên buồng đốt, lách trước mũi lò,
    qua đường khói ngang dưới mái, xuống đường khói lùi, ra ở đáy đi ngang, lên ống đứng, sang chụp SCR, xuống SCR
    tới bộ sấy không khí. Mỗi điểm là tâm ống (điểm ảnh bản vẽ) + `half` = nửa bề rộng lòng ống trong mặt cắt (m),
    lấy nhỏ hơn lòng ống thật chút để khói không chạm vách. Ống đùn đủ bề rộng lò nên khói rải cả bề rộng. */
export const BOILER_FLUE_PATH: readonly { d: number; h: number; half: number }[] = (
  [
    [186.5, 300, 3.0], [186.5, 240, 4.4], [178, 200, 3.4], [176, 140, 4.6], [190, 88, 4.0], // buồng đốt → lách trước mũi lò
    [235, 78, 4.4], [280, 96, 3.8], // đường khói ngang dưới mái
    [289, 150, 3.9], [289, 215, 3.9], [292, 252, 3.0], // đường khói lùi
    [318, 279, 1.6], [350, 280, 1.7], // ra ở đáy, đi ngang
    [379, 262, 2.2], [380, 228, 2.3], [383, 200, 1.9], // ống đứng
    [408, 195, 1.9], [440, 196, 2.1], [478, 214, 4.2], // ngang sang chụp SCR
    [498, 252, 6.2], [498, 312, 6.2], [498, 350, 4.4], [498, 395, 3.4], [498, 430, 3.0], // SCR → bộ sấy không khí
  ] as const
).map(([x, y, half]) => {
  const [d, h] = px(x, y);
  return { d, h, half };
});

/** "ah" = mặt sau khối bộ sấy không khí, cuối đường khói. */
export type BoilerWall = "front" | "rear" | "left" | "right" | "ah";

export const BOILER_WALL_LABEL: Record<BoilerWall, string> = {
  front: "Vách trước",
  rear: "Vách sau",
  left: "Vách trái",
  right: "Vách phải",
  ah: "Bộ sấy không khí",
};

type Face = { d: number; h: [number, number] };
const face = (x: number, yTop: number, yBottom: number): Face => ({ d: pxD(x), h: [pxH(yBottom), pxH(yTop)] });
const D_FRONT = 152; // vách trước thân trên
const D_REAR = 221; // vách sau thân trên (dưới mũi lò)
const D_REAR_PASS = 318; // vách sau đường khói lùi
const D_AH = 525; // mặt sau bộ sấy không khí

/** Mảng vách phẳng vuông góc chiều sâu (để tô sáng + kẻ ống), h từ thấp đến cao.
    Vách sau gồm vách sau buồng đốt và vách sau đường khói lùi (chỗ có IKEL). */
export const BOILER_FACES: Record<"front" | "rear" | "ah", Face[]> = {
  front: [face(D_FRONT, 115, 348)],
  rear: [face(D_REAR, 216, 348), face(D_REAR_PASS, 115, 262)],
  ah: [face(D_AH, 367, 435)],
};

/** u: 0→1 dọc vách tính từ bên TRÁI người đứng ngoài nhìn vào vách — vách trước/sau/bộ sấy
    theo bề rộng lò, vách trái/phải theo chiều sâu mặt cắt. h: cao độ (m). d: chiều sâu mặt vách
    phẳng (m) — chỉ cho vách trước/sau/bộ sấy. */
export type BlowerPlacement = { tag: string; type: SootBlowerType; wall: BoilerWall; u: number; h: number; d?: number };

/** y: [trên, dưới] theo điểm ảnh bản vẽ. x: [trước, sau] (vách bên) hoặc mặt vách (vách phẳng). */
/** rows / cols: số hàng ngang / cột — vị trí mỗi vòi bám về hàng/cột gần nhất (màn DCS xếp so le nên lượn sóng),
    cột chia đều trên khoảng x (hoặc u). */
type Group = {
  wall: BoilerWall;
  tags: string[];
  y: [top: number, bottom: number];
  u?: [number, number];
  x?: [number, number] | number;
  rows?: number;
  cols?: number;
  /** Đảo chiều cột so với màn DCS (cột trái DCS ↔ phía sau-phải người xem). */
  flip?: boolean;
};

const ALL_TILES: Record<string, [number, number]> = { ...SB_LEFT_RAW.tiles, ...SB_RIGHT_RAW.tiles };
const tagsOf = (type: SootBlowerType, pick: (n: number) => boolean = () => true) =>
  Object.keys(ALL_TILES).filter((t) => sootBlowerTypeOf(t) === type && pick(Number(t.replace(/\D/g, ""))));
const irZone = (page: typeof SB_LEFT_RAW, name: string) =>
  page.zones.filter((z) => z.name.startsWith(name)).flatMap((z) => (z.kind === "box" ? z.tags : [...z.top, ...(z.bottom ?? [])]));

const GROUPS: Group[] = [
  // IK: đặt riêng theo bản vẽ bố trí — xem IK_DRAWING bên dưới.
  // IKEL: cả 10 vòi trên vách sau đường khói lùi.
  // Một hàng ngang thẳng ở phần dưới vách sau đường khói lùi, ngay trên ống nối (người dùng chỉ 12/10/2026).
  // Nhìn từ sau lò bên trái người xem là phía PHẢI lò → số chẵn (trang Right side) nửa trái hình, số lẻ nửa phải.
  { wall: "rear", tags: tagsOf("IKEL", (n) => n % 2 === 0), y: [240, 240], x: D_REAR_PASS, u: [0.06, 0.46] },
  { wall: "rear", tags: tagsOf("IKEL", (n) => n % 2 === 1), y: [240, 240], x: D_REAR_PASS, u: [0.54, 0.94] },
  // IR: vòi thổi tường thân trên buồng đốt (giữa mũi lò và vòm), hai hàng; hàng trên hạ từ y 240 xuống 261
  // (≈ 2,6 m, người dùng chỉ 12/10/2026) — đều cả 4 vách.
  { wall: "front", tags: [...irZone(SB_LEFT_RAW, "Front wall"), ...irZone(SB_RIGHT_RAW, "Front wall")], y: [261, 320], x: D_FRONT, rows: 2 },
  // Vách sau nhìn từ phía sau: bên trái người xem là phía PHẢI lò → Right reverse wall ở nửa trái hình.
  { wall: "rear", tags: irZone(SB_RIGHT_RAW, "Right reverse wall"), y: [261, 320], x: D_REAR, u: [0.06, 0.46], rows: 2 },
  { wall: "rear", tags: irZone(SB_LEFT_RAW, "Left reverse wall"), y: [261, 320], x: D_REAR, u: [0.54, 0.94], rows: 2 },
  // Nhóm "Giữa": trang DCS trái (IR01/03/05/31/33/35) → vách trái, trang phải (IR02/04/06/32/34/36) → vách phải.
  { wall: "left", tags: irZone(SB_LEFT_RAW, "Giữa"), y: [261, 320], x: [160, 213], rows: 2 },
  { wall: "right", tags: irZone(SB_RIGHT_RAW, "Giữa"), y: [261, 320], x: [160, 213], rows: 2 },
  // IKAH: lưới 2×2 trên mặt sau bộ sấy không khí.
  { wall: "ah", tags: tagsOf("IKAH"), y: [382, 422], x: D_AH, u: [0.25, 0.75] },
  // IKSL: hai vách bên khối SCR — 2 hàng × 3 vòi cách đều theo bề sâu SCR (446–550). Đánh số 17/10/2026 theo hình
  // người dùng (nhìn vách trái từ ngoài): hàng dưới 1-2-3, hàng trên 4-5-6, số 1 phía TRƯỚC lò. Vách trái nhìn từ ngoài
  // thì phía trước ở bên trái người xem nhưng u tính từ phía sau → đảo cột; vách phải B cùng vị trí vật lý (B1 đối diện A1).
  { wall: "left", tags: Object.keys(ALL_TILES).filter((t) => t.startsWith("IKSL-A")), y: [253, 318], x: [463, 533], rows: 2, cols: 3, flip: true },
  { wall: "right", tags: Object.keys(ALL_TILES).filter((t) => t.startsWith("IKSL-B")), y: [253, 318], x: [463, 533], rows: 2, cols: 3 },
];

function place(group: Group): BlowerPlacement[] {
  if (!group.tags.length) return [];
  const xs = group.tags.map((t) => ALL_TILES[t][0]);
  const ys = group.tags.map((t) => ALL_TILES[t][1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // Vách trái nhìn từ ngoài: bên trái là phía sau lò; vách phải: bên trái là phía trước.
  const span = Array.isArray(group.x) ? group.x : null;
  const toU = (x: number) => (group.wall === "left" ? 1 - pxD(x) / BOILER_PROFILE_DEPTH : pxD(x) / BOILER_PROFILE_DEPTH);
  const [u0, u1] = span ? ([toU(span[0]), toU(span[1])].sort((a, b) => a - b) as [number, number]) : (group.u ?? [0.08, 0.92]);
  const d = typeof group.x === "number" ? pxD(group.x) : undefined;
  const [hTop, hBottom] = [pxH(group.y[0]), pxH(group.y[1])];
  // Giữ đúng thứ tự cột trái→phải như màn DCS để người vận hành đối chiếu được.
  return group.tags.map((tag) => {
    const dcsX = x1 === x0 ? 0.5 : (ALL_TILES[tag][0] - x0) / (x1 - x0);
    const rawX = group.flip ? 1 - dcsX : dcsX;
    const nx = group.cols && group.cols > 1 ? Math.round(rawX * (group.cols - 1)) / (group.cols - 1) : rawX;
    const raw = y1 === y0 ? 0.5 : (ALL_TILES[tag][1] - y0) / (y1 - y0);
    const ny = group.rows && group.rows > 1 ? Math.round(raw * (group.rows - 1)) / (group.rows - 1) : raw;
    return { tag, type: sootBlowerTypeOf(tag), wall: group.wall, u: u0 + nx * (u1 - u0), h: hTop - ny * (hTop - hBottom), d };
  });
}

/* IK: vị trí theo bản vẽ bố trí "IK-555 型 24 台" người dùng gửi 12/10/2026 — mỗi vách bên một
   hình, toạ độ là điểm ảnh của ảnh đó. Hình vách trái (số lẻ) có phía trước lò ở bên PHẢI, hình
   vách phải (số chẵn) phía trước ở bên TRÁI (góc hình ghi "尾部竖井后墙" = vách sau đường khói
   lùi); khớp quy ước DCS số lẻ vách trái. Mỗi vách: 6 vòi đỉnh buồng đốt, 2 vòi đường khói ngang
   trên mũi lò, 4 vòi đường khói lùi. Quy về mặt cắt bằng nội suy từng đoạn theo các mốc vách
   (vách trước, vách sau buồng đốt, vách trước / vách sau đường khói lùi) và mốc cao (mái, đỉnh –
   chóp – chân mũi lò) để vòi rơi đúng khoang dù tỉ lệ hai bản vẽ lệch nhau. */
const IK_DEPTH_MARKS: Record<"left" | "right", number[]> = { left: [550, 345, 285, 97], right: [765, 975, 1030, 1222] };
// mốc vách sau đường khói lùi giữ 339 (vị trí trước khi dời vách) để toạ độ IK người dùng đã chỉnh không đổi
const IK_DEPTH_TO = [D_FRONT, D_REAR, 260, 339]; // điểm ảnh bản vẽ mặt đứng
const IK_ROW_MARKS = [60, 312, 350, 380];
const IK_ROW_TO = [39, 166, 201, 216];
// Bốn vòi đường khói lùi mỗi vách (IK17–24) người dùng chỉnh cao độ trên mô hình 12/10/2026: hàng trên
// từ y 263 lên 217, hàng dưới từ y ~393 lên 334 (≈ +3 m và +4,5 m); cột sát vách sau (IK19/23, IK20/24) dời
// vào gần cột trước còn khoảng một nửa (≈ 3,3 m → 1,6 m) — không còn đúng toạ độ bản vẽ IK.
// Hàng dưới IK đỉnh buồng đốt (IK05/11, IK06/12) nâng lên y 333 ≈ +3,5 m, thẳng hàng (người dùng chỉ 12/10/2026).
const IK_DRAWING: Record<string, [number, number]> = {
  IK01: [495, 172], IK03: [495, 265], IK05: [495, 333], IK07: [440, 172], IK09: [437, 265], IK11: [437, 333],
  IK13: [330, 172], IK15: [330, 263], IK17: [253, 217], IK19: [207, 217], IK21: [253, 334], IK23: [207, 334],
  IK02: [820, 172], IK04: [820, 265], IK06: [820, 333], IK08: [877, 172], IK10: [877, 265], IK12: [877, 333],
  IK14: [985, 172], IK16: [985, 263], IK18: [1062, 217], IK20: [1110, 217], IK22: [1065, 334], IK24: [1110, 334],
};

/** Nội suy tuyến tính từng đoạn; ngoài hai đầu thì kéo dài theo đoạn gần nhất. */
function interp(marks: number[], to: number[], v: number): number {
  let i = 0;
  while (i < marks.length - 2 && (v - marks[i + 1]) * Math.sign(marks[marks.length - 1] - marks[0]) > 0) i++;
  return to[i] + ((v - marks[i]) / (marks[i + 1] - marks[i])) * (to[i + 1] - to[i]);
}

function placeIk(): BlowerPlacement[] {
  return tagsOf("IK").flatMap((tag) => {
    const at = IK_DRAWING[tag];
    if (!at) return [];
    const wall = Number(tag.replace(/\D/g, "")) % 2 === 1 ? "left" : "right";
    const d = pxD(interp(IK_DEPTH_MARKS[wall], IK_DEPTH_TO, at[0])) / BOILER_PROFILE_DEPTH;
    return [{ tag, type: "IK" as const, wall, u: wall === "left" ? 1 - d : d, h: pxH(interp(IK_ROW_MARKS, IK_ROW_TO, at[1])) }];
  });
}

export const SB_3D_PLACEMENTS: BlowerPlacement[] = [...placeIk(), ...GROUPS.flatMap(place)];
export const SB_3D_BY_TAG: Record<string, BlowerPlacement> = Object.fromEntries(SB_3D_PLACEMENTS.map((p) => [p.tag, p]));

/** Bộ lọc loại vòi trên trang: một loại, hoặc "ALL" = cả 110 vòi. */
export type SootBlowerFilter = SootBlowerType | "ALL";
export const matchesFilter = (filter: SootBlowerFilter, type: SootBlowerType) => filter === "ALL" || filter === type;

/** Vách có vòi của từng loại (IKSL điền sẵn theo mô tả để tô sáng dù chưa có tag). */
export const SB_3D_TYPE_WALLS: Record<SootBlowerType, BoilerWall[]> = {
  IK: ["left", "right"],
  IR: ["front", "rear", "left", "right"],
  IKEL: ["rear"],
  IKSL: ["left", "right"],
  IKAH: ["ah"],
};

export function sootBlowerWallLabel(tag: string): string {
  const p = SB_3D_BY_TAG[tag];
  return p ? BOILER_WALL_LABEL[p.wall] : "";
}
