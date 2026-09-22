import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { attachmentDisposition } from "@/lib/server/work-permit-attachments";
import { permitBody, permitHandle, permitSnapshot } from "@/lib/server/work-permits";
import { deleteS3ObjectByKey, getS3Object } from "@/lib/s3";
import { effectivePermitFormat } from "@/lib/work-permits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(_req: Request, props: Params) {
  const { id, attachmentId } = await props.params;
  return permitHandle(async () => {
    await requireUser();
    const attachment = await prisma.workPermitAttachment.findFirst({ where: { id: attachmentId, permitId: id } });
    if (!attachment) return fail("Không tìm thấy tệp đính kèm", 404);
    const object = await getS3Object(attachment.s3Key);
    if (!object.Body) return fail("Không đọc được tệp đính kèm", 404);
    const body = typeof object.Body.transformToWebStream === "function" ? object.Body.transformToWebStream() : object.Body as unknown as ReadableStream;
    const inline = attachment.mimeType.startsWith("image/") || attachment.mimeType === "application/pdf";
    return new Response(body, { headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": attachmentDisposition(attachment.originalName, inline),
      "Content-Length": String(attachment.bytes),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  });
}

export async function DELETE(req: Request, props: Params) {
  const { id, attachmentId } = await props.params;
  return permitHandle(async () => {
    const user = await requireUser();
    await requirePermitIssue(user);
    const body = await permitBody(req);
    const version = Number(body.version);
    if (!Number.isInteger(version) || version < 1) return fail("Phiên bản PCT không hợp lệ", 400);
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${id} FOR UPDATE`;
      const permit = await tx.workPermit.findUnique({ where: { id }, select: { kind: true, format: true, teamType: true, status: true, version: true } });
      if (!permit) throw fail("Không tìm thấy PCT", 404);
      if (permit.kind !== "MECHANICAL" || effectivePermitFormat(permit) !== "PAPER") throw fail("Loại phiếu không hỗ trợ tệp đính kèm", 400);
      if (permit.version !== version) throw fail("Phiếu đã được cập nhật. Vui lòng tải lại.", 409);
      if (["CLOSED", "CANCELLED"].includes(permit.status) || await tx.workPermitSession.count({ where: { permitId: id, endedAt: null } })) throw fail("Phiếu đang thực hiện hoặc đã khóa không thể xóa tệp", 409);
      const attachment = await tx.workPermitAttachment.findFirst({ where: { id: attachmentId, permitId: id } });
      if (!attachment) throw fail("Không tìm thấy tệp đính kèm", 404);
      await tx.workPermitAttachment.delete({ where: { id: attachment.id } });
      const updated = await tx.workPermit.update({ where: { id }, data: { version: { increment: 1 } } });
      await tx.workPermitHistory.create({ data: { permitId: id, actorId: user.id, actorName: user.name ?? "", action: "Xóa tệp đính kèm", before: permitSnapshot({ attachment: { id: attachment.id, name: attachment.originalName }, version }), after: permitSnapshot({ version: updated.version }) } });
      return { attachment, version: updated.version };
    });
    let cleanupFailed = false;
    try { await deleteS3ObjectByKey(result.attachment.s3Key); } catch { cleanupFailed = true; }
    await audit(user.id, "DELETE_WORK_PERMIT_ATTACHMENT", "WorkPermit", id, result.attachment.originalName);
    return ok({ id: result.attachment.id, version: result.version, cleanupFailed });
  });
}
