import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireUser } from "@/lib/api";
import { loadDailyWorkingHistory } from "@/lib/server/work-permit-daily-working";
import { permitHandle } from "@/lib/server/work-permits";
import { permitWorkingDay } from "@/lib/work-permit-daily-people";
import { countWorkersByCompany, permitWorkingDayRange, workingDayLabel, type DailyWorker } from "@/lib/work-permit-daily-history";
import { formatVietnamDateTime } from "@/lib/vietnam-time";
import { PERMIT_CONTRACTOR_SCOPES, type PermitContractorScope } from "@/lib/work-permits";
export const dynamic = "force-dynamic";

const BORDER = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } as const;
const byWorker = (a: DailyWorker, b: DailyWorker) => Number(b.commander) - Number(a.commander) || a.name.localeCompare(b.name, "vi");

/**
 * Lịch sử "Làm việc trong ngày" theo đơn vị nhà thầu (tab Nhân sự nhà thầu → Lịch sử theo ngày).
 *
 * - `from`, `to` (YYYY-MM-DD, giờ VN), `scope` (OVERHAUL | SCTX | INVESTMENT): mỗi ngày một dòng {day, total, byCompany}.
 *   `total` khử trùng trên mọi đơn vị nên có thể nhỏ hơn tổng các ô (một người làm cho hai đơn vị trong ngày).
 * - `day` + `company`: danh sách người của một đơn vị trong một ngày (bấm vào một ngày để xem ai đã làm).
 * - `format=xlsx`: tải bảng tổng hợp theo ngày + chi tiết từng người.
 * Ngày sau hôm nay bị cắt về hôm nay; khoảng tối đa DAILY_HISTORY_MAX_DAYS ngày.
 */
