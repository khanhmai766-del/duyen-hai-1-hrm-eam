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

/**
 * Lượt "OBSERVED": số dạng sổ PXVH1 đã thấy trên NKVH (thường là số gõ tay) nhưng sổ chưa có hồ sơ.
 * Tính vào dãy để lần lấy số sau nhảy qua, nhưng KHÔNG phải RESERVED — nên không hiện ở "Số đã lấy,
 * chưa lưu phiếu" và không ai "Tiếp tục" cấp phiếu giấy trùng số được. Khi phiếu NKVH đó được nhận về
 * sổ (Đồng bộ số hiện có / Sửa sổ theo NKVH), chính lượt này chuyển thành RESERVED/ISSUED.
 */
export const OBSERVED_NUMBER_STATUS = "OBSERVED";

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
        AND "status" IN ('RESERVED', 'ISSUED', 'CANCELLED', 'OBSERVED', 'REVIEW')
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
  kind: PermitKind; year: number; teamType: "INTERNAL" | "CONTRACTOR"; ownerId: string; ownerName: string; number?: unknown; nkvhPctId?: string;
}) {
  const baseline = await lockPermitNumberScope(tx, input.kind, input.year);
  const highest = await permitNumberHighWater(tx, input.kind, input.year);
  const number = input.number !== undefined && input.number !== null && input.number !== "" ? canonicalPermitNumber(input.number) : ((BigInt(baseline) > BigInt(highest) ? BigInt(baseline) : BigInt(highest)) + BigInt(1)).toString();
  if (number.length > 80) throw fail("Dãy số PCT đã vượt quá giới hạn", 409);
  if (await activePermitNumberExists(tx, input.kind, input.year, number)) {
    throw fail("Số PCT đang được sử dụng trong loại và năm này.", 409);
  }
  await assertNumberNotCancelled(tx, input.kind, input.year, number);
  const held = await tx.workPermitNumberReservation.findFirst({ where: {
    kind: input.kind, year: input.year, number, status: { in: ["RESERVED", "ISSUED", "CANCELLED", OBSERVED_NUMBER_STATUS, "REVIEW"] },
  } });
  if (held) {
    if (held.status === "RESERVED" && held.ownerId === input.ownerId && (!input.nkvhPctId || !held.nkvhPctId || held.nkvhPctId === input.nkvhPctId)) return held;
    throw fail(held.status === "RESERVED" ? `Số ${number} đang được ${held.ownerName} giữ.`
      : `Số ${number} đã cấp, đã hủy hoặc đã được ghi nhận sử dụng trên NKVH.`, 409);
  }
  const reservation = await tx.workPermitNumberReservation.create({ data: {
    nkvhPctId: input.nkvhPctId ?? null, kind: input.kind, year: input.year, number, teamType: input.teamType, ownerId: input.ownerId, ownerName: input.ownerName,
  } });
  await tx.workPermitNumberReservationHistory.create({ data: {
    reservationId: reservation.id, action: "RESERVED", actorId: input.ownerId, actorName: input.ownerName,
  } });
  return reservation;
}

