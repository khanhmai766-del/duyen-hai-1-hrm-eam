import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import {
  assertAdminOnlyFields,
  assertPcccScope,
  assertPcccScopePatch,
  assertPeriodWritable,
  clearInspectionStamp,
  clearSignature,
  normalizePositionPatch,
  pickFields,
  resolvePcccWriteScope,
  type FieldSpec,
} from "@/lib/pccc-service";
import { DAT_KHONG_DAT_OPTIONS } from "@/lib/pccc-status";

export const dynamic = "force-dynamic";

const EDITABLE: FieldSpec = {
  heThong: "string",
  viTri: "string",
  cuongVi: "string",
  machine: "string",
  tinhTrang: "string",
  ghiChu: "string",
  ngayKiemTra: "date",
  nguoiKiemTra: "string",
};

// PATCH /api/pccc/fire-control-cabinets/<id>
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolvePcccWriteScope(user, undefined, "FIRE_CONTROL_CABINET");
    const current = await prisma.pcccFireControlCabinet.findUnique({ where: { id: params.id }, include: { period: true } });
    if (!current) return fail("Không tìm thấy tủ điều khiển chữa cháy", 404);
    assertPeriodWritable(current.period);
    assertPcccScope(scope, current);

    const body = (await req.json()) as Record<string, unknown>;
    const data = normalizePositionPatch(pickFields(body, EDITABLE), current);
    if (Object.keys(data).length === 0) return fail("Không có trường nào để cập nhật");
    assertAdminOnlyFields(user, data);
    assertPcccScopePatch(scope, data);

    if (
      "tinhTrang" in data &&
      data.tinhTrang !== null &&
      !(DAT_KHONG_DAT_OPTIONS as readonly string[]).includes(String(data.tinhTrang))
    ) {
      return fail("Tình trạng phải là Đạt hoặc Không đạt");
    }

    const changed = Object.keys(data).filter(
      (key) => String((current as Record<string, unknown>)[key] ?? "") !== String(data[key] ?? "")
    );
    if (changed.length > 0) clearInspectionStamp("FIRE_CONTROL_CABINET", data);

    const updated = await prisma.pcccFireControlCabinet.update({ where: { id: current.id }, data });
    if (changed.length > 0) await clearSignature("FIRE_CONTROL_CABINET", current.id);

    await audit(
      user.id,
      "UPDATE_PCCC_FIRE_CONTROL_CABINET",
      "PcccFireControlCabinet",
      current.id,
      auditDetailWithPosition(user, `${current.period.label} · ${current.ma}`),
      { beforeData: current, afterData: updated, changedFields: changed }
    );
    return ok({ ...updated, signature: null, signatureCleared: changed.length > 0 });
  });
}
