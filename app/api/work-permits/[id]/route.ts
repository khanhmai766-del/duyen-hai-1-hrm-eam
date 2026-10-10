import { assertNkvhLinkAvailable, lockPermitNumberScope } from "@/lib/server/work-permit-number-reservations";
import { normalizeText } from "@/lib/nav";
import { assertOverhaulItemsConfirmed, parseOverhaulItems, sharedOverhaulPercents } from "@/lib/server/work-permit-overhaul";
import { enqueueOverhaulCancel, enqueueOverhaulClose, pushOverhaulSheetOutboxQuietly } from "@/lib/server/overhaul-sheet-writer";
import { after as afterResponse } from "next/server";
import { latestOverhaulNotes, overhaulItemsOf } from "@/lib/work-permit-overhaul";
import { requirePermitPositionAllowed, requirePermitVisible } from "@/lib/server/work-permit-scope";
import { permitIssueUpdateNeedsExecution } from "@/lib/work-permit-permissions";
import { requirePermitCancel, requirePermitIssuer, requirePermitExecute, permitCapabilities, permitRowCapabilities } from "@/lib/server/work-permit-permissions";
import { resolvePermitSafety } from "@/lib/server/work-permit-safety";
import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { audit, fail, ok, requireRole, requireUser } from "@/lib/api";
import { defaultPermitFormat, effectivePermitFormat, formatPermitNumber, PERMIT_STATUSES, PERMIT_TRANSITIONS, CONTRACTOR_PERMIT_TRANSITIONS, type PermitStatus } from "@/lib/work-permits";
import { parsePermit, permitBody, permitHandle, permitSnapshot, permitText, resolvePermitDefectLink } from "@/lib/server/work-permits";
import { resolvePermitIdentities } from "@/lib/server/work-permit-identities";
import { assertContractorCompanyScope } from "@/lib/server/work-permit-company-scope";
import { findSimilarPermits } from "@/lib/server/work-permit-similar";
import { historySummarySelect } from "@/lib/server/work-permit-selects";
import { consumePermitNumberReservation, teamTypeLabel } from "@/lib/server/work-permit-number-reservations";
import type { PermitKind } from "@/lib/work-permits";
import { syncPermitDocument } from "@/lib/server/work-permit-document-store";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser();
    await requirePermitVisible(user, params.id);
    const row = await prisma.workPermit.findUnique({ where: { id: params.id }, include: { sessions: { take: 2, orderBy: [{ openedAt: "desc" }, { id: "desc" }], include: { commander: { select: { phone: true } } } }, history: { take: 2, select: historySummarySelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }, _count: { select: { sessions: true, history: true } } } });
    if (!row) return fail("Không tìm thấy PCT", 404);
    // Điền sẵn hộp Kết thúc / Cập nhật tiến độ: % lũy kế CHUNG của hạng mục (mọi PCT cùng giữ — Cơ + Điện của hạng mục
    // phối hợp), ghi chú gần nhất của RIÊNG phiếu này (mỗi PCT một đoạn nhật ký).
    const overhaulItems = overhaulItemsOf(row.overhaulItems);
    const overhaulSessions = overhaulItems.length
      ? await prisma.workPermitSession.findMany({ where: { permitId: row.id }, orderBy: [{ openedAt: "desc" }, { id: "desc" }], select: { itemProgress: true } })
      : null;
    const overhaulNotes = overhaulSessions ? Object.fromEntries(latestOverhaulNotes(overhaulSessions)) : undefined;
    const overhaulPercents = overhaulSessions
      ? Object.fromEntries(await sharedOverhaulPercents(prisma, overhaulItems))
      : {};
    // Phiếu chưa làm việc (nháp chờ NKVH / đã cấp): cảnh báo nếu cùng sổ + cương vị có phiếu nội dung gần giống.
    const similarPermits = ["DRAFT", "ISSUED"].includes(row.status)
      ? (await findSimilarPermits(prisma, { kind: row.kind, position: row.position, content: row.content, excludeId: row.id })).map(({ id, number, year, status, content }) => ({ id, number, year, status, content }))
      : [];
    return ok({ ...row, overhaulPercents, overhaulNotes, similarPermits }, { ...await permitCapabilities(user), ...permitRowCapabilities(user, row), canDelete: user.role === "ADMIN" && user.accessMode !== "DEFECT_READ_ONLY", canEditLivePermit: user.role === "ADMIN" && user.accessMode !== "DEFECT_READ_ONLY" });
  });
}

