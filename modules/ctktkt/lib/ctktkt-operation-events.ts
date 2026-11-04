import type ExcelJS from "exceljs";

export const CTKTKT_OPERATION_EVENTS_CELL = "STARTUP_EVENTS_JSON";

export type CtktktOperationUnit = "S1" | "S2";
export type CtktktOperationKind = "startup" | "shutdown" | "incident_oil";
export type CtktktOperationPoint = "start" | "grid_sync" | "boiler_stop" | "grid_disconnect" | "oil_burn_start" | "oil_cut";

export type CtktktOperationReading = {
  time: string;
  power: Record<string, string>;
  oilFeed: string;
  oilReturn: string;
};

export type CtktktOperationEvent = {
  unit: CtktktOperationUnit;
  kind: CtktktOperationKind;
  points: Partial<Record<CtktktOperationPoint, CtktktOperationReading>>;
};

export const CTKTKT_EVENT_POWER_ROWS = [
  { row: 61, label: "MBA T1/T2 · P giao · Biểu 1" },
  { row: 62, label: "MBA T1/T2 · P giao · Biểu 2" },
  { row: 63, label: "MBA T1/T2 · P giao · Biểu 3" },
  { row: 65, label: "MBA T1/T2 · P nhận · Biểu 1" },
  { row: 66, label: "MBA T1/T2 · P nhận · Biểu 2" },
  { row: 67, label: "MBA T1/T2 · P nhận · Biểu 3" },
  { row: 69, label: "MBA TD911/TD921 · Biểu 1" },
  { row: 70, label: "MBA TD911/TD921 · Biểu 2" },
  { row: 71, label: "MBA TD911/TD921 · Biểu 3" },
  { row: 72, label: "MBA TD911/TD921 · Biểu 4" },
  { row: 74, label: "MBA TD912/TD922 · Biểu 1" },
  { row: 75, label: "MBA TD912/TD922 · Biểu 2" },
  { row: 76, label: "MBA TD912/TD922 · Biểu 3" },
  { row: 77, label: "MBA TD912/TD922 · Biểu 4" },
  { row: 79, label: "Công tơ máy phát · P giao · Biểu 1" },
  { row: 80, label: "Công tơ máy phát · P giao · Biểu 2" },
  { row: 81, label: "Công tơ máy phát · P giao · Biểu 3" },
  { row: 82, label: "Công tơ máy phát · P giao · Biểu 4" },
  { row: 83, label: "Tổng tự dùng từ lúc khởi động đến hòa lưới" },
] as const;

const POINTS_BY_KIND: Record<CtktktOperationKind, readonly CtktktOperationPoint[]> = {
  startup: ["start", "grid_sync", "oil_cut"],
  shutdown: ["boiler_stop", "grid_disconnect", "oil_burn_start", "oil_cut"],
  incident_oil: ["oil_burn_start", "oil_cut"],
};

const POWER_COLUMN_BY_POINT: Record<CtktktOperationKind, Partial<Record<CtktktOperationPoint, { S1: string; S2: string }>>> = {
  startup: { start: { S1: "C", S2: "G" }, grid_sync: { S1: "E", S2: "I" } },
  shutdown: { boiler_stop: { S1: "D", S2: "H" }, grid_disconnect: { S1: "F", S2: "J" } },
  incident_oil: {},
};

