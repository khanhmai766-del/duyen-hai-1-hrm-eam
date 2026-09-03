import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { computeDefaultKdTiepTheo, parseVNDate, TBYCNN_FILLABLE_WHEN_EMPTY, trimOrNull, validateSoLuong } from "@/lib/tbycnn";
import { canWriteRow, operationalData, resolveTbycnnWriteScope } from "@/lib/tbycnn-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/tbycnn/bulk — LƯU MỘT LƯỢT các dòng vừa sửa ở chế độ "Sửa bảng".
 *
 * Quy trình giấy: đi kiểm tra một vòng, ghi kết quả cho hàng chục thiết bị rồi mới về
 * nhập. Bắt lưu từng dòng là hàng chục lần chờ mạng và không có điểm nào để huỷ cả loạt,
 * nên cả bảng được sửa trong bộ nhớ rồi ghi một lượt — giống nút "Sửa bảng" của PCCC.
 *
 * TOÀN BỘ hoặc KHÔNG GÌ CẢ: một transaction duy nhất. Lưu được nửa chừng rồi hỏng thì
 * người dùng không biết dòng nào đã vào, dòng nào chưa.
 *
 * Vẫn cưỡng chế đủ ba rào như route sửa một dòng: phạm vi cương vị, khoá trường gốc, và
 * tổng khả dụng + không khả dụng = số lượng.
 */
/** Một dòng sửa: { id, ...các trường vận hành }. */
type Update = Record<string, unknown>;

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolveTbycnnWriteScope(user);

    const body = (await req.json().catch(() => ({}))) as { updates?: Update[] };
    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (updates.length === 0) throw fail("Không có dòng nào để lưu", 400);
    if (updates.length > 1000) throw fail("Quá 1000 dòng một lượt — hãy lọc bớt rồi lưu lại", 400);

    const ids = updates.map((u) => String(u.id ?? "")).filter(Boolean);
    if (ids.length !== updates.length) throw fail("Có dòng thiếu id", 400);

    const rows = await prisma.tbycnnEquipment.findMany({
      where: { id: { in: ids } },
      include: { period: { select: { label: true, isClosed: true } } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    const writes = [];
    for (const update of updates) {
      const id = String(update.id);
      const existing = byId.get(id);
      if (!existing) throw fail("Có dòng không còn tồn tại — hãy tải lại trang", 404);
      if (existing.period.isClosed) throw fail(`Kỳ ${existing.period.label} đã chốt sổ, chỉ xem được`, 409);
      if (!canWriteRow(scope, existing)) {
        throw fail(`"${existing.tenThietBi}" không thuộc cương vị quản lý của bạn`, 403);
      }

      const data = operationalData(update);
      // Mã hiệu / KKS: cho BỔ SUNG khi đang trống, không cho sửa đè giá trị đã có.
      for (const field of TBYCNN_FILLABLE_WHEN_EMPTY) {
        if (!(field in update)) continue;
        if (String(existing[field] ?? "").trim()) continue;
        Object.assign(data, { [field]: trimOrNull(update[field]) });
      }
      if (Object.keys(data).length === 0) continue;

      const khaDung = "soLuongKhaDung" in data ? data.soLuongKhaDung ?? null : existing.soLuongKhaDung;
      const khongKhaDung =
        "soLuongKhongKhaDung" in data ? data.soLuongKhongKhaDung ?? null : existing.soLuongKhongKhaDung;
      const error = validateSoLuong(existing.soLuong, khaDung, khongKhaDung);
      if (error) throw fail(`"${existing.tenThietBi}": ${error}`, 400);

      // Xoá trắng "KĐ tiếp theo" thì tự tính lại = KĐ gần nhất + chu kỳ thử (mục 6.4 bản cũ).
      if ("kdTiepTheoText" in data && !data.kdTiepTheoText) {
        const ganNhat = "kdGanNhatText" in data ? parseVNDate(data.kdGanNhatText) : existing.kdGanNhat;
        const chuKy = "chuKyThu" in data ? data.chuKyThu ?? null : existing.chuKyThu;
        const auto = computeDefaultKdTiepTheo(ganNhat, chuKy);
        if (auto) data.kdTiepTheo = auto;
      }

      writes.push(prisma.tbycnnEquipment.update({ where: { id }, data }));
    }

    if (writes.length === 0) throw fail("Không có thay đổi nào để lưu", 400);
    await prisma.$transaction(writes);

    await audit(
      user.id,
      "UPDATE_TBYCNN_BULK",
      "TbycnnEquipment",
      undefined,
      auditDetailWithPosition(user, `Lưu một lượt ${writes.length} dòng sổ TBYCNN`),
      { saveToAuditLog: true }
    );

    return ok({ saved: writes.length });
  });
}
