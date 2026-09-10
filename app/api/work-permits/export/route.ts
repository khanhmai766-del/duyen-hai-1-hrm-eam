import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { fail, requireUser } from "@/lib/api";
import { formatPermitNumber, PERMIT_FORMATS, effectivePermitFormat, PERMIT_KINDS, PERMIT_WORK_TYPE_CODES, PERMIT_UNITS, permitValue, type PermitKind, type PermitWorkType } from "@/lib/work-permits";
import { permitFilters, permitHandle } from "@/lib/server/work-permits";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return permitHandle(async () => {
    await requireUser();
    const params = new URL(req.url).searchParams;
    const yearText = params.get("year");
    const year = yearText === null ? null : Number(yearText);
    if (year !== null && (!/^\d{4}$/.test(yearText!) || year < 2000 || year > 2100)) return fail("Năm xuất sổ phải từ 2000 đến 2100");
    const where = { ...permitFilters(req), ...(year !== null ? { year } : {}) };
    // Chỉ lấy cột ghi sổ, không lấy danh sách nhân viên, searchText, định danh hay lịch sử.
    const rows = await prisma.workPermit.findMany({ where, select: {
      workType: true, number: true, year: true, content: true, workDate: true,
      issuerName: true, leaderName: true, commanderName: true, teamName: true,
      workerCount: true, authorizerName: true, result: true, note: true, statusReason: true,
      unit: true, location: true, repairRequestNumber: true, teamType: true, format: true,
    }, orderBy: [{ workDate: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: 10001 });
    if (rows.length > 10000) return fail("Có hơn 10.000 phiếu. Vui lòng thu hẹp khoảng ngày để xuất sổ.");
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Sổ cấp PCT", { pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:3" } });
    sheet.mergeCells("A1:P1"); sheet.getCell("A1").value = `SỔ THEO DÕI CẤP PHIẾU CÔNG TÁC ${PERMIT_KINDS[where.kind as PermitKind].toUpperCase()}`;
    sheet.mergeCells("A2:P2"); sheet.getCell("A2").value = `PHÂN XƯỞNG VẬN HÀNH 1${year ? ` · NĂM CẤP SỐ ${year}` : ""}`;
    sheet.addRow(["STT (KH/ĐX)", "Số PCT", "Nội dung công việc", "Ngày thực hiện", "Người cấp PCT", "Người lãnh đạo công việc", "Người chỉ huy trực tiếp", "Đơn vị công tác", "Số nhân viên", "Người cho phép làm việc", "Kết quả công việc", "Ghi chú", "Tổ máy / vị trí", "Số SYC", "Loại đơn vị", "Hình thức phiếu"]);
    rows.forEach(r => sheet.addRow([r.workType ? PERMIT_WORK_TYPE_CODES[r.workType as PermitWorkType] : "", formatPermitNumber(r), r.content, permitValue("workDate", r.workDate), r.issuerName, r.leaderName, r.commanderName, r.teamName, r.workerCount, r.authorizerName, r.result, r.note + (r.statusReason ? `\nLý do: ${r.statusReason}` : ""), `${PERMIT_UNITS[r.unit as keyof typeof PERMIT_UNITS]} · ${r.location}`, r.repairRequestNumber, r.teamType === "CONTRACTOR" ? "Nhà thầu" : "Nội bộ", PERMIT_FORMATS[effectivePermitFormat(r)]]));
    const widths = [12, 18, 48, 15, 22, 22, 22, 24, 12, 22, 30, 30, 28, 18, 18, 20];
    widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });
    sheet.eachRow((row, index) => {
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: "Times New Roman", size: 12, bold: index <= 3 };
        cell.alignment = { vertical: "middle", horizontal: index <= 3 ? "center" : "left", wrapText: true };
        if (index >= 3) cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      });
      if (index === 3) row.height = 44;
    });
    sheet.views = [{ state: "frozen", ySplit: 3, xSplit: 2 }];
    sheet.autoFilter = "A3:P3";
    const bytes = await book.xlsx.writeBuffer();
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="so-cap-pct${year ? `-${year}` : ""}.xlsx"`, "Cache-Control": "no-store" } });
  });
}
