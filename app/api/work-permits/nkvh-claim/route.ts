import { permitPositionVisible, permitScopeOf, requirePermitPositionAllowed } from "@/lib/server/work-permit-scope";
import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { OPERATION_POSITION_TITLES } from "@/lib/positions";
import { PERMIT_KINDS as PERMIT_KINDS_BY_KEY, PERMIT_UNITS } from "@/lib/work-permits";
import { permitBody, permitHandle } from "@/lib/server/work-permits";
import { requirePermitIssuer } from "@/lib/server/work-permit-permissions";
import { cancelNkvhPermit, claimNkvhPermit, closeNkvhPermit, nkvhClaimResult, NKVH_PENDING_STATUS, observeNkvhNumbers, parseNkvhKind, nkvhPositionOrBlank, parseNkvhPage, parseNkvhScope, stopNkvhPermit, syncNkvhPermit } from "@/lib/server/work-permit-nkvh-claim";
export const dynamic = "force-dynamic";

/** API của tiện ích "Cấp số PCT NKVH" (chrome-extension/nkvh-pct) — nghiệp vụ ở lib/server/work-permit-nkvh-claim.ts. */
export async function GET(req: Request) {
  return permitHandle(async () => {
    const user = await requireUser(); requirePermitIssuer(user);
    const params = new URL(req.url).searchParams;
    const { kind, nkvhPctId } = parseNkvhScope({ kind: params.get("kind"), nkvhPctId: params.get("nkvhPctId") });
    const scope = await permitScopeOf(user);
    const select = { id: true, number: true, year: true, status: true, nkvhNumber: true } as const;
    // Phiếu nháp "Chờ NKVH lưu" không trả cho tiện ích: với tiện ích, phiếu đó vẫn là lượt giữ số.
    const permit = await prisma.workPermit.findFirst({ where: { kind, nkvhPctId, status: { notIn: ["CANCELLED", NKVH_PENDING_STATUS] } }, orderBy: { createdAt: "desc" }, select });
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
    let response: Response;
    try { response = await handleNkvhPost(user, body); } catch (error) {
      if (error instanceof Response) await recordNkvhFailure(user, body, error);
      throw error;
    }
    await recordNkvhFailure(user, body, response);
    return response;
  });
}

/**
 * Tiện ích chỉ hiện lỗi trên trang NKVH (mất khi tải lại) → ghi lại để tra cứu: log máy chủ, và nếu phiếu
 * đang chờ NKVH lưu thì ghi lỗi gần nhất vào phiếu nháp để sổ hiện cho người cấp. Bỏ 404 (danh sách NKVH dò
 * đóng phiếu chưa có trên sổ là bình thường). Lỗi khi ghi chép không được che lỗi gốc.
 */
async function recordNkvhFailure(user: { id: string; name?: string | null }, body: Record<string, unknown>, error: Response) {
  if (error.status < 400 || error.status >= 500 || error.status === 404) return;
  try {
    const message = String((await error.clone().json())?.error ?? "");
    const pct = typeof body.nkvhPctId === "string" ? body.nkvhPctId.toLowerCase() : "";
    console.warn(`[nkvh-claim] ${error.status} mode=${String(body.mode ?? "")} kind=${String(body.kind ?? "")} pct=${pct || "-"} so=${String(body.formattedNumber ?? "-")} nguoi=${user.name ?? user.id}: ${message}`);
    if (!pct || !["sync", "import_existing"].includes(String(body.mode)) || !Object.hasOwn(PERMIT_KINDS_BY_KEY, String(body.kind))) return;
    const at = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date());
    await prisma.workPermit.updateMany({ where: { kind: String(body.kind), nkvhPctId: pct, status: NKVH_PENDING_STATUS },
      data: { statusReason: `Chưa đồng bộ được lúc ${at}: ${message}`.slice(0, 2000) } });
  } catch (logError) {
    console.warn("[nkvh-claim] không ghi được lỗi đồng bộ", logError);
  }
}

async function handleNkvhPost(user: Awaited<ReturnType<typeof requireUser>>, body: Record<string, unknown>) {
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
    await requirePermitPositionAllowed(user, nkvhPositionOrBlank(page, body.position));
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
}
