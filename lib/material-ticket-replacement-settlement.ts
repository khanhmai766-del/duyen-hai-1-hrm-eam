import type { Prisma } from "@prisma/client";
import { addMonths, isSupplementReason } from "@/lib/constants";
import { buildReplacementLogData } from "@/lib/material-replacement-log";
import { deliveryNoteSummary, usedLotsOfTicket } from "@/lib/material-stock-lot";
import { normalizeText } from "@/lib/nav";

const POINT_SELECT = {
  id: true,
  materialId: true,
  deviceSeq: true,
  machine: true,
  system: true,
  location: true,
  quantity: true,
  deviceCount: true,
  managingPosition: true,
  managingPositionCode: true,
  intervalMonths: true,
  intervalNote: true,
  samplingOnly: true,
  recoveryOnSupplement: true,
  note: true,
  isActive: true,
  renewalAppliedAt: true,
  autoRenew: true,
  createdById: true,
  material: { select: { unit: true } },
  device: { select: { name: true, parentSeq: true } },
  _count: { select: { logs: true } },
} satisfies Prisma.MaterialReplacementSelect;

type SettlementPoint = Prisma.MaterialReplacementGetPayload<{ select: typeof POINT_SELECT }>;

export type ReplacementTicketProgress = {
  id: string;
  number: string;
  repairRequestNumber: string | null;
};

/** Khóa nghiệp vụ của một vị trí thay thế, dùng chung cho lịch và lúc quyết toán. */
export function replacementTargetKey(point: {
  materialId: string;
  deviceSeq?: string | null;
  system?: string | null;
  location?: string | null;
}) {
  if (point.deviceSeq) return `${point.materialId}|device:${point.deviceSeq}`;
  return `${point.materialId}|system:${normalizeText(point.system ?? "")}|location:${normalizeText(point.location ?? "")}`;
}

function allocateUsedQuantity(total: number, weights: number[]) {
  const safeTotal = Math.max(0, Math.round(total));
  if (weights.length === 0) return [];
  const safeWeights = weights.map((weight) => Math.max(0, Math.round(weight)));
  const sum = safeWeights.reduce((value, weight) => value + weight, 0);
  if (sum <= 0) return safeWeights.map((_, index) => (index === 0 ? safeTotal : 0));

  const values = safeWeights.map((weight) => Math.floor((safeTotal * weight) / sum));
  values[0] += safeTotal - values.reduce((value, quantity) => value + quantity, 0);
  return values;
}

async function findTrackingPoint(tx: Prisma.TransactionClient, source: SettlementPoint) {
  // Phiếu đã được chuyển sang neo ở chu kỳ cũ sau một lần quyết toán trước đó: luôn ghi
  // tiếp vào chính chu kỳ này, không được nhảy sang điểm mới vừa được tự động gia hạn.
  if (source.isActive || source.renewalAppliedAt || source._count.logs > 0) return source;

  const targetWhere: Prisma.MaterialReplacementWhereInput = source.deviceSeq
    ? { materialId: source.materialId, deviceSeq: source.deviceSeq }
    : {
        materialId: source.materialId,
        deviceSeq: null,
        system: source.system,
        location: source.location,
      };

  return tx.materialReplacement.findFirst({
    where: { ...targetWhere, isActive: true },
    select: POINT_SELECT,
    orderBy: { nextDueAt: "asc" },
  });
}

/**
 * Chuyển các phiếu đang mở cùng trỏ từ dòng khai báo sang đúng chu kỳ đang theo dõi.
 * Việc này là mấu chốt để hai đợt lãnh cho cùng một lần thay chỉ gia hạn đúng một lần:
 * đợt quyết toán sau vẫn nhìn thấy `renewalAppliedAt` trên chu kỳ cũ.
 */
async function moveOpenTicketLinks(
  tx: Prisma.TransactionClient,
  sourceId: string,
  trackingId: string,
) {
  if (sourceId === trackingId) return;
  const links = await tx.materialTicketReplacement.findMany({
    where: {
      replacementId: sourceId,
      ticket: { settledAt: null, status: { notIn: ["HOAN_TAT", "TU_CHOI"] } },
    },
    select: { id: true, ticketId: true },
  });

  for (const link of links) {
    const existing = await tx.materialTicketReplacement.findUnique({
      where: { ticketId_replacementId: { ticketId: link.ticketId, replacementId: trackingId } },
      select: { id: true },
    });
    if (existing) {
      await tx.materialTicketReplacement.delete({ where: { id: link.id } });
    } else {
      await tx.materialTicketReplacement.update({
        where: { id: link.id },
        data: { replacementId: trackingId },
      });
    }
  }
}

/**
 * Ghi sự thật thay thế tại đúng mốc quyết toán phiếu vật tư.
 * Hàm phải chạy trong cùng transaction với việc chuyển phiếu sang HOAN_TAT.
 */
