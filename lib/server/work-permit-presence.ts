import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { formatPermitNumber, personCardRevokedMessage, type PermitMember } from "@/lib/work-permits";
import { presentMembers, samePermitWorker } from "@/lib/work-permit-presence";

/** Khóa chung trước mọi khóa dòng: hai cổng không thể cùng kiểm tra rồi cho một người vào hai phiếu.
 * Giữ đến cuối transaction, dùng chung với mở/kết thúc/bàn giao và quét vào/ra.
 */
export async function lockWorkPermitPresence(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('work-permit-presence'))`;
}

/** Đọc tình trạng hiện tại theo hồ sơ, không theo bản chụp trên phiếu. Người nhập tay không có hồ sơ nên không xét được. */
export async function assertCardsNotRevoked(tx: Prisma.TransactionClient, workers: Array<Pick<PermitMember, "personId">>, permit?: Parameters<typeof formatPermitNumber>[0]) {
  const ids = [...new Set(workers.flatMap(worker => worker.personId ? [worker.personId] : []))];
  if (!ids.length) return;
  const revoked = await tx.workPermitPerson.findFirst({ where: { id: { in: ids }, cardRevokedAt: { not: null } }, select: { name: true, company: true } });
  if (revoked) throw fail(personCardRevokedMessage(revoked, permit && formatPermitNumber(permit)), 403);
}

export async function assertWorkersFree(tx: Prisma.TransactionClient, workers: PermitMember[], permitId: string) {
  if (!workers.length) return;
  const sessions = await tx.workPermitSession.findMany({
    where: { endedAt: null, permitId: { not: permitId } },
    select: { commanderId: true, commanderCode: true, commanderName: true, company: true, members: true,
      permit: { select: { id: true, number: true, nkvhNumber: true, year: true, kind: true } } },
  });
  for (const session of sessions) {
    const occupied: PermitMember[] = [{ personId: session.commanderId ?? undefined, code: session.commanderCode,
      name: session.commanderName, company: session.company }, ...presentMembers(session.members)];
    const worker = workers.find(worker => occupied.some(other => samePermitWorker(worker, other)));
    if (worker) throw fail(`${worker.name}${worker.code ? ` (${worker.code})` : ""} đang làm việc ở PCT ${formatPermitNumber(session.permit)}. Phải ghi RA hoặc kết thúc lần làm việc tại phiếu đó trước khi cho vào phiếu này.`, 409);
  }
}
