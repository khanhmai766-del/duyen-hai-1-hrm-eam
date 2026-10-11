import type { NextRequest } from "next/server";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { authenticatedDeviceQrUrl, parseDeviceQrValue } from "@/lib/device-qr";
import { resolveActiveDeviceQrCard } from "@/lib/device-qr-access";
import { assertSeqViewable } from "@/lib/server-access";
import { prisma } from "@/lib/prisma";
import { parseWorkPermitQrValue } from "@/lib/work-permit-qr";
import { requirePermitVisible } from "@/lib/server/work-permit-scope";
import { requirePermitExecute } from "@/lib/server/work-permit-permissions";
import { lookupPermitCardPerson } from "@/lib/server/work-permit-people";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => null) as { value?: unknown } | null;
    const permitTarget = parseWorkPermitQrValue(body?.value);
    if (permitTarget) {
      await requirePermitVisible(user, permitTarget.id);
      await requirePermitExecute(user);
      const permit = await prisma.workPermit.findUnique({ where: { id: permitTarget.id }, select: {
        id: true, teamType: true, contractorScope: true, status: true,
      } });
      if (!permit || permit.teamType !== "CONTRACTOR" || permit.contractorScope !== "OVERHAUL") {
        return fail("Mã QR không thuộc PCT nhà thầu Đại tu", 400);
      }
      if (["DRAFT", "CLOSED", "CANCELLED"].includes(permit.status)) {
        const message = permit.status === "DRAFT" ? "PCT Đại tu này chưa được cấp"
          : permit.status === "CLOSED" ? "PCT Đại tu này đã đóng" : "PCT Đại tu này đã hủy";
        return fail(message, 409);
      }
      if (!["ISSUED", "WAITING", "ACTIVE"].includes(permit.status)) {
        return fail("PCT Đại tu chưa ở trạng thái có thể cho phép làm việc", 409);
      }
      const intent = permit.status === "ACTIVE" ? "" : "?open=1";
      return ok({ type: "WORK_PERMIT", url: `/work-permits/${encodeURIComponent(permit.id)}/lam-viec${intent}`, legacy: false });
    }
    const target = parseDeviceQrValue(body?.value);
    if (!target) {
      // Thẻ ra vào cổng & ATVSLĐ của nhân sự nhà thầu (11/10/2026): không chuyển trang — trang quét hiện thẻ thông tin
      // (nhóm SCTX / Đại tu, hạn thẻ, huấn luyện, PCT đang làm). Số thẻ trơn không có trong danh bạ thì coi như mã lạ;
      // link thẻ (?id=) không có trong danh bạ thì báo rõ "chưa có trong danh bạ".
      const raw = typeof body?.value === "string" ? body.value : "";
      const card = raw ? await lookupPermitCardPerson(raw) : null;
      const cardLink = /^https?:\/\/[^?]*\?(?:.*&)?id=/i.test(raw.trim());
      if (card && (card.person || cardLink)) {
        if (user.accessMode === "DEFECT_READ_ONLY") return fail("Tài khoản tra cứu không xem được thông tin nhân sự nhà thầu", 403);
        return ok({ type: "WORKER_CARD", code: card.code, person: card.person });
      }
      return fail("Mã QR không thuộc hệ thống Vận Hành 1", 400);
    }

    const node = await prisma.equipmentNode.findUnique({ where: { seq: target.seq }, select: { seq: true } });
    if (!node) return fail("Không tìm thấy thiết bị từ mã QR", 404);
    await assertSeqViewable(user, target.seq);
    const card = await resolveActiveDeviceQrCard(target.seq, target.machine);
    if (!card) return fail("Mã QR đã bị vô hiệu hóa hoặc không còn tồn tại", 410);

    return ok({
      type: "DEVICE",
      seq: target.seq,
      machine: card.machine,
      url: authenticatedDeviceQrUrl(target.seq, card.machine, user.accessMode),
      legacy: target.legacy,
    });
  });
}
