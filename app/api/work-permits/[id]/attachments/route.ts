import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { permitHandle, permitSnapshot } from "@/lib/server/work-permits";
import { permitAttachmentFile } from "@/lib/server/work-permit-attachments";
import { PERMIT_MAX_ATTACHMENTS } from "@/lib/work-permit-source-fields";
import { effectivePermitFormat } from "@/lib/work-permits";
import { deleteS3ObjectByKey, uploadBufferToS3 } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return permitHandle(async () => {
    const user = await requireUser();
    await requirePermitIssue(user);
    const form = await req.formData();
    const version = Number(form.get("version"));
    if (!Number.isInteger(version) || version < 1) return fail("Phiên bản PCT không hợp lệ", 400);
    const file = await permitAttachmentFile(form);
    const before = await prisma.workPermit.findUnique({ where: { id }, select: { kind: true, format: true, teamType: true, status: true, version: true, sessions: { where: { endedAt: null }, take: 1 }, _count: { select: { attachments: true } } } });
    if (!before) return fail("Không tìm thấy PCT", 404);
    if (before.kind !== "MECHANICAL" || effectivePermitFormat(before) !== "PAPER") return fail("Chỉ đính kèm tệp cho PCT Cơ – Nhiệt – Hóa bằng giấy", 400);
    if (["CLOSED", "CANCELLED"].includes(before.status) || before.sessions.length) return fail("Phiếu đang thực hiện hoặc đã khóa không thể thêm tệp", 409);
    if (before.version !== version) return fail("Phiếu đã được cập nhật. Vui lòng tải lại.", 409);
    if (before._count.attachments >= PERMIT_MAX_ATTACHMENTS) return fail("Phiếu đã có tối đa 10 tệp", 400);

    const uploaded = await uploadBufferToS3({ buffer: file.buffer, contentType: file.mime, folder: `work-permits/${id}`, filename: file.originalName });
    try {
      const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${id} FOR UPDATE`;
        const current = await tx.workPermit.findUnique({ where: { id }, select: { kind: true, format: true, teamType: true, status: true, version: true } });
        if (!current || current.version !== version || ["CLOSED", "CANCELLED"].includes(current.status)) throw fail("Phiếu đã thay đổi. Vui lòng tải lại.", 409);
        if (current.kind !== "MECHANICAL" || effectivePermitFormat(current) !== "PAPER") throw fail("Loại phiếu đã thay đổi. Vui lòng tải lại.", 409);
        if (await tx.workPermitSession.count({ where: { permitId: id, endedAt: null } })) throw fail("Phiếu đang thực hiện không thể thêm tệp", 409);
        if (await tx.workPermitAttachment.count({ where: { permitId: id } }) >= PERMIT_MAX_ATTACHMENTS) throw fail("Phiếu đã có tối đa 10 tệp", 400);
        const attachment = await tx.workPermitAttachment.create({ data: { permitId: id, s3Key: uploaded.key, originalName: file.originalName, mimeType: file.mime, bytes: file.bytes, uploadedById: user.id } });
        const updated = await tx.workPermit.update({ where: { id }, data: { version: { increment: 1 } } });
        await tx.workPermitHistory.create({ data: { permitId: id, actorId: user.id, actorName: user.name ?? "", action: "Thêm tệp đính kèm", before: permitSnapshot({ version }), after: permitSnapshot({ attachment: { id: attachment.id, name: attachment.originalName, bytes: attachment.bytes }, version: updated.version }) } });
        return { attachment, version: updated.version };
      });
      await audit(user.id, "UPLOAD_WORK_PERMIT_ATTACHMENT", "WorkPermit", id, file.originalName);
      const { s3Key: _key, uploadedById: _uploader, ...publicAttachment } = result.attachment;
      void _key; void _uploader;
      return ok({ attachment: publicAttachment, version: result.version });
    } catch (error) {
      try { await deleteS3ObjectByKey(uploaded.key); } catch { /* retry cleanup operationally */ }
      throw error;
    }
  });
}
