import type { Prisma, WorkPermit } from "@prisma/client";
import { fail } from "@/lib/api";
import { permitText } from "@/lib/server/work-permits";

/** Điền sẵn người cấp từ phiên đăng nhập (cho phép sửa); CHTT nhà thầu từ danh bạ dùng chung. */
export async function resolvePermitIdentities(
  tx: Prisma.TransactionClient,
  body: Record<string, unknown>,
  user: { id: string; name?: string | null },
  before?: WorkPermit,
) {
  // Mặc định giao diện điền người cấp theo tài khoản đăng nhập, nhưng cho phép sửa lại theo
  // người cấp thực tế. `issuerUserId` chỉ neo khi tên vẫn là người thao tác; nếu nhập một tên
  // khác thì để null, tránh gắn sai ID tài khoản. Mọi lần sửa vẫn có actor trong History/Audit.
  const issuerName = permitText(body, "issuerName") || user.name?.trim() || "";
  const issuerUserId = before && before.status !== "DRAFT" && issuerName === before.issuerName
    ? before.issuerUserId
    : issuerName === user.name?.trim() ? user.id : null;
  if (body.teamType !== "CONTRACTOR") {
    return { ...body, issuerName, issuerUserId, commanderPersonId: null };
  }
  const commanderPersonId = permitText(body, "commanderPersonId", 100) || null;
  if (!commanderPersonId) {
    // Nháp có thể hủy trực tiếp trước khi chọn CHTT; khi cấp thực tế phải chọn danh bạ.
    const cancellingDraft = body.status === "CANCELLED" && before?.status === "DRAFT";
    if (body.status !== "DRAFT" && !cancellingDraft) throw fail("Vui lòng chọn CHTT từ danh sách nhà thầu trước khi cấp phiếu");
    return { ...body, issuerName, issuerUserId, commanderPersonId: null, commanderName: "" };
  }
  await tx.$queryRaw`SELECT "id" FROM "WorkPermitPerson" WHERE "id" = ${commanderPersonId} FOR UPDATE`;
  const person = await tx.workPermitPerson.findUnique({ where: { id: commanderPersonId } });
  const unchanged = before?.status !== "DRAFT" && before?.commanderPersonId === commanderPersonId;
  if (!person || (!unchanged && (!person.isActive || !person.canCommand))) throw fail("Người được chọn không có trong danh sách CHTT nhà thầu đang hoạt động");
  return { ...body, issuerName, issuerUserId, commanderPersonId,
    commanderName: unchanged ? before!.commanderName : person.name,
    teamName: unchanged ? body.teamName : person.company };
}
