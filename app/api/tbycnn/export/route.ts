import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, handle, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  computeTinhTrang,
  displayKdDate,
  tbycnnToolTabOf,
  TBYCNN_COLUMNS,
  TBYCNN_NO_POSITION_LABEL,
  TBYCNN_TOOL_DANH_MUCS,
} from "@/lib/tbycnn";
import {
  resolvePeriod,
  TBYCNN_ORDER_BY,
  TBYCNN_PERMISSION,
  TBYCNN_READ_LEVELS,
  resolveTbycnnViewScope,
  scopeWhere,
} from "@/lib/tbycnn-service";

// exceljs cần Node runtime (không chạy trên Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tbycnn/export?period=YYYY-MM&cuongViCode=&machine=&bang=
 *
 * Thay cho bản .xls SpreadsheetML viết tay của app cũ: dùng ExcelJS như module PCCC nên
 * ra .xlsx thật. Bố cục bám đúng file Excel gốc của nhà máy — mỗi cương vị một dòng tiêu
 * đề gộp, trong đó mỗi danh mục La Mã lại một dòng tiêu đề.
 *
 * Mọi ô ghi kiểu CHUỖI (kể cả ngày và số) đúng như bản cũ: dữ liệu gốc có "06/26",
 * "Không có", "-"… nếu để Excel tự suy kiểu thì các ô này bị đổi nghĩa.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      TBYCNN_PERMISSION.view,
      [...TBYCNN_READ_LEVELS],
      "Không đủ quyền xem sổ thiết bị yêu cầu nghiêm ngặt"
    );

    const sp = req.nextUrl.searchParams;
    const period = await resolvePeriod(sp.get("period"));
    // Lọc theo MÃ chức danh + tổ máy, giống PCCC: đổi cách viết nhãn về sau không làm
    // hỏng link xuất file (xem lib/pccc-position.ts).
    const cuongViCode = (sp.get("cuongViCode") ?? "").trim();
    const machine = (sp.get("machine") ?? "").trim();
    /*
     * `bang` = bảng đang xem trên giao diện. Ba bảng dụng cụ ATLĐ đã TÁCH HẲN khỏi sổ chính
     * nên file xuất ra phải tách theo: bấm Xuất File ở tab Thang di động mà nhận về cả quyển
     * sổ thì nút đó nói dối. Không truyền `bang` → sổ chính, tức LOẠI ba danh mục dụng cụ.
     */
    const toolTab = tbycnnToolTabOf(sp.get("bang"));
    const danhMucWhere = toolTab
      ? { danhMuc: toolTab.danhMuc }
      : { danhMuc: { notIn: [...TBYCNN_TOOL_DANH_MUCS] } };
    // Bảng dụng cụ dùng ĐÚNG cột của biểu mẫu nó; sổ chính giữ nguyên bộ cột cũ.
    const columns = toolTab
      ? [
          { key: "tt", label: "TT", width: 52 },
          { key: "tenThietBi", label: "Tên dụng cụ", width: 220 },
          { key: "maHieu", label: "Mã hiệu", width: 170 },
          ...toolTab.columns.map((c) => ({ key: c.key, label: c.label, width: c.width })),
          { key: "chuKyThu", label: "Chu kỳ (tháng)", width: 84 },
          { key: "kdGanNhat", label: "KĐ gần nhất", width: 110 },
          { key: "kdTiepTheo", label: "Thời gian kiểm tra tiếp theo", width: 120 },
          { key: "tinhTrang", label: "Tình trạng", width: 140 },
        ]
      : TBYCNN_COLUMNS;

    // Xuất file phải bó đúng phạm vi đang xem, nếu không người dùng lấy được bằng nút
    // Xuất Excel đúng những dòng màn hình vừa giấu đi.
    const viewScope = await resolveTbycnnViewScope(user);
    const rows = await prisma.tbycnnEquipment.findMany({
      where: {
        periodId: period.id,
        ...scopeWhere(viewScope),
        ...(cuongViCode ? { cuongViCode } : {}),
        ...(machine ? { machine } : {}),
        ...danhMucWhere,
      },
      orderBy: TBYCNN_ORDER_BY,
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "PowerPlant EAM";
    const ws = wb.addWorksheet(`${toolTab ? toolTab.label : "TBYCNN"} ${period.label}`.slice(0, 31), {
      views: [{ state: "frozen", ySplit: 1 }],
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const headers = ["Cương vị quản lý", ...columns.map((c) => c.label)];
    ws.columns = [
      { width: 22 },
      ...columns.map((c) => ({ width: Math.max(8, Math.round(c.width / 7)) })),
    ];
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    headerRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      cell.border = { bottom: { style: "thin" } };
    });

    const cellValue = (row: (typeof rows)[number], key: string): string => {
      switch (key) {
        case "kdGanNhat":
          return displayKdDate(row.kdGanNhat, row.kdGanNhatText);
        case "kdTiepTheo":
          return displayKdDate(row.kdTiepTheo, row.kdTiepTheoText);
        case "tinhTrang":
          return computeTinhTrang(row.soLuongKhaDung, row.soLuongKhongKhaDung);
        default: {
          const v = (row as unknown as Record<string, unknown>)[key];
          return v == null ? "" : String(v);
        }
      }
    };

    // Dòng tiêu đề gộp cả chiều rộng bảng, chèn lại mỗi khi cương vị / danh mục đổi —
    // giống cách bản cũ và file Excel gốc trình bày.
    const mergeBanner = (text: string, argb: string) => {
      const row = ws.addRow([text]);
      ws.mergeCells(row.number, 1, row.number, headers.length);
      row.font = { bold: true };
      row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      return row;
    };

    let lastKhuVuc = "";
    let lastNhom = "";
    for (const row of rows) {
      if (row.khuVuc !== lastKhuVuc) {
        // Hồ sơ có dòng không ghi cương vị; băng gộp để trắng thì người đọc file Excel
        // tưởng thiếu dữ liệu chứ không hiểu là "chưa giao cho ai".
        mergeBanner(row.khuVuc || TBYCNN_NO_POSITION_LABEL, "FFDBEAFE");
        lastKhuVuc = row.khuVuc;
        lastNhom = "";
      }
      if (row.nhom !== lastNhom) {
        mergeBanner(`   ${row.nhom}`, "FFF1F5F9");
        lastNhom = row.nhom;
      }
      const dataRow = ws.addRow([row.khuVuc || TBYCNN_NO_POSITION_LABEL, ...columns.map((c) => cellValue(row, c.key))]);
      dataRow.alignment = { vertical: "top", wrapText: true };
    }

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

    const buffer = await wb.xlsx.writeBuffer();
    await audit(
      user.id,
      "EXPORT_TBYCNN",
      "TbycnnPeriod",
      period.id,
      auditDetailWithPosition(
        user,
        `Xuất Excel ${toolTab ? toolTab.label : "TBYCNN"} ${period.label}${cuongViCode ? ` — ${cuongViCode}` : ""}${machine ? ` · ${machine}` : ""} (${rows.length} thiết bị)`
      )
    );

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${toolTab ? toolTab.key : "TBYCNN"}-${period.label}.xlsx"`,
      },
    });
  });
}
