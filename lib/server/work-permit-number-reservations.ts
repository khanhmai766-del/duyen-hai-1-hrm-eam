import { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { PERMIT_KINDS, type PermitKind } from "@/lib/work-permits";

export function permitNumberScope(kind: unknown, year: unknown): { kind: PermitKind; year: number } {
  if (typeof kind !== "string" || !Object.hasOwn(PERMIT_KINDS, kind)) throw fail("Loại PCT không hợp lệ", 400);
  const parsedYear = Number(year);
  if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) throw fail("Năm cấp số không hợp lệ", 400);
  return { kind: kind as PermitKind, year: parsedYear };
}

export function canonicalPermitNumber(value: unknown): string {
  const input = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9]{1,80}$/.test(input) || BigInt(input) < BigInt(1)) throw fail("Số PCT phải là số nguyên dương", 400);
  const number = BigInt(input).toString();
  if (number.length > 80) throw fail("Số PCT vượt quá 80 chữ số", 400);
  return number;
}

/**
 * Chỉ trả một số vừa hủy về dãy khi nó đúng là số kế tiếp sau mốc/số đang dùng cao nhất.
 * Nhờ vậy người cấp có thể sửa ngay lượt lấy nhầm mà không tạo lỗ giữa dãy số đã phát hành.
 */
export function canAutoReleaseLatestNumber(number: string, baseline: string, highestWithoutNumber: string) {
  const floor = BigInt(baseline) > BigInt(highestWithoutNumber) ? BigInt(baseline) : BigInt(highestWithoutNumber);
  return BigInt(number) === floor + BigInt(1);
}

type Tx = Prisma.TransactionClient;

export function teamTypeLabel(teamType: string) {
  return teamType === "CONTRACTOR" ? "Nhà thầu · PCT giấy" : "Nội bộ";
}

export async function lockPermitNumberScope(tx: Tx, kind: PermitKind, year: number) {
  const rows = await tx.$queryRaw<Array<{ number: string }>>`
    SELECT "number" FROM "WorkPermitNumberBaseline"
    WHERE "kind" = ${kind} AND "year" = ${year} FOR UPDATE
  `;
  if (!rows.length) throw fail("Chưa thiết lập mốc sổ giấy cho loại PCT và năm này", 409);
  return rows[0].number;
}

export async function permitNumberHighWater(
  tx: Tx,
  kind: PermitKind,
  year: number,
  options: { ignoreCancelledNumber?: string } = {}
): Promise<string> {
  const ignoreCancelledNumber = options.ignoreCancelledNumber ?? null;
  const rows = await tx.$queryRaw<Array<{ highest: string | null }>>`
    SELECT max("number"::numeric)::text AS "highest" FROM (
      SELECT "number" FROM "WorkPermit"
      WHERE "kind" = ${kind} AND "year" = ${year}
        AND "status" NOT IN ('DRAFT', 'CANCELLED') AND "number" ~ '^[0-9]+$'
      UNION ALL
      SELECT "number" FROM "WorkPermitNumberReservation"
      WHERE "kind" = ${kind} AND "year" = ${year}
        AND "status" IN ('RESERVED', 'ISSUED', 'CANCELLED')
        AND NOT (
          ${ignoreCancelledNumber}::text IS NOT NULL
          AND "status" = 'CANCELLED'
          AND "number" ~ '^[0-9]+$'
          AND "number"::numeric = ${ignoreCancelledNumber}::numeric
        )
    ) AS used_numbers
  `;
  return rows[0]?.highest ?? "0";
}

