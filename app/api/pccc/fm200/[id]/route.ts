import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import {
  assertPcccScope,
  assertPcccScopePatch,
  resolvePcccWriteScope,
  assertPeriodWritable,
  clearSignature,
  normalizePositionPatch,
  pickFields,
  type FieldSpec,
} from "@/lib/pccc-service";

export const dynamic = "force-dynamic";

const EDITABLE: FieldSpec = {
  cuongVi: "string",
  machine: "string",
  mucMin: "number",
  mucMax: "number",
  mucDvt: "string",
  mucGhiChu: "string",
  apMin: "number",
  apMax: "number",
  apDvt: "string",
  apGhiChu: "string",
  ngayKiemTra: "date",
  nguoiKiemTra: "string",
};

/** Chỉ nhận đúng các nhãn bình của bảng; giá trị rỗng → null (chưa đo). */
function sanitizeValues(input: unknown, labels: string[], current: Record<string, number | null>) {
  if (input === undefined) return undefined;
  if (input === null || typeof input !== "object") throw fail("Giá trị bình không hợp lệ");
  const out: Record<string, number | null> = { ...current };
  for (const [label, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!labels.includes(label)) throw fail(`Bảng không có bình "${label}"`);
    if (raw === null || raw === "") {
      out[label] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) throw fail(`Giá trị bình ${label} không phải số`);
    out[label] = n;
  }
  return out;
}

// PATCH /api/pccc/fm200/<id> -> sửa 1 bảng FM200 (ký 1 lần cho cả bảng, không theo bình)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolvePcccWriteScope(user);

    const current = await prisma.pcccFm200Panel.findUnique({ where: { id: params.id }, include: { period: true } });
    if (!current) return fail("Không tìm thấy bảng FM200", 404);
    assertPeriodWritable(current.period);
    assertPcccScope(scope, current);

    const body = (await req.json()) as Record<string, unknown>;
    const data = normalizePositionPatch(pickFields(body, EDITABLE), current);
    const mucValues = sanitizeValues(body.mucValues, current.binhLabels, (current.mucValues ?? {}) as Record<string, number | null>);
    const apValues = sanitizeValues(body.apValues, current.binhLabels, (current.apValues ?? {}) as Record<string, number | null>);
    if (mucValues !== undefined) data.mucValues = mucValues;
    if (apValues !== undefined) data.apValues = apValues;
    if (Object.keys(data).length === 0) return fail("Không có trường nào để cập nhật");
    assertPcccScopePatch(scope, data);

    const changed = Object.keys(data);
    const updated = await prisma.pcccFm200Panel.update({ where: { id: current.id }, data });
    await clearSignature("FM200_PANEL", current.id);

    await audit(
      user.id,
      "UPDATE_PCCC_FM200",
      "PcccFm200Panel",
      current.id,
      auditDetailWithPosition(user, `${current.period.label} · ${current.title}`),
      { beforeData: current, afterData: updated, changedFields: changed }
    );
    return ok({ ...updated, signature: null, signatureCleared: true });
  });
}
