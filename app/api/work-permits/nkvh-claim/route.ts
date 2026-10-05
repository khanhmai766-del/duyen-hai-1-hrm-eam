import { permitPositionVisible, permitScopeOf, requirePermitPositionAllowed } from "@/lib/server/work-permit-scope";
import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { OPERATION_POSITION_TITLES } from "@/lib/positions";
import { PERMIT_UNITS } from "@/lib/work-permits";
import { permitBody, permitHandle } from "@/lib/server/work-permits";
import { requirePermitIssuer } from "@/lib/server/work-permit-permissions";
import { cancelNkvhPermit, claimNkvhPermit, closeNkvhPermit, nkvhClaimResult, observeNkvhNumbers, parseNkvhKind, nkvhPosition, parseNkvhPage, parseNkvhScope, stopNkvhPermit, syncNkvhPermit } from "@/lib/server/work-permit-nkvh-claim";
export const dynamic = "force-dynamic";

/** API của tiện ích "Cấp số PCT NKVH" (chrome-extension/nkvh-pct) — nghiệp vụ ở lib/server/work-permit-nkvh-claim.ts. */
export async function GET(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); requirePermitIssuer(user);
    const params = new URL(req.url).searchParams;
    const { kind, nkvhPctId } = parseNkvhScope({ kind: params.get("kind"), nkvhPctId: params.get("nkvhPctId") });
    const scope = await permitScopeOf(user);
    const select = { id: true, number: true, year: true, status: true, nkvhNumber: true } as const;
    const permit = await prisma.workPermit.findFirst({ where: { kind, nkvhPctId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, select });
    // Phiếu sổ đã hủy của chính id_pct này — để trang NKVH đã hủy biết đã báo hủy rồi.
    const cancelled = permit ? null : await prisma.workPermit.findFirst({ where: { kind, nkvhPctId, status: "CANCELLED" }, orderBy: { createdAt: "desc" }, select });
    const reservation = await prisma.workPermitNumberReservation.findFirst({ where: { kind, nkvhPctId, status: "RESERVED" } });
    return ok({
      protocolVersion: 2,
      reservation: reservation ? { id: reservation.id, reservationId: reservation.id, number: reservation.number, year: reservation.year, status: reservation.status, formatted: `${reservation.number}/${reservation.year}/VH1-NĐDH` } : null,
      permit: permit ? nkvhClaimResult(permit, false) : null,
      cancelledPermit: cancelled ? nkvhClaimResult(cancelled, false) : null,
      positions: OPERATION_POSITION_TITLES.filter(position => permitPositionVisible(position, scope)), units: PERMIT_UNITS, userName: user.name ?? "",
    });
  });
}

export async function POST(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); requirePermitIssuer(user);
    const body = await permitBody(req);
    if (body.mode === "close") {
      const kind = parseNkvhKind(body.kind);
      const result = await prisma.$transaction(tx => closeNkvhPermit(tx, user, {
        kind, nkvhPctId: body.nkvhPctId, formattedNumber: body.formattedNumber,
        sourceStatus: body.sourceStatus, closedAt: body.closedAt,
      }));
      if (result.changed) await audit(user.id, "UPDATE_WORK_PERMIT", "WorkPermit", result.id, `Đóng PCT ${result.formatted} theo NKVH`);
      return ok(result);
    }
    if (body.mode === "observe") {
      const kind = parseNkvhKind(body.kind);
      const result = await prisma.$transaction(tx => observeNkvhNumbers(tx, user, { kind, entries: body.entries }));
      if (result.recorded.length) {
        await audit(user.id, "OBSERVE_WORK_PERMIT_NUMBER_NKVH", "WorkPermitNumberReservation", undefined,
          `Ghi nhận số PCT đã dùng trên NKVH: ${result.recorded.join(", ")}`);
      }
      return ok(result);
    }
    const { kind, nkvhPctId } = parseNkvhScope(body);
    if (body.mode === "renumber") return fail("Hãy cập nhật tiện ích và đồng bộ phiếu đã lưu trên NKVH để sửa cả số và nội dung.", 400);
    if (body.mode === "cancel") {
      const result = await prisma.$transaction(tx => cancelNkvhPermit(tx, user, { kind, nkvhPctId, reason: body.reason }));
      await audit(user.id, "UPDATE_WORK_PERMIT", "WorkPermit", result.id, `Hủy PCT ${result.formatted} theo NKVH`);
      return ok(result);
    }
    if (body.mode === "stop") {
      const result = await prisma.$transaction(tx => stopNkvhPermit(tx, user, { kind, nkvhPctId, reason: body.reason }));
      await audit(user.id, "UPDATE_WORK_PERMIT", "WorkPermit", result.id, `Dừng PCT ${result.formatted} theo NKVH`);
      return ok(result);
    }
    const page = parseNkvhPage(body.page, kind);
    if (body.mode === "sync" || body.mode === "import_existing") {
      if (body.saved !== true) return fail("Hãy cập nhật tiện ích. Chỉ đồng bộ dữ liệu đã lưu trên NKVH.", 400);
      await requirePermitPositionAllowed(user, nkvhPosition(page, body.position));
      const result = await prisma.$transaction(tx => syncNkvhPermit(tx, user, { kind, nkvhPctId, page,
        unit: body.unit, position: body.position, formattedNumber: body.formattedNumber,
        sourceStatus: body.sourceStatus, sourceReason: body.sourceReason }));
      if (result.changed) await audit(user.id, "SYNC_WORK_PERMIT_NKVH", "WorkPermit", result.id, `Đồng bộ PCT ${result.formatted} theo NKVH`);
      return ok(result);
    }
    if (body.mode !== "claim") return fail("Thao tác PCT không hợp lệ. Hãy cập nhật tiện ích NKVH.", 400);
    const result = await prisma.$transaction(tx => claimNkvhPermit(tx, user, { kind, nkvhPctId, page, unit: body.unit, position: body.position }));
    if (result.created) await audit(user.id, "RESERVE_WORK_PERMIT_NUMBER", "WorkPermitNumberReservation", result.id, `Giữ số ${result.formatted} cho NKVH, chưa cấp phiếu`);
    return ok(result);
  });
}
