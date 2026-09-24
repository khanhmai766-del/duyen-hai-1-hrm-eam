import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { audit, ok, requireUser } from "@/lib/api";
import { OPERATION_POSITION_TITLES } from "@/lib/positions";
import { PERMIT_UNITS } from "@/lib/work-permits";
import { permitBody, permitHandle } from "@/lib/server/work-permits";
import { requirePermitIssue } from "@/lib/server/work-permit-permissions";
import { cancelNkvhPermit, claimNkvhPermit, nkvhClaimResult, parseNkvhPage, parseNkvhScope, syncNkvhPermit } from "@/lib/server/work-permit-nkvh-claim";
export const dynamic = "force-dynamic";

/** API của tiện ích "Cấp số PCT NKVH" (chrome-extension/nkvh-pct) — nghiệp vụ ở lib/server/work-permit-nkvh-claim.ts. */
export async function GET(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const params = new URL(req.url).searchParams;
    const { kind, nkvhPctId } = parseNkvhScope({ kind: params.get("kind"), nkvhPctId: params.get("nkvhPctId") });
    const select = { id: true, number: true, year: true, status: true } as const;
    const permit = await prisma.workPermit.findFirst({ where: { kind, nkvhPctId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, select });
    // Phiếu sổ đã hủy của chính id_pct này — để trang NKVH đã hủy biết đã báo hủy rồi.
    const cancelled = permit ? null : await prisma.workPermit.findFirst({ where: { kind, nkvhPctId, status: "CANCELLED" }, orderBy: { createdAt: "desc" }, select });
    return ok({
      permit: permit ? nkvhClaimResult(permit, false) : null,
      cancelledPermit: cancelled ? nkvhClaimResult(cancelled, false) : null,
      positions: OPERATION_POSITION_TITLES, units: PERMIT_UNITS, userName: user.name ?? "",
    });
  });
}

export async function POST(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitIssue(user);
    const body = await permitBody(req);
    const { kind, nkvhPctId } = parseNkvhScope(body);
    if (body.mode === "cancel") {
      const result = await prisma.$transaction(tx => cancelNkvhPermit(tx, user, { kind, nkvhPctId, reason: body.reason }));
      await audit(user.id, "UPDATE_WORK_PERMIT", "WorkPermit", result.id, `Hủy PCT ${result.formatted} theo NKVH`);
      return ok(result);
    }
    const page = parseNkvhPage(body.page, kind);
    if (body.mode === "sync") {
      const result = await prisma.$transaction(tx => syncNkvhPermit(tx, user, { kind, nkvhPctId, page }));
      await audit(user.id, "SYNC_WORK_PERMIT_NKVH", "WorkPermit", result.id, `Đồng bộ PCT ${result.formatted} từ NKVH`);
      return ok(result);
    }
    const result = await prisma.$transaction(tx => claimNkvhPermit(tx, user, { kind, nkvhPctId, page, unit: body.unit, position: body.position }));
    if (result.created) await audit(user.id, "CREATE_WORK_PERMIT", "WorkPermit", result.id, `Tạo PCT ${result.formatted} từ NKVH (tiện ích)`);
    return ok(result);
  });
}
