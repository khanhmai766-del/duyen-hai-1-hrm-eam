import type { Prisma, WorkPermit } from "@prisma/client";
import { fail } from "@/lib/api";
import { permitText } from "@/lib/server/work-permits";

/** Ghi nhận người cấp thật từ phiên đăng nhập; CHTT nhà thầu từ danh bạ dùng chung. */
export async function resolvePermitIdentities(
  tx: Prisma.TransactionClient,
  body: Record<string, unknown>,
  user: { id: string; name?: string | null },
  before?: WorkPermit,
) {
  if (body.teamType !== "CONTRACTOR") return { ...body, issuerUserId: null, commanderPersonId: null };
  // Người sửa phiếu đã cấp không trở thành người cấp mới. Phiếu cũ giữ nguyên tên.
  const issuerName = before && before.status !== "DRAFT" ? before.issuerName : user.name ?? "";
  const issuerUserId = before && before.status !== "DRAFT" ? before.issuerUserId : user.id;
  const commanderPersonId = permitText(body, "commanderPersonId", 100) || null;
  if (!commanderPersonId) {
    // Cho lưu nháp chưa chọn CHTT; khi cấp thực tế phải chọn danh bạ.
    if (body.status !== "DRAFT") throw fail("Vui lòng chọn CHTT từ danh sách nhà thầu trước khi cấp phiếu");
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
