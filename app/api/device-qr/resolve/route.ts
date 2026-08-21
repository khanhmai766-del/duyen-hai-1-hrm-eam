import type { NextRequest } from "next/server";
import { fail, handle, ok, requireUser } from "@/lib/api";
import { requireDeviceView } from "@/lib/device-permissions";
import { parseDeviceQrValue, deviceDetailUrl } from "@/lib/device-qr";
import { resolveActiveDeviceQrCard } from "@/lib/device-qr-access";
import { assertSeqViewable } from "@/lib/server-access";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireDeviceView(user);
    const body = await req.json().catch(() => null) as { value?: unknown } | null;
    const target = parseDeviceQrValue(body?.value);
    if (!target) return fail("Mã QR không thuộc hệ thống thiết bị Vận Hành 1", 400);

    const node = await prisma.equipmentNode.findUnique({ where: { seq: target.seq }, select: { seq: true } });
    if (!node) return fail("Không tìm thấy thiết bị từ mã QR", 404);
    await assertSeqViewable(user, target.seq);
    const card = await resolveActiveDeviceQrCard(target.seq, target.machine);
    if (!card) return fail("Mã QR đã bị vô hiệu hóa hoặc không còn tồn tại", 410);

    return ok({
      seq: target.seq,
      machine: card.machine,
      url: deviceDetailUrl(target.seq, card.machine),
      legacy: target.legacy,
    });
  });
}
