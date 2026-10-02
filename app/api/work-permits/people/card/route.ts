import { prisma } from "@/lib/prisma";
import { fail, ok, requireUser } from "@/lib/api";
import { permitHandle } from "@/lib/server/work-permits";
import { personCardSelect, withPhotoUrl } from "@/lib/server/work-permit-people";
import { cardlessCode, isCardlessCode, parseCardQr } from "@/lib/work-permit-card";
import { presentMembers, samePermitWorker } from "@/lib/work-permit-presence";
export const dynamic = "force-dynamic";

/**
 * Tra một thẻ khi quét QR: nội dung QR (link ?id= hoặc số thẻ trơn) → hồ sơ + ảnh + các lần làm việc
 * đang mở của người đó. Tra đúng số thẻ (khoá duy nhất) nên nhanh, không phụ thuộc Google Sheets.
 */
export async function GET(req: Request) {
  return permitHandle(async () => {
    await requireUser();
    const code = parseCardQr(new URL(req.url).searchParams.get("q") ?? "");
    if (!code) return fail("Không đọc được số thẻ từ mã QR");
    const select = { id: true, code: true, name: true, company: true, phone: true, canCommand: true, isActive: true, version: true, ...personCardSelect } as const;
    // QR người chưa có thẻ mang họ tên → thử tiếp mã tạm HL-… (lib/work-permit-card.ts).
    const person = await prisma.workPermitPerson.findUnique({ where: { code }, select })
      ?? (isCardlessCode(code) ? null : await prisma.workPermitPerson.findUnique({ where: { code: cardlessCode(code) }, select }));
    if (!person) return ok({ code, person: null });
    const sessions = await prisma.workPermitSession.findMany({
      where: { endedAt: null },
      select: { id: true, commanderId: true, members: true, openedAt: true, permit: { select: { id: true, number: true, year: true, kind: true } } },
      orderBy: { openedAt: "asc" },
    });
    return ok({ code, person: { ...withPhotoUrl(person), activeWorks: sessions.filter(s => s.commanderId === person.id || presentMembers(s.members).some(member => samePermitWorker(member, { personId: person.id, code: person.code, name: person.name, company: person.company }))).map(s => ({
      sessionId: s.id, role: s.commanderId === person.id ? "CHTT" : "MEMBER", openedAt: s.openedAt, permit: s.permit,
    })) } });
  });
}
