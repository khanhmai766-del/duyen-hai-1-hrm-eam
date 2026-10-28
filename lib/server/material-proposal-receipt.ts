import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import type { FullTicket } from "@/lib/material-ticket-bbnt-do";
import { isGasCylinderTicket, GAS_RETURN_STATUS } from "@/lib/constants";
import { receiveIntoLot, sharedCodesOf, syncMaterialQuantity } from "@/lib/material-stock-lot";

// Gắn trên lô để lần sửa sau nhận ra phiếu đã không trừ ERP, kể cả sau khi
// đồng bộ/nhập kho làm tồn ERP tăng lại. Phiếu cũ không có dấu này đã trừ ERP.
export const ERP_RECEIPT_DOCUMENT_ONLY_NOTE = "Xác nhận theo liên 3 khi tồn ERP không đủ; không trừ ERP.";

export function receiptSkippedErpDeduction(lotNote: string | null | undefined) {
  return lotNote?.split("\n").includes(ERP_RECEIPT_DOCUMENT_ONLY_NOTE) ?? false;
}

/** Giữ cách điều chỉnh cũ với lô đã trừ ERP; lô xác nhận theo chứng từ không tác động ERP. */
export async function adjustReceiptErp(
  tx: Prisma.TransactionClient,
  params: { erpCode: string; delta: number; skipDeduction: boolean },
) {
  if (params.skipDeduction || params.delta === 0) return;
  const rows = await tx.$queryRaw<Array<{ erpStock: number }>>`
    SELECT "erpStock" FROM "ErpMaterial" WHERE "code" = ${params.erpCode} FOR UPDATE
  `;
  if (!rows.length) throw fail(`Không tìm thấy mã vật tư ERP "${params.erpCode}"`, 404);
  if (rows[0].erpStock + params.delta < 0) throw fail("Không thể điều chỉnh vì số lượng ERP sẽ âm");
  await tx.erpMaterial.update({ where: { code: params.erpCode }, data: { erpStock: { increment: params.delta } } });
}

/** Xác nhận hàng đã lãnh theo chứng từ, bắt buộc số phiếu và ngày trên phiếu. */
export function parseProposalReceipt(body: Record<string, unknown>) {
  const quantity = Number(body.receivedQuantity);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw fail("Khối lượng vật tư lãnh phải là số nguyên lớn hơn 0");
  }
  const deliveryNoteNumber = String(body.deliveryNoteNumber || body.receivedMethod || "").trim();
  if (!deliveryNoteNumber) throw fail("Vui lòng nhập số phiếu giao hàng");
  const rawDate = String(body.deliveryNoteDate ?? "").trim();
  if (!rawDate) throw fail("Vui lòng nhập ngày phiếu giao hàng");
  const deliveryNoteDate = new Date(`${rawDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    || Number.isNaN(deliveryNoteDate.getTime())
    || deliveryNoteDate.toISOString().slice(0, 10) !== rawDate) {
    throw fail("Ngày phiếu giao hàng không hợp lệ");
  }
  return { quantity, deliveryNoteNumber, deliveryNoteDate };
}

export async function recordProposalReceipt(
  tx: Prisma.TransactionClient,
  params: {
    ticket: FullTicket;
    receipt: ReturnType<typeof parseProposalReceipt>;
    erpCode: string;
    erpName: string;
    photoKey: string;
    actor: { id: string; name?: string | null; position?: string | null };
    stockOptions: { stockUnit: string; machine?: string };
  },
) {
  const { ticket: t, receipt, actor, stockOptions } = params;
  const item = t.items[0];
  if (!item) throw fail("Phiếu chưa có vật tư");
  if (!params.photoKey) throw fail("Vui lòng đính kèm ảnh phiếu xuất kho (liên 3)");
  // Giữ khoá phiếu trước khi cộng lô. Hai yêu cầu cùng đọc bước NHAN_VAT_TU
  // thì chỉ một yêu cầu được ghi kho; yêu cầu còn lại nhận 409.
  const claim = await tx.materialTicket.updateMany({
    where: { id: t.id, type: "DE_XUAT", status: "NHAN_VAT_TU", receivedAt: null, updatedAt: t.updatedAt },
    data: { updatedAt: new Date() },
  });
  if (claim.count !== 1) throw fail("Phiếu đã được xác nhận hoặc đã thay đổi, vui lòng tải lại", 409);

  // Khoá mã ERP trong cùng giao dịch với lô/phiếu, tránh đè số tồn vừa đồng bộ
  // và tránh hai phiếu cùng trừ từ một số tồn cũ.
  const erpRows = await tx.$queryRaw<Array<{ erpStock: number }>>`
    SELECT "erpStock" FROM "ErpMaterial" WHERE "code" = ${params.erpCode} FOR UPDATE
  `;
  if (!erpRows.length) throw fail("Không tìm thấy mã vật tư ERP", 404);
  const erpBefore = Number(erpRows[0].erpStock);
  if (!Number.isFinite(erpBefore) || erpBefore < 0) throw fail("Số tồn ERP không hợp lệ, vui lòng kiểm tra lại");
  const deductErp = erpBefore >= receipt.quantity;
  const erpAfter = deductErp ? erpBefore - receipt.quantity : erpBefore;
  if (deductErp) await tx.erpMaterial.update({
    where: { code: params.erpCode }, data: { erpStock: { decrement: receipt.quantity } },
  });

  const lot = await receiveIntoLot(tx, {
    materialCode: item.material.code,
    stockUnit: stockOptions.stockUnit,
    quantity: receipt.quantity,
    ticketId: t.id,
    deliveryNote: receipt.deliveryNoteNumber,
    erpCode: params.erpCode,
    receivedAt: receipt.deliveryNoteDate,
  });
  if (!lot) throw fail("Không thể ghi nhận lô vật tư đã lãnh", 409);
  const lotBefore = !deductErp ? await tx.materialStockLot.findUnique({ where: { id: lot.id }, select: { note: true } }) : null;
  await tx.materialStockLot.update({
    where: { id: lot.id },
    data: {
      deliveryPhotoKey: params.photoKey, deliveryPhotoAt: new Date(), deliveryPhotoByName: actor.name ?? "",
      ...(!deductErp && !receiptSkippedErpDeduction(lotBefore?.note)
        ? { note: [lotBefore?.note, ERP_RECEIPT_DOCUMENT_ONLY_NOTE].filter(Boolean).join("\n") } : {}),
    },
  });
  const materialAfter = await syncMaterialQuantity(tx, item.material.code, sharedCodesOf(item.material), stockOptions);
  await tx.materialTicket.update({
    where: { id: t.id },
    data: {
      status: isGasCylinderTicket(t.materialCategory) ? GAS_RETURN_STATUS : "CHO_PHIEU_YCSC",
      receivedQuantity: receipt.quantity,
      receivedMethod: receipt.deliveryNoteNumber,
      deliveryNoteNumber: receipt.deliveryNoteNumber,
      deliveryNoteDate: receipt.deliveryNoteDate,
      receiptSource: "ERP",
      remainingQuantity: receipt.quantity - (t.usedQuantity ?? 0),
      receivedById: actor.id,
      receivedByName: actor.name ?? "",
      receivedByPosition: actor.position ?? null,
      receivedAt: new Date(),
    },
  });
  await tx.materialTicketItem.update({ where: { id: item.id }, data: { erpCode: params.erpCode, erpName: params.erpName } });
  return { materialAfter, erpBefore, erpAfter, deductErp };
}