const OIL_LAYOUT: Record<CtktktOperationKind, Record<CtktktOperationUnit, {
  timeCells: Partial<Record<CtktktOperationPoint, string>>;
  feedRow: number;
  returnRow: number;
  columns: Partial<Record<CtktktOperationPoint, string>>;
  divisor: number;
}>> = {
  startup: {
    S1: { timeCells: { start: "C86", grid_sync: "D86", oil_cut: "E86" }, feedRow: 88, returnRow: 89, columns: { start: "C", grid_sync: "D", oil_cut: "E" }, divisor: 1 },
    S2: { timeCells: { start: "C92", grid_sync: "D92", oil_cut: "E92" }, feedRow: 94, returnRow: 95, columns: { start: "C", grid_sync: "D", oil_cut: "E" }, divisor: 1000 },
  },
  shutdown: {
    S1: { timeCells: { oil_burn_start: "C99", oil_cut: "D99" }, feedRow: 101, returnRow: 102, columns: { oil_burn_start: "C", oil_cut: "D" }, divisor: 1 },
    S2: { timeCells: { oil_burn_start: "C106", oil_cut: "D106" }, feedRow: 108, returnRow: 109, columns: { oil_burn_start: "C", oil_cut: "D" }, divisor: 1 },
  },
  incident_oil: {
    S1: { timeCells: { oil_burn_start: "G99", oil_cut: "H99" }, feedRow: 101, returnRow: 102, columns: { oil_burn_start: "G", oil_cut: "H" }, divisor: 1 },
    S2: { timeCells: { oil_burn_start: "G106", oil_cut: "H106" }, feedRow: 108, returnRow: 109, columns: { oil_burn_start: "G", oil_cut: "H" }, divisor: 1 },
  },
};

export const CTKTKT_OPERATION_POINT_LABELS: Record<CtktktOperationKind, Partial<Record<CtktktOperationPoint, string>>> = {
  startup: { start: "Khởi động", grid_sync: "Hòa lưới", oil_cut: "Cắt dầu kết thúc khởi động" },
  shutdown: { oil_burn_start: "Bắt đầu đốt dầu giảm tải", boiler_stop: "Ngừng đốt lò", grid_disconnect: "Tách lưới", oil_cut: "Cắt dầu" },
  incident_oil: { oil_burn_start: "Bắt đầu đốt dầu sự cố", oil_cut: "Cắt dầu" },
};

export const CTKTKT_OPERATION_ELECTRICAL_POINTS: Record<CtktktOperationKind, readonly CtktktOperationPoint[]> = {
  startup: ["start", "grid_sync"],
  shutdown: ["boiler_stop", "grid_disconnect"],
  incident_oil: [],
};

export const CTKTKT_OPERATION_OIL_POINTS: Record<CtktktOperationKind, readonly CtktktOperationPoint[]> = {
  startup: ["start", "grid_sync", "oil_cut"],
  shutdown: ["oil_burn_start", "oil_cut"],
  incident_oil: ["oil_burn_start", "oil_cut"],
};

export function ctktktOperationPowerColumn(event: CtktktOperationEvent, point: CtktktOperationPoint) {
  return POWER_COLUMN_BY_POINT[event.kind][point]?.[event.unit] || null;
}

export function ctktktOperationOilCells(event: CtktktOperationEvent) {
  const layout = OIL_LAYOUT[event.kind][event.unit];
  return CTKTKT_OPERATION_OIL_POINTS[event.kind].map(point => {
    const column = layout.columns[point];
    return {
      point,
      timeCell: layout.timeCells[point] || null,
      feedCell: column ? `${column}${layout.feedRow}` : null,
      returnCell: column ? `${column}${layout.returnRow}` : null,
    };
  }).filter(item => item.feedCell && item.returnCell);
}

export function isCtktktOperationPowerCell(cell: string) {
  return /^[C-J](?:61|62|63|65|66|67|69|70|71|72|74|75|76|77|79|80|81|82|83)$/.test(cell.toUpperCase());
}

export function ctktktOperationEventId(unit: CtktktOperationUnit, kind: CtktktOperationKind) {
  return `${unit}:${kind}`;
}

function blankPoint(): CtktktOperationReading {
  return { time: "", power: {}, oilFeed: "", oilReturn: "" };
}

export function createCtktktOperationEvent(unit: CtktktOperationUnit, kind: CtktktOperationKind): CtktktOperationEvent {
  return {
    unit,
    kind,
    points: Object.fromEntries(POINTS_BY_KIND[kind].map(point => [point, blankPoint()])),
  };
}

export function parseCtktktOperationEvents(raw: string | undefined): CtktktOperationEvent[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((event): event is CtktktOperationEvent =>
      !!event && typeof event === "object"
      && ((event as CtktktOperationEvent).unit === "S1" || (event as CtktktOperationEvent).unit === "S2")
      && Object.hasOwn(POINTS_BY_KIND, (event as CtktktOperationEvent).kind)
      && !!(event as CtktktOperationEvent).points,
    );
  } catch {
    return [];
  }
}

