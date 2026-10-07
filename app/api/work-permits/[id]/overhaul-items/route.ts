import { after as afterResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { audit, fail, ok, requireUser } from "@/lib/api";
import { requirePermitVisible } from "@/lib/server/work-permit-scope";
import { requirePermitActor } from "@/lib/server/work-permit-permissions";
import { permitBody, permitHandle, permitSnapshot } from "@/lib/server/work-permits";
import { assertOverhaulItemsConfirmed, parseOverhaulItems } from "@/lib/server/work-permit-overhaul";
import { syncPermitDocument } from "@/lib/server/work-permit-document-store";
import { workPermitPrisma as prisma } from "@/lib/server/work-permit-prisma";
import { isOverhaulPaperPermit, overhaulItemKey, overhaulItemProgressOf, overhaulItemsOf } from "@/lib/work-permit-overhaul";
import { formatPermitNumber } from "@/lib/work-permits";
export const dynamic = "force-dynamic";

/**
 * Bổ sung / bớt hạng mục đại tu cho PCT giấy nhà thầu · Đại tu ĐÃ CẤP — kể cả khi đang có lần làm việc mở (khác nút
 * "Chỉnh sửa" phiếu, vốn bị chặn lúc đang làm việc). Chỉ đổi `overhaulItems`, không đụng thông tin khác của phiếu.
 * Hạng mục mới dùng ngay cho Cập nhật tiến độ / Kết thúc / Tiến độ trong ngày / job 16:00 — ghi Sheet qua các luồng đó.
 * Bớt: chỉ hạng mục CHƯA ghi tiến độ (đã ghi thì Sheet đã có dữ liệu của phiếu này — giữ nguyên để không lệch).
 * Được bớt tới hết hạng mục (07/10/2026) — phiếu không còn hạng mục thì ghi tiến độ bằng % chung như phiếu thường.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return permitHandle(async () => {
    const user = await requireUser();
    await requirePermitVisible(user, params.id);
    await requirePermitActor(user, params.id);
    const body = await permitBody(req);
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "WorkPermit" WHERE "id" = ${params.id} FOR UPDATE`;
      const before = await tx.workPermit.findUnique({ where: { id: params.id } });
      if (!before) throw fail("Không tìm thấy PCT", 404);
      if (body.version !== before.version) throw fail("Phiếu đã thay đổi. Tải lại rồi thử lại.", 409);
      if (!isOverhaulPaperPermit(before)) throw fail("Chỉ PCT giấy nhà thầu · Đại tu mới có hạng mục đại tu");
      if (!["ISSUED", "ACTIVE", "WAITING", "PAUSED"].includes(before.status)) throw fail("Chỉ bổ sung hạng mục cho phiếu đã cấp, chưa kết thúc phiếu hoặc huỷ", 409);
      const parsed = parseOverhaulItems(body.overhaulItems, before);
      const next = parsed === Prisma.DbNull || parsed === undefined ? [] : overhaulItemsOf(parsed);
      const prev = overhaulItemsOf(before.overhaulItems);
      const nextKeys = new Set(next.map(overhaulItemKey));
      const removed = prev.filter(item => !nextKeys.has(overhaulItemKey(item)));
      if (removed.length) {
        const sessions = await tx.workPermitSession.findMany({ where: { permitId: before.id }, select: { itemProgress: true } });
        const progressed = new Set(sessions.flatMap(s => overhaulItemProgressOf(s.itemProgress).filter(i => i.done).map(overhaulItemKey)));
        const blocked = removed.filter(item => progressed.has(overhaulItemKey(item)));
        if (blocked.length) throw fail(`Không bớt được hạng mục đã ghi tiến độ: ${blocked.map(i => i.code).join(", ")}`, 409);
      }
      await assertOverhaulItemsConfirmed(tx, body.overhaulItems, before.overhaulItems, before.id);
      const after = await tx.workPermit.update({ where: { id: before.id }, data: { overhaulItems: parsed as Prisma.InputJsonValue, version: { increment: 1 } } });
      const prevKeys = new Set(prev.map(overhaulItemKey));
      const added = next.filter(item => !prevKeys.has(overhaulItemKey(item)));
      const summary = [added.length ? `+ ${added.map(i => i.code).join(", ")}` : "", removed.length ? `− ${removed.map(i => i.code).join(", ")}` : ""].filter(Boolean).join(" · ");
      await tx.workPermitHistory.create({ data: { permitId: after.id, actorId: user.id, actorName: user.name ?? "", action: `Bổ sung hạng mục đại tu${summary ? ` · ${summary}` : ""}`, before: permitSnapshot(before), after: permitSnapshot(after) } });
      return { before, after, summary };
    });
    await audit(user.id, "UPDATE_WORK_PERMIT_OVERHAUL_ITEMS", "WorkPermit", result.after.id, `PCT ${formatPermitNumber(result.after)}: ${result.summary || "không đổi"}`);
    // Phụ lục hạng mục in kèm phiếu đổi theo danh sách mới.
    afterResponse(() => syncPermitDocument(result.after, result.before));
    return ok(result.after);
  });
}
