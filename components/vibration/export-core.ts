/** Tiện ích xuất dùng chung cho 4 màn nhập độ rung (chuyển từ daily-export.js / mill-shift-report.js của VibraControl cũ).
 *  Excel viết tay (XLSX = ZIP không nén) để cho đúng bố cục bản cũ, không cần thư viện. */

export const enc = new TextEncoder();

/** Thoát ký tự XML và bỏ ký tự điều khiển. */
export const xmlEsc = (v: unknown) =>
  String(v ?? "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string);

/** Thoát ký tự HTML (dùng cho bản in PDF). */
export const htmlEsc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export const colLetter = (n: number) => {
  let s = "";
  for (; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

export const displayDate = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("/") : d || "");

/** Số của Excel (ô số thật) hoặc null nếu không phải số không âm. */
export const excelNumber = (v: unknown) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) && Number.isFinite(+s) ? +s : null;
};

export const dateSerial = (s: string) => {
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) ? t / 86400000 + 25569 : null;
};

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc = (data: Uint8Array) => {
  let n = 0xffffffff;
  for (const b of data) n = crcTable[(n ^ b) & 255] ^ (n >>> 8);
  return (n ^ 0xffffffff) >>> 0;
};
const u16 = (b: Uint8Array, o: number, n: number) => {
  b[o] = n & 255;
  b[o + 1] = (n >>> 8) & 255;
};
const u32 = (b: Uint8Array, o: number, n: number) => {
  u16(b, o, n);
  u16(b, o + 2, n >>> 16);
};

/** Gói các tệp XML thành .xlsx (ZIP kiểu "store"). */
export function zipFiles(files: Record<string, string>): Blob {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const filename = enc.encode(name);
    const body = enc.encode(content);
    const sum = crc(body);
    const head = new Uint8Array(30 + filename.length);
    const dir = new Uint8Array(46 + filename.length);
    u32(head, 0, 0x04034b50); u16(head, 4, 20); u16(head, 6, 0x800); u32(head, 14, sum);
    u32(head, 18, body.length); u32(head, 22, body.length); u16(head, 26, filename.length); head.set(filename, 30);
    local.push(head, body);
    u32(dir, 0, 0x02014b50); u16(dir, 4, 20); u16(dir, 6, 20); u16(dir, 8, 0x800); u32(dir, 16, sum);
    u32(dir, 20, body.length); u32(dir, 24, body.length); u16(dir, 28, filename.length); u32(dir, 42, offset); dir.set(filename, 46);
    central.push(dir);
    offset += head.length + body.length;
  }
  const csize = central.reduce((n, x) => n + x.length, 0);
  const end = new Uint8Array(22);
  const count = Object.keys(files).length;
  u32(end, 0, 0x06054b50); u16(end, 8, count); u16(end, 10, count); u32(end, 12, csize); u32(end, 16, offset);
  return new Blob([...local, ...central, end] as BlobPart[], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Tên sheet Excel hợp lệ (≤ 31 ký tự, bỏ \ / ? * [ ] :). */
export const sheetName = (s: string) => s.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";

/** Phần thân chung của một workbook: [Content_Types], rels, workbook, styles + sheet XML. */
export function buildWorkbookFiles(names: string[], styles: string, sheetXmls: string[], xmlDecl = true): Record<string, string> {
  const decl = xmlDecl ? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' : "";
  const files: Record<string, string> = {
    "[Content_Types].xml": `${decl}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `${decl}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": styles,
  };
  sheetXmls.forEach((x, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = x));
  return files;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|\x00-\x1f]/g, "-").trim();

export function downloadJson(data: unknown, name: string) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), name);
}

/** Mở bản in trong cửa sổ mới (người dùng chọn "Lưu dưới dạng PDF"). Ném lỗi tiếng Việt khi bị chặn pop-up. */
export function openPrintWindow(html: string, delay = 350) {
  const w = window.open("", "_blank");
  if (!w) throw new Error("Trình duyệt đang chặn cửa sổ mới. Cho phép pop-up để in hoặc lưu PDF.");
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), delay);
}

/** Ghi ảnh PNG vào clipboard; bị chặn thì tải về. Trả "copied" hoặc "downloaded". */
export async function copyCanvasPng(canvas: HTMLCanvasElement, fallbackName: string): Promise<"copied" | "downloaded"> {
  const blob = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("Không tạo được ảnh."))), "image/png"));
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("no clipboard");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return "copied";
  } catch {
    downloadBlob(blob, fallbackName);
    return "downloaded";
  }
}

/** Ngắt dòng văn bản theo bề rộng (canvas). */
export function wrapText(ctx: CanvasRenderingContext2D, text: unknown, w: number): string[] {
  const out: string[] = [];
  for (const para of String(text ?? "").split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > w && line) {
        out.push(line);
        line = word;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}
