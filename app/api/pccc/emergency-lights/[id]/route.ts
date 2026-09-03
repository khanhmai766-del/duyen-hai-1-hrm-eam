import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import {
  assertPcccScope,
  assertPcccScopePatch,
  assertAdminOnlyFields,
  resolvePcccWriteScope,
  assertPeriodWritable,
  clearInspectionStamp,
  clearSignature,
  normalizePositionPatch,
  pickFields,
  type FieldSpec,
} from "@/lib/pccc-service";
import { LIGHT_TINH_TRANG_OPTIONS } from "@/lib/pccc-status";

export const dynamic = "force-dynamic";

/**
 * `ketQuaTest` là văn bản tự do lấy nguyên văn từ ô "Tháng MM/YYYY" của sheet nguồn
 * (kèm cả số phiếu YCSC) — sửa được vì mỗi kỳ người kiểm tra ghi lại kết quả mới.
 *
 * `tenKhuVuc`/`maBanVe` là dữ liệu định danh CẤP KHU VỰC nên vẫn chỉ đọc.
 * `soLuongKhuVuc` được phép hiệu chỉnh để phản ánh số lượng kiểm kê thực tế.
 */
const EDITABLE: FieldSpec = {
  soLuongKhuVuc: "number",
  cuongVi: "string",
  machine: "string",
  nguoiGiamSat: "string",
  tinhTrang: "string",
  ketQuaTest: "string",
  ghiChu: "string",
  ngayKiemTra: "date",
  nguoiKiemTra: "string",
};

// PATCH /api/pccc/emergency-lights/<id>
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolvePcccWriteScope(user, undefined, "EMERGENCY_LIGHT");

    const current = await prisma.pcccEmergencyLight.findUnique({ where: { id: params.id }, include: { period: true } });
    if (!current) return fail("Không tìm thấy đèn", 404);
    assertPeriodWritable(current.period);
    assertPcccScope(scope, current);

    const body = (await req.json()) as Record<string, unknown>;
    const data = normalizePositionPatch(pickFields(body, EDITABLE), current, { withGiamSat: true });
    if (Object.keys(data).length === 0) return fail("Không có trường nào để cập nhật");
    assertAdminOnlyFields(user, data);
    assertPcccScopePatch(scope, data);

    // Bộ giá trị đóng — chặn ở server, không chỉ giới hạn dropdown. "Không có đèn" là
    // một lựa chọn HỢP LỆ (vị trí thực tế không lắp đèn), không phải giá trị rác.
    if ("tinhTrang" in data && data.tinhTrang !== null && !(LIGHT_TINH_TRANG_OPTIONS as readonly string[]).includes(String(data.tinhTrang))) {
      return fail("Tình trạng đèn không hợp lệ");
    }
    if ("soLuongKhuVuc" in data && data.soLuongKhuVuc !== null && Number(data.soLuongKhuVuc) < 0) {
      return fail("Số lượng khu vực không được nhỏ hơn 0");
    }

    const changed = Object.keys(data).filter(
      (k) => String((current as Record<string, unknown>)[k] ?? "") !== String(data[k] ?? "")
    );
    if (changed.length > 0) clearInspectionStamp("EMERGENCY_LIGHT", data);

    const updated = await prisma.pcccEmergencyLight.update({ where: { id: current.id }, data });
    if (changed.length > 0) await clearSignature("EMERGENCY_LIGHT", current.id);

    await audit(
      user.id,
      "UPDATE_PCCC_EMERGENCY_LIGHT",
      "PcccEmergencyLight",
      current.id,
      auditDetailWithPosition(user, `${current.period.label} · ${current.loai} · ${current.maKks}`),
      { beforeData: current, afterData: updated, changedFields: changed }
    );
    return ok({ ...updated, signature: null, signatureCleared: changed.length > 0 });
  });
}
