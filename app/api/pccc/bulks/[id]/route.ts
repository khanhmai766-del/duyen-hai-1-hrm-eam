import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import {
  assertPcccScope,
  assertPcccScopePatch,
  assertAdminOnlyFields,
  resolvePcccWriteScope,
  assertPeriodWritable,
  clearSignature,
  normalizePositionPatch,
  pickFields,
  type FieldSpec,
} from "@/lib/pccc-service";
import { fcdStatus } from "@/lib/pccc-summary";

export const dynamic = "force-dynamic";

const EDITABLE: FieldSpec = {
  ten: "string",
  cuongVi: "string",
  machine: "string",
  viTri: "string",
  dvt: "string",
  khoiLuongThietKe: "number",
  khoiLuongHienTai: "number",
  ngayChot: "date",
  nguoiChot: "string",
  ghiChu: "string",
};

// PATCH /api/pccc/bulks/<id> -> sửa 1 bồn; % còn lại và tình trạng là dẫn xuất
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolvePcccWriteScope(user);

    const current = await prisma.pcccBulk.findUnique({ where: { id: params.id }, include: { period: true } });
    if (!current) return fail("Không tìm thấy bồn/mức", 404);
    assertPeriodWritable(current.period);
    assertPcccScope(scope, current);

    const data = normalizePositionPatch(pickFields((await req.json()) as Record<string, unknown>, EDITABLE), current);
    if (Object.keys(data).length === 0) return fail("Không có trường nào để cập nhật");
    assertAdminOnlyFields(user, data);
    assertPcccScopePatch(scope, data);

    const thietKe = ("khoiLuongThietKe" in data ? (data.khoiLuongThietKe as number | null) : current.khoiLuongThietKe) ?? null;
    const hienTai = ("khoiLuongHienTai" in data ? (data.khoiLuongHienTai as number | null) : current.khoiLuongHienTai) ?? null;
    const pct = thietKe && hienTai !== null ? hienTai / thietKe : null;
    data.phanTramConLai = pct;
    data.tinhTrang = fcdStatus(pct);

    const changed = Object.keys(data).filter(
      (k) => String((current as Record<string, unknown>)[k] ?? "") !== String(data[k] ?? "")
    );
    const updated = await prisma.pcccBulk.update({ where: { id: current.id }, data });
    if (changed.length > 0) await clearSignature("BULK", current.id);

    await audit(
      user.id,
      "UPDATE_PCCC_BULK",
      "PcccBulk",
      current.id,
      auditDetailWithPosition(user, `${current.period.label} · ${current.ten}`),
      { beforeData: current, afterData: updated, changedFields: changed }
    );
    return ok({ ...updated, signature: null, signatureCleared: changed.length > 0 });
  });
}
