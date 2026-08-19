import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import {
  assertPcccScope,
  assertPcccScopePatch,
  assertAdminOnlyFields,
  assertPeriodWritable,
  clearInspectionStamp,
  clearSignature,
  normalizePositionPatch,
  pickFields,
  resolvePcccWriteScope,
  type FieldSpec,
} from "@/lib/pccc-service";
import { isValidApSuat, normalizeChungLoai } from "@/lib/pccc-status";

export const dynamic = "force-dynamic";

/** Các trường người dùng được sửa trên web. Cột dẫn xuất (denHanThayThe) tính lại từ ngaySx + thoiGianSd. */
const EDITABLE: FieldSpec = {
  chungLoai: "string",
  viTri: "string",
  cuongVi: "string",
  machine: "string", // S1 | S2 | COMMON — chuẩn hoá lại ở normalizePositionPatch
  nguoiGiamSat: "string",
  sl: "number",
  dvt: "string",
  tinhTrang: "string",
  apSuat: "number",
  viTriHienTai: "string",
  tinhTrangNgoai: "string",
  nguonGoc: "string",
  thoiGianThayGanNhat: "date",
  ngaySx: "date",
  thoiGianSd: "number",
  ngayKiemTra: "date",
  nguoiKiemTra: "string",
  ghiChu: "string",
};

function computeDenHan(ngaySx: Date | null, namSuDung: number | null) {
  if (!ngaySx || namSuDung === null) return null;
  const d = new Date(ngaySx.getTime());
  d.setUTCMonth(d.getUTCMonth() + Math.round(namSuDung * 12));
  return d;
}

// PATCH /api/pccc/extinguishers/<id> -> sửa 1 bình; mọi thay đổi đều xoá chữ ký của dòng
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolvePcccWriteScope(user);

    const current = await prisma.pcccExtinguisher.findUnique({ where: { id: params.id }, include: { period: true } });
    if (!current) return fail("Không tìm thấy bình chữa cháy", 404);
    assertPeriodWritable(current.period);
    assertPcccScope(scope, current);

    const body = (await req.json()) as Record<string, unknown>;
    const data = normalizePositionPatch(pickFields(body, EDITABLE), current, { withGiamSat: true });
    if (Object.keys(data).length === 0) return fail("Không có trường nào để cập nhật");
    assertAdminOnlyFields(user, data);
    assertPcccScopePatch(scope, data);

    if ("chungLoai" in data) data.chungLoai = normalizeChungLoai(data.chungLoai as string | null);
    // Áp suất/KL là SỐ PHẦN TRĂM 0–100 — chặn ở server, không tin client. Không còn
    // ràng buộc nào giữa áp suất và tình trạng: hai đánh giá độc lập theo TB 5100.
    if ("apSuat" in data && !isValidApSuat(data.apSuat as number | null)) {
      return fail("Áp suất / khối lượng phải là số phần trăm từ 0 đến 100");
    }
    const autoAdjusted = Boolean(data.autoAdjustedTinhTrang);
    delete data.autoAdjustedTinhTrang;

    // Hạn thay thế là DẪN XUẤT — tính lại khi ngày SX hoặc số năm sử dụng đổi.
    if ("ngaySx" in data || "thoiGianSd" in data) {
      const ngaySx = ("ngaySx" in data ? (data.ngaySx as Date | null) : current.ngaySx) ?? null;
      const nam = ("thoiGianSd" in data ? (data.thoiGianSd as number | null) : current.thoiGianSd) ?? null;
      data.denHanThayThe = computeDenHan(ngaySx, nam);
    }

    const changed = Object.keys(data).filter(
      (k) => String((current as Record<string, unknown>)[k] ?? "") !== String(data[k] ?? "")
    );
    // Có sửa gì thì chữ ký VÀ dấu kiểm tra cùng bị xoá (xem clearInspectionStamp).
    if (changed.length > 0) clearInspectionStamp("EXTINGUISHER", data);
    const updated = await prisma.pcccExtinguisher.update({ where: { id: current.id }, data });
    if (changed.length > 0) await clearSignature("EXTINGUISHER", current.id);

    await audit(
      user.id,
      "UPDATE_PCCC_EXTINGUISHER",
      "PcccExtinguisher",
      current.id,
      auditDetailWithPosition(user, `${current.period.label} · ${current.ma}`),
      { beforeData: current, afterData: updated, changedFields: changed }
    );
    return ok({
      ...updated,
      signature: null,
      signatureCleared: changed.length > 0,
      // Client hiện toast riêng khi tình trạng bị quy tắc áp suất nâng mức
      autoAdjustedTinhTrang: autoAdjusted,
    });
  });
}
