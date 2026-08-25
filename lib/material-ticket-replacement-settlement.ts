import type { Prisma } from "@prisma/client";
import { addMonths, isSupplementReason } from "@/lib/constants";
import { fail } from "@/lib/api";
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
      unit: true,
      assignedPosition: true,
      items: {
        take: 1,
        select: {
          materialId: true,
          deviceSeq: true,
          deviceNameManual: true,
          material: { select: { unit: true } },
          device: { select: { name: true } },
        },
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
  // `handle()` chỉ giữ nguyên thông báo khi ta ném Response; ném Error thường thì người dùng
  // chỉ nhận được "Lỗi máy chủ" 500 và không biết phải sửa gì.
  if (!ticket) throw fail("Không tìm thấy phiếu vật tư để ghi lịch sử thay thế", 404);

  const usedQuantity = Math.max(0, Math.round(ticket.usedQuantity ?? 0));
  const lots = await usedLotsOfTicket(tx, ticket.id);
  const lotSummary = deliveryNoteSummary(lots, ticket.items[0]?.material.unit);
  const deliveryNoteNumber = lotSummary
    || ticket.deliveryNoteNumber?.trim()
    || ticket.receivedMethod?.trim()
    || null;
  const workDoneAt = ticket.workEndedAt
    ?? ticket.defect?.completedAt
    ?? ticket.completedAt
    ?? ticket.usedAt;

  /** Chứng từ và số liệu dùng chung cho mọi dòng lịch sử của phiếu này. */
  const ticketColumns = {
    ticketId: ticket.id,
    pctNumber: ticket.pctNumber?.trim() || null,
    bbntDoNumber: params.bbntDoNumber,
    bbntDoUrl: ticket.docUrl?.trim() || null,
    proposalNumber: ticket.proposalNumber?.trim() || null,
    deliveryNoteNumber,
    defectId: ticket.defectId,
    requestNumber: ticket.defect?.requestNumber ?? ticket.repairRequestNumber?.trim() ?? null,
  };

  /**
   * PHIẾU KHÔNG GẮN ĐIỂM THAY THẾ — vật tư dùng cho việc phát sinh ngoài lịch.
   *
   * Vẫn phải ghi lịch sử, nếu không thì phần vật tư này biến mất khỏi cột "Luỹ kế đã sử dụng"
   * của biểu dự toán QLVT.20, và công thức dự toán năm sau mất luôn thành phần "bình quân
   * phát sinh" — vốn là phần khó dự báo nhất.
   *
   * Đánh dấu bằng cột `unplanned` chứ KHÔNG suy từ `replacementId = null`: dòng định kỳ cũng
   * rơi vào null khi điểm đã hết chu kỳ đang theo dõi tại lúc quyết toán.
   */
  if (ticket.replacementLinks.length === 0) {
    const item = ticket.items[0];
    // Không tiêu hao thì không có gì để đưa vào báo cáo năm; ghi dòng 0 chỉ làm nhiễu sổ.
    if (!item || usedQuantity <= 0) return { logged: 0, renewed: 0, released: 0 };

    await tx.materialReplacementLog.create({
      data: {
        ...buildReplacementLogData({
          point: {
            id: ticket.id,
            materialId: item.materialId,
            deviceSeq: item.deviceSeq,
            machine: ticket.unit,
            system: null,
            location: item.deviceNameManual,
            managingPosition: ticket.assignedPosition,
            // Không thuộc điểm theo dõi nào nên không có chu kỳ để ghi.
            intervalMonths: 0,
            intervalNote: null,
            material: { unit: item.material.unit },
            device: item.device,
          },
          replacementId: null,
          doneById: params.doneById,
          // Việc phát sinh không gia hạn chu kỳ nào nên mốc thời gian không ảnh hưởng tính
          // chu kỳ; thiếu thì lấy ngày quyết toán thay vì CHẶN quyết toán như nhánh định kỳ.
          replacedAt: workDoneAt ?? params.settledAt,
          quantity: null,
          note: ticket.completionNote?.trim() || "Sử dụng vật tư ngoài lịch thay thế",
          defect: ticket.defect
            ? { id: ticket.defect.id, requestNumber: ticket.defect.requestNumber }
            : null,
        }),
        ...ticketColumns,
        usedQuantity,
        unplanned: true,
      },
    });
    return { logged: 1, renewed: 0, released: 0 };
  }

  const weights = ticket.replacementLinks.map((link) =>
    link.plannedQuantity ?? Math.max(0, link.replacement.quantity * Math.max(1, link.replacement.deviceCount)),
  );
  const allocated = allocateUsedQuantity(usedQuantity, weights);
  const replacedAt = workDoneAt;
  if (!replacedAt) {
    throw fail("Phiếu thiếu thời gian hoàn thành công việc nên chưa thể chốt lịch sử thay thế", 409);
  }

  const isSupplement = isSupplementReason(ticket.proposalNote);
  let logged = 0;
  let renewed = 0;
  let released = 0;

  /**
   * NHIỀU liên kết có thể quy về CÙNG một chu kỳ đang theo dõi: phiếu gắn cả dòng khai báo cũ
   * lẫn chu kỳ mới của cùng vị trí, hoặc `moveOpenTicketLinks` vừa dồn chúng lại. Log bị khoá
   * `@@unique([replacementId, ticketId])` nên phải GỘP trước rồi mới ghi — ghi thẳng từng liên
   * kết sẽ ném lỗi trùng khoá và chặn hẳn việc quyết toán phiếu.
   *
   * Gộp thì CỘNG DỒN khối lượng chứ không bỏ bớt: phần đã chia cho liên kết bị gộp vào vẫn là
   * vật tư đã tiêu thật, đánh rơi là hụt luỹ kế sử dụng của biểu dự toán năm.
   */
  type LogGroup = {
    logPoint: SettlementPoint;
    trackedId: string | null;
    plannedQuantity: number | null;
    usedQuantity: number;
  };
  const groups = new Map<string, LogGroup>();

  for (let index = 0; index < ticket.replacementLinks.length; index += 1) {
    const link = ticket.replacementLinks[index];
    const source = link.replacement;
    const tracked = await findTrackingPoint(tx, source);
    if (tracked) await moveOpenTicketLinks(tx, source.id, tracked.id);

    const logPoint = tracked ?? source;
    const groupKey = tracked ? `tracked:${tracked.id}` : `source:${source.id}`;
    const plannedQuantity = link.plannedQuantity ?? weights[index] ?? null;
    const usedForLink = allocated[index] ?? 0;
    const merged = groups.get(groupKey);
    if (merged) {
      merged.usedQuantity += usedForLink;
      if (plannedQuantity !== null) {
        merged.plannedQuantity = (merged.plannedQuantity ?? 0) + plannedQuantity;
      }
      continue;
    }
    groups.set(groupKey, {
      logPoint,
      trackedId: tracked?.id ?? null,
      plannedQuantity,
      usedQuantity: usedForLink,
    });
  }

  for (const group of groups.values()) {
    // `logPoint` chính là chu kỳ đang theo dõi khi `trackedId` có giá trị, nên dùng lại được
    // cho cả việc gia hạn bên dưới mà không phải đọc lại DB.
    const { logPoint, trackedId } = group;
    const tracked = trackedId ? logPoint : null;
    const logData = buildReplacementLogData({
      point: logPoint,
      replacementId: tracked?.id ?? null,
      doneById: params.doneById,
      replacedAt,
      quantity: group.plannedQuantity,
      note: ticket.completionNote?.trim() || "Ghi nhận khi quyết toán phiếu vật tư",
      defect: ticket.defect
        ? { id: ticket.defect.id, requestNumber: ticket.defect.requestNumber }
        : null,
    });

    await tx.materialReplacementLog.create({
      data: {
        ...logData,
        ...ticketColumns,
        usedQuantity: group.usedQuantity,
      },
    });
    logged += 1;

    // Nhóm đã là duy nhất theo chu kỳ nên không cần chống trùng thêm ở đây.
    if (!tracked || isSupplement) continue;
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
