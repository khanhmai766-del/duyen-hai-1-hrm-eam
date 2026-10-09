import ExcelJS from "exceljs";
import { requireUser } from "@/lib/api";
import { loadWorkingPeople, type WorkingPerson } from "@/lib/server/work-permit-working";
import { permitPositionVisible, permitScopeOf } from "@/lib/server/work-permit-scope";
import { permitHandle } from "@/lib/server/work-permits";
import { formatVietnamDateTime } from "@/lib/vietnam-time";
import { formatPermitNumber, PERMIT_KINDS } from "@/lib/work-permits";
export const dynamic = "force-dynamic";

const NO_POSITION = "Chưa ghi cương vị";
const BORDER = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } as const;

/** Tên trang tính: tối đa 31 ký tự, không chứa : \ / ? * [ ], không trùng (Excel so không phân biệt hoa thường). */
function sheetName(label: string, used: Set<string>) {
  const base = label.replace(/[:\\/?*[\]]/g, "-").trim().slice(0, 31) || "Cương vị";
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  used.add(name.toLowerCase());
  return name;
}

/** Hai dòng tiêu đề + dòng đầu cột; kẻ khung và cố định phần đầu. */
function layout(sheet: ExcelJS.Worksheet, title: string, subtitle: string, headers: string[], widths: number[]) {
  const last = String.fromCharCode(64 + headers.length);
  sheet.mergeCells(`A1:${last}1`); sheet.getCell("A1").value = title;
  sheet.mergeCells(`A2:${last}2`); sheet.getCell("A2").value = subtitle;
  sheet.addRow(headers);
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.views = [{ state: "frozen", ySplit: 3 }];
  sheet.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:3" };
}
function style(sheet: ExcelJS.Worksheet, totalRow?: number) {
  sheet.eachRow((row, index) => {
    row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: "Times New Roman", size: 12, bold: index <= 3 || index === totalRow };
      cell.alignment = { vertical: "middle", horizontal: index <= 3 ? "center" : "left", wrapText: true };
      if (index >= 3) cell.border = BORDER;
    });
    if (index === 3) row.height = 32;
  });
}

/**
 * Xuất Excel nhân sự nhà thầu đang làm việc NGAY LÚC BẤM: trang "Tổng hợp" + mỗi cương vị một trang tính.
 * Cùng nguồn với cột "Đang làm việc" của bảng đơn vị; lọc theo cương vị người xem được thấy (như bảng Đang làm việc).
 */
export async function GET() {
  return permitHandle(async () => {
    const user = await requireUser();
    const scope = await permitScopeOf(user);
    const people = (await loadWorkingPeople()).filter(person => permitPositionVisible(person.permit.position, scope));
    const now = new Date();
    const stamp = `Thời điểm xuất: ${formatVietnamDateTime(now)}`;

    const groups = new Map<string, WorkingPerson[]>();
    for (const person of people) {
      const position = person.permit.position?.trim() || NO_POSITION;
      groups.set(position, [...(groups.get(position) ?? []), person]);
    }
    const positions = [...groups.keys()].sort((a, b) => a === NO_POSITION ? 1 : b === NO_POSITION ? -1 : a.localeCompare(b, "vi"));

    const book = new ExcelJS.Workbook();
    const used = new Set<string>();
    const summary = book.addWorksheet(sheetName("Tổng hợp", used));
    layout(summary, "NHÂN SỰ NHÀ THẦU ĐANG LÀM VIỆC THEO CƯƠNG VỊ", `PHÂN XƯỞNG VẬN HÀNH 1 · ${stamp}`,
      ["STT", "Cương vị", "Số PCT đang làm việc", "CHTT", "Nhân viên", "Tổng số người"], [8, 40, 22, 12, 14, 18]);
    positions.forEach((position, index) => {
      const list = groups.get(position)!;
      const commanders = list.filter(person => person.role === "CHTT").length;
      summary.addRow([index + 1, position, new Set(list.map(person => person.permit.id)).size, commanders, list.length - commanders, list.length]);
    });
    const allCommanders = people.filter(person => person.role === "CHTT").length;
    const summaryTotal = summary.addRow(["", "Tổng cộng", new Set(people.map(person => person.permit.id)).size, allCommanders, people.length - allCommanders, people.length]).number;
    if (!positions.length) summary.addRow(["", "Hiện không có nhân sự nhà thầu nào đang làm việc."]);
    style(summary, summaryTotal);

    for (const position of positions) {
      const list = [...groups.get(position)!].sort((a, b) => formatPermitNumber(a.permit).localeCompare(formatPermitNumber(b.permit), "vi", { numeric: true })
        || (a.role === b.role ? 0 : a.role === "CHTT" ? -1 : 1) || a.name.localeCompare(b.name, "vi"));
      const sheet = book.addWorksheet(sheetName(position, used));
      layout(sheet, `NHÂN SỰ ĐANG LÀM VIỆC · CƯƠNG VỊ ${position.toUpperCase()}`, `${list.length} người · ${stamp}`,
        ["STT", "Họ và tên", "Số thẻ", "Vai trò", "Đơn vị", "SĐT", "Số PCT", "Sổ", "Nội dung công việc", "Địa điểm", "Vào lúc"],
        [7, 26, 14, 11, 30, 15, 22, 18, 46, 30, 18]);
      list.forEach((person, index) => sheet.addRow([index + 1, person.name, person.code, person.role === "CHTT" ? "CHTT" : "Nhân viên", person.company, person.phone,
        formatPermitNumber(person.permit), PERMIT_KINDS[person.permit.kind], person.permit.content, person.permit.location, formatVietnamDateTime(person.since)]));
      sheet.autoFilter = "A3:K3";
      style(sheet);
    }

    const bytes = await book.xlsx.writeBuffer();
    const [, hh, mi, dd, mm, yyyy] = formatVietnamDateTime(now).match(/(\d{2}):(\d{2}).*?(\d{2})\/(\d{2})\/(\d{4})/) ?? [];
    const fileStamp = yyyy ? `${yyyy}${mm}${dd}-${hh}${mi}` : String(now.getTime());
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="nhan-su-dang-lam-viec-${fileStamp}.xlsx"`, "Cache-Control": "no-store" } });
  });
}
