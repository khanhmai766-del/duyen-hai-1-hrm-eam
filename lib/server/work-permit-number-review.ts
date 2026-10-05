import { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { CONFIRMED_NUMBER_STATUS, IGNORED_NUMBER_STATUS, OBSERVED_NUMBER_STATUS, lockPermitNumberScope } from "@/lib/server/work-permit-number-reservations";
import type { PermitKind } from "@/lib/work-permits";

type Tx = Prisma.TransactionClient;
export async function reviewObservedNumber(tx: Tx, actor: { id: string; name?: string | null }, input: {
  id: string; action: "confirm" | "ignore"; expectedStatus: string; expectedUpdatedAt: string; reason: string; sourceChecked: boolean;
}) {
  if (!input.sourceChecked) throw fail("Cần xác nhận đã đối chiếu phiếu và số trên NKVH.", 400);
  if (!input.reason.trim() || input.reason.length > 2000) throw fail("Nhập lý do đối chiếu (tối đa 2.000 ký tự).", 400);
  const scope = await tx.workPermitNumberReservation.findUnique({ where: { id: input.id } });
  if (!scope) throw fail("Không tìm thấy số cần đối chiếu.", 404);
  await lockPermitNumberScope(tx, scope.kind as PermitKind, scope.year);
  await tx.$queryRaw`SELECT "id" FROM "WorkPermitNumberReservation" WHERE "id" = ${input.id} FOR UPDATE`;
  const row = await tx.workPermitNumberReservation.findUniqueOrThrow({ where: { id: input.id } });
  if (row.status !== input.expectedStatus || row.updatedAt.toISOString() !== input.expectedUpdatedAt) throw fail("Số vừa được cập nhật. Tải lại trước khi đối chiếu.", 409);
  if (![OBSERVED_NUMBER_STATUS, CONFIRMED_NUMBER_STATUS].includes(row.status)) throw fail("Số này không còn chờ đối chiếu.", 409);
  let status = CONFIRMED_NUMBER_STATUS;
  if (input.action === "ignore") {
    const permits = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "WorkPermit" WHERE "kind" = ${row.kind} AND "year" = ${row.year}
        AND "number" ~ '^[0-9]+$' AND "number"::numeric = ${row.number}::numeric AND "status" <> 'DRAFT' LIMIT 1`;
    const linked = row.permitId ? await tx.workPermit.findUnique({ where: { id: row.permitId }, select: { id: true } }) : null;
    if (linked || permits.length) throw fail("Số còn hồ sơ phiếu trên website. Xử lý số trên NKVH và đồng bộ lại trước khi bỏ ghi nhận.", 409);
    status = IGNORED_NUMBER_STATUS;
  } else if (row.permitId) {
    const permit = await tx.workPermit.findUnique({ where: { id: row.permitId }, select: { status: true } });
    if (!permit) throw fail("Không tìm thấy hồ sơ phiếu liên quan. Tải lại để đối chiếu.", 409);
    status = permit.status === "CANCELLED" ? "CANCELLED" : "ISSUED";
  }
  const saved = await tx.workPermitNumberReservation.update({ where: { id: row.id }, data: { status } });
  await tx.workPermitNumberReservationHistory.create({ data: { reservationId: row.id, action: status, actorId: actor.id,
    actorName: actor.name ?? "", permitId: row.permitId, note: `${input.action === "confirm" ? "Xác nhận dùng số NKVH để nâng dãy" : "Bỏ ghi nhận sai sau khi đối chiếu NKVH"}: ${input.reason.trim()}` } });
  return saved;
}
