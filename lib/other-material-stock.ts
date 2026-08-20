import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { adjustStockToQuantity, consumeStock, receiveIntoLot, sharedCodesOf, syncMaterialQuantity } from "@/lib/material-stock-lot";

type Actor = { id: string; name?: string | null; position?: string | null };

async function stockByLots(tx: Prisma.TransactionClient, materialCode: string) {
  const result = await tx.materialStockLot.aggregate({
    where: { materialCode },
    _sum: { quantityLeft: true },
  });
  return Math.max(0, result._sum.quantityLeft ?? 0);
}

/** Lãnh một dòng của phiếu Vật tư khác: tạo lô, cộng tồn và ghi sổ trong cùng transaction. */
export async function receiveOtherMaterial(
  tx: Prisma.TransactionClient,
  params: {
    material: { id: string; code: string; erpCodes?: string[] | null; quantity: number };
    ticketId: string;
    ticketItemId: string;
    quantity: number;
    deliveryNote?: string | null;
    erpCode?: string | null;
    occurredAt: Date;
    assignedPosition?: string | null;
    unit?: string | null;
    deviceSeq?: string | null;
    actor: Actor;
    note?: string | null;
  },
) {
  // Bảo toàn tồn cũ vốn chỉ nằm ở Material.quantity trước khi sổ lô được bổ sung.
  await adjustStockToQuantity(tx, params.material.code, params.material.quantity);
  const before = await stockByLots(tx, params.material.code);
  await receiveIntoLot(tx, {
    materialCode: params.material.code,
    quantity: params.quantity,
    ticketId: params.ticketId,
    deliveryNote: params.deliveryNote,
    erpCode: params.erpCode,
    receivedAt: params.occurredAt,
  });
  const after = await syncMaterialQuantity(tx, params.material.code, sharedCodesOf(params.material));
  return tx.materialStockMovement.create({
    data: {
      materialId: params.material.id,
      materialCode: params.material.code,
      type: "RECEIPT",
      quantity: params.quantity,
      stockBefore: before,
      stockAfter: after,
      occurredAt: params.occurredAt,
      ticketId: params.ticketId,
      ticketItemId: params.ticketItemId,
      assignedPosition: params.assignedPosition || null,
      unit: params.unit || null,
      deviceSeq: params.deviceSeq || null,
      note: params.note?.trim() || null,
      createdById: params.actor.id,
      createdByName: params.actor.name ?? "",
      createdByPosition: params.actor.position ?? null,
    },
  });
}

/** Cấp phát hoặc sử dụng: dựng lô tồn đầu kỳ nếu cần, trừ FIFO và ghi sổ bất biến. */
export async function consumeOtherMaterial(
  tx: Prisma.TransactionClient,
  params: {
    material: { id: string; code: string; erpCodes?: string[] | null; quantity: number };
    type: "ISSUE" | "USE";
    quantity: number;
    occurredAt: Date;
    assignedPosition?: string | null;
    unit?: string | null;
    deviceSeq?: string | null;
    receiver?: { id?: string | null; name: string } | null;
    actor: Actor;
    note?: string | null;
  },
) {
  // Dữ liệu cũ có thể chỉ có Material.quantity mà chưa có lô. Đồng bộ thành lô điều chỉnh
  // trước khi trừ để nghiệp vụ mới không làm mất tồn đã nhập từ trước.
  await adjustStockToQuantity(tx, params.material.code, params.material.quantity);
  const before = await stockByLots(tx, params.material.code);
  if (params.quantity > before) throw new Error(`Số lượng hiện có chỉ còn ${before}, không đủ để xuất ${params.quantity}`);

  const id = randomUUID();
  await consumeStock(tx, {
    materialCode: params.material.code,
    ticketId: `movement:${id}`,
    quantity: params.quantity,
  });
  const after = await syncMaterialQuantity(tx, params.material.code, sharedCodesOf(params.material));
  return tx.materialStockMovement.create({
    data: {
      id,
      materialId: params.material.id,
      materialCode: params.material.code,
      type: params.type,
      quantity: params.quantity,
      stockBefore: before,
      stockAfter: after,
      occurredAt: params.occurredAt,
      assignedPosition: params.assignedPosition || null,
      unit: params.unit || null,
      deviceSeq: params.deviceSeq || null,
      receiverId: params.receiver?.id || null,
      receiverName: params.receiver?.name || null,
      issuerId: params.type === "ISSUE" ? params.actor.id : null,
      issuerName: params.type === "ISSUE" ? params.actor.name ?? "" : null,
      note: params.note?.trim() || null,
      createdById: params.actor.id,
      createdByName: params.actor.name ?? "",
      createdByPosition: params.actor.position ?? null,
    },
  });
}