function cleanNumber(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const normalized = text.replace(/\s+/g, "").replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) throw new Error("Chỉ số công tơ sự kiện phải là số.");
  return normalized;
}

function validDateTime(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  if (!match) throw new Error("Thời điểm sự kiện phải có dạng ngày/giờ hợp lệ.");
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) {
    throw new Error("Ngày sự kiện không tồn tại.");
  }
  return text;
}

export function normalizeCtktktOperationEvents(raw: unknown) {
  let parsed: unknown;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
  } catch {
    throw new Error("Danh sách sự kiện không đúng định dạng.");
  }
  if (!Array.isArray(parsed) || parsed.length > 6) throw new Error("Danh sách sự kiện không hợp lệ.");
  const ids = new Set<string>();
  const allowedRows = new Set(CTKTKT_EVENT_POWER_ROWS.map(item => String(item.row)));
  const events = parsed.map((item): CtktktOperationEvent => {
    if (!item || typeof item !== "object") throw new Error("Một sự kiện không hợp lệ.");
    const source = item as Record<string, unknown>;
    const unit = source.unit;
    const kind = source.kind;
    if ((unit !== "S1" && unit !== "S2") || typeof kind !== "string" || !Object.hasOwn(POINTS_BY_KIND, kind)) {
      throw new Error("Tổ máy hoặc loại sự kiện không hợp lệ.");
    }
    const typedKind = kind as CtktktOperationKind;
    const id = ctktktOperationEventId(unit, typedKind);
    if (ids.has(id)) throw new Error("Mỗi tổ máy chỉ được có một sự kiện cùng loại trong ngày.");
    ids.add(id);
    if (!source.points || typeof source.points !== "object" || Array.isArray(source.points)) throw new Error("Thiếu các mốc của sự kiện.");
    const inputPoints = source.points as Record<string, unknown>;
    const points: CtktktOperationEvent["points"] = {};
    for (const point of POINTS_BY_KIND[typedKind]) {
      const rawPoint = inputPoints[point];
      if (rawPoint === undefined) continue;
      if (!rawPoint || typeof rawPoint !== "object" || Array.isArray(rawPoint)) throw new Error("Một mốc sự kiện không hợp lệ.");
      const value = rawPoint as Record<string, unknown>;
      const powerSource = value.power && typeof value.power === "object" && !Array.isArray(value.power)
        ? value.power as Record<string, unknown>
        : {};
      const power: Record<string, string> = {};
      for (const [row, reading] of Object.entries(powerSource)) {
        if (!allowedRows.has(row) || (row === "83" && !(typedKind === "startup" && point === "grid_sync"))) {
          throw new Error("Vị trí công tơ sự kiện không hợp lệ.");
        }
        power[row] = cleanNumber(reading);
      }
      points[point] = {
        time: validDateTime(value.time),
        power,
        oilFeed: cleanNumber(value.oilFeed),
        oilReturn: cleanNumber(value.oilReturn),
      };
    }
    for (const key of Object.keys(inputPoints)) {
      if (!POINTS_BY_KIND[typedKind].includes(key as CtktktOperationPoint)) throw new Error("Mốc sự kiện không đúng loại.");
    }
    return { unit, kind: typedKind, points };
  });
  return JSON.stringify(events);
}

function numeric(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const result = Number(String(value).replace(",", "."));
  return Number.isFinite(result) ? result : null;
}

function meterDelta(from: CtktktOperationReading | undefined, to: CtktktOperationReading | undefined, divisor: number) {
  const fromFeed = numeric(from?.oilFeed);
  const fromReturn = numeric(from?.oilReturn);
  const toFeed = numeric(to?.oilFeed);
  const toReturn = numeric(to?.oilReturn);
  if (fromFeed === null || fromReturn === null || toFeed === null || toReturn === null) return null;
  return ((toFeed - fromFeed) - (toReturn - fromReturn)) / divisor;
}

