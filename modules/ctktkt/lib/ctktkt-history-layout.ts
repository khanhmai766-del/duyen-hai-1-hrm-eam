import type * as XLSX from "xlsx";

function normalizedLabel(value: unknown) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replaceAll("đ", "d").replace(/\s+/g, " ").trim();
}

/** Match HFO tank labels rather than assuming historical files use today's row numbers. */
export function ctktktHistoryHfoCellMap(sheet: XLSX.WorkSheet) {
  const levels = new Map<number, number>();
  const temperatures = new Map<number, number>();
  for (let row = 40; row <= 85; row += 1) {
    const label = normalizedLabel(sheet[`L${row}`]?.v);
    const level = /^muc bon (?:dau )?hfo\s*([1-5])\b/.exec(label);
    const temperature = /^bon (?:dau )?hfo\s*([1-5])\b/.exec(label);
    const match = level || temperature;
    if (!match) continue;
    const rows = level ? levels : temperatures;
    const tank = Number(match[1]);
    if (rows.has(tank)) throw new Error(`Bảng HFO có nhiều dòng cùng nhãn bồn ${tank}; chưa thể xác định đúng ô số liệu.`);
    rows.set(tank, row);
  }
  const map = new Map<string, string | null>();
  for (const [rows, start] of [[levels, 52], [temperatures, 60]] as const) {
    if (!rows.size) continue;
    for (let tank = 1; tank <= 5; tank += 1) for (const column of ["M", "N", "O", "P", "Q", "R"]) {
      const sourceRow = rows.get(tank);
      map.set(`${column}${start + tank - 1}`, sourceRow ? `${column}${sourceRow}` : null);
    }
  }
  return map;
}

/** Older files enter one set of 6A10 moisture/Qk readings for both units. */
export function ctktktHistoryCoalQualityCellMap(sheet: XLSX.WorkSheet) {
  const map = new Map<string, string | null>();
  for (let row = 75; row <= 95; row += 1) {
    const moistureHeader = normalizedLabel(sheet[`AJ${row}`]?.v);
    const dryHeatHeader = normalizedLabel(sheet[`AL${row}`]?.v);
    if (!/(wtp|am toan phan)/.test(moistureHeader) || !/(qk|nhiet tri kho)/.test(dryHeatHeader)) continue;
    // Require the actual three-shift labels; never infer a shift from a numeric cell.
    const shifts = ["0h-08h", "08h-16h", "16h-24h"];
    if (!shifts.every((shift, index) => normalizedLabel(sheet[`AF${row + 1 + index}`]?.v).replaceAll(" ", "") === shift)) continue;
    if (map.size) throw new Error("File có nhiều bảng độ ẩm/nhiệt trị dùng chung; chưa thể xác định đúng ô nhập.");
    for (let shift = 0; shift < 3; shift += 1) for (const start of [87, 90]) {
      map.set(`AJ${start + shift}`, `AJ${row + 1 + shift}`);
      map.set(`AK${start + shift}`, `AL${row + 1 + shift}`);
    }
  }
  return map;
}

export function ctktktHistorySourceCellMap(sheet: XLSX.WorkSheet) {
  return new Map([...ctktktHistoryHfoCellMap(sheet), ...ctktktHistoryCoalQualityCellMap(sheet)]);
}
