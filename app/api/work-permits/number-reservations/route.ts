import { audit, fail, ok, requireUser } from "@/lib/api";
import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { canonicalPermitNumber, permitNumberScope, reservePermitNumber } from "@/lib/server/work-permit-number-reservations";
import { permitBody, permitHandle } from "@/lib/server/work-permits";

export const dynamic = "force-dynamic";

export async function GET() {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const rows = await prisma.workPermitNumberReservation.findMany({
      where: { status: "RESERVED", ...(user.role === "ADMIN" ? {} : { ownerId: user.id }) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return ok(rows);
  });
}

export async function POST(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const body = await permitBody(req);
    const { kind, year } = permitNumberScope(body.kind, body.year);
    if (body.teamType !== "INTERNAL" && body.teamType !== "CONTRACTOR") return fail("Loại đơn vị không hợp lệ", 400);
    const requestedNumber = body.number === undefined || body.number === null || body.number === ""
      ? undefined : canonicalPermitNumber(body.number);
    const row = await prisma.$transaction(tx => reservePermitNumber(tx, {
      kind, year, teamType: body.teamType as "INTERNAL" | "CONTRACTOR", requestedNumber, reissueAcknowledged: body.reissueAcknowledged === true,
      ownerId: user.id, ownerName: user.name ?? "",
    }));
    await audit(user.id, "RESERVE_WORK_PERMIT_NUMBER", "WorkPermitNumberReservation", row.id,
      `Lấy số PCT ${row.number}/${row.year}, ${row.kind}`);
    return ok(row);
  });
}
