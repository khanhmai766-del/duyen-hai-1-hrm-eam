import fs from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import type { WorkPermit } from "@prisma/client";
import { formatPermitNumber, PERMIT_DISCIPLINES } from "@/lib/work-permits";
import { safetyPrintData, type SafetySelection } from "@/lib/work-permit-safety";

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
function plain(xml: string) { return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join(""); }
function paragraph(text: string, properties = "") {
  return `<w:p>${properties}<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/></w:rPr>${text.split("\n").map((line, i) => `${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${escape(line)}</w:t>`).join("")}</w:r></w:p>`;
}
/** Clone the original row's cell geometry, permitting long safety text to wrap. */
function fillRow(template: string, values: string[]) {
  let index = 0;
  const row = template.replace(/<w:trHeight\b[^>]*\/>/g, "").replace(/<w:tblHeader\b[^>]*\/>/g, "");
  const result = row.replace(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g, cell => {
    const properties = cell.match(/<w:tcPr\b[^>]*>[\s\S]*?<\/w:tcPr>/)?.[0] ?? "";
    return `<w:tc>${properties}${paragraph(values[index++] ?? "")}</w:tc>`;
  });
  if (index !== values.length) throw new Error("Số cột của mẫu PCT không khớp. Vui lòng kiểm tra lại mẫu.");
  return result;
}
function fillTable(xml: string, header: string, values: string[][]) {
  let matches = 0;
  const result = xml.replace(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g, table => {
    const rows = table.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g);
    if (!rows || !plain(rows[0]).includes(header)) return table;
    matches++;
    if (!rows[1]) throw new Error("Mẫu PCT thiếu dòng bảng an toàn");
    const first = table.indexOf(rows[0]), last = table.lastIndexOf(rows[rows.length - 1]) + rows[rows.length - 1].length;
    const count = Math.max(values.length, rows.length - 1);
    const cols = [...rows[1].matchAll(/<w:tc\b/g)].length;
    const headerRow = rows[0].includes("w:tblHeader") ? rows[0] : (rows[0].includes("</w:trPr>") ? rows[0].replace("</w:trPr>", "<w:tblHeader/></w:trPr>") : rows[0].replace(/(<w:tr\b[^>]*>)/, "$1<w:trPr><w:tblHeader/></w:trPr>"));
    return table.slice(0, first) + headerRow + Array.from({ length: count }, (_, i) => fillRow(rows[1], values[i] ?? [String(i + 1), ...Array(cols - 1).fill("")])).join("") + table.slice(last);
  });
  if (matches !== 1) throw new Error(`Không xác định được bảng ${header} trong mẫu PCT`);
  return result;
}
function replaceParagraph(xml: string, startsWith: string, value: string) {
  let done = false;
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, p => {
    if (done || !plain(p).trim().startsWith(startsWith)) return p;
    done = true;
    return paragraph(value, p.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/)?.[0] ?? "");
  });
}
function appendix(rows: SafetySelection[], number: string) {
  const grouped = safetyPrintData(rows);
  const cell = (text: string, width: number) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${paragraph(text)}</w:tc>`;
  const header = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell("STT", 600)}${cell("Biện pháp an toàn", 6400)}${cell("Đơn vị thực hiện", 2000)}</w:tr>`;
  const measures = [...new Set([...grouped.authorization, ...grouped.execution])];
  return paragraph(`PHỤ LỤC PHÂN CÔNG BIỆN PHÁP AN TOÀN\nKèm PCT số ${number}`, '<w:pPr><w:pageBreakBefore/></w:pPr>') + paragraph("Biện pháp dự kiến do người cấp phiếu phân công; kiểm tra thực hiện và ký xác nhận trên phiếu chính.") + `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="600"/><w:gridCol w:w="6400"/><w:gridCol w:w="2000"/></w:tblGrid>${header}${measures.map((measure, i) => `<w:tr>${cell(String(i + 1), 600)}${cell(measure, 6400)}${cell([grouped.authorization.includes(measure) && "Đơn vị cho phép", grouped.execution.includes(measure) && "Đơn vị công tác"].filter(Boolean).join("\n"), 2000)}</w:tr>`).join("")}</w:tbl>`;
}

