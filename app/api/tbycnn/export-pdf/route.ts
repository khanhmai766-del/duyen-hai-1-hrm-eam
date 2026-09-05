import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, handle, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { loadSignatureImages } from "@/lib/pccc-archive";
import { positionLabelOf } from "@/lib/position-catalog";
import { MACHINE_LABEL, isPcccMachine } from "@/lib/pccc-position";
import { buildTbycnnPdf } from "@/lib/tbycnn-pdf";
import {
  resolvePeriod,
  TBYCNN_ORDER_BY,
  TBYCNN_PERMISSION,
  TBYCNN_READ_LEVELS,
  resolveTbycnnViewScope,
  scopeWhere,
} from "@/lib/tbycnn-service";

// pdf-lib + sharp cần Node runtime (không chạy trên Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tbycnn/export-pdf?period=YYYY-MM&cuongViCode=&machine=&preview=1
 *
 * Bản in A4 ngang của sổ TBYCNN — thay cho nút "Xuất PDF" của ứng dụng rời, vốn chỉ mở
 * tab trắng rồi gọi `window.print()` (xem README mục 6.9 của bản cũ). Dựng ở server nên
 * mọi máy tải về đúng một bản, và đóng được chữ ký số vào.
 *
 * Cùng bộ tham số lọc với `export` (Excel) để hai nút trên thanh công cụ luôn in ra cùng
 * một phạm vi — người dùng bấm nút nào cũng nhận đúng phần đang xem.
 *
 * `preview=1` = BẢN NHÁP để soi trước khi in: dựng ĐÚNG cùng một PDF (nếu khác thì xem
 * trước thành vô nghĩa), chỉ khác hai điểm — trả `inline` để trình duyệt hiện thẳng trong
 * khung xem thay vì tải về, và KHÔNG ghi nhật ký. Người dùng lật tới lật lui bản nháp cả
 * chục lần, ghi hết vào AuditLog thì lần xuất thật chìm nghỉm giữa đống bản nháp.
 * Dựng lại y hệt PCCC (`app/api/pccc/so-theo-doi/export/route.ts`).
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
    const preview = sp.get("preview") === "1";
    const period = await resolvePeriod(sp.get("period"));
    const cuongViCode = (sp.get("cuongViCode") ?? "").trim();
    const machine = (sp.get("machine") ?? "").trim();

    // Cùng lý do như xuất Excel: nút xuất không được là cửa sau vượt phạm vi xem.
    const viewScope = await resolveTbycnnViewScope(user);
    const where: Prisma.TbycnnEquipmentWhereInput = {
      periodId: period.id,
      ...scopeWhere(viewScope),
      ...(cuongViCode ? { cuongViCode } : {}),
      ...(machine ? { machine } : {}),
    };

    const rows = await prisma.tbycnnEquipment.findMany({
      where,
      orderBy: TBYCNN_ORDER_BY,
      include: { signature: true },
    });

    const scopeLabel =
      [
        cuongViCode ? positionLabelOf(cuongViCode) : "Toàn phân xưởng",
        machine && isPcccMachine(machine) && machine !== "COMMON" ? MACHINE_LABEL[machine] : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Toàn phân xưởng";

    const signatureImages = await loadSignatureImages(rows.map((r) => r.signature?.signatureKey));

    const buffer = await buildTbycnnPdf({
      periodLabel: period.label,
      scopeLabel,
      rows,
      signatureImages,
    });

    if (!preview) {
      await audit(
        user.id,
        "EXPORT_TBYCNN_PDF",
        "TbycnnPeriod",
        period.id,
        auditDetailWithPosition(user, `Xuất PDF TBYCNN ${period.label} · ${scopeLabel} (${rows.length} thiết bị)`)
      );
    }

    // Tên tệp bỏ dấu: một số trình duyệt và máy in mạng vẫn cắt chữ có dấu trong
    // Content-Disposition thành ký tự lạ.
    const slug = scopeLabel
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          `${preview ? "inline" : "attachment"}; filename="TBYCNN-${period.label}-${slug}.pdf"`,
      },
    });
  });
}