export async function GET(req: Request) {
  return permitHandle(async () => {
    await requireUser();
    const params = new URL(req.url).searchParams;
    const rawScope = params.get("scope");
    if (rawScope && !Object.hasOwn(PERMIT_CONTRACTOR_SCOPES, rawScope)) return fail("Nhóm nhà thầu không hợp lệ");
    const scope = (rawScope || null) as PermitContractorScope | null;
    const now = new Date();
    const today = permitWorkingDay(now);

    const company = params.get("company");
    if (company !== null) {
      const day = params.get("day") ?? "";
      if (!company.trim() || company.length > 200) return fail("Đơn vị không hợp lệ");
      let days: string[];
      try { days = permitWorkingDayRange(day, day); } catch { return fail("Ngày không hợp lệ, vui lòng dùng định dạng YYYY-MM-DD"); }
      if (day > today) return fail("Chưa đến ngày này");
      const { days: [entry], permitNumbers } = await loadDailyWorkingHistory(days, now, scope);
      const workers = entry.workers.filter(worker => worker.company === company).sort(byWorker);
      return ok(workers.map(worker => ({ name: worker.name, code: worker.code, commander: worker.commander,
        permits: worker.permitIds.map(id => permitNumbers.get(id) ?? "").filter(Boolean).sort((a, b) => a.localeCompare(b, "vi", { numeric: true })) })),
      { day, company, scope });
    }

    const from = params.get("from") ?? "", to = params.get("to") ?? "";
    let days: string[];
    try { days = permitWorkingDayRange(from, to < today ? to : today); }
    catch (error) { return fail(error instanceof RangeError && /tối đa|trước ngày/.test(error.message) ? error.message : "Ngày không hợp lệ, vui lòng dùng định dạng YYYY-MM-DD"); }
    const history = await loadDailyWorkingHistory(days, now, scope);
    const rows = history.days.map(entry => ({ day: entry.day, total: entry.workers.length, byCompany: countWorkersByCompany(entry.workers, worker => worker.company) }));
    if (params.get("format") !== "xlsx") return ok(rows, { from: days[0], to: days[days.length - 1], scope });

    const codes = new Map((await prisma.workPermitCompany.findMany({ select: { name: true, code: true } })).map(row => [row.name, row.code]));
    const label = (name: string) => codes.get(name) || name;
    const companies = [...new Set(rows.flatMap(row => Object.keys(row.byCompany)))].sort((a, b) => label(a).localeCompare(label(b), "vi"));
    const scopeText = scope ? ` · ${PERMIT_CONTRACTOR_SCOPES[scope].toUpperCase()}` : "";
    const range = `Từ ${workingDayLabel(days[0]).full} đến ${workingDayLabel(days[days.length - 1]).full}`;
    const stamp = `Thời điểm xuất: ${formatVietnamDateTime(now)}`;
    const book = new ExcelJS.Workbook();

    // Trang 1: ma trận đơn vị × ngày, kèm trung bình và cao nhất của từng đơn vị.
    const matrix = book.addWorksheet("Theo ngày");
    const headers = ["STT", "Mã đơn vị", "Tên đơn vị", ...days.map(day => `${workingDayLabel(day).weekday}\n${workingDayLabel(day).short}`), "Trung bình / ngày", "Cao nhất"];
    matrix.mergeCells(1, 1, 1, headers.length); matrix.getCell(1, 1).value = `SỐ NGƯỜI LÀM VIỆC TRONG NGÀY THEO ĐƠN VỊ NHÀ THẦU${scopeText}`;
    matrix.mergeCells(2, 1, 2, headers.length); matrix.getCell(2, 1).value = `${range} · gồm CHTT, mỗi người chỉ tính một lần trên tất cả PCT, theo giờ Việt Nam · ${stamp}`;
    matrix.addRow(headers);
    const stats = (values: number[]) => [Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10, Math.max(...values)];
    companies.forEach((name, index) => {
      const values = rows.map(row => row.byCompany[name] ?? 0);
      matrix.addRow([index + 1, codes.get(name) ?? "", name, ...values, ...stats(values)]);
    });
    const totals = rows.map(row => row.total);
    const totalRow = matrix.addRow(["", "", "Tổng (mỗi người tính một lần)", ...totals, ...stats(totals)]).number;
    [7, 14, 40, ...days.map(() => 8), 14, 11].forEach((width, index) => { matrix.getColumn(index + 1).width = width; });
    matrix.views = [{ state: "frozen", xSplit: 3, ySplit: 3 }];
    matrix.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:3" };
    matrix.eachRow((row, index) => {
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        cell.font = { name: "Times New Roman", size: 12, bold: index <= 3 || index === totalRow };
        cell.alignment = { vertical: "middle", horizontal: index <= 2 ? "center" : column === 3 && index > 3 ? "left" : "center", wrapText: true };
        if (index >= 3) cell.border = BORDER;
        if (index === totalRow) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F1FB" } };
      });
      if (index === 3) row.height = 34;
    });

    // Trang 2: từng người theo ngày — trả lời "ai đã làm ngày đó, ở PCT nào".
    const detail = book.addWorksheet("Chi tiết từng người");
    const detailHeaders = ["STT", "Ngày", "Mã đơn vị", "Đơn vị", "Họ và tên", "Số thẻ", "Vai trò", "Số PCT"];
    detail.mergeCells(1, 1, 1, detailHeaders.length); detail.getCell(1, 1).value = `CHI TIẾT NHÂN SỰ LÀM VIỆC TRONG NGÀY${scopeText}`;
    detail.mergeCells(2, 1, 2, detailHeaders.length); detail.getCell(2, 1).value = `${range} · ${stamp}`;
    detail.addRow(detailHeaders);
    let order = 0;
    for (const entry of [...history.days].reverse()) {
      const workers = [...entry.workers].sort((a, b) => label(a.company).localeCompare(label(b.company), "vi") || byWorker(a, b));
      for (const worker of workers) detail.addRow([++order, workingDayLabel(entry.day).full, codes.get(worker.company) ?? "", worker.company, worker.name, worker.code,
        worker.commander ? "CHTT" : "Nhân viên", worker.permitIds.map(id => history.permitNumbers.get(id) ?? "").filter(Boolean).join(", ")]);
    }
    if (!order) detail.addRow(["", "Không có ai làm việc trong khoảng ngày này."]);
    [7, 13, 14, 36, 26, 14, 11, 40].forEach((width, index) => { detail.getColumn(index + 1).width = width; });
    detail.views = [{ state: "frozen", ySplit: 3 }];
    detail.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: detailHeaders.length } };
    detail.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:3" };
    detail.eachRow((row, index) => {
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: "Times New Roman", size: 12, bold: index <= 3 };
        cell.alignment = { vertical: "middle", horizontal: index <= 3 ? "center" : "left", wrapText: true };
        if (index >= 3) cell.border = BORDER;
      });
      if (index === 3) row.height = 28;
    });

    const bytes = await book.xlsx.writeBuffer();
    const file = `lich-su-lam-viec-trong-ngay-${days[0].replaceAll("-", "")}-${days[days.length - 1].replaceAll("-", "")}.xlsx`;
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "no-store" } });
  });
}
