import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  computeDefaultKdTiepTheo,
  parseVNDate,
  TBYCNN_FILLABLE_WHEN_EMPTY,
  trimOrNull,
  validateSoLuong,
} from "@/lib/tbycnn";
import {
  canDeleteEquipment,
  operationalData,
  serializeEquipment,
  TBYCNN_DELETE_WINDOW_DAYS,
  TBYCNN_PERMISSION,
  TBYCNN_WRITE_LEVELS,
} from "@/lib/tbycnn-service";

export const dynamic = "force-dynamic";

/**
 * PUT /api/tbycnn/[id] — cập nhật một thiết bị.
 *
 * CƯỠNG CHẾ quy tắc khoá trường của bản cũ (mục 6.6): chỉ nhóm "vận hành" (kết quả kiểm
 * định, số lượng khả dụng, khiếm khuyết, ghi chú) được sửa; thông tin gốc theo hồ sơ nhà
 * máy bị bỏ qua kể cả khi client gửi lên — trừ Mã hiệu/KKS đang trống thì cho bổ sung.
 * Khoá ở giao diện là chưa đủ vì người dùng gọi thẳng API được.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      TBYCNN_PERMISSION.manage,
      [...TBYCNN_WRITE_LEVELS],
      "Không đủ quyền cập nhật sổ thiết bị yêu cầu nghiêm ngặt"
    );

    const existing = await prisma.tbycnnEquipment.findUnique({
      where: { id: params.id },
      include: { period: { select: { label: true, isClosed: true } } },
    });
    if (!existing) throw fail("Không tìm thấy thiết bị", 404);
    if (existing.period.isClosed) {
      throw fail(`Kỳ ${existing.period.label} đã chốt sổ, chỉ xem được`, 409);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const data = operationalData(body);

    // Mã hiệu / KKS: cho BỔ SUNG khi đang trống, không cho sửa đè giá trị đã có.
    for (const field of TBYCNN_FILLABLE_WHEN_EMPTY) {
      if (!(field in body)) continue;
      if (String(existing[field] ?? "").trim()) continue;
      Object.assign(data, { [field]: trimOrNull(body[field]) });
    }

    const khaDung = "soLuongKhaDung" in data ? data.soLuongKhaDung ?? null : existing.soLuongKhaDung;
    const khongKhaDung =
      "soLuongKhongKhaDung" in data ? data.soLuongKhongKhaDung ?? null : existing.soLuongKhongKhaDung;
    const error = validateSoLuong(existing.soLuong, khaDung, khongKhaDung);
    if (error) throw fail(error, 400);

    // Xoá trắng "KĐ tiếp theo" thì tự tính lại = KĐ gần nhất + chu kỳ thử (mục 6.4 bản cũ).
    if ("kdTiepTheoText" in data && !data.kdTiepTheoText) {
      const ganNhat =
        "kdGanNhatText" in data ? parseVNDate(data.kdGanNhatText) : existing.kdGanNhat;
      const chuKy = "chuKyThu" in data ? data.chuKyThu ?? null : existing.chuKyThu;
      const auto = computeDefaultKdTiepTheo(ganNhat, chuKy);
      if (auto) data.kdTiepTheo = auto;
    }

    const updated = await prisma.tbycnnEquipment.update({ where: { id: params.id }, data });

    await audit(
      user.id,
      "UPDATE_TBYCNN",
      "TbycnnEquipment",
      updated.id,
      auditDetailWithPosition(user, `Cập nhật "${updated.tenThietBi}" (${updated.khuVuc})`),
      { beforeData: existing, afterData: updated, changedFields: Object.keys(data) }
    );

    return ok(serializeEquipment(updated));
  });
}

/**
 * DELETE /api/tbycnn/[id] — chỉ thiết bị TỰ THÊM và trong 30 ngày (mục 6.7 bản cũ).
 * Thiết bị gốc theo hồ sơ nhà máy không xoá được bằng bất kỳ quyền nào.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      TBYCNN_PERMISSION.manage,
      [...TBYCNN_WRITE_LEVELS],
      "Không đủ quyền cập nhật sổ thiết bị yêu cầu nghiêm ngặt"
    );

    const existing = await prisma.tbycnnEquipment.findUnique({
      where: { id: params.id },
      include: { period: { select: { label: true, isClosed: true } } },
    });
    if (!existing) throw fail("Không tìm thấy thiết bị", 404);
    if (existing.period.isClosed) throw fail(`Kỳ ${existing.period.label} đã chốt sổ, chỉ xem được`, 409);
    if (!canDeleteEquipment(existing)) {
      throw fail(
        existing.sourceId != null
          ? "Thiết bị theo hồ sơ gốc của nhà máy — không xoá được"
          : `Chỉ xoá được thiết bị tự thêm trong vòng ${TBYCNN_DELETE_WINDOW_DAYS} ngày`,
        403
      );
    }

    await prisma.tbycnnEquipment.delete({ where: { id: params.id } });
    await audit(
      user.id,
      "DELETE_TBYCNN",
      "TbycnnEquipment",
      params.id,
      auditDetailWithPosition(user, `Xoá "${existing.tenThietBi}" (${existing.khuVuc})`),
      { beforeData: existing }
    );

    return ok({ id: params.id });
  });
}
