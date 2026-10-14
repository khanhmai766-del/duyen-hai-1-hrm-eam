import { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { CONFIRMED_NUMBER_STATUS, IGNORED_NUMBER_STATUS, OBSERVED_NUMBER_STATUS, lockPermitNumberScope } from "@/lib/server/work-permit-number-reservations";
import type { PermitKind } from "@/lib/work-permits";
import { permitSnapshot } from "@/lib/server/work-permits";

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

/**
 * Phiếu NKVH đã LƯU số (số đã thấy trên NKVH) rồi bị XOÁ trên NKVH (ca 4453/2026 Điện, 14/10/2026): không còn phiếu để
 * đồng bộ, còn nút hủy phiếu chờ thì cố ý chặn số đã thấy trên NKVH → số kẹt mãi ở khung đối chiếu. Quản trị xác nhận đã
 * kiểm tra NKVH thì: hủy phiếu nháp "Chờ NKVH lưu" mang số này (nếu có, bỏ liên kết NKVH) và ghi số là ĐÃ HỦY — số từng
 * dùng trên NKVH nên không cấp lại (khác "Bỏ ghi nhận sai" = tiện ích đọc nhầm, số được dùng lại).
 */
export async function cancelDeletedNkvhNumber(tx: Tx, actor: { id: string; name?: string | null }, input: {
  id: string; expectedStatus: string; expectedUpdatedAt: string; reason: string; sourceChecked: boolean;
}) {
  if (!input.sourceChecked) throw fail("Cần xác nhận đã kiểm tra phiếu không còn trên NKVH.", 400);
  const reasonText = input.reason.trim();
  if (reasonText.length < 5 || reasonText.length > 2000) throw fail("Nhập lý do (5–2.000 ký tự).", 400);
  const scope = await tx.workPermitNumberReservation.findUnique({ where: { id: input.id } });
  if (!scope) throw fail("Không tìm thấy số cần đối chiếu.", 404);
  await lockPermitNumberScope(tx, scope.kind as PermitKind, scope.year);
  await tx.$queryRaw`SELECT "id" FROM "WorkPermitNumberReservation" WHERE "id" = ${input.id} FOR UPDATE`;
  const row = await tx.workPermitNumberReservation.findUniqueOrThrow({ where: { id: input.id } });
  if (row.status !== input.expectedStatus || row.updatedAt.toISOString() !== input.expectedUpdatedAt) throw fail("Số vừa được cập nhật. Tải lại trước khi đối chiếu.", 409);
  if (![OBSERVED_NUMBER_STATUS, CONFIRMED_NUMBER_STATUS].includes(row.status)) throw fail("Số này không còn chờ đối chiếu.", 409);
  // Số đã có phiếu ĐÃ CẤP trên sổ thì không phải ca này — hủy phiếu đó theo quy trình hủy PCT.
  const issued = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "WorkPermit" WHERE "kind" = ${row.kind} AND "year" = ${row.year}
      AND "number" ~ '^[0-9]+$' AND "number"::numeric = ${row.number}::numeric AND "status" NOT IN ('DRAFT', 'CANCELLED') LIMIT 1`;
  if (issued.length) throw fail("Số đang thuộc một phiếu đã cấp trên sổ. Hủy phiếu đó theo quy trình hủy PCT, không dùng thao tác này.", 409);
  const note = `Phiếu NKVH đã bị xoá: ${reasonText}`;
  const drafts = await tx.workPermit.findMany({ where: { kind: row.kind, year: row.year, number: row.number, status: "DRAFT" } });
  for (const draft of drafts) {
    await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${draft.id} FOR UPDATE`;
    // Bỏ liên kết NKVH như hủy nháp trên web: nếu sau này NKVH khôi phục phiếu thì sổ tạo hồ sơ mới, không dính nháp đã hủy.
    const after = await tx.workPermit.update({ where: { id: draft.id }, data: { status: "CANCELLED", statusReason: note, nkvhPctId: null, version: { increment: 1 } } });
    await tx.workPermitHistory.create({ data: { permitId: draft.id, actorId: actor.id, actorName: actor.name ?? "",
      action: "Hủy phiếu chờ NKVH lưu (phiếu NKVH đã bị xoá)", before: permitSnapshot(draft), after: permitSnapshot(after) } });
  }
  // permitId là duy nhất trên bảng lượt giữ: chỉ gắn nháp khi chưa có lượt khác (vd lượt đã trả số) gắn với nó.
  const draftId = drafts[0]?.id;
  const linkDraft = draftId && !row.permitId && !(await tx.workPermitNumberReservation.findUnique({ where: { permitId: draftId }, select: { id: true } }));
  const saved = await tx.workPermitNumberReservation.update({ where: { id: row.id }, data: {
    status: "CANCELLED", ...(linkDraft ? { permitId: draftId } : {}), cancelledAt: new Date(), cancelledById: actor.id, cancelReason: note,
  } });
  await tx.workPermitNumberReservationHistory.create({ data: { reservationId: row.id, action: "CANCELLED", actorId: actor.id,
    actorName: actor.name ?? "", permitId: saved.permitId, note: `${note}${drafts.length ? ` · hủy ${drafts.length} phiếu nháp chờ NKVH lưu` : ""}` } });
  return { saved, cancelledDrafts: drafts.length };
}
