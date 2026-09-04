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
} from "@/lib/tbycnn-service";

// pdf-lib + sharp cần Node runtime (không chạy trên Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tbycnn/export-pdf?period=YYYY-MM&cuongViCode=&machine=
 *
 * Bản in A4 ngang của sổ TBYCNN — thay cho nút "Xuất PDF" của ứng dụng rời, vốn chỉ mở
 * tab trắng rồi gọi `window.print()` (xem README mục 6.9 của bản cũ). Dựng ở server nên
 * mọi máy tải về đúng một bản, và đóng được chữ ký số vào.
 *
 * Cùng bộ tham số lọc với `export` (Excel) để hai nút trên thanh công cụ luôn in ra cùng
 * một phạm vi — người dùng bấm nút nào cũng nhận đúng phần đang xem.
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
    const cuongViCode = (sp.get("cuongViCode") ?? "").trim();
    const machine = (sp.get("machine") ?? "").trim();

    const where: Prisma.TbycnnEquipmentWhereInput = {
      periodId: period.id,
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

    await audit(
      user.id,
      "EXPORT_TBYCNN_PDF",
      "TbycnnPeriod",
      period.id,
      auditDetailWithPosition(user, `Xuất PDF TBYCNN ${period.label} · ${scopeLabel} (${rows.length} thiết bị)`)
    );

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
        "Content-Disposition": `attachment; filename="TBYCNN-${period.label}-${slug}.pdf"`,
      },
    });
  });
}
