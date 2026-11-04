export function normalizeSpreadsheetValue(raw: string) {
  const text = raw.trim().replace(/[\u00a0\u202f\s]+/g, "");
  if (!text || text === "-" || text === "–" || text === "—") return "";
  if (!/^[+-]?[\d.,]+$/.test(text)) return raw.trim();

  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    return comma > dot
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  }
  if (comma >= 0) {
    const parts = text.split(",");
    return parts.length === 2 ? `${parts[0]}.${parts[1]}` : text.replace(/,/g, "");
  }
  if ((text.match(/\./g) || []).length > 1) return text.replace(/\./g, "");
  return text;
}

export function parseSpreadsheetClipboard(text: string) {
  const rows = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  if (rows.at(-1) === "") rows.pop();

  let matrix = rows.map(line => line.split("\t"));
  const hasLeadingLabel = matrix.length > 0 && matrix.every(row => {
    if (row.length < 2) return false;
    const first = normalizeSpreadsheetValue(row[0]);
    const second = normalizeSpreadsheetValue(row[1]);
    return first !== "" && !Number.isFinite(Number(first)) && second !== "" && Number.isFinite(Number(second));
  });
  if (hasLeadingLabel) matrix = matrix.map(row => row.slice(1));
  return matrix.map(row => row.map(normalizeSpreadsheetValue));
}

export type SpreadsheetCellPosition<T> = {
  item: T;
  top: number;
  left: number;
};

/** Gom các ô theo vị trí hiển thị để mọi bảng/card đều điều hướng như Excel. */
export function groupSpreadsheetCells<T>(cells: SpreadsheetCellPosition<T>[], rowTolerance = 8) {
  const rows: Array<Array<SpreadsheetCellPosition<T>>> = [];
  for (const cell of [...cells].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const row = rows.find(candidate => Math.abs(candidate[0].top - cell.top) <= rowTolerance);
    if (row) row.push(cell);
    else rows.push([cell]);
  }
  return rows
    .sort((a, b) => a[0].top - b[0].top)
    .map(row => row.sort((a, b) => a.left - b.left));
}
