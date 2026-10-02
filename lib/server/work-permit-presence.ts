import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { formatPermitNumber, type PermitMember } from "@/lib/work-permits";
import { presentMembers, samePermitWorker } from "@/lib/work-permit-presence";

/** Khóa chung trước mọi khóa dòng: hai cổng không thể cùng kiểm tra rồi cho một người vào hai phiếu.
 * Giữ đến cuối transaction, dùng chung với mở/kết thúc/bàn giao và quét vào/ra.
 */
export async function lockWorkPermitPresence(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('work-permit-presence'))`;
}

export async function assertWorkersFree(tx: Prisma.TransactionClient, workers: PermitMember[], permitId: string) {
  if (!workers.length) return;
  const sessions = await tx.workPermitSession.findMany({
    where: { endedAt: null, permitId: { not: permitId } },
    select: { commanderId: true, commanderCode: true, commanderName: true, company: true, members: true,
      permit: { select: { id: true, number: true, year: true, kind: true } } },
  });
  for (const session of sessions) {
    const occupied: PermitMember[] = [{ personId: session.commanderId ?? undefined, code: session.commanderCode,
      name: session.commanderName, company: session.company }, ...presentMembers(session.members)];
    const worker = workers.find(worker => occupied.some(other => samePermitWorker(worker, other)));
    if (worker) throw fail(`${worker.name}${worker.code ? ` (${worker.code})` : ""} đang làm việc ở PCT ${formatPermitNumber(session.permit)}. Phải ghi RA hoặc kết thúc lần làm việc tại phiếu đó trước khi cho vào phiếu này.`, 409);
  }
}
