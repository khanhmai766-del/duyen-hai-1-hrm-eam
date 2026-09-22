import { fail, ok, requireUser } from "@/lib/api";
import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { permitHandle } from "@/lib/server/work-permits";
import { permitNumberHighWater, permitNumberScope } from "@/lib/server/work-permit-number-reservations";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return permitHandle(async () => {
    await requireUser();
    const params = new URL(req.url).searchParams;
    const { kind, year } = permitNumberScope(params.get("kind"), params.get("year"));
    const result = await prisma.$transaction(async tx => {
      const baseline = await tx.workPermitNumberBaseline.findUnique({ where: { kind_year: { kind, year } } });
      const highest = await permitNumberHighWater(tx, kind, year);
      const floor = baseline && BigInt(baseline.number) > BigInt(highest) ? BigInt(baseline.number) : BigInt(highest);
      const suggested = (floor + BigInt(1)).toString();
      return { configured: Boolean(baseline), baseline: baseline?.number ?? null,
        highest: highest === "0" ? null : highest, suggested: baseline && suggested.length <= 80 ? suggested : null };
    });
    if (!result.configured) return ok(result, { message: "Chưa thiết lập mốc sổ giấy cho loại PCT và năm này" });
    if (!result.suggested) return fail("Dãy số PCT đã vượt quá giới hạn", 409);
    return ok(result);
  });
}
