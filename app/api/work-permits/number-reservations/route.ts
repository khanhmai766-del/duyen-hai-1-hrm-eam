import { audit, fail, ok, requireUser } from "@/lib/api";
import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { requirePermitIssue, requirePermitIssuer } from "@/lib/server/work-permit-permissions";
import { permitNumberScope, reservePermitNumber } from "@/lib/server/work-permit-number-reservations";
import { permitBody, permitHandle } from "@/lib/server/work-permits";

export const dynamic = "force-dynamic";

export async function GET() {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const rows = await prisma.workPermitNumberReservation.findMany({
      where: { OR: [{ status: "RESERVED" }, { status: "REVIEW", nkvhPctId: { not: null }, permitId: null }], ...(user.role === "ADMIN" ? {} : { ownerId: user.id }) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    // Lượt lấy từ NKVH: kèm id phiếu nháp "Chờ NKVH lưu" mang số đó, để nút "Tiếp tục" mở chính phiếu nháp thay vì
    // biểu mẫu cấp phiếu mới (cấp mới bằng số này = hai phiếu trùng số, xem consumePermitNumberReservation).
    const linked = rows.filter(row => row.nkvhPctId);
    const drafts = linked.length ? await prisma.workPermit.findMany({
      where: { status: "DRAFT", OR: linked.map(row => ({ kind: row.kind, year: row.year, number: row.number, nkvhPctId: row.nkvhPctId })) },
      select: { id: true, kind: true, nkvhPctId: true },
    }) : [];
    return ok(rows.map(row => ({ ...row, draftPermitId: row.nkvhPctId ? drafts.find(d => d.kind === row.kind && d.nkvhPctId === row.nkvhPctId)?.id ?? null : null })));
  });
}

export async function POST(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); requirePermitIssuer(user);
    const body = await permitBody(req);
    const { kind, year } = permitNumberScope(body.kind, body.year);
    if (body.teamType !== "INTERNAL" && body.teamType !== "CONTRACTOR") return fail("Loại đơn vị không hợp lệ", 400);
    const row = await prisma.$transaction(tx => reservePermitNumber(tx, {
      kind, year, number: body.number, teamType: body.teamType as "INTERNAL" | "CONTRACTOR", ownerId: user.id, ownerName: user.name ?? "",
    }));
    await audit(user.id, "RESERVE_WORK_PERMIT_NUMBER", "WorkPermitNumberReservation", row.id,
      `Lấy số PCT ${row.number}/${row.year}, ${row.kind}`);
    return ok(row);
  });
}
