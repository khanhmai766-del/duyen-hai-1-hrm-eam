import { requirePermitVisible } from "@/lib/server/work-permit-scope";
import { requirePermitExecute } from "@/lib/server/work-permit-permissions";
import { normalizeText } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { permitBody, permitHandle, permitInstant, permitSnapshot, permitText } from "@/lib/server/work-permits";
import { assertCommanderFree, readSessionOpen, resolveSessionMembers, validateSessionTime } from "@/lib/server/work-permit-sessions";
import { sameCompany } from "@/lib/work-permit-card";
import { closeInsideVisits, handoffMembers, membersInside, sessionMembers, withEntry } from "@/lib/server/work-permit-attendance";
import { syncPermitDocument } from "@/lib/server/work-permit-document-store";
import { assertWorkersFree, lockWorkPermitPresence } from "@/lib/server/work-permit-presence";
import { presentMembers } from "@/lib/work-permit-presence";
import { after as afterResponse } from "next/server";
import { parseSessionItemProgress, sharedOverhaulPercents } from "@/lib/server/work-permit-overhaul";
import { enqueueOverhaulManualProgress, enqueueOverhaulProgressUpdate, enqueueOverhaulSessionEnd, overhaulProgressKey, pushOverhaulSheetOutboxQuietly, vnDay } from "@/lib/server/overhaul-sheet-writer";
import { isOverhaulPaperPermit, OVERHAUL_DAY_STATUSES, overhaulItemProgressOf, overhaulItemsOf, type OverhaulItemProgress } from "@/lib/work-permit-overhaul";
import { permitDeadline, personScopeError, workersStillInside } from "@/lib/work-permits";
export const dynamic = "force-dynamic";
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser(); await requirePermitExecute(user);
    await requirePermitVisible(user, params.id);
    const body = await permitBody(req);
    if (!["open", "end", "handoff", "progress"].includes(String(body.action))) return fail("Thao tác lần làm việc không hợp lệ");
    const result = await prisma.$transaction(async tx => {
      await lockWorkPermitPresence(tx);
      // Mọi thao tác vòng đời đều khóa phiếu trước, rồi khóa CHTT: cùng thứ tự tránh deadlock.
      await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${params.id} FOR UPDATE`;
      const permit = await tx.workPermit.findUnique({ where: { id: params.id } });
      if (!permit) throw fail("Không tìm thấy PCT", 404);
      if (permit.teamType !== "CONTRACTOR") throw fail("Quản lý lần làm việc chỉ áp dụng cho đơn vị nhà thầu");
      if (body.version !== permit.version) throw fail("Phiếu đã thay đổi. Đóng cửa sổ và tải lại trước khi thao tác.", 409);
      if (body.action === "open" || body.action === "handoff") {
        const handoff = body.action === "handoff";
        const sessionId = handoff ? permitText(body, "sessionId", 100) : "";
        // Quét vào/ra khóa lần làm việc: đọc sau khi khóa để giữ đúng trạng thái mới nhất khi bàn giao.
        if (handoff) await tx.$queryRaw`SELECT "id" FROM "WorkPermitSession" WHERE "id" = ${sessionId} AND "permitId" = ${permit.id} FOR UPDATE`;
        const oldSession = handoff ? await tx.workPermitSession.findFirst({ where: { id: sessionId, permitId: permit.id, endedAt: null } }) : null;
        if (handoff && (!oldSession || permit.status !== "ACTIVE")) throw fail("Lần làm việc không còn mở. Vui lòng tải lại phiếu.", 409);
        if ((!handoff && !["ISSUED", "WAITING"].includes(permit.status)) || !permit.issuedAt) throw fail("Chỉ mở lần làm việc cho phiếu đã cấp hoặc đang chờ làm tiếp", 409);
        // Quá "Kết thúc công việc dự kiến": theo quy định phải kết thúc phiếu này và cấp PCT mới — không cho vào làm tiếp.
        if (permitDeadline(permit)?.state === "overdue") throw fail(`PCT đã quá thời gian kết thúc công việc dự kiến (${permit.plannedEndAt!.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}). Không mở hoặc bàn giao lần làm việc nữa — kết thúc phiếu và cấp PCT mới nếu công tác chưa xong.`, 409);
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
        const commanderScopeError = personScopeError(person, permit.contractorScope);
        if (commanderScopeError) throw fail(commanderScopeError);
        const previous = await tx.workPermitSession.findFirst({ where: { permitId: permit.id, ...(oldSession ? { id: { not: oldSession.id } } : {}), OR: [{ endedAt: null }, { endedAt: { gt: input.openedAt } }] } });
        if (previous) throw fail("Thời gian trùng với một lần làm việc khác của chính PCT này", 409);
        // Khóa CHTT xuyên hai loại sổ trước khi tìm xung đột, kể cả lần đã kết thúc có giờ giao nhau.
        await assertCommanderFree(tx, person.id, input.openedAt);
        const members = (await resolveSessionMembers(tx, input.members, { permitScope: permit.contractorScope,
          keep: new Set(oldSession ? sessionMembers(oldSession.members).flatMap(member => member.personId ? [member.personId] : []) : []) })).filter(member => member.personId ? member.personId !== person.id : member.code.toUpperCase() !== person.code.toUpperCase());
        // Chỉ nhân viên ĐÚNG đơn vị công tác của phiếu (tên đơn vị ghi lúc cấp, hoặc đơn vị hiện tại của CHTT
        // khi tên đơn vị đã đổi sau đó) — không để lẫn người của đơn vị làm phiếu khác. Người nhập tay (không
        // có hồ sơ danh bạ) không kiểm được đơn vị nên giữ như cũ.
        const foreign = members.find(member => member.personId && !sameCompany(member.company, permit.teamName) && !sameCompany(member.company, person.company));
        if (foreign) throw fail(`${foreign.name} (${foreign.code}) thuộc đơn vị “${foreign.company}”, không phải đơn vị công tác của phiếu (“${permit.teamName}”). Chỉ cho nhân viên đúng đơn vị vào làm việc.`);
        const handoffNote = handoff ? permitText(body, "endNote", 2000) : "";
        const nextMembers = oldSession ? handoffMembers(members, oldSession.members, input.openedAt)
          : members.map(member => withEntry(member, input.openedAt));
        await assertWorkersFree(tx, [{ personId: person.id, code: person.code, name: person.name, company: person.company }, ...presentMembers(nextMembers)], permit.id);
        if (oldSession) await tx.workPermitSession.update({ where: { id: oldSession.id }, data: {
          endedAt: input.openedAt, endConfirmedByName: input.authorizerName, members: permitSnapshot(closeInsideVisits(oldSession.members, input.openedAt)),
          endNote: `Bàn giao CHTT cho ${person.name}. ${handoffNote}`.trim(), endedById: user.id, endedByName: user.name ?? "",
        } });
        const session = await tx.workPermitSession.create({ data: {
          permitId: permit.id, commanderId: person.id, commanderCode: person.code, commanderName: person.name, company: person.company,
          // Mở mới ghi VÀO; bàn giao giữ người đã RA ở ngoài khu vực.
          members: permitSnapshot(nextMembers), workerCount: 1 + members.length, openedAt: input.openedAt, authorizerName: input.authorizerName,
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
      // PCT đại tu có hạng mục: đánh giá TỪNG hạng mục, % chung của phiếu = trung bình; phiếu khác giữ một % chung.
      const permitItems = isOverhaulPaperPermit(permit) ? overhaulItemsOf(permit.overhaulItems) : [];
      // % lũy kế trước đó: CHUNG cho mọi PCT cùng giữ hạng mục (PCT Cơ + PCT Điện của hạng mục phối hợp), gồm cả lần đang mở.
      const progressHistory = () => sharedOverhaulPercents(tx, permitItems);

      if (body.action === "progress" && !permitText(body, "sessionId", 100)) {
        // Cập nhật tiến độ NGOÀI lần làm việc (nghiệp vụ 07/10/2026): phiếu đã cấp / chờ làm tiếp / đã kết thúc vẫn ghi % +
        // nhật ký về Sheet ở NGÀY CẬP NHẬT; người cập nhật chọn trạng thái (phiếu đã kết thúc gợi ý "Kết thúc công tác").
        if (!["ISSUED", "WAITING", "CLOSED"].includes(permit.status)) throw fail("Phiếu đang có lần làm việc mở — cập nhật tiến độ trên lần làm việc đó.", 409);
        if (!permitItems.length) throw fail("Chỉ PCT nhà thầu · Đại tu có hạng mục mới cập nhật tiến độ");
        const sheetStatus = String(body.sheetStatus ?? "");
        if (sheetStatus !== OVERHAUL_DAY_STATUSES.IN_PROGRESS && sheetStatus !== OVERHAUL_DAY_STATUSES.CLOSED) throw fail("Chọn trạng thái ghi lên Sheet: Đang thực hiện hoặc Kết thúc công tác");
        const parsed = parseSessionItemProgress(body.itemProgress, permitItems, await progressHistory());
        if (!parsed.items.some(item => item.done)) throw fail("Tick ít nhất một hạng mục đã thực hiện để cập nhật tiến độ");
        const at = new Date();
        const note = permitText(body, "note", 2000);
        await enqueueOverhaulManualProgress(tx, permit, user.name ?? "", at, parsed.items, note, sheetStatus);
        const after = await tx.workPermit.update({ where: { id: permit.id }, data: { progress: parsed.progress, version: { increment: 1 } } });
        const summary = parsed.items.filter(item => item.done).map(item => `${item.code} ${item.percent}%`).join(", ");
        await tx.workPermitHistory.create({ data: { permitId: permit.id, actorId: user.id, actorName: user.name ?? "", action: `Cập nhật tiến độ ngoài lần làm việc · ${sheetStatus} · ${summary}${note ? ` · ${note.slice(0, 200)}` : ""}`, before: permitSnapshot(permit), after: permitSnapshot(after) } });
        return { id: "", commanderName: "ngoài lần làm việc", itemProgress: parsed.items };
      }

      if (body.action === "progress") {
        // Cập nhật tiến độ giữa chừng: không kết thúc lần làm việc, chỉ ghi % + ghi chú các mục có tick về Sheet.
        const session = await tx.workPermitSession.findFirst({ where: { id: permitText(body, "sessionId", 100), permitId: permit.id } });
        if (!session || session.endedAt || permit.status !== "ACTIVE") throw fail("Lần làm việc không còn mở. Vui lòng tải lại phiếu.", 409);
        if (!permitItems.length) throw fail("Chỉ PCT nhà thầu · Đại tu có hạng mục mới cập nhật tiến độ giữa chừng");
        const parsed = parseSessionItemProgress(body.itemProgress, permitItems, await progressHistory());
        if (!parsed.items.some(item => item.done)) throw fail("Tick ít nhất một hạng mục đã thực hiện để cập nhật tiến độ");
        const at = new Date();
        const note = permitText(body, "note", 2000);
        // Giữ kết quả mới nhất từng hạng mục trên lần đang mở; mục không tick lần này giữ lần cập nhật trước (nếu có).
        const earlier = new Map(overhaulItemProgressOf(session.itemProgress).map(item => [overhaulProgressKey(item), item]));
        const merged: OverhaulItemProgress[] = parsed.items.map(item => item.done ? { ...item, at: at.toISOString() } : earlier.get(overhaulProgressKey(item)) ?? item);
        // Ghi chú làm việc giữ trên endNote của lần đang mở (chưa kết thúc nên endNote chưa dùng) — hộp Kết thúc /
        // Cập nhật tiến độ sau điền sẵn để xem lại; kết thúc thì ghi đè bằng ghi chú kết thúc thật.
        const afterSession = await tx.workPermitSession.update({ where: { id: session.id }, data: { itemProgress: permitSnapshot(merged), ...(note ? { endNote: note } : {}) } });
        await enqueueOverhaulProgressUpdate(tx, permit, session, at, parsed.items, note);
        const after = await tx.workPermit.update({ where: { id: permit.id }, data: { progress: parsed.progress, version: { increment: 1 } } });
        const summary = parsed.items.filter(item => item.done).map(item => `${item.code} ${item.percent}%`).join(", ");
        await tx.workPermitHistory.create({ data: { permitId: permit.id, actorId: user.id, actorName: user.name ?? "", action: `Cập nhật tiến độ · ${summary}${note ? ` · ${note.slice(0, 200)}` : ""}`, before: permitSnapshot({ ...permit, session }), after: permitSnapshot({ ...after, session: afterSession }) } });
        return afterSession;
      }

      const sessionId = permitText(body, "sessionId", 100);
      const endedAt = permitInstant(body, "endedAt");
      const endConfirmedByName = permitText(body, "endConfirmedByName");
      const endNote = permitText(body, "endNote", 2000);
      if (!sessionId || !endedAt || !endConfirmedByName) throw fail("Vui lòng nhập lần làm việc, thời điểm kết thúc và người xác nhận kết thúc");
      const session = await tx.workPermitSession.findFirst({ where: { id: sessionId, permitId: permit.id } });
      if (!session || session.endedAt || permit.status !== "ACTIVE") throw fail("Lần làm việc không còn mở. Vui lòng tải lại phiếu.", 409);
      const itemResult = permitItems.length ? parseSessionItemProgress(body.itemProgress, permitItems, await progressHistory()) : null;
      const progress = itemResult ? itemResult.progress : Number(body.progress);
      if (!itemResult && (body.progress === "" || body.progress === null || body.progress === undefined || !Number.isInteger(progress) || progress < 0 || progress > 100)) throw fail("Tiến độ phải là số nguyên từ 0 đến 100%");
      // Mục đã "Cập nhật tiến độ" trong lần này, cùng ngày kết thúc: không tick lại vẫn tính có làm, giữ % đã cập nhật.
      const updates = new Map(overhaulItemProgressOf(session.itemProgress).filter(item => item.done && item.at).map(item => [overhaulProgressKey(item), item]));
      const doneToday = new Set([...updates].filter(([, item]) => vnDay(new Date(item.at!)) === vnDay(endedAt)).map(([key]) => key));
      const finalItems = itemResult?.items.map(item => item.done ? item : updates.get(overhaulProgressKey(item)) ?? item);
      if (session.commanderId) await tx.$queryRaw`SELECT "id" FROM "WorkPermitPerson" WHERE "id" = ${session.commanderId} FOR UPDATE`;
      validateSessionTime(endedAt, session.openedAt);
      // Nhân viên (trừ CHTT) phải quét ra hết mới được kết thúc — không còn lối "ghi RA hộ cho mọi người".
      const workers = workersStillInside(sessionMembers(session.members), session);
      if (workers.length) {
        throw fail(`Còn ${workers.length} nhân viên chưa rút khỏi vị trí làm việc: ${workers.map(m => m.name).slice(0, 10).join(", ")}${workers.length > 10 ? "…" : ""}. Quét ra từng người ở mục “Quét vào / ra” trước khi kết thúc lần làm việc.`, 409);
      }
      // Còn lại chỉ có thể là CHTT (nếu có trong danh sách) — ghi RA cùng lúc kết thúc.
      const inside = membersInside(session.members);
      const afterSession = await tx.workPermitSession.update({ where: { id: session.id }, data: {
        endedAt, endConfirmedByName, endNote, progress, endedById: user.id, endedByName: user.name ?? "",
        ...(finalItems ? { itemProgress: permitSnapshot(finalItems) } : {}),
        ...(inside.length ? { members: permitSnapshot(closeInsideVisits(session.members, endedAt)) } : {}),
      } });
      if (itemResult) await enqueueOverhaulSessionEnd(tx, permit, session, endedAt, itemResult.items, endNote, doneToday);
      const after = await tx.workPermit.update({ where: { id: permit.id }, data: { status: "WAITING", progress, version: { increment: 1 } } });
      await tx.workPermitHistory.create({ data: { permitId: permit.id, actorId: user.id, actorName: user.name ?? "", action: `Kết thúc lần làm việc · CHTT ${session.commanderName} (${session.commanderCode})`, before: permitSnapshot({ ...permit, session }), after: permitSnapshot({ ...after, session: afterSession }) } });
      return afterSession;
    });
    const verbs: Record<string, [string, string]> = { handoff: ["HANDOFF_WORK_PERMIT_SESSION", "Bàn giao"], open: ["OPEN_WORK_PERMIT_SESSION", "Mở"], progress: ["PROGRESS_WORK_PERMIT_SESSION", "Cập nhật tiến độ"], end: ["END_WORK_PERMIT_SESSION", "Kết thúc"] };
    const [auditAction, verb] = verbs[String(body.action)];
    await audit(user.id, auditAction, "WorkPermit", params.id, result.id ? `${verb} lần làm việc ${result.id}: ${result.commanderName}` : `${verb} ngoài lần làm việc`);
    // Mở/bàn giao lần làm việc ghi người cho phép + thời điểm cho phép — có trên mẫu Cơ.
    if (body.action === "open" || body.action === "handoff") await syncPermitDocument(await prisma.workPermit.findUnique({ where: { id: params.id } }));
    // Kết quả ngày của PCT đại tu: đẩy lên Google Sheets sau khi đã trả lời — lỗi thì hàng đợi giữ lại cho timer.
    else if (result.itemProgress) afterResponse(pushOverhaulSheetOutboxQuietly);
    return ok(result);
  });
}
