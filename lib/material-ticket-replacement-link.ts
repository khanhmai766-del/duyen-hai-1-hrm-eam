import type { Prisma } from "@prisma/client";

/**
 * Liên kết phiếu vật tư ↔ điểm thay thế (`MaterialTicketReplacement`).
 *
 * Vì sao cần bảng nối trong khi đã có `MaterialTicketItem.replacementPointKeys`: mảng đó chỉ
 * chứa CHUỖI `deviceSeq` (xem `replacementPointSelectionKey`), nên biết phiếu phục vụ thiết bị
 * nào nhưng KHÔNG biết phục vụ kỳ thay thế nào. Một thiết bị có thể có nhiều điểm theo dõi cho
 * nhiều loại vật tư, và điểm thì bị gỡ rồi khai lại sau mỗi lần thay — chuỗi thiết bị không đủ
 * để neo vào đúng một kỳ.
 *
 * Mảng cũ VẪN ĐƯỢC GHI song song, không bỏ: `lib/equipment-move.ts` còn dựa vào nó khi đổi mã
 * thiết bị, và nó là snapshot đọc được cả khi điểm đã bị xoá khỏi danh mục.
 */

/** Điểm thay thế đủ dữ liệu để tính nhu cầu; nhận cả bản select gọn lẫn bản đầy đủ. */
export type LinkablePoint = { id: string; quantity: number; deviceCount: number };

/**
 * Nhu cầu vật tư của một điểm = dung tích mỗi thiết bị × số thiết bị tại điểm.
 *
 * Cùng công thức mà `DefectMaterialRequest.quantity` đang dùng khi ra SYC — giữ giống nhau để
 * hai con số không đá nhau trên cùng một hồ sơ.
 */
export function plannedQuantityOfPoint(point: LinkablePoint) {
  const value = point.quantity * point.deviceCount;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Đặt lại toàn bộ liên kết của một phiếu cho khớp danh sách điểm truyền vào.
 *
 * Gọi được nhiều lần: sửa phiếu ở bước "Xem lại" đổi danh sách thiết bị thì liên kết cũ phải
 * biến mất chứ không cộng dồn. `plannedQuantity` là SNAPSHOT lúc gắn nên chỉ ghi khi tạo dòng
 * mới — sửa khai báo điểm về sau không được làm đổi con số phiếu đã căn cứ.
 */
export async function syncTicketReplacementLinks(
  tx: Prisma.TransactionClient,
  ticketId: string,
  points: LinkablePoint[]
) {
  const wanted = new Map(points.map((point) => [point.id, point]));

  await tx.materialTicketReplacement.deleteMany({
    where: { ticketId, replacementId: { notIn: [...wanted.keys()] } },
  });
  if (wanted.size === 0) return 0;

  const existing = await tx.materialTicketReplacement.findMany({
    where: { ticketId },
    select: { replacementId: true },
  });
  const already = new Set(existing.map((row) => row.replacementId));

  const created = [...wanted.values()].filter((point) => !already.has(point.id));
  if (created.length > 0) {
    await tx.materialTicketReplacement.createMany({
      data: created.map((point) => ({
        ticketId,
        replacementId: point.id,
        plannedQuantity: plannedQuantityOfPoint(point),
      })),
      skipDuplicates: true,
    });
  }
  return wanted.size;
}
