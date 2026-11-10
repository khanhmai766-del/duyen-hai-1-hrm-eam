import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { canViewMaterialReplacement } from "@/lib/material-replacement-access";
import type { EquipmentAccessContext } from "@/lib/server-access";
import type { PositionViewScope } from "@/lib/position-data-scope";

type DeclarationInput = Prisma.MaterialReplacementUncheckedCreateWithoutMaterialInput & { id?: string };

/** Chỉ sửa/xoá ID được gửi rõ ràng; phần danh mục bị ẩn theo cương vị luôn được giữ. */
export async function syncMaterialDeclarations(tx: Prisma.TransactionClient, materialId: string,
  rows: DeclarationInput[], deletedIds: string[], access: EquipmentAccessContext, view: PositionViewScope) {
  await tx.$queryRaw`SELECT "id" FROM "MaterialReplacement" WHERE "materialId" = ${materialId} ORDER BY "id" FOR UPDATE`;
  const existing = await tx.materialReplacement.findMany({ where: { materialId },
    include: { _count: { select: { logs: true, ticketLinks: true, defectRequests: true } } } });
  const byId = new Map(existing.map(row => [row.id, row]));
  const touched = new Set<string>();
  const visible = (row: (typeof existing)[number]) => view.all || canViewMaterialReplacement(access, row, view);
  const linked = (row: (typeof existing)[number]) => row._count.logs + row._count.ticketLinks + row._count.defectRequests > 0;
  for (const input of rows) {
    const { id, createdById, ...data } = input;
    let current = id ? byId.get(id) : undefined;
    if (id && !current) throw fail("Điểm khai báo không còn thuộc vật tư này; vui lòng tải lại", 409);
    // Tab cũ chưa gửi ID: nhận diện dòng cũ khi khớp duy nhất, không xoá các dòng vắng mặt.
    if (!id) {
      const matches = existing.filter(row => !row.isActive && visible(row) && !touched.has(row.id)
        && row.deviceSeq === (data.deviceSeq ?? null) && row.system === (data.system ?? null)
        && row.location === (data.location ?? null) && row.managingPosition === (data.managingPosition ?? null));
      if (matches.length > 1) throw fail("Có nhiều điểm khai báo trùng vị trí; vui lòng tải lại trước khi lưu", 409);
      current = matches[0];
    }
    if (current) {
      if (touched.has(current.id)) throw fail("Một điểm khai báo không được gửi nhiều lần");
      if (!visible(current)) throw fail("Bạn không có quyền sửa điểm khai báo này", 403);
      if (current.isActive || current._count.logs > 0) throw fail("Không thể sửa dòng theo dõi hoặc lưu trữ bằng form khai báo", 409);
      if (linked(current) && (current.deviceSeq !== (data.deviceSeq ?? null)
        || current.system !== (data.system ?? null) || current.location !== (data.location ?? null)
        || current.managingPosition !== (data.managingPosition ?? null))) {
        throw fail("Điểm đã gắn phiếu hoặc lịch sử; không thể đổi thiết bị, vị trí hay cương vị", 409);
      }
      const unchangedSchedule = current.intervalMonths === data.intervalMonths
        && (current.lastReplacedAt?.getTime() ?? null) === (data.lastReplacedAt ? new Date(data.lastReplacedAt).getTime() : null);
      await tx.materialReplacement.update({ where: { id: current.id }, data: {
        ...data, isActive: false, nextDueAt: unchangedSchedule ? current.nextDueAt : data.nextDueAt,
      } });
      touched.add(current.id);
    } else {
      if (!view.all && !canViewMaterialReplacement(access, data, view)) throw fail("Điểm mới nằm ngoài phạm vi cương vị được xem", 403);
      await tx.materialReplacement.create({ data: { ...data, materialId, createdById, isActive: false } });
    }
  }
  for (const id of new Set(deletedIds)) {
    const current = byId.get(id);
    if (!current || current.isActive || touched.has(id)) throw fail("Điểm cần xoá không hợp lệ; vui lòng tải lại", 409);
    if (!visible(current)) throw fail("Bạn không có quyền xoá điểm khai báo này", 403);
    if (linked(current)) throw fail("Không thể xoá điểm đã gắn phiếu, yêu cầu sửa chữa hoặc lịch sử thay thế", 409);
    await tx.materialReplacement.delete({ where: { id } });
  }
}

/** Mã kho và chứng từ đã phát sinh phải được giữ; không đổi mã hoặc xoá danh mục đó. */
export async function materialHasHistory(tx: Prisma.TransactionClient, ids: string[], code: string) {
  const rows = await Promise.all([
    tx.materialStockLot.findFirst({ where: { materialCode: code }, select: { id: true } }),
    tx.materialTicketItem.findFirst({ where: { materialId: { in: ids } }, select: { id: true } }),
    tx.materialStockMovement.findFirst({ where: { materialId: { in: ids } }, select: { id: true } }),
    tx.defectMaterialRequest.findFirst({ where: { materialId: { in: ids } }, select: { id: true } }),
    tx.materialReplacementLog.findFirst({ where: { materialId: { in: ids } }, select: { id: true } }),
  ]);
  return rows.some(Boolean);
}
