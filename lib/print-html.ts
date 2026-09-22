import { readFile } from "node:fs/promises";
import path from "node:path";

export const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

export async function loadPrintTemplate(name: string) {
  if (!/^[a-z0-9-]+\.html$/.test(name)) throw new Error("Tên mẫu HTML không hợp lệ");
  return readFile(path.join(process.cwd(), "templates", "html", name), "utf8");
}

export function plainHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** The Word exporter replaces the first paragraph beginning with the same heading. */
export function replacePrintParagraph(html: string, startsWith: string, value: string) {
  let found = false;
  const result = html.replace(/<p\b[^>]*>[\s\S]*?<\/p>/g, (paragraph) => {
    if (found || !plainHtml(paragraph).startsWith(startsWith.replace(/\s+/g, " "))) return paragraph;
    found = true;
    const opening = paragraph.match(/^<p\b[^>]*>/)?.[0] ?? "<p>";
    return `${opening}${escapeHtml(value).replace(/\r?\n/g, "<br>")}</p>`;
  });
  if (!found) throw new Error(`Mẫu HTML thiếu đoạn ${startsWith}`);
  return result;
}

export function fillPrintTable(html: string, header: string, values: string[][]) {
  let found = 0;
  const result = html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/g, (table) => {
    const rows = [...table.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)];
    if (!rows.length || !plainHtml(rows[0][0]).includes(header)) return table;
    found++;
    if (rows.length < 2) throw new Error(`Mẫu HTML thiếu dòng bảng ${header}`);
    const template = rows[1][0].replace(/ style="height:[^"]*"/g, "");
    const repeated = values.map((value, index) => {
      let cellIndex = 0;
      const row = template.replace(/<(td|th)\b([^>]*)>[\s\S]*?<\/\1>/g, (_cell, tag: string, attrs: string) => {
        const content = [String(index + 1), ...value][cellIndex++] ?? "";
        return `<${tag}${attrs}><p>${escapeHtml(content).replace(/\r?\n/g, "<br>")}</p></${tag}>`;
      });
      if (cellIndex !== value.length + 1) throw new Error(`Số cột bảng ${header} không khớp`);
      return row;
    }).join("");
    const first = rows[0];
    const last = rows[rows.length - 1];
    return table.slice(0, first.index! + first[0].length) + repeated + table.slice(last.index! + last[0].length);
  });
  if (found !== 1) throw new Error(`Mẫu HTML không có đúng một bảng ${header}`);
  return result;
}

export function assertPrintFilled(html: string) {
  const tags = [...html.matchAll(/\{\{[^{}]+\}\}/g)].map((match) => match[0]);
  if (tags.length) throw new Error(`Mẫu HTML còn thẻ chưa điền: ${[...new Set(tags)].join(", ")}`);
  return html;
}

export function printHtmlResponse(html: string, fileBase: string) {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${fileBase.replace(/[^a-zA-Z0-9_-]/g, "_")}.html"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
    },
  });
}
