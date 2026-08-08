import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import {
  assertPcccScope,
  assertPcccScopePatch,
  assertPeriodWritable,
  clearSignature,
  normalizePositionPatch,
  pickFields,
  resolvePcccWriteScope,
  type FieldSpec,
} from "@/lib/pccc-service";
import { apSuatOptions, normalizeChungLoai, resolveTinhTrang } from "@/lib/pccc-status";

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
  apSuat: "string",
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
    assertPcccScopePatch(scope, data);

    // Quy tắc TÌNH TRẠNG ↔ ÁP SUẤT của bảng gốc — cưỡng chế Ở SERVER, không tin
    // client: áp suất phải nằm trong danh sách của chủng loại, và áp suất từ mức
    // cảnh báo trở lên thì không được để "Khả dụng" (xem lib/pccc-status.ts).
    if ("chungLoai" in data) data.chungLoai = normalizeChungLoai(data.chungLoai as string | null);
    if ("apSuat" in data || "tinhTrang" in data || "chungLoai" in data) {
      const chungLoai = ("chungLoai" in data ? (data.chungLoai as string | null) : current.chungLoai) ?? null;
      const apSuat = ("apSuat" in data ? (data.apSuat as string | null) : current.apSuat) ?? null;
      const tinhTrang = ("tinhTrang" in data ? (data.tinhTrang as string | null) : current.tinhTrang) ?? null;

      if (apSuat && !apSuatOptions(chungLoai).includes(apSuat)) {
        return fail(`Áp suất "${apSuat}" không hợp lệ với ${chungLoai ?? "chủng loại này"}`);
      }
      const resolved = resolveTinhTrang(apSuat, tinhTrang);
      if (resolved !== tinhTrang) {
        // Người dùng chọn "Khả dụng" trong khi áp suất đang cảnh báo → nói rõ vì sao
        // bị đổi, thay vì âm thầm ghi giá trị khác cái họ vừa bấm.
        data.tinhTrang = resolved;
        data.autoAdjustedTinhTrang = true;
      }
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
