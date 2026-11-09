/**
 * "Tổng tự dùng PMIS" của từng tổ — ô L157 (S1) / L158 (S2) trên trang ngày (MWh).
 *
 * Quy tắc (theo PXVH1, 09/11/2026):
 *  - Tổ có phát điện: (điện đầu cực − xuất tuyến) + điện năng nhận qua xuất tuyến của tổ.
 *  - Tổ không phát, có nhận qua xuất tuyến của tổ (285 → S1, 283 → S2): = điện năng nhận.
 *  - Tổ không phát, không nhận qua xuất tuyến của tổ → đang lấy điện qua TD21. Lẽ ra đọc xuất tuyến 284,
 *    nhưng CSV 284 đang hỏng nên lấy công tơ tự dùng TD21 trong ngày (ô I24 = R49 hôm nay − R49 hôm trước).
 *  - Trường hợp đặc biệt (vd. nhận xuất tuyến rồi cắt điện MBA chuyển sang TD21 trong ngày): người nhập
 *    ghi thẳng tổng tự dùng PMIS của tổ ở ô nhập tay; số nhập tay luôn được ưu tiên.
 * Không đủ dữ liệu để chọn nguồn (thiếu chỉ số TD21, hoặc cả hai tổ cùng phải lấy qua TD21 nên không tách
 * được) thì giữ (đầu cực − xuất tuyến) để người nhập bổ sung bằng ô nhập tay.
 */
export type PmisAuxUnit = "S1" | "S2";
export type PmisAuxSource = "manual" | "running" | "line" | "td21" | "incomplete";

const SECTION = "pmis_daily";
const SECTION_LABEL = "Đối chiếu PMIS theo ngày";

export function pmisAuxManualCell(unit: PmisAuxUnit) {
  return `PMIS_AUX_MANUAL_${unit}`;
}
export function pmisAuxNoteCell(unit: PmisAuxUnit) {
  return `PMIS_AUX_NOTE_${unit}`;
}

export const CTKTKT_PMIS_AUX_MANUAL_FIELDS = (["S1", "S2"] as const).map(unit => ({
  cell: pmisAuxManualCell(unit),
  section: SECTION,
  sectionLabel: SECTION_LABEL,
  label: `${unit} · Tổng tự dùng PMIS nhập tay (MWh) — khi nhận xuất tuyến rồi cắt điện MBA…`,
  row: 0,
  column: 0,
}));
export const CTKTKT_PMIS_AUX_NOTE_FIELDS = (["S1", "S2"] as const).map(unit => ({
  cell: pmisAuxNoteCell(unit),
  section: SECTION,
  sectionLabel: SECTION_LABEL,
  label: `${unit} · Lý do nhập tay tổng tự dùng PMIS`,
  row: 0,
  column: 0,
}));
export const CTKTKT_PMIS_AUX_CELLS = new Set<string>([
  ...CTKTKT_PMIS_AUX_MANUAL_FIELDS.map(field => field.cell),
  ...CTKTKT_PMIS_AUX_NOTE_FIELDS.map(field => field.cell),
]);

const UNIT_CELLS = {
  S1: { gross: "J157", net: "K157", received: "GRID_RECEIVE_S1", target: "L157" },
  S2: { gross: "J158", net: "K158", received: "GRID_RECEIVE_S2", target: "L158" },
} as const;

function numberOrNull(value: string | undefined) {
  const text = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export type PmisAuxInputs = {
  /** Ô KTKT của ngày: J157/K157/J158/K158, R49, ô nhập tay và GRID_RECEIVE_S1/S2 (điện nhận lưới, MWh). */
  values: Readonly<Record<string, string | undefined>>;
  /** Chỉ số TD21 lúc 24h của ngày hôm trước (R49 của D-1). */
  previousTd21?: string;
  /** Sản lượng phát trong ngày dùng khi chưa có điện đầu cực PMIS (vd. B/H của Dữ liệu các tháng). */
  generatedFallback?: Partial<Record<PmisAuxUnit, string | undefined>>;
};

export type PmisAuxResult = {
  unit: PmisAuxUnit;
  source: PmisAuxSource;
  /** Giá trị (MWh); null khi chưa đủ số liệu để tính. */
  value: number | null;
  /** Công thức Excel cho ô L157/L158. */
  formula: string;
  receivedMwh: number | null;
  td21Mwh: number | null;
};

export function td21DailyMwh(today: string | undefined, previous: string | undefined) {
  const end = numberOrNull(today), start = numberOrNull(previous);
  return end !== null && start !== null && end >= start ? end - start : null;
}

export function calculatePmisAuxiliary({ values, previousTd21, generatedFallback }: PmisAuxInputs): Record<PmisAuxUnit, PmisAuxResult> {
  const td21 = td21DailyMwh(values.R49, previousTd21);
  const units = (["S1", "S2"] as const).map(unit => {
    const cells = UNIT_CELLS[unit];
    const gross = numberOrNull(values[cells.gross]);
    const net = numberOrNull(values[cells.net]);
    const received = numberOrNull(values[cells.received]);
    const generated = gross ?? numberOrNull(generatedFallback?.[unit]);
    const manual = numberOrNull(values[pmisAuxManualCell(unit)]);
    return { unit, cells, gross, net, received, manual, running: generated !== null && generated > 0 };
  });
  const viaTd21 = units.filter(item => item.manual === null && !item.running && !(item.received !== null && item.received > 0));
  const result = {} as Record<PmisAuxUnit, PmisAuxResult>;
  for (const item of units) {
    const base = `${item.cells.gross}-${item.cells.net}`;
    const diff = item.gross !== null && item.net !== null ? item.gross - item.net : null;
    const receivedPart = item.received !== null && item.received > 0 ? item.received : 0;
    const common = { unit: item.unit, receivedMwh: item.received, td21Mwh: td21 };
    if (item.manual !== null) {
      result[item.unit] = { ...common, source: "manual", value: item.manual, formula: String(item.manual) };
    } else if (item.running) {
      result[item.unit] = {
        ...common,
        source: "running",
        value: diff === null ? null : diff + receivedPart,
        formula: receivedPart > 0 ? `${base}+${receivedPart}` : base,
      };
    } else if (receivedPart > 0) {
      result[item.unit] = { ...common, source: "line", value: (diff ?? 0) + receivedPart, formula: `${base}+${receivedPart}` };
    } else if (td21 !== null && viaTd21.length === 1) {
      result[item.unit] = { ...common, source: "td21", value: td21, formula: "I24" };
    } else {
      result[item.unit] = { ...common, source: "incomplete", value: diff, formula: base };
    }
  }
  return result;
}

export const PMIS_AUX_SOURCE_LABEL: Record<PmisAuxSource, string> = {
  manual: "Nhập tay",
  running: "Đầu cực − xuất tuyến + nhận xuất tuyến",
  line: "Không phát · điện nhận qua xuất tuyến của tổ",
  td21: "Không phát · lấy qua TD21 (công tơ TD21, thay xuất tuyến 284)",
  incomplete: "Chưa đủ số liệu chọn nguồn — nhập tay nếu cần",
};