export async function recordSettledTicketReplacements(
  tx: Prisma.TransactionClient,
  params: {
    ticketId: string;
    doneById: string;
    bbntDoNumber: string;
    settledAt: Date;
  },
) {
  const ticket = await tx.materialTicket.findUnique({
    where: { id: params.ticketId },
    select: {
      id: true,
      usedQuantity: true,
      workEndedAt: true,
      completedAt: true,
      usedAt: true,
      completionNote: true,
      proposalNote: true,
      proposalNumber: true,
      deliveryNoteNumber: true,
      receivedMethod: true,
      pctNumber: true,
      docUrl: true,
      defectId: true,
      repairRequestNumber: true,
      defect: { select: { id: true, requestNumber: true, completedAt: true } },
      items: {
        take: 1,
        select: { material: { select: { unit: true } } },
      },
      replacementLinks: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          plannedQuantity: true,
          replacement: { select: POINT_SELECT },
        },
      },
    },
  });
  if (!ticket) throw new Error("Không tìm thấy phiếu vật tư để ghi lịch sử thay thế");
  if (ticket.replacementLinks.length === 0) {
    return { logged: 0, renewed: 0, released: 0 };
  }

  const usedQuantity = Math.max(0, Math.round(ticket.usedQuantity ?? 0));
  const weights = ticket.replacementLinks.map((link) =>
    link.plannedQuantity ?? Math.max(0, link.replacement.quantity * Math.max(1, link.replacement.deviceCount)),
  );
  const allocated = allocateUsedQuantity(usedQuantity, weights);
  const lots = await usedLotsOfTicket(tx, ticket.id);
  const lotSummary = deliveryNoteSummary(lots, ticket.items[0]?.material.unit);
  const deliveryNoteNumber = lotSummary
    || ticket.deliveryNoteNumber?.trim()
    || ticket.receivedMethod?.trim()
    || null;
  const replacedAt = ticket.workEndedAt
    ?? ticket.defect?.completedAt
    ?? ticket.completedAt
    ?? ticket.usedAt;
  if (!replacedAt) {
    throw new Error("Phiếu thiếu thời gian hoàn thành công việc nên chưa thể chốt lịch sử thay thế");
  }

  const isSupplement = isSupplementReason(ticket.proposalNote);
  let logged = 0;
  let renewed = 0;
  let released = 0;
  const handledTrackingIds = new Set<string>();

  for (let index = 0; index < ticket.replacementLinks.length; index += 1) {
    const link = ticket.replacementLinks[index];
    const source = link.replacement;
    const tracked = await findTrackingPoint(tx, source);
    if (tracked) await moveOpenTicketLinks(tx, source.id, tracked.id);

    const logPoint = tracked ?? source;
    const logData = buildReplacementLogData({
      point: logPoint,
      replacementId: tracked?.id ?? null,
      doneById: params.doneById,
      replacedAt,
      quantity: link.plannedQuantity ?? weights[index] ?? null,
      note: ticket.completionNote?.trim() || "Ghi nhận khi quyết toán phiếu vật tư",
      defect: ticket.defect
        ? { id: ticket.defect.id, requestNumber: ticket.defect.requestNumber }
        : null,
    });

    await tx.materialReplacementLog.create({
      data: {
        ...logData,
        ticketId: ticket.id,
        usedQuantity: allocated[index] ?? 0,
        pctNumber: ticket.pctNumber?.trim() || null,
        bbntDoNumber: params.bbntDoNumber,
        bbntDoUrl: ticket.docUrl?.trim() || null,
        proposalNumber: ticket.proposalNumber?.trim() || null,
        deliveryNoteNumber,
        defectId: ticket.defectId,
        requestNumber: ticket.defect?.requestNumber ?? ticket.repairRequestNumber?.trim() ?? null,
      },
    });
    logged += 1;

    if (!tracked || handledTrackingIds.has(tracked.id) || isSupplement) continue;
    handledTrackingIds.add(tracked.id);
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtext(${replacementTargetKey(tracked)}))::text AS lock_result
    `;

    if (tracked.autoRenew && tracked.intervalMonths > 0) {
      const claimed = await tx.materialReplacement.updateMany({
        where: { id: tracked.id, isActive: true, renewalAppliedAt: null },
        data: { isActive: false, renewalAppliedAt: params.settledAt },
      });
      if (claimed.count === 1) {
        await tx.materialReplacement.create({
          data: {
            materialId: tracked.materialId,
            deviceSeq: tracked.deviceSeq,
            machine: tracked.machine,
            location: tracked.location,
            system: tracked.system,
            quantity: tracked.quantity,
            deviceCount: tracked.deviceCount,
            managingPosition: tracked.managingPosition,
            managingPositionCode: tracked.managingPositionCode,
            intervalMonths: tracked.intervalMonths,
            intervalNote: tracked.intervalNote,
            samplingOnly: tracked.samplingOnly,
            recoveryOnSupplement: tracked.recoveryOnSupplement,
            lastReplacedAt: replacedAt,
            nextDueAt: addMonths(replacedAt, tracked.intervalMonths),
            note: tracked.note,
            isActive: true,
            renewalAppliedAt: null,
            autoRenew: tracked.autoRenew,
            createdById: tracked.createdById,
          },
        });
        renewed += 1;
        released += 1;
      }
    } else {
      const releasedPoint = await tx.materialReplacement.updateMany({
        where: { id: tracked.id, isActive: true },
        data: { isActive: false },
      });
      released += releasedPoint.count;
    }
  }

  return { logged, renewed, released };
}
