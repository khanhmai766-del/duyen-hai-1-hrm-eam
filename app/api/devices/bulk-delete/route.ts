import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { invalidateEquipmentNodeCache } from "@/lib/equipment-node-cache";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";
import { recomputeChildCount } from "@/lib/equipment-child-count";

export const dynamic = "force-dynamic";

const MAX_BULK_DELETE = 500;

// Mã thiết bị (seq) là fullCode "DH1.S1.x.y…"; chấp nhận thêm dạng số thuần cho dữ liệu cũ.
const SEQ_PATTERN = /^(?:DH1\.S1|[1-9]\d*)(?:\.[1-9]\d*)*$/;

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "device-delete", ["full"], "Không đủ quyền xoá thiết bị");

    const body = (await req.json().catch(() => null)) as { ids?: unknown; dryRun?: unknown } | null;
    if (!Array.isArray(body?.ids)) return fail("Danh sách thiết bị không hợp lệ");
    const dryRun = body?.dryRun === true;

    const ids = [...new Set(body.ids.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return fail("Chưa chọn thiết bị cần xóa");
    if (ids.length > MAX_BULK_DELETE) return fail(`Chỉ được chọn tối đa ${MAX_BULK_DELETE} mục mỗi lần`);
    if (ids.some((id) => !SEQ_PATTERN.test(id))) return fail("Danh sách có mã thiết bị không hợp lệ");

    // Xác nhận các nút được chọn còn tồn tại; lấy parentSeq để cập nhật lại childCount sau khi xóa.
    const selected = await prisma.equipmentNode.findMany({
      where: { seq: { in: ids } },
      select: { seq: true, parentSeq: true },
    });
    if (selected.length !== ids.length) return fail("Một số thiết bị không còn tồn tại. Vui lòng tải lại cây thiết bị", 409);

    // Mở rộng mỗi lựa chọn thành CHÍNH NÓ + toàn bộ hậu duệ. Cây dùng materialized path nên
    // hậu duệ của "1.15.1.1" là mọi node có seq bắt đầu bằng "1.15.1.1." (dấu chấm chặn trùng
    // tiền tố kiểu "1.15.1.10"). Nhờ vậy chọn cả nhóm/thư mục sẽ xóa toàn bộ thiết bị con.
    const targets = await prisma.equipmentNode.findMany({
      where: { OR: ids.flatMap((seq) => [{ seq }, { seq: { startsWith: `${seq}.` } }]) },
      select: { seq: true },
    });
    const targetSeqs = [...new Set(targets.map((n) => n.seq))];
    if (targetSeqs.length > MAX_BULK_DELETE) {
      return fail(
        `Lựa chọn gồm ${targetSeqs.length.toLocaleString("vi-VN")} thiết bị (đã tính cả thiết bị con trong nhóm), vượt quá giới hạn ${MAX_BULK_DELETE} mỗi lần. Vui lòng chọn nhánh nhỏ hơn.`
      );
    }

    // Chỉ đếm số lượng sẽ xóa, không thực hiện xóa — dùng cho hộp thoại xác nhận.
    if (dryRun) return ok({ ids: targetSeqs, count: targetSeqs.length });

    // Các thư mục cha cần tính lại childCount (bỏ những cha nằm trong tập bị xóa).
    const deletedSet = new Set(targetSeqs);
    const parentSeqs = [...new Set(selected.map((n) => n.parentSeq).filter((p): p is string => !!p && !deletedSet.has(p)))];

    const result = await prisma.$transaction(async (tx) => {
      const del = await tx.equipmentNode.deleteMany({ where: { seq: { in: targetSeqs } } });
      await recomputeChildCount(tx, parentSeqs);
      return del;
    });

    await audit(
      user.id,
      "BULK_DELETE_EQUIPMENT_NODE",
      "EquipmentNode",
      ids.join(","),
      `Xóa hàng loạt ${result.count} thiết bị (gồm thiết bị con trong nhóm đã chọn)`
    );
    invalidateEquipmentNodeCache();
    invalidateDeviceListCache();
    return ok({ ids: targetSeqs, count: result.count });
  });
}
