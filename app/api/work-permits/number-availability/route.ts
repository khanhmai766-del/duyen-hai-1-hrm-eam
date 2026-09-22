import { fail, ok, requireUser } from "@/lib/api";
import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { activePermitNumberExists, canonicalPermitNumber, permitNumberScope } from "@/lib/server/work-permit-number-reservations";
import { permitHandle } from "@/lib/server/work-permits";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const params = new URL(req.url).searchParams;
    const { kind, year } = permitNumberScope(params.get("kind"), params.get("year"));
    if (!params.get("number")) return fail("Cần nhập số PCT", 400);
    const number = canonicalPermitNumber(params.get("number"));
    return ok(await prisma.$transaction(async tx => {
      const [baseline, activePermit, activeReservation, cancelledPermits] = await Promise.all([
        tx.workPermitNumberBaseline.findUnique({ where: { kind_year: { kind, year } } }),
        activePermitNumberExists(tx, kind, year, number),
        tx.workPermitNumberReservation.findFirst({ where: { kind, year, number, status: { in: ["RESERVED", "ISSUED"] } }, select: { id: true } }),
        tx.$queryRaw<Array<{ id: string; number: string; content: string; teamType: string; updatedAt: Date }>>`
          SELECT "id", "number", "content", "teamType", "updatedAt" FROM "WorkPermit"
          WHERE "kind" = ${kind} AND "year" = ${year} AND "status" = 'CANCELLED'
            AND "number" ~ '^[0-9]+$' AND "number"::numeric = ${number}::numeric
          ORDER BY "updatedAt" DESC LIMIT 3
        `,
      ]);
      const cancelledReservation = await tx.workPermitNumberReservation.findFirst({ where: { kind, year, number, status: "CANCELLED" }, select: { id: true } });
      return { number, configured: Boolean(baseline), active: activePermit || Boolean(activeReservation),
        eligible: Boolean(baseline) && !activePermit && !activeReservation &&
          (BigInt(number) > BigInt(baseline!.number) || cancelledPermits.length > 0 || Boolean(cancelledReservation)),
        cancelledPermits, cancelledReservation: Boolean(cancelledReservation) };
    }));
  });
}
