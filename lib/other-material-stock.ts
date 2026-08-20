import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { isGasCylinderCategory } from "@/lib/constants";
import { adjustStockToQuantity, consumeStock, receiveIntoLot, sharedCodesOf, syncMaterialQuantity } from "@/lib/material-stock-lot";

type Actor = { id: string; name?: string | null; position?: string | null };

function stockUnitOf(material: { category?: string | null; machine?: string | null }) {
  return isGasCylinderCategory(material.category) && ["S1", "S2", "COMMON"].includes(material.machine ?? "")
    ? material.machine!
    : "COMMON";
}

async function stockByLots(tx: Prisma.TransactionClient, materialCode: string, stockUnit: string) {
  const result = await tx.materialStockLot.aggregate({
    where: { materialCode, stockUnit },
    _sum: { quantityLeft: true },
  });
  return Math.max(0, result._sum.quantityLeft ?? 0);
}

/** Lãnh một dòng của phiếu Vật tư khác: tạo lô, cộng tồn và ghi sổ trong cùng transaction. */
export async function receiveOtherMaterial(
  tx: Prisma.TransactionClient,
  params: {
    material: { id: string; code: string; erpCodes?: string[] | null; quantity: number; category?: string | null; machine?: string | null };
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
  const stockUnit = stockUnitOf(params.material);
  // Bảo toàn tồn cũ vốn chỉ nằm ở Material.quantity trước khi sổ lô được bổ sung.
  await adjustStockToQuantity(tx, params.material.code, params.material.quantity, stockUnit);
  const before = await stockByLots(tx, params.material.code, stockUnit);
  await receiveIntoLot(tx, {
    materialCode: params.material.code,
    stockUnit,
    quantity: params.quantity,
    ticketId: params.ticketId,
    deliveryNote: params.deliveryNote,
    erpCode: params.erpCode,
    receivedAt: params.occurredAt,
  });
  const after = await syncMaterialQuantity(tx, params.material.code, sharedCodesOf(params.material),
    isGasCylinderCategory(params.material.category) ? { stockUnit, machine: stockUnit } : { stockUnit });
  return tx.materialStockMovement.create({
    data: {
      materialId: params.material.id,
      materialCode: params.material.code,
      erpCodes: params.erpCode ? [params.erpCode] : [],
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
    material: { id: string; code: string; erpCodes?: string[] | null; quantity: number; category?: string | null; machine?: string | null };
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
  const stockUnit = stockUnitOf(params.material);
  // Dữ liệu cũ có thể chỉ có Material.quantity mà chưa có lô. Đồng bộ thành lô điều chỉnh
  // trước khi trừ để nghiệp vụ mới không làm mất tồn đã nhập từ trước.
  await adjustStockToQuantity(tx, params.material.code, params.material.quantity, stockUnit);
  const before = await stockByLots(tx, params.material.code, stockUnit);
  if (params.quantity > before) throw new Error(`Số lượng hiện có chỉ còn ${before}, không đủ để xuất ${params.quantity}`);

  const id = randomUUID();
  await consumeStock(tx, {
    materialCode: params.material.code,
    stockUnit,
    ticketId: `movement:${id}`,
    quantity: params.quantity,
  });
  const consumedLots = await tx.materialStockLot.findMany({
    where: { usages: { some: { ticketId: `movement:${id}` } } },
    select: { erpCode: true },
  });
  const after = await syncMaterialQuantity(tx, params.material.code, sharedCodesOf(params.material),
    isGasCylinderCategory(params.material.category) ? { stockUnit, machine: stockUnit } : { stockUnit });
  return tx.materialStockMovement.create({
    data: {
      id,
      materialId: params.material.id,
      materialCode: params.material.code,
      erpCodes: Array.from(new Set(consumedLots.map((lot) => lot.erpCode).filter(Boolean) as string[])),
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