export async function activePermitNumberExists(tx: Tx, kind: PermitKind, year: number, number: string, excludePermitId?: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "WorkPermit"
    WHERE "kind" = ${kind} AND "year" = ${year}
      AND "status" NOT IN ('DRAFT', 'CANCELLED')
      AND "number" ~ '^[0-9]+$' AND "number"::numeric = ${number}::numeric
      AND (${excludePermitId ?? null}::text IS NULL OR "id" <> ${excludePermitId ?? null})
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Giữ số TIẾP THEO của sổ (loại + năm). Lượt giữ đã hủy vẫn chặn số theo mặc định; quản trị chỉ
 * giải phóng đúng số hủy kế tiếp tại "Mốc sổ giấy". Phiếu hủy và toàn bộ lịch sử vẫn được giữ.
 */
export async function reservePermitNumber(tx: Tx, input: {
  kind: PermitKind; year: number; teamType: "INTERNAL" | "CONTRACTOR"; ownerId: string; ownerName: string;
}) {
  const baseline = await lockPermitNumberScope(tx, input.kind, input.year);
  const highest = await permitNumberHighWater(tx, input.kind, input.year);
  const number = ((BigInt(baseline) > BigInt(highest) ? BigInt(baseline) : BigInt(highest)) + BigInt(1)).toString();
  if (number.length > 80) throw fail("Dãy số PCT đã vượt quá giới hạn", 409);
  if (await activePermitNumberExists(tx, input.kind, input.year, number)) {
    throw fail("Số PCT đang được sử dụng trong loại và năm này.", 409);
  }
  const reservation = await tx.workPermitNumberReservation.create({ data: {
    kind: input.kind, year: input.year, number, teamType: input.teamType, ownerId: input.ownerId, ownerName: input.ownerName,
  } });
  await tx.workPermitNumberReservationHistory.create({ data: {
    reservationId: reservation.id, action: "RESERVED", actorId: input.ownerId, actorName: input.ownerName,
  } });
  return reservation;
}

export async function consumePermitNumberReservation(tx: Tx, input: {
  reservationId: unknown; kind: PermitKind; year: number; number: string;
  teamType: string; userId: string; userName: string; isAdmin: boolean; permitId: string;
}) {
  if (typeof input.reservationId !== "string" || !input.reservationId) throw fail("Hãy lấy số PCT trước khi cấp phiếu", 409);
  await tx.$queryRaw`SELECT "id" FROM "WorkPermitNumberReservation" WHERE "id" = ${input.reservationId} FOR UPDATE`;
  const reservation = await tx.workPermitNumberReservation.findUnique({ where: { id: input.reservationId } });
  if (!reservation || reservation.status !== "RESERVED") throw fail("Lượt lấy số PCT không còn hiệu lực", 409);
  if (reservation.ownerId !== input.userId && !input.isAdmin) throw fail("Bạn không được dùng số PCT do người khác lấy", 403);
  // Số thuộc về SỔ (loại PCT + năm), không thuộc loại đơn vị: lấy số 15 cho phiếu nội bộ rồi mới
  // phát hiện đúng ra là phiếu nhà thầu thì vẫn dùng chính số 15 — chỉ ghi lại loại đơn vị mới.
  // Đổi sổ (Cơ ↔ Điện) hay năm thì KHÔNG được, vì đó là dãy số khác.
  if (reservation.kind !== input.kind || reservation.year !== input.year || reservation.number !== canonicalPermitNumber(input.number)) {
    throw fail("Số, loại PCT hoặc năm đã khác lượt lấy số", 409);
  }
  const teamTypeChanged = reservation.teamType !== input.teamType;
  if (await activePermitNumberExists(tx, input.kind, input.year, reservation.number, input.permitId)) {
    throw fail("Số PCT đang được sử dụng trong loại và năm này.", 409);
  }
  const saved = await tx.workPermitNumberReservation.update({ where: { id: reservation.id }, data: { status: "ISSUED", permitId: input.permitId, issuedAt: new Date(), teamType: input.teamType } });
  const released = await tx.workPermitNumberReservation.findMany({ where: {
    kind: input.kind, year: input.year, number: reservation.number, status: "RELEASED", reusedPermitId: null,
  }, select: { id: true } });
  if (released.length) {
    await tx.workPermitNumberReservation.updateMany({ where: { id: { in: released.map(item => item.id) } }, data: { reusedPermitId: input.permitId } });
    await Promise.all(released.map(item => tx.workPermitNumberReservationHistory.create({ data: {
      reservationId: item.id, action: "REUSED", actorId: input.userId, actorName: input.userName,
      permitId: input.permitId, note: `Số ${reservation.number}/${input.year} đã được cấp lại`,
    } })));
  }
  await tx.workPermitNumberReservationHistory.create({ data: { reservationId: reservation.id, action: "ISSUED",
    actorId: input.userId, actorName: input.userName, permitId: input.permitId,
    note: teamTypeChanged ? `Đổi loại phiếu khi cấp: ${teamTypeLabel(reservation.teamType)} → ${teamTypeLabel(input.teamType)}` : null } });
  return saved;
}