export function calculateCtktktOperationEventOil(event: CtktktOperationEvent) {
  const divisor = OIL_LAYOUT[event.kind][event.unit].divisor;
  if (event.kind === "startup") {
    const first = meterDelta(event.points.start, event.points.grid_sync, divisor);
    const second = meterDelta(event.points.grid_sync, event.points.oil_cut, divisor);
    const total = meterDelta(event.points.start, event.points.oil_cut, divisor);
    return { phases: [first, second], total };
  }
  return { phases: [meterDelta(event.points.oil_burn_start, event.points.oil_cut, divisor)], total: meterDelta(event.points.oil_burn_start, event.points.oil_cut, divisor) };
}

function legacyTime(date: string, value: string | undefined) {
  const time = value?.trim();
  if (!time) return "";
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? `${date}T${time}` : "";
}

export function legacyCtktktOperationEvents(row: Record<string, string>, operatingDate: string) {
  const unit = row["KTKT:STARTUP_UNIT"];
  const kind = row["KTKT:STARTUP_EVENT"];
  if ((unit !== "S1" && unit !== "S2") || (kind !== "startup" && kind !== "shutdown" && kind !== "incident_oil")) return [];
  const event = createCtktktOperationEvent(unit, kind);
  const setOil = (point: CtktktOperationPoint, time: string | undefined, column: string) => {
    event.points[point] = {
      time: legacyTime(operatingDate, time),
      power: {},
      oilFeed: row[`KTKT:${column}87`] || "",
      oilReturn: row[`KTKT:${column}88`] || "",
    };
  };
  if (kind === "startup") {
    setOil("start", row["KTKT:STARTUP_OIL_START_TIME"], "C");
    setOil("grid_sync", row["KTKT:STARTUP_GRID_SYNC_TIME"], "E");
    setOil("oil_cut", row["KTKT:STARTUP_MIN_LOAD_TIME"], "G");
  } else if (kind === "shutdown") {
    setOil("oil_burn_start", row["KTKT:STARTUP_OIL_START_TIME"], "C");
    setOil("grid_disconnect", row["KTKT:STARTUP_GRID_SYNC_TIME"], "F");
    setOil("oil_cut", row["KTKT:STARTUP_GRID_SYNC_TIME"], "F");
  } else {
    setOil("oil_burn_start", row["KTKT:STARTUP_OIL_START_TIME"], "C");
    setOil("oil_cut", row["KTKT:STARTUP_MIN_LOAD_TIME"], "D");
  }
  return [event];
}

function excelSerial(dateTime: string) {
  if (!dateTime) return null;
  const [date, time] = dateTime.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return (Date.UTC(year, month - 1, day, hour, minute) / 86_400_000) + 25_569;
}

