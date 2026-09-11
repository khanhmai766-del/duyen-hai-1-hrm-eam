import { Prisma } from "@prisma/client";
import { fail, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { permitHandle } from "@/lib/server/work-permits";
import { PERMIT_KINDS, type PermitKind } from "@/lib/work-permits";

export const dynamic = "force-dynamic";

interface NumericPermitNumber {
  number: string | null;
}

export async function GET(req: Request) {
  return permitHandle(async () => {
    await requireUser();
    const params = new URL(req.url).searchParams;
    const kind = params.get("kind") ?? "";
    const year = Number(params.get("year"));

    if (!Object.hasOwn(PERMIT_KINDS, kind)) return fail("Loại PCT không hợp lệ");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail("Năm cấp số không hợp lệ");

    const rows = await prisma.$queryRaw<NumericPermitNumber[]>(Prisma.sql`
      SELECT max("number"::numeric)::text AS "number"
      FROM "WorkPermit"
      WHERE "kind" = ${kind as PermitKind}
        AND "year" = ${year}
        AND "status" <> 'CANCELLED'
        AND "number" ~ '^[0-9]+$'
    `);
    const highest = rows[0]?.number ?? null;
    const suggested = highest
      ? (BigInt(highest) + BigInt(1)).toString().padStart(highest.length, "0")
      : "1";

    return ok({ highest, suggested: suggested.length <= 80 ? suggested : null });
  });
}