function plannedTime(date: Date | null) {
  if (!date) return "…… giờ …… ngày ……/……/………";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("hour")} giờ ${get("minute")} ngày ${get("day")}/${get("month")}/${get("year")}`;
}

export async function createWorkPermitDocument(row: WorkPermit) {
  const mechanical = row.kind === "MECHANICAL";
  const zip = new PizZip(await fs.readFile(path.join(process.cwd(), "templates", mechanical ? "work-permit-mechanical.docx" : "work-permit-electrical.docx")));
  let xml = zip.file("word/document.xml")!.asText();
  const selected = (Array.isArray(row.safetyItems) ? row.safetyItems : []) as unknown as SafetySelection[];
  const groups = safetyPrintData(selected), number = formatPermitNumber(row);
  xml = replaceParagraph(xml, "Số:", `Số: ${number}`);
  if (mechanical) {
    xml = fillTable(xml, "Nhận diện mối nguy", groups.hazards.map((r, i) => [String(i + 1), r.hazard, r.measure]));
    xml = fillTable(xml, "Kiểm tra các biện pháp an toàn đơn vị cho phép", groups.authorization.map((s, i) => [String(i + 1), s, "", ""]));
    xml = fillTable(xml, "Kiểm tra các biện pháp an toàn đơn vị công tác", groups.execution.map((s, i) => [String(i + 1), s, "", ""]));
    xml = replaceParagraph(xml, "Địa điểm:", `Địa điểm: ${row.location}`);
    xml = replaceParagraph(xml, "Nội dung:", `Nội dung: ${row.content}`);
    xml = replaceParagraph(xml, "Số ĐK:", row.registrationNumber.trim() ? `Số ĐK: ${row.registrationNumber.trim()}` : "");
    xml = replaceParagraph(xml, "Phạm vi:", `Phạm vi: ${row.workScope || "……………………………………………………"}`);
    xml = replaceParagraph(xml, "[  ] Thủy", Object.entries(PERMIT_DISCIPLINES).map(([key, label]) => `[${row.disciplines.includes(key) ? "X" : "  "}] ${label}`).join("        "));
    xml = replaceParagraph(xml, "Thời gian:", `Thời gian: Từ ${plannedTime(row.plannedStartAt)} đến ${plannedTime(row.plannedEndAt)}`);
    const issue = row.issuedAt ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(row.issuedAt) : "…………………";
    xml = replaceParagraph(xml, "Người cấp phiếu:", `Người cấp phiếu: ${row.issuerName}       Chữ ký: ……………       Ngày giờ cấp: ${issue}`);
    xml = replaceParagraph(xml, "Người CHTT:", `Người CHTT: ${row.commanderName}       Chữ ký: …………… Ngày ……/……/……… Giờ …………`);
    xml = replaceParagraph(xml, "Đơn vị công tác:", `Đơn vị công tác: ${row.teamName}       Số lượng người: ${row.workerCount ?? "………"}`);
  } else {
    xml = fillTable(xml, "Cảnh báo mối nguy hiểm", groups.hazards.map((r, i) => [String(i + 1), r.hazard, r.measure, ""]));
    xml = replaceParagraph(xml, "1.1.", `1.1. Người lãnh đạo công việc (nếu có): ${row.leaderName}`);
    xml = replaceParagraph(xml, "1.2.", `1.2. Người chỉ huy trực tiếp: ${row.commanderName}`);
    xml = replaceParagraph(xml, "1.3.", `1.3. Nhân viên đơn vị công tác: ${row.workerCount ?? "………"} người`);
    xml = replaceParagraph(xml, "1.4.", `1.4. Địa điểm công tác: ${row.location}`);
    xml = replaceParagraph(xml, "1.5.", `1.5. Nội dung công tác: ${row.content}`);
    xml = replaceParagraph(xml, "- Bắt đầu công việc:", `- Bắt đầu công việc: ${plannedTime(row.plannedStartAt)}`);
    xml = replaceParagraph(xml, "- Kết thúc công việc:", `- Kết thúc công việc: ${plannedTime(row.plannedEndAt)}`);
    if (row.workScope) xml = fillTable(xml, "Phạm vi được phép làm việc", [["1", row.location, row.workScope]]);
    xml = replaceParagraph(xml, "Phiếu công tác cấp ngày", `Phiếu công tác cấp ngày ${row.issuedAt ? row.issuedAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "…………………"}`);
    xml = replaceParagraph(xml, "Họ và tên", `Họ và tên: ${row.issuerName}    Chức vụ: ……………    Ký/xác nhận: ……………`);
    // Không tự điền các mục xác nhận ĐÃ cắt điện/tiếp đất/kiểm tra từ kế hoạch an toàn.
    if (selected.length) {
      const end = xml.lastIndexOf("<w:sectPr");
      if (end < 0) throw new Error("Mẫu Điện thiếu thiết lập trang");
      xml = xml.slice(0, end) + appendix(selected, number) + xml.slice(end);
    }
  }
  zip.file("word/document.xml", xml);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
