import fs from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import type { WorkPermit } from "@prisma/client";
import { formatPermitNumber, PERMIT_DISCIPLINES } from "@/lib/work-permits";
import { safetyPrintData, type SafetySelection } from "@/lib/work-permit-safety";

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
const DEFAULT_RUN_PROPERTIES = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
function plain(xml: string) { return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join(""); }
function firstTag(xml: string, tag: "pPr" | "rPr" | "tcPr") { return xml.match(new RegExp(`<w:${tag}\\b[^>]*>[\\s\\S]*?<\\/w:${tag}>`))?.[0] ?? ""; }
function normalizedRunProperties(properties: string) {
  if (!properties) return DEFAULT_RUN_PROPERTIES;
  if (/<w:rFonts\b/.test(properties)) return properties;
  return properties.replace(/<w:rPr\b[^>]*>/, '$&<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman"/>');
}
function paragraph(text: string, properties = "", runProperties = DEFAULT_RUN_PROPERTIES) {
  return `<w:p>${properties}<w:r>${normalizedRunProperties(runProperties)}${text.split("\n").map((line, i) => `${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${escape(line)}</w:t>`).join("")}</w:r></w:p>`;
}
/** Clone the original row's cell geometry, permitting long safety text to wrap. */
function fillRow(template: string, values: string[]) {
  let index = 0;
  let row = template.replace(/<w:trHeight\b[^>]*\/>/g, "").replace(/<w:tblHeader\b[^>]*\/>/g, "");
  if (!row.includes("<w:cantSplit")) row = row.includes("</w:trPr>") ? row.replace("</w:trPr>", "<w:cantSplit/></w:trPr>") : row.replace(/(<w:tr\b[^>]*>)/, "$1<w:trPr><w:cantSplit/></w:trPr>");
  const result = row.replace(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g, cell => {
    const value = values[index++] ?? "";
    return `<w:tc>${firstTag(cell, "tcPr")}${paragraph(value, firstTag(cell, "pPr"), firstTag(cell, "rPr"))}</w:tc>`;
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
    // Các bảng an toàn chỉ in đúng các mục người dùng đã chọn/phân công.
    // STT được sinh lại độc lập từ 1 theo số hàng có nội dung của từng bảng.
    const headerRow = rows[0].includes("w:tblHeader") ? rows[0] : (rows[0].includes("</w:trPr>") ? rows[0].replace("</w:trPr>", "<w:tblHeader/></w:trPr>") : rows[0].replace(/(<w:tr\b[^>]*>)/, "$1<w:trPr><w:tblHeader/></w:trPr>"));
    return table.slice(0, first) + headerRow + values.map((value, index) => fillRow(rows[1], [String(index + 1), ...value])).join("") + table.slice(last);
  });
  if (matches !== 1) throw new Error(`Không xác định được bảng ${header} trong mẫu PCT`);
  return result;
}
function replaceParagraph(xml: string, startsWith: string, value: string) {
  let done = false;
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, p => {
    if (done || !plain(p).trim().startsWith(startsWith)) return p;
    done = true;
    return paragraph(value, firstTag(p, "pPr"), firstTag(p, "rPr"));
  });
}
function plannedTime(date: Date | null) {
  if (!date) return "…… giờ …… ngày ……/……/………";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("hour")} giờ ${get("minute")} ngày ${get("day")}/${get("month")}/${get("year")}`;
}
function signatureMoment(date: Date | null) {
  if (!date) return "Ngày ……/……/……… Giờ ……h……";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `Ngày ${get("day")}/${get("month")}/${get("year")} Giờ ${get("hour")}h${get("minute")}`;
}
function ensureNoTemplateTags(xml: string) {
  const tags = [...plain(xml).matchAll(/\{\{([^{}]+)\}\}/g)].map(match => match[1].trim());
  if (tags.length) throw new Error(`Mẫu PCT còn thẻ chưa được điền: ${[...new Set(tags)].join(", ")}`);
}

export async function createWorkPermitDocument(row: WorkPermit) {
  const mechanical = row.kind === "MECHANICAL";
  const zip = new PizZip(await fs.readFile(path.join(process.cwd(), "templates", mechanical ? "work-permit-mechanical.docx" : "work-permit-electrical.docx")));
  let xml = zip.file("word/document.xml")!.asText();
  const selected = (Array.isArray(row.safetyItems) ? row.safetyItems : []) as unknown as SafetySelection[];
  const groups = safetyPrintData(selected), number = formatPermitNumber(row);
  xml = replaceParagraph(xml, "Số:", `Số: ${number}${!mechanical && row.registrationNumber.trim() ? `\nSố ĐKCT: ${row.registrationNumber.trim()}` : ""}`);
  if (mechanical) {
    xml = fillTable(xml, "Nhận diện mối nguy", groups.hazards.map(r => [r.hazard, r.measure]));
    xml = fillTable(xml, "Kiểm tra các biện pháp an toàn đơn vị cho phép", groups.authorization.map(s => [s, "", ""]));
    xml = fillTable(xml, "Kiểm tra các biện pháp an toàn đơn vị công tác", groups.execution.map(s => [s, "", ""]));
    xml = replaceParagraph(xml, "Địa điểm:", `Địa điểm: ${row.location}`);
    xml = replaceParagraph(xml, "Nội dung:", `Nội dung: ${row.content}`);
    xml = replaceParagraph(xml, "Số ĐK:", row.registrationNumber.trim() ? `Số ĐK: ${row.registrationNumber.trim()}` : "");
    xml = replaceParagraph(xml, "Phạm vi:", `Phạm vi: ${row.workScope || "……………………………………………………"}`);
    xml = replaceParagraph(xml, "[  ] Thủy", Object.entries(PERMIT_DISCIPLINES).map(([key, label]) => `[${row.disciplines.includes(key) ? "X" : "  "}] ${label}`).join("        "));
    xml = replaceParagraph(xml, "Thời gian:", `Thời gian: Từ ${plannedTime(row.plannedStartAt)} đến ${plannedTime(row.plannedEndAt)}`);
    const authorizationMoment = signatureMoment(row.authorizedAt);
    xml = replaceParagraph(xml, "Người cấp phiếu:", `Người cấp phiếu: ${row.issuerName || "……………………"}       Chữ ký: ……………       ${signatureMoment(row.issuedAt)}`);
    xml = replaceParagraph(xml, "Người cho phép:", `Người cho phép: ${row.authorizerName || "……………………"}       Chữ ký: ……………       ${authorizationMoment}`);
    xml = replaceParagraph(xml, "Người CHTT:", `Người CHTT: ${row.commanderName || "……………………"}       Chữ ký: ……………       ${authorizationMoment}`);
    xml = replaceParagraph(xml, "Đơn vị công tác:", `Đơn vị công tác: ${row.teamName}       Số lượng người: ${row.workerCount ?? "………"}`);
  } else {
    xml = replaceParagraph(xml, "1.1.", `1.1. Người lãnh đạo công việc (nếu có): ${row.leaderName}`);
    xml = replaceParagraph(xml, "1.2.", `1.2. Người chỉ huy trực tiếp: ${row.commanderName}`);
    xml = replaceParagraph(xml, "1.3.", `1.3. Nhân viên đơn vị công tác: ${row.workerCount ?? "………"} người`);
    xml = replaceParagraph(xml, "1.4.", `1.4. Địa điểm công tác: ${row.location}`);
    xml = replaceParagraph(xml, "1.5.", `1.5. Nội dung công tác: ${row.content}`);
    xml = replaceParagraph(xml, "- Bắt đầu công việc:", `- Bắt đầu công việc: ${plannedTime(row.plannedStartAt)}`);
    xml = replaceParagraph(xml, "- Kết thúc công việc:", `- Kết thúc công việc: ${plannedTime(row.plannedEndAt)}`);
    xml = replaceParagraph(xml, "Phiếu công tác cấp ngày", `Phiếu công tác cấp ngày ${row.issuedAt ? row.issuedAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "…………………"}`);
    xml = replaceParagraph(xml, "Họ và tên", `Họ và tên: ${row.issuerName}    Chức vụ: ……………    Ký/xác nhận: ……………`);
    if (row.electricalSafetySupervisorName.trim()) xml = replaceParagraph(xml, "Họ và tên…………………… chức vụ", `Họ và tên: ${row.electricalSafetySupervisorName.trim()}    Chức vụ: ……………    Ký/xác nhận: ……………`);
  }
  ensureNoTemplateTags(xml);
  zip.file("word/document.xml", xml);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
