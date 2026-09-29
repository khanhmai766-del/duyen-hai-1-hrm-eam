import { Prisma } from "@prisma/client";
import { audit, fail, ok, requireRole, requireUser } from "@/lib/api";
import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { activePermitNumberExists, canonicalPermitNumber, permitNumberHighWater, permitNumberScope } from "@/lib/server/work-permit-number-reservations";
import { permitBody, permitHandle } from "@/lib/server/work-permits";
import { PERMIT_KINDS, type PermitKind } from "@/lib/work-permits";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); requireRole(user, ["ADMIN"]);
    const year = Number(new URL(req.url).searchParams.get("year"));
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail("Năm cấp số không hợp lệ", 400);
    const rows = await prisma.$transaction(async tx => Promise.all((Object.keys(PERMIT_KINDS) as PermitKind[]).map(async kind => {
      const [baseline, history, highest, highestCancelledRows, legacyDuplicates] = await Promise.all([
        tx.workPermitNumberBaseline.findUnique({ where: { kind_year: { kind, year } } }),
        tx.workPermitNumberBaselineHistory.findMany({ where: { kind, year }, orderBy: { createdAt: "desc" }, take: 10 }),
        permitNumberHighWater(tx, kind, year),
        tx.$queryRaw<Array<{ number: string | null }>>(Prisma.sql`
          SELECT max("number"::numeric)::text AS "number"
          FROM "WorkPermitNumberReservation"
          WHERE "kind" = ${kind} AND "year" = ${year}
            AND "status" = 'CANCELLED' AND "number" ~ '^[0-9]+$'
        `),
        tx.$queryRaw<Array<{ number: string; permitIds: string[] }>>(Prisma.sql`
          SELECT "number"::numeric::text AS "number", array_agg("id" ORDER BY "createdAt") AS "permitIds"
          FROM "WorkPermit"
          WHERE "kind" = ${kind} AND "year" = ${year}
            AND "status" NOT IN ('DRAFT', 'CANCELLED') AND "number" ~ '^[0-9]+$'
          GROUP BY "number"::numeric HAVING count(*) > 1
        `),
      ]);
      const floor = baseline && BigInt(baseline.number) > BigInt(highest) ? BigInt(baseline.number) : BigInt(highest);
      const highestCancelled = highestCancelledRows[0]?.number ?? null;
      const withoutCancelled = highestCancelled ? await permitNumberHighWater(tx, kind, year, { ignoreCancelledNumber: highestCancelled }) : highest;
      const reuseFloor = baseline && BigInt(baseline.number) > BigInt(withoutCancelled) ? BigInt(baseline.number) : BigInt(withoutCancelled);
      const reusableCancelledNumber = highestCancelled && BigInt(highestCancelled) === reuseFloor + BigInt(1) ? highestCancelled : null;
      return { kind, year, baseline, highest, suggested: baseline ? (floor + BigInt(1)).toString() : null,
        reusableCancelledNumber, history, legacyDuplicates };
    })));
    return ok(rows);
  });
}

export async function PUT(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); requireRole(user, ["ADMIN"]);
    const body = await permitBody(req);
    const { kind, year } = permitNumberScope(body.kind, body.year);
    const input = typeof body.number === "string" ? body.number.trim() : "";
    const reuseCancelledNumber = body.reuseCancelledNumber === undefined || body.reuseCancelledNumber === null || body.reuseCancelledNumber === ""
      ? null : canonicalPermitNumber(body.reuseCancelledNumber);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!/^[0-9]{1,80}$/.test(input)) return fail("Mốc sổ giấy phải là số nguyên không âm", 400);
    if (!reason || reason.length > 2000) return fail("Cần nhập lý do thiết lập hoặc điều chỉnh mốc", 400);
    const number = BigInt(input).toString();
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "number" FROM "WorkPermitNumberBaseline" WHERE "kind" = ${kind} AND "year" = ${year} FOR UPDATE`;
      const previous = await tx.workPermitNumberBaseline.findUnique({ where: { kind_year: { kind, year } } });
      if (previous && body.version !== previous.version) throw fail("Mốc sổ giấy đã được người khác sửa. Vui lòng tải lại.", 409);
      const active = await tx.$queryRaw<Array<{ highest: string | null }>>(Prisma.sql`
        SELECT max("number"::numeric)::text AS "highest" FROM "WorkPermit"
        WHERE "kind" = ${kind} AND "year" = ${year}
          AND "status" NOT IN ('DRAFT', 'CANCELLED') AND "number" ~ '^[0-9]+$'
      `);
      if (BigInt(number) < BigInt(active[0]?.highest ?? "0")) throw fail("Mốc không được thấp hơn số PCT chưa hủy cao nhất trên website", 409);
      let releasedCount = 0;
      if (reuseCancelledNumber) {
        if (await activePermitNumberExists(tx, kind, year, reuseCancelledNumber)) throw fail("Số PCT muốn cấp lại đang được một phiếu khác sử dụng", 409);
        const highWaterWithoutTarget = await permitNumberHighWater(tx, kind, year, { ignoreCancelledNumber: reuseCancelledNumber });
        const floorWithoutTarget = BigInt(number) > BigInt(highWaterWithoutTarget) ? BigInt(number) : BigInt(highWaterWithoutTarget);
        if (BigInt(reuseCancelledNumber) !== floorWithoutTarget + BigInt(1)) {
          throw fail("Chỉ có thể cấp lại số đã hủy liền sau mốc hiện tại", 409);
        }
        const cancelled = await tx.workPermitNumberReservation.findMany({
          where: { kind, year, number: reuseCancelledNumber, status: "CANCELLED" }, select: { id: true },
        });
        if (!cancelled.length) throw fail("Không tìm thấy lượt cấp số đã hủy để đặt lại", 409);
        const released = await tx.workPermitNumberReservation.updateMany({
          where: { id: { in: cancelled.map(item => item.id) }, status: "CANCELLED" }, data: { status: "RELEASED" },
        });
        releasedCount = released.count;
        await Promise.all(cancelled.map(item => tx.workPermitNumberReservationHistory.create({ data: {
          reservationId: item.id, action: "RELEASED", actorId: user.id, actorName: user.name ?? "",
          note: `Cho phép cấp lại số ${reuseCancelledNumber}/${year}: ${reason}`,
        } })));
      }
      const saved = previous
        ? await tx.workPermitNumberBaseline.update({ where: { kind_year: { kind, year } }, data: { number, updatedById: user.id, version: { increment: 1 } } })
        : await tx.workPermitNumberBaseline.create({ data: { kind, year, number, updatedById: user.id } });
      await tx.workPermitNumberBaselineHistory.create({ data: { kind, year, before: previous?.number ?? null,
        after: number, reason, actorId: user.id, actorName: user.name ?? "" } });
      return { baseline: saved, releasedNumber: releasedCount ? reuseCancelledNumber : null };
    });
    await audit(user.id, "SET_WORK_PERMIT_NUMBER_BASELINE", "WorkPermitNumberBaseline", `${kind}:${year}`,
      `Đặt mốc ${number}${result.releasedNumber ? `, cho phép cấp lại số ${result.releasedNumber}` : ""}: ${reason}`);
    return ok(result);
  });
}
