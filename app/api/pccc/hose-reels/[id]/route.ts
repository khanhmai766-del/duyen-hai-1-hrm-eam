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
import { applyTccToggle, deriveCabinetStatus } from "@/lib/pccc-status";

import { pcccDeleteHandler } from "@/lib/pccc-delete";

export const dynamic = "force-dynamic";

const EDITABLE: FieldSpec = {
  ten: "string",
  viTri: "string",
  cuongVi: "string",
  machine: "string",
  soYcsc: "string",
  ngayKiemTra: "date",
  nguoiKiemTra: "string",
  ghiChu: "string",
};

// PATCH /api/pccc/hose-reels/<id>
// body: { ...trường định danh, components?: [{ groupLabel, status, checked }] }
//
// Quy tắc ô tích và cách suy tình trạng tổng thể DÙNG CHUNG với tủ chữa cháy — từ
// 2026-08-19 cả hai bảng đều hai mức Đạt/Không đạt theo TB 5100.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolvePcccWriteScope(user, undefined, "HOSE_REEL");

    const current = await prisma.pcccHoseReel.findUnique({
      where: { id: params.id },
      include: { period: true, components: true },
    });
    if (!current) return fail("Không tìm thấy cuộn vòi chữa cháy", 404);
    assertPeriodWritable(current.period);
    assertPcccScope(scope, current);

    const body = (await req.json()) as Record<string, unknown> & {
      components?: { groupLabel: string; status: string; checked: boolean }[];
    };
    const data = normalizePositionPatch(pickFields(body, EDITABLE), current);
    const componentPatch = Array.isArray(body.components) ? body.components : [];
    if (Object.keys(data).length === 0 && componentPatch.length === 0) return fail("Không có trường nào để cập nhật");
    assertAdminOnlyFields(user, data);
    assertPcccScopePatch(scope, data);

    const changed = Object.keys(data).filter(
      (k) => String((current as Record<string, unknown>)[k] ?? "") !== String(data[k] ?? "")
    );

    for (const patch of componentPatch) {
      const target = current.components.find((c) => c.groupLabel === patch.groupLabel && c.status === patch.status);
      if (!target) return fail(`Không có hạng mục ${patch.groupLabel} / ${patch.status}`);
      for (const change of applyTccToggle(current.components, patch.groupLabel, patch.status, Boolean(patch.checked))) {
        const cell = current.components.find((c) => c.groupLabel === change.groupLabel && c.status === change.status);
        if (!cell || cell.checked === change.checked) continue;
        await prisma.pcccHoseReelComponent.update({ where: { id: cell.id }, data: { checked: change.checked } });
        cell.checked = change.checked;
        changed.push(`${change.groupLabel}/${change.status}=${change.checked ? "☑" : "☐"}`);
      }
    }

    if (changed.length > 0) clearInspectionStamp("HOSE_REEL", data);
    const updated = await prisma.pcccHoseReel.update({
      where: { id: current.id },
      data: { ...data, tinhTrangTongThe: deriveCabinetStatus(current.components) },
      include: { components: { orderBy: [{ groupOrder: "asc" }, { statusOrder: "asc" }] }, cabinet: { select: { id: true, ma: true, ten: true } } },
    });
    if (changed.length > 0) await clearSignature("HOSE_REEL", current.id);

    await audit(
      user.id,
      "UPDATE_PCCC_HOSE_REEL",
      "PcccHoseReel",
      current.id,
      auditDetailWithPosition(user, `${current.period.label} · ${current.ma}`),
      { beforeData: current, afterData: updated, changedFields: changed }
    );
    return ok({ ...updated, signature: null, signatureCleared: changed.length > 0 });
  });
}

// DELETE /api/pccc/hose-reels/<id> — gỡ hẳn một cuộn vòi khỏi kỳ.
//
// KHÔNG đánh số lại STT các dòng còn lại: đánh lại thì mọi dòng đều bị coi là "đã sửa"
// và mất sạch chữ ký của cả bảng chỉ vì xoá một dòng.
/**
 * DELETE /api/pccc/hose-reels/[id] — xoá cuộn vòi khỏi kỳ.
 *
 * Từ 10/09/2026 đi CHUNG LUẬT với bảy loại còn lại: phải có công tắc "Xoá thiết bị" của kỳ
 * do Quản trị bật. Trước đó cuộn vòi là loại duy nhất xoá được tự do — một sổ mà hai luật
 * xoá thì không ai nhớ nổi chỗ nào được chỗ nào không.
 */
export const DELETE = pcccDeleteHandler({
  target: "HOSE_REEL",
  scopeTable: "HOSE_REEL",
  denyMessage: "Không đủ quyền xoá cuộn vòi",
  notFound: "Không tìm thấy cuộn vòi chữa cháy",
  auditAction: "DELETE_PCCC_HOSE_REEL",
  entity: "PcccHoseReel",
  find: (id) => prisma.pcccHoseReel.findUnique({ where: { id }, include: { period: true } }),
  remove: (id) => prisma.pcccHoseReel.delete({ where: { id } }),
  label: (row) => row.ma,
});