/** Chỉ ADMIN được xóa hẳn phiếu đã hủy; lịch sử cấp số và audit vẫn được giữ. */
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser(); requireRole(user, ["ADMIN"]);
    if (user.accessMode === "DEFECT_READ_ONLY") throw fail("Tài khoản chỉ đọc không được xóa PCT", 403);
    await requirePermitVisible(user, params.id);
    const body = await permitBody(req);
    const reason = permitText(body, "reason", 2000);
    if (reason.length < 5) throw fail("Nhập lý do xóa PCT (ít nhất 5 ký tự).");
    const removed = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${params.id} FOR UPDATE`;
      const row = await tx.workPermit.findUnique({ where: { id: params.id } });
      if (!row) throw fail("Không tìm thấy PCT", 404);
      if (row.status !== "CANCELLED") throw fail("Chỉ được xóa PCT đã hủy", 409);
      if (body.version !== row.version) throw fail("Phiếu đã được người khác cập nhật. Đóng cửa sổ và tải lại trước khi xóa.", 409);
      if (await tx.workPermitSession.count({ where: { permitId: row.id, endedAt: null } })) {
        throw fail("Phiếu còn lần làm việc chưa kết thúc, không thể xóa", 409);
      }
      // File Word dùng key theo loại/năm/số: số đã cấp lại có thể đang dùng cùng file.
      const sharedDocument = effectivePermitFormat(row) === "PAPER" && await tx.workPermit.findFirst({
        where: { id: { not: row.id }, kind: row.kind, year: row.year, number: row.number, status: { not: "DRAFT" },
          OR: [{ format: "PAPER" }, { format: null, teamType: "CONTRACTOR" }] }, select: { id: true },
      });
      const sessions = await tx.workPermitSession.deleteMany({ where: { permitId: row.id } });
      const history = await tx.workPermitHistory.deleteMany({ where: { permitId: row.id } });
      await tx.workPermit.delete({ where: { id: row.id } });
      // permitId ở lịch sử cấp số là liên kết mềm: giữ ID gốc để đối chiếu audit sau khi xóa.
      const reservations = await tx.workPermitNumberReservation.findMany({ where: { permitId: row.id }, select: { id: true } });
      for (const reservation of reservations) {
        await tx.workPermitNumberReservationHistory.create({ data: { reservationId: reservation.id, action: "PERMIT_DELETED",
          actorId: user.id, actorName: user.name ?? "", permitId: row.id, note: reason } });
      }
      return { row, sessions: sessions.count, history: history.count, deleteDocument: !sharedDocument };
    });
    await audit(user.id, "DELETE_WORK_PERMIT", "WorkPermit", removed.row.id,
      `Xóa PCT đã hủy ${formatPermitNumber(removed.row)}: ${reason} · ${removed.sessions} lần làm việc · ${removed.history} mục lịch sử`);
    if (removed.deleteDocument) await syncPermitDocument(null, removed.row);
    return ok({ id: removed.row.id });
  });
}
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    // Chỉnh sửa / cấp phiếu: chỉ nhóm cấp phiếu cố định (nghiệp vụ 04/10/2026), không nới theo RBAC "Cấp phiếu".
    const user = await requireUser(); requirePermitIssuer(user);
    await requirePermitVisible(user, params.id);
    const body = await permitBody(req);
    if (body.position !== undefined) await requirePermitPositionAllowed(user, body.position);
    const status = String(body.status) as PermitStatus;
    if (!Object.hasOwn(PERMIT_STATUSES, status)) return fail("Trạng thái không hợp lệ");
    // Cấp (nháp → Đã cấp) và hủy là việc của nhóm cố định (lib/work-permit-issuers.ts); sửa thông tin thì theo requirePermitIssue.
    if (status === "ISSUED" || status === "CANCELLED") {
      const current = await prisma.workPermit.findUnique({ where: { id: params.id }, select: { status: true } });
      if (current && current.status !== status) {
        requirePermitIssuer(user);
        // Hủy phiếu đã cấp: các cấp quản lý đến Trưởng kíp. Hủy nháp vẫn theo nhóm cấp phiếu.
        if (status === "CANCELLED" && current.status !== "DRAFT") requirePermitCancel(user);
      }
    }
    const numberScope = await prisma.workPermit.findUniqueOrThrow({ where: { id: params.id }, select: { kind: true, year: true, nkvhPctId: true } });
    let previous: Awaited<ReturnType<typeof prisma.workPermit.findUnique>> = null;
    const row = await prisma.$transaction(async tx => {
      await assertNkvhLinkAvailable(tx, numberScope.kind as PermitKind, typeof body.nkvhPctId === "string" ? body.nkvhPctId.toLowerCase() : numberScope.nkvhPctId, params.id);
      await lockPermitNumberScope(tx, numberScope.kind as PermitKind, numberScope.year);
      await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${params.id} FOR UPDATE`;
      const before = await tx.workPermit.findUnique({ where: { id: params.id } });
      if (!before) throw fail("Không tìm thấy PCT", 404);
      previous = before;
      if (permitIssueUpdateNeedsExecution(before, body)) await requirePermitExecute(user);
      if (before.status === "PAUSED" && body.status !== "CANCELLED" && body.statusReason !== undefined && body.statusReason !== before.statusReason) await requirePermitExecute(user);
      if (["CLOSED", "CANCELLED"].includes(before.status)) throw fail("Phiếu đã đóng hoặc hủy được khóa để giữ lịch sử", 409);
      if (before.status === "DRAFT" && before.nkvhPctId) throw fail("Phiếu đang chờ lưu trên NKVH — sổ tự ghi nhận khi NKVH lưu xong. Trên sổ chỉ hủy được phiếu chờ này.", 409);
      if (body.version !== before.version) throw fail("Phiếu đã được người khác cập nhật. Đóng cửa sổ và tải lại trước khi sửa.", 409);
      const linkedBody = await resolvePermitDefectLink(tx, {
        ...body,
        defectId: body.defectId === undefined ? before.defectId : body.defectId,
        repairRequestNumber: body.repairRequestNumber === undefined ? before.repairRequestNumber : body.repairRequestNumber,
      }, before);
      const data = parsePermit(await resolvePermitIdentities(tx, { ...linkedBody, format: body.format ?? before.format,
        position: body.position === undefined ? before.position : body.position,
        contractorScope: body.contractorScope === undefined ? before.contractorScope : body.contractorScope,
        nkvhPctId: body.nkvhPctId === undefined ? before.nkvhPctId : body.nkvhPctId,
        registrationNumber: body.registrationNumber === undefined ? before.registrationNumber : body.registrationNumber,
        printWorkerCount: body.printWorkerCount === undefined ? before.printWorkerCount : body.printWorkerCount,
        managingUnit: body.managingUnit === undefined ? before.managingUnit : body.managingUnit,
        plantName: body.plantName === undefined ? before.plantName : body.plantName,
        sourceClassification: body.sourceClassification === undefined ? before.sourceClassification : body.sourceClassification,
        electricalSafetySupervisorName: body.electricalSafetySupervisorName === undefined ? before.electricalSafetySupervisorName : body.electricalSafetySupervisorName,
        workScope: body.workScope === undefined ? before.workScope : body.workScope,
        disciplines: body.disciplines === undefined ? before.disciplines : body.disciplines,
        plannedStartAt: body.plannedStartAt === undefined ? before.plannedStartAt?.toISOString() ?? null : body.plannedStartAt,
        plannedEndAt: body.plannedEndAt === undefined ? before.plannedEndAt?.toISOString() ?? null : body.plannedEndAt,
      }, user, before), status);
      if (before.nkvhNumber) data.searchText += ` ${normalizeText(before.nkvhNumber)}`;
      // Đơn vị đã phân loại khác nhóm phiếu → chặn; chỉ kiểm khi đổi đơn vị / nhóm phiếu.
      await assertContractorCompanyScope(tx, data, before);
      /*
       * Đổi LOẠI ĐƠN VỊ (nội bộ · điện tử ⇄ nhà thầu · giấy) giữ nguyên số: số thuộc về sổ, không
       * thuộc loại đơn vị. Chỉ cho khi chưa có gì không đảo ngược được — phiếu mới ở "Đã cấp" (hoặc
       * nháp), chưa cho phép làm việc và chưa từng mở lần làm việc. Quá mốc đó thì hồ sơ đã có chữ
       * ký theo loại cũ; muốn sửa phải để quản trị xoá phiếu rồi cấp lại.
       * Hình thức luôn đi theo loại đơn vị; đổi sổ (Cơ ↔ Điện) thì không bao giờ được.
       */
      const teamTypeChanged = data.teamType !== before.teamType;
      if (data.kind !== before.kind) throw fail("Không thể đổi loại PCT (sổ Cơ/Điện) của phiếu đã tạo", 409);
      if (teamTypeChanged) {
        if (!["DRAFT", "ISSUED"].includes(before.status) || status !== before.status) throw fail("Chỉ đổi loại phiếu khi phiếu đang ở trạng thái Đã cấp và không đổi trạng thái cùng lúc", 409);
        if (before.authorizedAt) throw fail("Phiếu đã được cho phép làm việc — không đổi loại phiếu được nữa", 409);
        if (await tx.workPermitSession.count({ where: { permitId: before.id } })) throw fail("Phiếu đã có lần làm việc — không đổi loại phiếu được nữa", 409);
        if (data.format !== defaultPermitFormat(data.teamType)) throw fail("PCT nhà thầu dùng phiếu giấy; PCT nội bộ dùng phiếu điện tử");
      } else if (data.format !== (before.format ?? defaultPermitFormat(before.teamType))) {
        throw fail("Không thể đổi hình thức của phiếu đã tạo", 409);
      }
      // Đổi NHÓM phiếu nhà thầu (SCTX ↔ Đại tu, 08/10/2026 — thay cho hủy rồi cấp lại như PCT 4319): cùng mốc với đổi loại
      // đơn vị — chưa cho phép làm việc, chưa có lần làm việc. CHTT / nhân viên phải đúng nhóm mới (resolvePermitIdentities).
      if (!teamTypeChanged && data.teamType === "CONTRACTOR" && (data.contractorScope ?? null) !== (before.contractorScope ?? null)) {
        if (!["DRAFT", "ISSUED"].includes(before.status) || status !== before.status) throw fail("Chỉ đổi nhóm phiếu (SCTX / Đại tu) khi phiếu đang ở trạng thái Đã cấp và không đổi trạng thái cùng lúc", 409);
        if (before.authorizedAt) throw fail("Phiếu đã được cho phép làm việc — không đổi nhóm phiếu được nữa", 409);
        if (await tx.workPermitSession.count({ where: { permitId: before.id } })) throw fail("Phiếu đã có lần làm việc — không đổi nhóm phiếu được nữa", 409);
      }
      if (permitIssueUpdateNeedsExecution(before, data)) await requirePermitExecute(user);
      if (before.teamType === "INTERNAL" && (data.authorizerName !== before.authorizerName || (data.authorizedAt?.getTime() ?? null) !== (before.authorizedAt?.getTime() ?? null) || (body.progress !== undefined && body.progress !== before.progress))) throw fail("PCT nội bộ không quản lý bước cho phép hoặc tiến độ; dữ liệu cũ được giữ nguyên");
      if (body.progress !== undefined && body.progress !== before.progress && (typeof body.progress !== "number" || !Number.isInteger(body.progress) || body.progress < 0 || body.progress > 100 || !["ACTIVE", "PAUSED", "WAITING"].includes(before.status))) throw fail("Chỉ cập nhật tiến độ từ 0 đến 100% cho phiếu đã vào làm việc");
      if (status !== before.status && !(before.teamType === "CONTRACTOR" ? CONTRACTOR_PERMIT_TRANSITIONS : PERMIT_TRANSITIONS)[before.status as PermitStatus]?.includes(status)) throw fail("Không thể chuyển sang trạng thái này", 409);
      if (before.status !== "DRAFT" && (data.kind !== before.kind || data.year !== before.year || data.number !== before.number)) throw fail("Không được đổi loại, số hoặc năm của phiếu đã cấp", 409);
      if (before.issuedAt && !data.issuedAt || before.authorizedAt && !data.authorizedAt) throw fail("Không được xóa mốc cấp hoặc cho phép làm việc đã ghi nhận", 409);
      if (before.teamType === "CONTRACTOR" && !teamTypeChanged) {
        if ((before.authorizedAt?.getTime() ?? null) !== (data.authorizedAt?.getTime() ?? null)) throw fail("Thời điểm cho phép làm việc được ghi qua từng lần làm việc", 409);
        const live = await tx.workPermitSession.findFirst({ where: { permitId: before.id, endedAt: null } });
        // Quản trị được sửa thông tin phiếu đang làm việc (10/10/2026) — nhưng không đổi trạng thái khi lần làm việc còn mở.
        if (live && (user.role !== "ADMIN" || status !== before.status)) throw fail(user.role === "ADMIN" ? "Phiếu đang làm việc — chỉ sửa được thông tin, không đổi trạng thái. Kết thúc lần làm việc trước khi đóng/hủy PCT." : "Cần kết thúc lần làm việc đang mở trước khi sửa hoặc đóng/hủy PCT", 409);
        const last = await tx.workPermitSession.findFirst({ where: { permitId: before.id }, orderBy: { openedAt: "desc" } });
        if (status === "CLOSED" && (!last?.endedAt || !data.closedAt || data.closedAt < last.endedAt)) throw fail("Thời điểm đóng PCT phải từ thời điểm kết thúc lần làm việc cuối trở đi");
        if (last && data.issuedAt && before.authorizedAt && data.issuedAt > before.authorizedAt) throw fail("Thời điểm cấp không được sau lần cho phép làm việc đầu tiên");
      }
      // Không gửi overhaulItems = giữ nguyên; phiếu rời nhóm Đại tu thì parseOverhaulItems trả DbNull để xoá.
      const overhaulItems = parseOverhaulItems(body.overhaulItems === undefined ? before.overhaulItems ?? undefined : body.overhaulItems, data);
      // Phiếu đã cấp (hoặc vừa cấp từ nháp) thêm hạng mục đang nằm trong PCT khác: phải đã xác nhận trong hộp chọn.
      // Nháp → cấp: so với rỗng (mọi mục coi là mới) vì lúc lưu nháp chưa kiểm.
      if (body.overhaulItems !== undefined && !["DRAFT", "CANCELLED", "CLOSED"].includes(status)) await assertOverhaulItemsConfirmed(tx, body.overhaulItems, before.status === "DRAFT" ? null : before.overhaulItems, params.id);
      const saved = await tx.workPermit.updateMany({ where: { id: params.id, version: before.version }, data: { ...data, ...(overhaulItems !== undefined ? { overhaulItems } : {}), ...(body.progress !== undefined ? { progress: body.progress as number | null } : {}), safetyItems: permitSnapshot(await resolvePermitSafety(tx, { ...body, format: data.format, teamType: data.teamType }, before)), status, version: { increment: 1 } } });
      if (saved.count !== 1) throw fail("Phiếu vừa được cập nhật ở phiên khác. Vui lòng tải lại.", 409);
      const after = await tx.workPermit.findUniqueOrThrow({ where: { id: params.id } });
      if (before.status === "DRAFT" && status === "ISSUED") {
        await consumePermitNumberReservation(tx, { reservationId: body.reservationId, kind: data.kind as PermitKind,
          year: data.year, number: data.number, teamType: data.teamType, userId: user.id, userName: user.name ?? "",
          isAdmin: user.role === "ADMIN", permitId: after.id });
      }
      if (teamTypeChanged && before.status !== "DRAFT") {
        // Lượt giữ số đã gắn phiếu cũng mang loại đơn vị — cập nhật cho khớp để tra cứu số không lệch.
        const reservation = await tx.workPermitNumberReservation.findUnique({ where: { permitId: after.id } });
        if (reservation) {
          await tx.workPermitNumberReservation.update({ where: { id: reservation.id }, data: { teamType: data.teamType } });
          await tx.workPermitNumberReservationHistory.create({ data: { reservationId: reservation.id, action: "TEAM_TYPE_CHANGED",
            actorId: user.id, actorName: user.name ?? "", permitId: after.id, note: `${teamTypeLabel(before.teamType)} → ${teamTypeLabel(data.teamType)}` } });
        }
      }
      if (status === "CANCELLED" && before.status !== "CANCELLED") {
        const reservation = await tx.workPermitNumberReservation.findUnique({ where: { permitId: after.id } });
        if (reservation?.status === "ISSUED") {
          await tx.workPermitNumberReservation.update({ where: { id: reservation.id },
            data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: user.id, cancelReason: data.statusReason } });
          await tx.workPermitNumberReservationHistory.create({ data: { reservationId: reservation.id, action: "CANCELLED",
            actorId: user.id, actorName: user.name ?? "", permitId: after.id, note: data.statusReason } });
        }
        // PCT đại tu giữ hạng mục cuối cùng: chốt kết quả cuối lên Sheet kèm "PCT hủy do …".
        await enqueueOverhaulCancel(tx, before, after, new Date(), after.statusReason);
      }
      if (status === "CLOSED" && before.status !== "CLOSED") await enqueueOverhaulClose(tx, after, after.closedAt ?? new Date());
      await tx.workPermitHistory.create({ data: { permitId: after.id, actorId: user.id, actorName: user.name ?? "", action: teamTypeChanged ? `Đổi loại phiếu: ${teamTypeLabel(before.teamType)} → ${teamTypeLabel(data.teamType)}` : status === before.status ? "Cập nhật thông tin" : `Chuyển sang ${PERMIT_STATUSES[status]}`, before: permitSnapshot(before), after: permitSnapshot(after) } });
      return after;
    });
    await audit(user.id, "UPDATE_WORK_PERMIT", "WorkPermit", row.id, `Cập nhật PCT ${formatPermitNumber(row)}: ${PERMIT_STATUSES[status]}`);
    await syncPermitDocument(row, previous);
    if (["CLOSED", "CANCELLED"].includes(row.status) && row.contractorScope === "OVERHAUL") afterResponse(pushOverhaulSheetOutboxQuietly);
    return ok(row);
  });
}
