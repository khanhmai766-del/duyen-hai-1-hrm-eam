import { ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { permitHandle } from "@/lib/server/work-permits";
import { CONFIRMED_NUMBER_STATUS, OBSERVED_NUMBER_STATUS } from "@/lib/server/work-permit-number-reservations";
export const dynamic = "force-dynamic";

/** Nhắc sau ngần này kể từ lúc lấy số — đủ để NKVH lưu và tiện ích tự đồng bộ trong trường hợp bình thường. */
const REMIND_AFTER_MS = 60 * 60_000;

/**
 * GET — phiếu nháp "Chờ NKVH lưu" CỦA CHÍNH NGƯỜI ĐANG ĐĂNG NHẬP cần đồng bộ (chuông thông báo, 08/10/2026):
 * số đã thấy trên danh sách NKVH đã lưu (OBSERVED…) hoặc lần đồng bộ gần nhất bị từ chối, mà quá 1 giờ vẫn còn là nháp.
 * Rà soát 08/10/2026: 7 phiếu Điện treo 8–27 giờ vì tiện ích không tự đồng bộ — người lấy số không hay biết.
 */
export async function GET() {
  return permitHandle(async () => {
    const user = await requireUser();
    const drafts = await prisma.workPermit.findMany({
      where: { status: "DRAFT", nkvhPctId: { not: null }, createdById: user.id, createdAt: { lt: new Date(Date.now() - REMIND_AFTER_MS) } },
      select: { id: true, kind: true, number: true, year: true, content: true, createdAt: true, statusReason: true, nkvhPctId: true },
      orderBy: { createdAt: "asc" }, take: 30,
    });
    if (!drafts.length) return ok([]);
    const seen = await prisma.workPermitNumberReservation.findMany({
      where: { status: { in: [OBSERVED_NUMBER_STATUS, CONFIRMED_NUMBER_STATUS] }, OR: drafts.map(d => ({ kind: d.kind, year: d.year, number: d.number })) },
      select: { kind: true, year: true, number: true },
    });
    const seenKey = new Set(seen.map(r => `${r.kind}:${r.year}:${r.number}`));
    return ok(drafts.flatMap(d => {
      const rejected = d.statusReason.startsWith("Chưa đồng bộ được");
      const onNkvh = seenKey.has(`${d.kind}:${d.year}:${d.number}`);
      return rejected || onNkvh ? [{ id: d.id, kind: d.kind, number: d.number, year: d.year, content: d.content, createdAt: d.createdAt, reason: rejected ? d.statusReason : "" }] : [];
    }));
  });
}
