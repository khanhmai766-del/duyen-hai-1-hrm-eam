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
import { VALVE_LOAI_OPTIONS, VALVE_TINH_TRANG_OPTIONS } from "@/lib/pccc-status";

export const dynamic = "force-dynamic";

const EDITABLE: FieldSpec = {
  tenVan: "string",
  loaiVan: "string",
  viTri: "string",
  cuongVi: "string",
  machine: "string",
  nguoiGiamSat: "string",
  tinhTrang: "string",
  moTa: "string",
  soYcsc: "string",
  ngayKiemTra: "date",
  nguoiKiemTra: "string",
};

// PATCH /api/pccc/valves/<id>
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolvePcccWriteScope(user, undefined, "VALVE");

    const current = await prisma.pcccValve.findUnique({ where: { id: params.id }, include: { period: true } });
    if (!current) return fail("Không tìm thấy van chữa cháy", 404);
    assertPeriodWritable(current.period);
    assertPcccScope(scope, current);

    const body = (await req.json()) as Record<string, unknown>;
    const data = normalizePositionPatch(pickFields(body, EDITABLE), current, { withGiamSat: true });
    if (Object.keys(data).length === 0) return fail("Không có trường nào để cập nhật");
    assertAdminOnlyFields(user, data);
    assertPcccScopePatch(scope, data);

    // Hai ô chọn có bộ giá trị đóng — chặn ở server chứ không chỉ giới hạn dropdown,
    // vì gọi thẳng API vẫn đặt được giá trị lạ rồi làm hỏng thống kê tình trạng.
    if ("tinhTrang" in data && data.tinhTrang !== null && !(VALVE_TINH_TRANG_OPTIONS as readonly string[]).includes(String(data.tinhTrang))) {
      return fail("Tình trạng van không hợp lệ");
    }
    if ("loaiVan" in data) {
      const loai = String(data.loaiVan ?? "").toUpperCase();
      if (!(VALVE_LOAI_OPTIONS as readonly string[]).includes(loai)) return fail("Loại van phải là DELUGE hoặc ALARM");
      data.loaiVan = loai;
    }

    const changed = Object.keys(data).filter(
      (k) => String((current as Record<string, unknown>)[k] ?? "") !== String(data[k] ?? "")
    );
    if (changed.length > 0) clearInspectionStamp("VALVE", data);

    const updated = await prisma.pcccValve.update({ where: { id: current.id }, data });
    if (changed.length > 0) await clearSignature("VALVE", current.id);

    await audit(
      user.id,
      "UPDATE_PCCC_VALVE",
      "PcccValve",
      current.id,
      auditDetailWithPosition(user, `${current.period.label} · ${current.maKks}`),
      { beforeData: current, afterData: updated, changedFields: changed }
    );
    return ok({ ...updated, signature: null, signatureCleared: changed.length > 0 });
  });
}
