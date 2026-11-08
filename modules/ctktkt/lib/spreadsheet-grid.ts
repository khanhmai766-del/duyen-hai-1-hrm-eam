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

const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function htmlAttribute(attributes: string, name: string) {
  const pattern = new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?`, "i");
  const match = attributes.match(pattern);
  if (!match) return undefined;
  return decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? "");
}

/**
 * Giá trị gốc của từng ô trong clipboard HTML (Excel: x:num, Google Sheets: data-sheets-value).
 * Clipboard văn bản chỉ chứa số đang hiển thị (vd. ô định dạng 1 chữ số thập phân), nên
 * cần lấy giá trị gốc để số dán vào web đúng bằng số trong bảng tính.
 */
function parseClipboardHtmlNumbers(html: string) {
  const rows: Array<Array<number | null>> = [];
  const tableStart = html.search(/<table[\s>]/i);
  if (tableStart < 0) return rows;
  const body = html.slice(tableStart);
  for (const rowMatch of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row: Array<number | null> = [];
    for (const cellMatch of rowMatch[1].matchAll(/<t[dh]\b([^>]*)>/gi)) {
      const attributes = cellMatch[1];
      let value: number | null = null;
      const excelNumber = htmlAttribute(attributes, "x:num");
      if (excelNumber) {
        const parsed = Number(excelNumber);
        if (Number.isFinite(parsed)) value = parsed;
      }
      if (value === null) {
        const sheetsValue = htmlAttribute(attributes, "data-sheets-value");
        if (sheetsValue) {
          try {
            const parsed = JSON.parse(sheetsValue) as Record<string, unknown>;
            if (typeof parsed["3"] === "number" && Number.isFinite(parsed["3"])) value = parsed["3"];
          } catch {
            value = null;
          }
        }
      }
      const span = Math.max(1, Math.min(50, Number(htmlAttribute(attributes, "colspan")) || 1));
      row.push(value);
      for (let extra = 1; extra < span; extra += 1) row.push(null);
    }
    rows.push(row);
  }
  return rows;
}

function cleanNumberString(value: number) {
  return String(Number(value.toPrecision(12)));
}

/** Chỉ thay bằng giá trị gốc khi số hiển thị đúng là bản làm tròn của giá trị đó. */
function preciseCellValue(raw: string, precise: number | null) {
  if (precise === null) return raw;
  const trimmed = raw.trim().replace(/[\u00a0\u202f\s]+/g, "");
  const isPercent = trimmed.endsWith("%");
  const text = isPercent ? trimmed.slice(0, -1) : trimmed;
  const original = isPercent ? precise * 100 : precise;
  // Thử cả cách đọc mặc định lẫn dấu chấm phân cách hàng nghìn kiểu Việt Nam (4.012 = 4012).
  const candidates = [normalizeSpreadsheetValue(text), text.replace(/\./g, "").replace(",", ".")];
  const matches = candidates.some(shown => {
    if (!/^[+-]?\d*\.?\d+$/.test(shown)) return false;
    const decimals = shown.includes(".") ? shown.length - shown.indexOf(".") - 1 : 0;
    const tolerance = 0.5 * 10 ** -decimals + Math.abs(original) * 1e-12;
    return Math.abs(original - Number(shown)) <= tolerance;
  });
  return matches ? cleanNumberString(original) : raw;
}

export function parseSpreadsheetClipboard(text: string, html = "") {
  const rows = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  if (rows.at(-1) === "") rows.pop();

  let matrix = rows.map(line => line.split("\t"));
  if (html) {
    const precise = parseClipboardHtmlNumbers(html);
    const sameShape = precise.length === matrix.length && precise.every((row, index) => row.length === matrix[index].length);
    if (sameShape) matrix = matrix.map((row, r) => row.map((cell, c) => preciseCellValue(cell, precise[r][c])));
  }
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
