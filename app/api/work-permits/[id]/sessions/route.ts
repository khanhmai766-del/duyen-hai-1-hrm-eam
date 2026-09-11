import { requirePermitExecute } from "@/lib/server/work-permit-permissions";
import { normalizeText } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { permitBody, permitHandle, permitInstant, permitSnapshot, permitText } from "@/lib/server/work-permits";
import { assertCommanderFree, readSessionOpen, resolveSessionMembers, validateSessionTime } from "@/lib/server/work-permit-sessions";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitExecute(user);
    const body = await permitBody(req);
    if (!["open", "end", "handoff"].includes(String(body.action))) return fail("Thao tác lần làm việc không hợp lệ");
    const result = await prisma.$transaction(async tx => {
      // Mọi thao tác vòng đời đều khóa phiếu trước, rồi khóa CHTT: cùng thứ tự tránh deadlock.
      await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${params.id} FOR UPDATE`;
      const permit = await tx.workPermit.findUnique({ where: { id: params.id } });
      if (!permit) throw fail("Không tìm thấy PCT", 404);
      if (permit.teamType !== "CONTRACTOR") throw fail("Quản lý lần làm việc chỉ áp dụng cho đơn vị nhà thầu");
      if (body.version !== permit.version) throw fail("Phiếu đã thay đổi. Đóng cửa sổ và tải lại trước khi thao tác.", 409);
      if (body.action === "open" || body.action === "handoff") {
        const handoff = body.action === "handoff";
        const oldSession = handoff ? await tx.workPermitSession.findFirst({ where: { id: permitText(body, "sessionId", 100), permitId: permit.id, endedAt: null } }) : null;
        if (handoff && (!oldSession || permit.status !== "ACTIVE")) throw fail("Lần làm việc không còn mở. Vui lòng tải lại phiếu.", 409);
        if ((!handoff && !["ISSUED", "WAITING"].includes(permit.status)) || !permit.issuedAt) throw fail("Chỉ mở lần làm việc cho phiếu đã cấp hoặc đang chờ làm tiếp", 409);
        const input = readSessionOpen(body);
        validateSessionTime(input.openedAt, permit.issuedAt);
        if (oldSession && oldSession.commanderId === input.commanderId) throw fail("Vui lòng chọn CHTT mới khác người đang thực hiện");
        if (oldSession) validateSessionTime(input.openedAt, oldSession.openedAt);
        // Khóa hai CHTT theo cùng thứ tự để hai bàn giao đồng thời không deadlock.
        for (const id of [...new Set([input.commanderId, ...(oldSession ? [oldSession.commanderId] : [])])].sort()) {
          await tx.$queryRaw`SELECT "id" FROM "WorkPermitPerson" WHERE "id" = ${id} FOR UPDATE`;
        }
        const person = await tx.workPermitPerson.findUnique({ where: { id: input.commanderId } });
        if (!person?.isActive || !person.canCommand) throw fail("Người được chọn không có trong danh sách CHTT nhà thầu đang hoạt động");
        const previous = await tx.workPermitSession.findFirst({ where: { permitId: permit.id, ...(oldSession ? { id: { not: oldSession.id } } : {}), OR: [{ endedAt: null }, { endedAt: { gt: input.openedAt } }] } });
        if (previous) throw fail("Thời gian trùng với một lần làm việc khác của chính PCT này", 409);
        // Khóa CHTT xuyên hai loại sổ trước khi tìm xung đột, kể cả lần đã kết thúc có giờ giao nhau.
        await assertCommanderFree(tx, person.id, input.openedAt);
        const members = (await resolveSessionMembers(tx, input.members)).filter(member => member.personId ? member.personId !== person.id : member.code.toUpperCase() !== person.code.toUpperCase());
        const handoffNote = handoff ? permitText(body, "endNote", 2000) : "";
        if (oldSession) await tx.workPermitSession.update({ where: { id: oldSession.id }, data: {
          endedAt: input.openedAt, endConfirmedByName: input.authorizerName,
          endNote: `Bàn giao CHTT cho ${person.name}. ${handoffNote}`.trim(), endedById: user.id, endedByName: user.name ?? "",
        } });
        const session = await tx.workPermitSession.create({ data: {
          permitId: permit.id, commanderId: person.id, commanderCode: person.code, commanderName: person.name, company: person.company,
          members: permitSnapshot(members), workerCount: 1 + members.length, openedAt: input.openedAt, authorizerName: input.authorizerName,
          searchText: normalizeText([person.code, person.name, person.company, input.authorizerName, ...members.map(m => `${m.code} ${m.name} ${m.company}`)].join(" ")),
          createdById: user.id, createdByName: user.name ?? "",
        } });
        const after = await tx.workPermit.update({ where: { id: permit.id }, data: {
          status: "ACTIVE", authorizedAt: permit.authorizedAt ?? input.openedAt, authorizerName: input.authorizerName,
          version: { increment: 1 },
        } });
        await tx.workPermitHistory.create({ data: { permitId: permit.id, actorId: user.id, actorName: user.name ?? "", action: oldSession ? `Bàn giao CHTT · ${oldSession.commanderName} → ${person.name}` : `Mở lần làm việc · CHTT ${person.name} (${person.code})`, before: permitSnapshot(oldSession ? { ...permit, session: oldSession } : permit), after: permitSnapshot({ ...after, session }) } });
        return session;
      }
      const sessionId = permitText(body, "sessionId", 100);
      const endedAt = permitInstant(body, "endedAt");
      const endConfirmedByName = permitText(body, "endConfirmedByName");
      const endNote = permitText(body, "endNote", 2000);
      const progress = Number(body.progress);
      if (!sessionId || !endedAt || !endConfirmedByName) throw fail("Vui lòng nhập lần làm việc, thời điểm kết thúc và người xác nhận kết thúc");
      if (body.progress === "" || body.progress === null || body.progress === undefined || !Number.isInteger(progress) || progress < 0 || progress > 100) throw fail("Tiến độ phải là số nguyên từ 0 đến 100%");
      const session = await tx.workPermitSession.findFirst({ where: { id: sessionId, permitId: permit.id } });
      if (!session || session.endedAt || permit.status !== "ACTIVE") throw fail("Lần làm việc không còn mở. Vui lòng tải lại phiếu.", 409);
      if (session.commanderId) await tx.$queryRaw`SELECT "id" FROM "WorkPermitPerson" WHERE "id" = ${session.commanderId} FOR UPDATE`;
      validateSessionTime(endedAt, session.openedAt);
      const afterSession = await tx.workPermitSession.update({ where: { id: session.id }, data: { endedAt, endConfirmedByName, endNote, progress, endedById: user.id, endedByName: user.name ?? "" } });
      const after = await tx.workPermit.update({ where: { id: permit.id }, data: { status: "WAITING", progress, version: { increment: 1 } } });
      await tx.workPermitHistory.create({ data: { permitId: permit.id, actorId: user.id, actorName: user.name ?? "", action: `Kết thúc lần làm việc · CHTT ${session.commanderName} (${session.commanderCode})`, before: permitSnapshot({ ...permit, session }), after: permitSnapshot({ ...after, session: afterSession }) } });
      return afterSession;
    });
    await audit(user.id, body.action === "handoff" ? "HANDOFF_WORK_PERMIT_SESSION" : body.action === "open" ? "OPEN_WORK_PERMIT_SESSION" : "END_WORK_PERMIT_SESSION", "WorkPermit", params.id, `${body.action === "handoff" ? "Bàn giao" : body.action === "open" ? "Mở" : "Kết thúc"} lần làm việc ${result.id}: ${result.commanderName}`);
    return ok(result);
  });
}
