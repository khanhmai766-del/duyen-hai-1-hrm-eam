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

export const dynamic = "force-dynamic";

const EDITABLE: FieldSpec = {
  tenKhuVuc: "string",
  viTri: "string",
  cuongVi: "string",
  machine: "string",
  nguoiGiamSat: "string",
  khac: "string",
  ngayKiemTra: "date",
  nguoiKiemTra: "string",
};

// PATCH /api/pccc/alarm-buttons/<id>
// body: { ...trường định danh, components?: [{ groupLabel, status, checked }] }
//
// Dùng LẠI nguyên applyTccToggle/deriveCabinetStatus của tủ chữa cháy: cùng một
// quy tắc ô tích (một nhóm tích được nhiều khiếm khuyết cùng lúc, chỉ ô đầu và ô
// cuối loại trừ nhau) và cùng cách suy tình trạng tổng thể.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    const scope = await resolvePcccWriteScope(user, undefined, "ALARM_BUTTON");

    const current = await prisma.pcccAlarmButton.findUnique({
      where: { id: params.id },
      include: { period: true, components: true },
    });
    if (!current) return fail("Không tìm thấy nút nhấn báo cháy", 404);
    assertPeriodWritable(current.period);
    assertPcccScope(scope, current);

    const body = (await req.json()) as Record<string, unknown> & {
      components?: { groupLabel: string; status: string; checked: boolean }[];
    };
    const data = normalizePositionPatch(pickFields(body, EDITABLE), current, { withGiamSat: true });
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
        await prisma.pcccAlarmButtonComponent.update({ where: { id: cell.id }, data: { checked: change.checked } });
        cell.checked = change.checked;
        changed.push(`${change.groupLabel}/${change.status}=${change.checked ? "☑" : "☐"}`);
      }
    }

    // Có sửa gì thì chữ ký VÀ dấu kiểm tra cùng bị xoá (xem clearInspectionStamp).
    if (changed.length > 0) clearInspectionStamp("ALARM_BUTTON", data);
    const updated = await prisma.pcccAlarmButton.update({
      where: { id: current.id },
      data: { ...data, tinhTrangTongThe: deriveCabinetStatus(current.components) },
      include: { components: { orderBy: [{ groupOrder: "asc" }, { statusOrder: "asc" }] } },
    });
    if (changed.length > 0) await clearSignature("ALARM_BUTTON", current.id);

    await audit(
      user.id,
      "UPDATE_PCCC_ALARM_BUTTON",
      "PcccAlarmButton",
      current.id,
      auditDetailWithPosition(user, `${current.period.label} · ${current.maKks}`),
      { beforeData: current, afterData: updated, changedFields: changed }
    );
    return ok({ ...updated, signature: null, signatureCleared: changed.length > 0 });
  });
}