function displayOperationTime(dateTime: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T([0-2]\d:[0-5]\d)$/.exec(dateTime);
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}` : dateTime;
}

function setFormula(sheet: ExcelJS.Worksheet, cellAddress: string, formula: string, result: number | null) {
  sheet.getCell(cellAddress).value = result === null ? { formula } : { formula, result };
}

function fill(sheet: ExcelJS.Worksheet, address: string, color: string) {
  sheet.getCell(address).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

function setLabel(sheet: ExcelJS.Worksheet, address: string, value: string, options: { fill?: string; bold?: boolean; align?: "left" | "center" } = {}) {
  const cell = sheet.getCell(address);
  cell.value = value;
  if (options.fill) fill(sheet, address, options.fill);
  cell.font = { ...cell.font, bold: options.bold ?? true, size: 9 };
  cell.alignment = { ...cell.alignment, horizontal: options.align || "left", vertical: "middle", wrapText: true };
}

function inputStyle(sheet: ExcelJS.Worksheet, address: string) {
  const cell = sheet.getCell(address);
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  cell.border = {
    top: { style: "thin", color: { argb: "FFD6D3D1" } },
    bottom: { style: "thin", color: { argb: "FFD6D3D1" } },
    left: { style: "thin", color: { argb: "FFD6D3D1" } },
    right: { style: "thin", color: { argb: "FFD6D3D1" } },
  };
  cell.alignment = { ...cell.alignment, horizontal: "right", vertical: "middle", wrapText: true };
}

export function applyCtktktOperationEventLayout(sheet: ExcelJS.Worksheet) {
  // Replace the legacy event area completely before populating the six source tables.
  for (const range of [...(sheet.model.merges || [])]) {
    const endpoints = range.split(":").map(address => sheet.getCell(address));
    if (endpoints.every(cell => Number(cell.row) >= 85 && Number(cell.row) <= 110 && Number(cell.col) >= 2 && Number(cell.col) <= 8)) sheet.unMergeCells(range);
  }
  for (let row = 85; row <= 110; row += 1) for (let column = 2; column <= 8; column += 1) {
    const cell = sheet.getRow(row).getCell(column);
    cell.value = null;
    cell.style = { font: { name: "Times New Roman", size: 9, color: { argb: "FF000000" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } } };
  }

  const eventHeaders = [
    "Khởi động S1", "Ngừng đốt lò S1", "Hòa lưới tổ máy S1", "Tách lưới tổ máy S1",
    "Khởi động S2", "Ngừng đốt lò S2", "Hòa lưới tổ máy S2", "Tách lưới tổ máy S2",
  ];
  setLabel(sheet, "B59", "CÔNG TƠ MÁY PHÁT, MBA", { fill: "FFFFFF00", align: "center" });
  eventHeaders.forEach((label, index) => {
    const column = String.fromCharCode(67 + index);
    setLabel(sheet, `${column}59`, label, { fill: "FFFFFF00", align: "center" });
  });
  const meterLabels: Record<number, string> = {
    60: "MBA T1/T2 (P giao)", 61: "     Biểu 1", 62: "     Biểu 2", 63: "     Biểu 3",
    64: "MBA T1/T2 (P nhận)", 65: "     Biểu 1", 66: "     Biểu 2", 67: "     Biểu 3",
    68: "MBA TD911/TD921", 69: "     Biểu 1", 70: "     Biểu 2", 71: "     Biểu 3", 72: "     Biểu 4",
    73: "MBA TD912/TD922", 74: "     Biểu 1", 75: "     Biểu 2", 76: "     Biểu 3", 77: "     Biểu 4",
    78: "Công tơ máy phát S1/S2 (P giao)", 79: "     Biểu 1", 80: "     Biểu 2", 81: "     Biểu 3", 82: "     Biểu 4",
    83: "Tổng tự dùng từ lúc khởi động đến hòa lưới",
  };
  for (const [rowText, label] of Object.entries(meterLabels)) {
    const row = Number(rowText);
    setLabel(sheet, `B${row}`, label, { fill: [60, 64, 68, 73, 78, 83].includes(row) ? "FF9BBB59" : undefined });
  }
  for (const column of ["C", "D", "E", "F", "G", "H", "I", "J"]) {
    for (const { row } of CTKTKT_EVENT_POWER_ROWS) {
      const cell = `${column}${row}`;
      sheet.getCell(cell).value = null;
      inputStyle(sheet, cell);
    }
  }

  const headers: Array<[string, string]> = [
    ["B85", "Khởi động tổ máy S1"], ["B91", "Khởi động tổ máy S2"],
    ["B98", "Ngừng tổ máy S1"], ["F98", "Đốt dầu sự cố S1"],
    ["B105", "Ngừng tổ máy S2"], ["F105", "Đốt dầu sự cố S2"],
  ];
  for (const [cell, label] of headers) setLabel(sheet, cell, label, { fill: "FF00B050" });
  const timeHeaders = ["B86", "C86", "D86", "E86", "B92", "C92", "D92", "E92", "B99", "C99", "D99", "F99", "G99", "H99", "B106", "C106", "D106", "F106", "G106", "H106"];
  for (const cell of timeHeaders) {
    const isPrompt = cell.startsWith("B") || cell.startsWith("F");
    setLabel(sheet, cell, isPrompt ? "Thời gian (h:m, dd/mm/yy)" : "", { fill: "FF00B0F0", align: "center" });
    if (!isPrompt) {
      sheet.getCell(cell).numFmt = "hh:mm, dd/mm/yy";
      inputStyle(sheet, cell);
    }
  }
  const subheaders: Array<[string, string]> = [
    ["B87", "CÔNG TƠ DẦU CỦA LÒ S1"], ["C87", "Bắt đầu đốt"], ["D87", "Hòa lưới"], ["E87", "Cắt dầu"],
    ["B93", "CÔNG TƠ DẦU CỦA LÒ S2"], ["C93", "Bắt đầu đốt"], ["D93", "Hòa lưới"], ["E93", "Cắt dầu"],
    ["B100", "CÔNG TƠ DẦU CỦA LÒ S1"], ["C100", "Bắt đầu đốt"], ["D100", "Cắt dầu"],
    ["F100", "CÔNG TƠ DẦU CỦA LÒ S1"], ["G100", "Bắt đầu đốt"], ["H100", "Cắt dầu"],
    ["B107", "CÔNG TƠ DẦU CỦA LÒ S2"], ["C107", "Bắt đầu đốt"], ["D107", "Cắt dầu"],
    ["F107", "CÔNG TƠ DẦU CỦA LÒ S2"], ["G107", "Bắt đầu đốt"], ["H107", "Cắt dầu"],
  ];
  for (const [cell, label] of subheaders) setLabel(sheet, cell, label, { fill: "FFFFFF00", align: cell.startsWith("B") || cell.startsWith("F") ? "left" : "center" });
  const oilLabels: Array<[string, string]> = [
    ["B88", "Công tơ dầu cấp lò S1 (tấn)"], ["B89", "Công tơ dầu hồi lò S1 (tấn)"], ["B90", "Lượng dầu tiêu thụ (tấn)"],
    ["B94", "Công tơ dầu cấp lò S2 (tấn)"], ["B95", "Công tơ dầu hồi lò S2 (tấn)"], ["B96", "Lượng dầu tiêu thụ (tấn)"],
    ["B101", "Công tơ dầu cấp lò S1 (tấn)"], ["B102", "Công tơ dầu hồi lò S1 (tấn)"], ["B103", "Lượng dầu tiêu thụ (tấn)"],
    ["F101", "Công tơ dầu cấp lò S1 (tấn)"], ["F102", "Công tơ dầu hồi lò S1 (tấn)"], ["F103", "Lượng dầu tiêu thụ (tấn)"],
    ["B108", "Công tơ dầu cấp lò S2 (tấn)"], ["B109", "Công tơ dầu hồi lò S2 (tấn)"], ["B110", "Lượng dầu tiêu thụ (tấn)"],
    ["F108", "Công tơ dầu cấp lò S2 (tấn)"], ["F109", "Công tơ dầu hồi lò S2 (tấn)"], ["F110", "Lượng dầu tiêu thụ (tấn)"],
  ];
  for (const [cell, label] of oilLabels) setLabel(sheet, cell, label, { fill: "FF9BBB59" });

  for (const range of ["B85:E85", "B91:E91", "B98:D98", "F98:H98", "B105:D105", "F105:H105", "C103:D103", "G103:H103", "C110:D110", "G110:H110"]) {
    if (!sheet.getCell(range.split(":")[0]).isMerged) sheet.mergeCells(range);
  }
  for (const [row, columns] of [[88, ["C", "D", "E"]], [89, ["C", "D", "E"]], [94, ["C", "D", "E"]], [95, ["C", "D", "E"]], [101, ["C", "D", "G", "H"]], [102, ["C", "D", "G", "H"]], [108, ["C", "D", "G", "H"]], [109, ["C", "D", "G", "H"]]] as const) {
    for (const column of columns) {
      const address = `${column}${row}`;
      sheet.getCell(address).value = null;
      inputStyle(sheet, address);
    }
  }
  for (const cell of ["D90", "E90", "F90", "D96", "E96", "F96", "C103", "G103", "C110", "G110"]) sheet.getCell(cell).value = null;
  for (const [cell, formula] of [
    ["D90", "(D88-C88)-(D89-C89)"], ["E90", "(E88-D88)-(E89-D89)"], ["F90", "(E88-C88)-(E89-C89)"],
    ["D96", "((D94-C94)-(D95-C95))/1000"], ["E96", "((E94-D94)-(E95-D95))/1000"], ["F96", "((E94-C94)-(E95-C95))/1000"],
    ["C103", "(D101-C101)-(D102-C102)"], ["G103", "(H101-G101)-(H102-G102)"],
    ["C110", "(D108-C108)-(D109-C109)"], ["G110", "(H108-G108)-(H109-G109)"],
  ] as const) setFormula(sheet, cell, formula, null);
  setLabel(sheet, "F89", "Tổng dầu khởi động", { fill: "FF00B0F0", bold: false });
  setLabel(sheet, "F95", "Tổng dầu khởi động", { fill: "FF00B0F0", bold: false });
  for (const [top, bottom, left, right] of [[85, 90, 2, 5], [91, 96, 2, 5], [98, 103, 2, 4], [98, 103, 6, 8], [105, 110, 2, 4], [105, 110, 6, 8], [89, 90, 6, 6], [95, 96, 6, 6]]) {
    for (let row = top; row <= bottom; row += 1) for (let column = left; column <= right; column += 1) {
      const cell = sheet.getRow(row).getCell(column);
      cell.border = Object.fromEntries(["top", "bottom", "left", "right"].map(side => [side, { style: "thin", color: { argb: "FF000000" } }]));
      cell.font = { ...cell.font, bold: false, color: { argb: "FF000000" } };
      cell.alignment = { ...cell.alignment, horizontal: column === left ? "left" : "center", vertical: "middle", wrapText: true };
    }
  }
  // Source uses yellow only for the oil-meter label, white for the phase labels.
  for (const address of ["C87", "D87", "E87", "C93", "D93", "E93", "C100", "D100", "G100", "H100", "C107", "D107", "G107", "H107"]) fill(sheet, address, "FFFFFFFF");
  for (const address of timeHeaders) fill(sheet, address, "FF00B0F0");
  for (const [cell] of headers) sheet.getCell(cell).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  for (const row of [86, 92, 99, 100, 106, 107, 108, 109, 110]) sheet.getRow(row).height = Math.max(sheet.getRow(row).height || 0, 30);
}

function setTime(sheet: ExcelJS.Worksheet, cellAddress: string, value: CtktktOperationReading | undefined) {
  const cell = sheet.getCell(cellAddress);
  const serial = excelSerial(value?.time || "");
  cell.value = serial;
  cell.numFmt = "hh:mm, dd/mm/yy";
  cell.alignment = { ...cell.alignment, horizontal: "center", vertical: "middle", wrapText: true };
}

function setMeter(sheet: ExcelJS.Worksheet, cellAddress: string, value: unknown) {
  const cell = sheet.getCell(cellAddress);
  cell.value = numeric(value);
}

function writeOilEvent(sheet: ExcelJS.Worksheet, event: CtktktOperationEvent) {
  const layout = OIL_LAYOUT[event.kind][event.unit];
  const orderedPoints = POINTS_BY_KIND[event.kind].filter(point => layout.columns[point]);
  for (const point of orderedPoints) {
    const column = layout.columns[point]!;
    const input = event.points[point];
    const timeCell = layout.timeCells[point];
    if (timeCell) setTime(sheet, timeCell, input);
    setMeter(sheet, `${column}${layout.feedRow}`, input?.oilFeed);
    setMeter(sheet, `${column}${layout.returnRow}`, input?.oilReturn);
  }

  const oil = calculateCtktktOperationEventOil(event);
  if (event.kind === "startup") {
    const row = event.unit === "S1" ? 90 : 96;
    setFormula(sheet, `D${row}`, event.unit === "S1" ? "(D88-C88)-(D89-C89)" : "((D94-C94)-(D95-C95))/1000", oil.phases[0]);
    setFormula(sheet, `E${row}`, event.unit === "S1" ? "(E88-D88)-(E89-D89)" : "((E94-D94)-(E95-D95))/1000", oil.phases[1]);
    setFormula(sheet, `F${row}`, event.unit === "S1" ? "(E88-C88)-(E89-C89)" : "((E94-C94)-(E95-C95))/1000", oil.total);
  } else if (event.kind === "shutdown") {
    const row = event.unit === "S1" ? 103 : 110;
    const col = event.unit === "S1" ? "C" : "C";
    const feedRow = layout.feedRow;
    const returnRow = layout.returnRow;
    const startColumn = layout.columns.oil_burn_start!;
    const endColumn = layout.columns.oil_cut!;
    setFormula(sheet, `${col}${row}`, `(${endColumn}${feedRow}-${startColumn}${feedRow})-(${endColumn}${returnRow}-${startColumn}${returnRow})`, oil.total);
  } else {
    const row = event.unit === "S1" ? 103 : 110;
    const feedRow = layout.feedRow;
    const returnRow = layout.returnRow;
    const startColumn = layout.columns.oil_burn_start!;
    const endColumn = layout.columns.oil_cut!;
    setFormula(sheet, `G${row}`, `(${endColumn}${feedRow}-${startColumn}${feedRow})-(${endColumn}${returnRow}-${startColumn}${returnRow})`, oil.total);
  }
}

export function applyCtktktOperationEvents(sheet: ExcelJS.Worksheet, raw: string | CtktktOperationEvent[] | undefined) {
  const events = Array.isArray(raw) ? raw : parseCtktktOperationEvents(raw);
  const eventColumns = ["C", "D", "E", "F", "G", "H", "I", "J"];
  for (const column of eventColumns) {
    for (const { row } of CTKTKT_EVENT_POWER_ROWS) setMeter(sheet, `${column}${row}`, null);
  }

  for (const event of events) {
    const powerColumns = POWER_COLUMN_BY_POINT[event.kind];
    for (const [pointName, unitColumns] of Object.entries(powerColumns)) {
      const point = pointName as CtktktOperationPoint;
      const column = unitColumns?.[event.unit];
      const reading = event.points[point];
      if (!column || !reading) continue;
      for (const { row } of CTKTKT_EVENT_POWER_ROWS) {
        if (row === 83 && !(event.kind === "startup" && point === "grid_sync")) continue;
        setMeter(sheet, `${column}${row}`, reading.power[String(row)]);
      }
      const header = sheet.getCell(`${column}59`);
      const time = reading.time ? `\n${displayOperationTime(reading.time)}` : "";
      header.value = `${CTKTKT_OPERATION_POINT_LABELS[event.kind][point] || "Sự kiện"} ${event.unit}${time}`;
      header.alignment = { ...header.alignment, horizontal: "center", vertical: "middle", wrapText: true };
      const rowNumber = Number(/\d+$/.exec(header.address)?.[0] || 59);
      const headerRow = sheet.getRow(rowNumber);
      if (reading.time && (!headerRow.height || headerRow.height < 30)) headerRow.height = 30;
    }
    writeOilEvent(sheet, event);
  }

  const eventKinds = new Set(events.map(event => `${event.unit}:${event.kind}`));
  // Keep original formulas active even if an event was deleted from the web form.
  if (sheet.name.match(/^\d{2}$/)) {
    for (const [cell, formula] of [
      ["D90", "(D88-C88)-(D89-C89)"], ["E90", "(E88-D88)-(E89-D89)"], ["F90", "(E88-C88)-(E89-C89)"],
      ["D96", "((D94-C94)-(D95-C95))/1000"], ["E96", "((E94-D94)-(E95-D95))/1000"], ["F96", "((E94-C94)-(E95-C95))/1000"],
    ] as const) if (!sheet.getCell(cell).formula) setFormula(sheet, cell, formula, null);
    if (!eventKinds.has("S1:shutdown") && !sheet.getCell("C103").formula) setFormula(sheet, "C103", "(D101-C101)-(D102-C102)", null);
    if (!eventKinds.has("S2:shutdown") && !sheet.getCell("C110").formula) setFormula(sheet, "C110", "(D108-C108)-(D109-C109)", null);
    if (!eventKinds.has("S1:incident_oil") && !sheet.getCell("G103").formula) setFormula(sheet, "G103", "(H101-G101)-(H102-G102)", null);
    if (!eventKinds.has("S2:incident_oil") && !sheet.getCell("G110").formula) setFormula(sheet, "G110", "(H108-G108)-(H109-G109)", null);
  }
}
