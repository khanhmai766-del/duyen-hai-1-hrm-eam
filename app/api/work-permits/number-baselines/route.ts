import { Prisma } from "@prisma/client";
import { audit, fail, ok, requireRole, requireUser } from "@/lib/api";
import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { permitNumberHighWater, permitNumberScope } from "@/lib/server/work-permit-number-reservations";
import { permitBody, permitHandle } from "@/lib/server/work-permits";
import { PERMIT_KINDS, type PermitKind } from "@/lib/work-permits";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); requireRole(user, ["ADMIN"]);
    const year = Number(new URL(req.url).searchParams.get("year"));
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail("Năm cấp số không hợp lệ", 400);
    const rows = await prisma.$transaction(async tx => Promise.all((Object.keys(PERMIT_KINDS) as PermitKind[]).map(async kind => {
      const [baseline, history, highest, legacyDuplicates] = await Promise.all([
        tx.workPermitNumberBaseline.findUnique({ where: { kind_year: { kind, year } } }),
        tx.workPermitNumberBaselineHistory.findMany({ where: { kind, year }, orderBy: { createdAt: "desc" }, take: 10 }),
        permitNumberHighWater(tx, kind, year),
        tx.$queryRaw<Array<{ number: string; permitIds: string[] }>>(Prisma.sql`
          SELECT "number"::numeric::text AS "number", array_agg("id" ORDER BY "createdAt") AS "permitIds"
          FROM "WorkPermit"
          WHERE "kind" = ${kind} AND "year" = ${year}
            AND "status" NOT IN ('DRAFT', 'CANCELLED') AND "number" ~ '^[0-9]+$'
          GROUP BY "number"::numeric HAVING count(*) > 1
        `),
      ]);
      const floor = baseline && BigInt(baseline.number) > BigInt(highest) ? BigInt(baseline.number) : BigInt(highest);
      return { kind, year, baseline, highest, suggested: baseline ? (floor + BigInt(1)).toString() : null, history, legacyDuplicates };
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
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!/^[0-9]{1,80}$/.test(input)) return fail("Mốc sổ giấy phải là số nguyên không âm", 400);
    if (!reason || reason.length > 2000) return fail("Cần nhập lý do thiết lập hoặc điều chỉnh mốc", 400);
    const number = BigInt(input).toString();
    const row = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "number" FROM "WorkPermitNumberBaseline" WHERE "kind" = ${kind} AND "year" = ${year} FOR UPDATE`;
      const previous = await tx.workPermitNumberBaseline.findUnique({ where: { kind_year: { kind, year } } });
      if (previous && body.version !== previous.version) throw fail("Mốc sổ giấy đã được người khác sửa. Vui lòng tải lại.", 409);
      const active = await tx.$queryRaw<Array<{ highest: string | null }>>(Prisma.sql`
        SELECT max("number"::numeric)::text AS "highest" FROM "WorkPermit"
        WHERE "kind" = ${kind} AND "year" = ${year}
          AND "status" NOT IN ('DRAFT', 'CANCELLED') AND "number" ~ '^[0-9]+$'
      `);
      if (BigInt(number) < BigInt(active[0]?.highest ?? "0")) throw fail("Mốc không được thấp hơn số PCT chưa hủy cao nhất trên website", 409);
      const saved = previous
        ? await tx.workPermitNumberBaseline.update({ where: { kind_year: { kind, year } }, data: { number, updatedById: user.id, version: { increment: 1 } } })
        : await tx.workPermitNumberBaseline.create({ data: { kind, year, number, updatedById: user.id } });
      await tx.workPermitNumberBaselineHistory.create({ data: { kind, year, before: previous?.number ?? null,
        after: number, reason, actorId: user.id, actorName: user.name ?? "" } });
      return saved;
    });
    await audit(user.id, "SET_WORK_PERMIT_NUMBER_BASELINE", "WorkPermitNumberBaseline", `${kind}:${year}`,
      `Đặt mốc ${number}: ${reason}`);
    return ok(row);
  });
}
