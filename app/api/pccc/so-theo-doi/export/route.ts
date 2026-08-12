import type { NextRequest } from "next/server";
import { audit, auditDetailWithPosition, fail, handle, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { PCCC_PERMISSION, pcccPositionCodesOf, pcccWriteScopeOf, resolvePeriod } from "@/lib/pccc-service";
import { loadSignatureImages } from "@/lib/pccc-archive";
import { bookFileNameOf, bookKeyOf, bookPositionOf, bookStatusOf, loadBookData } from "@/lib/pccc-so-theo-doi";
import { buildPcccBookPdf } from "@/lib/pccc-so-theo-doi-pdf";
import { positionLabelOf } from "@/lib/position-catalog";
import { uploadS3Object } from "@/lib/s3";

export const dynamic = "force-dynamic";

/**
 * GET /api/pccc/so-theo-doi/export?period=&cuongVi=
 * Dựng "Sổ theo dõi phương tiện PCCC" (Mẫu số 01) của MỘT cương vị, LƯU LÊN S3 rồi trả
 * luôn tệp về cho trình duyệt tải xuống.
 *
 * Lưu S3 trước, trả tệp sau và cả hai dùng CHUNG một buffer: bản người dùng cầm trên tay
 * luôn khớp từng byte với bản lưu trữ, không có chuyện in ra một đằng lưu một nẻo.
 *
 * Điều kiện ký đủ được kiểm LẠI ở đây, không tin nút bấm phía client: gọi thẳng URL này
 * là một cửa vào hợp lệ.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.view, ["read", "personal", "manage", "full"]);

    const sp = req.nextUrl.searchParams;
    const period = await resolvePeriod(sp.get("period"));
    const scope = await pcccWriteScopeOf(user);
    const positionCode = bookPositionOf(scope, sp.get("cuongVi"), pcccPositionCodesOf(user)[0]);
    const status = await bookStatusOf(period.id, positionCode);
    if (!positionCode || !status.ready) {
      return fail(status.reason ?? "Chưa đủ điều kiện xuất sổ theo dõi", 409);
    }

    const { rows } = await loadBookData(period.id, positionCode);
    const signatureImages = await loadSignatureImages(rows.map((r) => r.signatureKey));
    const buffer = await buildPcccBookPdf({
      periodLabel: period.label,
      positionLabel: positionLabelOf(positionCode),
      rows,
      signatureImages,
    });

    const key = bookKeyOf(period.label, positionCode);
    const fileName = bookFileNameOf(period.label, positionCode);
    await uploadS3Object({ key, body: buffer, contentType: "application/pdf", originalName: fileName });

    await audit(
      user.id,
      "EXPORT_PCCC_BOOK",
      "PcccPeriod",
      period.id,
      auditDetailWithPosition(user, `Xuất sổ theo dõi PCCC ${period.label} · ${positionLabelOf(positionCode)} · ${rows.length} thiết bị`)
    );

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  });
}