export async function consumePermitNumberReservation(tx: Tx, input: {
  reservationId: unknown; kind: PermitKind; year: number; number: string;
  teamType: string; userId: string; userName: string; isAdmin: boolean; permitId: string; releasePrevious?: boolean;
}) {
  if (typeof input.reservationId !== "string" || !input.reservationId) throw fail("Hãy lấy số PCT trước khi cấp phiếu", 409);
  await lockPermitNumberScope(tx, input.kind, input.year);
  await tx.$queryRaw`SELECT "id" FROM "WorkPermitNumberReservation" WHERE "id" = ${input.reservationId} FOR UPDATE`;
  let reservation = await tx.workPermitNumberReservation.findUnique({ where: { id: input.reservationId } });
  if (!reservation || reservation.status !== "RESERVED") throw fail("Lượt lấy số PCT không còn hiệu lực", 409);
  if (reservation.ownerId !== input.userId && !input.isAdmin) throw fail("Bạn không được dùng số PCT do người khác lấy", 403);
  // Số thuộc về SỔ (loại PCT + năm), không thuộc loại đơn vị: lấy số 15 cho phiếu nội bộ rồi mới
  // phát hiện đúng ra là phiếu nhà thầu thì vẫn dùng chính số 15 — chỉ ghi lại loại đơn vị mới.
  // Đổi sổ (Cơ ↔ Điện) hay năm thì KHÔNG được, vì đó là dãy số khác.
  if (reservation.kind !== input.kind || reservation.year !== input.year) {
    throw fail("Số, loại PCT hoặc năm đã khác lượt lấy số", 409);
  }
  const target = canonicalPermitNumber(input.number);
  if (reservation.number !== target) {
    if (input.releasePrevious !== true) throw fail("Cần xác nhận số giữ ban đầu chưa sử dụng trước khi đổi số.", 409);
    await assertNumberNotCancelled(tx, input.kind, input.year, target);
    if (await activePermitNumberExists(tx, input.kind, input.year, target, input.permitId)) throw fail("Số đích đã thuộc phiếu khác.", 409);
    const held = await tx.workPermitNumberReservation.findFirst({ where: {
      kind: input.kind, year: input.year, number: target, status: { in: ["RESERVED", "ISSUED", OBSERVED_NUMBER_STATUS, "REVIEW"] },
    } });
    if (held && held.status !== "RESERVED") throw fail("Số đích đã được ghi nhận sử dụng. Cần đối chiếu phiếu liên quan.", 409);
    await releaseUnusedReservation(tx, reservation, input.userId, input.userName, "Người cấp xác nhận chưa dùng số ban đầu khi đổi số");
    reservation = held ?? await tx.workPermitNumberReservation.create({ data: {
      kind: input.kind, year: input.year, number: target, teamType: input.teamType, ownerId: input.userId, ownerName: input.userName,
    } });
    if (held) await tx.workPermitNumberReservationHistory.create({ data: { reservationId: held.id, action: "TRANSFERRED",
      actorId: input.userId, actorName: input.userName, permitId: input.permitId,
      note: `Phiếu đã cấp nhận số đang giữ bởi ${held.ownerName}; lượt giữ trước không còn hiệu lực` } });
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

/** Cùng khóa cho mọi đường tạo/gắn/sửa liên kết, kể cả khác năm. */
export async function lockNkvhPermit(tx: Tx, kind: PermitKind, nkvhPctId: string) {
  // Prisma không giải mã được kiểu void của hàm khóa PostgreSQL.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pct:${kind}:${nkvhPctId}`}, 0))::text`;
}
export async function assertNkvhLinkAvailable(tx: Tx, kind: PermitKind, nkvhPctId: string | null, excludeId?: string) {
  if (!nkvhPctId) return;
  await lockNkvhPermit(tx, kind, nkvhPctId);
  const linked = await tx.workPermit.findFirst({ where: { kind, nkvhPctId, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { number: true, year: true } });
  if (linked) throw fail(`Phiếu NKVH đã liên kết hồ sơ ${linked.number}/${linked.year}. Hãy đồng bộ hồ sơ đó, không tạo thêm phiếu.`, 409);
}
export async function assertNumberNotCancelled(tx: Tx, kind: PermitKind, year: number, number: string) {
  const cancelled = await tx.workPermit.findFirst({ where: { kind, year, number, status: "CANCELLED" }, select: { id: true } });
  const held = await tx.workPermitNumberReservation.findFirst({ where: { kind, year, number, status: "CANCELLED" }, select: { id: true } });
  const released = cancelled && !held ? await tx.workPermitNumberReservation.findFirst({ where: { kind, year, number, status: "RELEASED", permitId: cancelled.id }, select: { id: true } }) : null;
  if (held || (cancelled && !released)) throw fail(`Số ${number}/${year} thuộc phiếu hoặc lượt bị hủy chưa được giải phóng. Cần đối chiếu trước khi cấp lại.`, 409);
}
export async function releaseUnusedReservation(tx: Tx, reservation: { id: string; kind: string; year: number; number: string }, actorId: string, actorName: string, note: string) {
  await lockPermitNumberScope(tx, reservation.kind as PermitKind, reservation.year);
  const live = await tx.workPermitNumberReservation.findUnique({ where: { id: reservation.id } });
  if (!live || !["RESERVED", "REVIEW"].includes(live.status)) throw fail("Số đã cấp hoặc đã thấy sử dụng trên NKVH không được giải phóng như lượt chưa dùng.", 409);
  if (await activePermitNumberExists(tx, reservation.kind as PermitKind, reservation.year, reservation.number)) throw fail("Số giữ ban đầu đã có phiếu sử dụng, không được giải phóng.", 409);
  await tx.workPermitNumberReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED", nkvhPctId: null } });
  await tx.workPermitNumberReservationHistory.create({ data: { reservationId: reservation.id, action: "RELEASED", actorId, actorName, note } });
}
