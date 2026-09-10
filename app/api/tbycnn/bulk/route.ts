import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import {
  computeDefaultKdTiepTheo,
  parseVNDate,
  suyKhaDungTuKetQua,
  TBYCNN_FILLABLE_WHEN_EMPTY,
  trimOrNull,
  validateSoLuong,
} from "@/lib/tbycnn";
import {
  canDeleteEquipment,
  canWriteRow,
  operationalData,
  resolveTbycnnWriteScope,
  TBYCNN_DELETE_WINDOW_DAYS,
} from "@/lib/tbycnn-service";

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
 *
 * `deletes` đi CHUNG một lượt với `updates` vì cùng một thao tác của người dùng: dọn sổ
 * xong bấm Lưu một lần. Chung transaction nên không có cảnh xoá xong mới phát hiện một
 * dòng sửa không hợp lệ và đứng giữa hai trạng thái.
 */
/** Một dòng sửa: { id, ...các trường vận hành }. */
type Update = Record<string, unknown>;

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolveTbycnnWriteScope(user);

    const body = (await req.json().catch(() => ({}))) as { updates?: Update[]; deletes?: unknown };
    const updates = Array.isArray(body.updates) ? body.updates : [];
    const deleteIds = [
      ...new Set((Array.isArray(body.deletes) ? body.deletes : []).map((id) => String(id ?? "")).filter(Boolean)),
    ];
    if (updates.length === 0 && deleteIds.length === 0) throw fail("Không có dòng nào để lưu", 400);
    if (updates.length > 1000) throw fail("Quá 1000 dòng một lượt — hãy lọc bớt rồi lưu lại", 400);
    if (deleteIds.length > 1000) throw fail("Quá 1000 dòng xoá một lượt — hãy lọc bớt rồi làm lại", 400);

    const ids = updates.map((u) => String(u.id ?? "")).filter(Boolean);
    if (ids.length !== updates.length) throw fail("Có dòng thiếu id", 400);
    // Một dòng vừa sửa vừa xoá thì sửa là vô nghĩa — chặn ở đây cho lỗi nói đúng nguyên
    // nhân, thay vì để transaction chết vì cập nhật một bản ghi vừa bị xoá.
    const conflicting = ids.filter((id) => deleteIds.includes(id));
    if (conflicting.length > 0) throw fail("Có dòng vừa được sửa vừa được đánh dấu xoá — hãy tải lại trang", 400);

    const rows = await prisma.tbycnnEquipment.findMany({
      where: { id: { in: [...ids, ...deleteIds] } },
      include: { period: { select: { label: true, isClosed: true, allowItemDeletion: true } } },
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

      /*
       * Đổi "Kết quả" thì kéo theo hai ô số lượng khả dụng — trừ khi người dùng tự đặt
       * chúng trong CÙNG lượt sửa (giá trị họ gõ tay luôn thắng).
       *
       * Hai chỗ này nói cùng một sự thật: dụng cụ còn dùng được hay không. Để lệch nhau
       * thì huy hiệu Tình trạng, năm thẻ thống kê và con số "đã kiểm tra N đạt" trên
       * biên bản nói ba kiểu khác nhau về cùng một cái thang.
       */
      if ("ketQuaThu" in data && !("soLuongKhaDung" in data) && !("soLuongKhongKhaDung" in data)) {
        const suy = suyKhaDungTuKetQua(data.ketQuaThu, existing.soLuong);
        if (suy) Object.assign(data, suy);
      }

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

    /*
     * XOÁ DÒNG. Cùng ba rào với bước sửa, cộng thêm công tắc "Xoá thiết bị" của kỳ:
     * `canDeleteEquipment` chỉ nới cho dòng gốc khi Quản trị đã bật công tắc đó.
     * Giữ lại bản ghi trước khi xoá để ghi vào nhật ký — xoá xong thì không tra lại được.
     */
    const deleted: typeof rows = [];
    for (const id of deleteIds) {
      const existing = byId.get(id);
      // Người khác vừa xoá xong thì coi như đã đạt mục đích, không bắt người dùng làm lại
      // cả lượt chỉ vì một dòng đã biến mất.
      if (!existing) continue;
      if (existing.period.isClosed) throw fail(`Kỳ ${existing.period.label} đã chốt sổ, chỉ xem được`, 409);
      if (!canWriteRow(scope, existing)) {
        throw fail(`"${existing.tenThietBi}" không thuộc cương vị quản lý của bạn`, 403);
      }
      if (!canDeleteEquipment(existing, new Date(), existing.period.allowItemDeletion)) {
        throw fail(
          existing.sourceId != null
            ? `"${existing.tenThietBi}" là thiết bị theo hồ sơ gốc — cần Quản trị bật công tắc Xoá thiết bị của kỳ`
            : `"${existing.tenThietBi}": chỉ xoá được thiết bị tự thêm trong vòng ${TBYCNN_DELETE_WINDOW_DAYS} ngày, hoặc cần Quản trị bật công tắc Xoá thiết bị`,
          403
        );
      }
      deleted.push(existing);
    }
    // Số dòng SỬA phải chốt trước khi nhét lệnh xoá vào cùng mảng, không thì đếm nhầm.
    const savedCount = writes.length;
    if (deleted.length > 0) {
      writes.push(prisma.tbycnnEquipment.deleteMany({ where: { id: { in: deleted.map((r) => r.id) } } }));
    }

    if (writes.length === 0) throw fail("Không có thay đổi nào để lưu", 400);
    await prisma.$transaction(writes);

    await audit(
      user.id,
      "UPDATE_TBYCNN_BULK",
      "TbycnnEquipment",
      undefined,
      auditDetailWithPosition(
        user,
        `Lưu một lượt ${savedCount} dòng sổ TBYCNN` +
          (deleted.length > 0
            ? `; xoá ${deleted.length} thiết bị: ${deleted.map((r) => `"${r.tenThietBi}" (${r.khuVuc})`).join(", ")}`
            : "")
      ),
      { saveToAuditLog: true, ...(deleted.length > 0 ? { beforeData: deleted } : {}) }
    );

    return ok({ saved: savedCount, deleted: deleted.length });
  });
}
