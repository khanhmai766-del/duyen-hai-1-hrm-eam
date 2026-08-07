import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit, auditDetailWithPosition } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import {
  PCCC_PERMISSION,
  assertPeriodOpen,
  clearSignature,
  normalizePositionPatch,
  pickFields,
  type FieldSpec,
} from "@/lib/pccc-service";
import { applyTccToggle, deriveCabinetStatus } from "@/lib/pccc-status";

export const dynamic = "force-dynamic";

const EDITABLE: FieldSpec = {
  ten: "string",
  viTri: "string",
  cuongVi: "string",
  machine: "string",
  sl: "number",
  dvt: "string",
  soYcsc: "string",
  ngayKiemTra: "date",
  nguoiKiemTra: "string",
  ghiChu: "string",
};

// PATCH /api/pccc/cabinets/<id>
// body: { ...trường định danh, components?: [{ groupLabel, status, checked }] }
// Một nhóm được phép tích NHIỀU trạng thái cùng lúc (quy tắc có chủ đích).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, PCCC_PERMISSION.manage, ["personal", "manage", "full"], "Không đủ quyền sửa dữ liệu PCCC");

    const current = await prisma.pcccCabinet.findUnique({
      where: { id: params.id },
      include: { period: true, components: true },
    });
    if (!current) return fail("Không tìm thấy tủ chữa cháy", 404);
    assertPeriodOpen(current.period);

    const body = (await req.json()) as Record<string, unknown> & {
      components?: { groupLabel: string; status: string; checked: boolean }[];
    };
    const data = normalizePositionPatch(pickFields(body, EDITABLE), current);
    const componentPatch = Array.isArray(body.components) ? body.components : [];
    if (Object.keys(data).length === 0 && componentPatch.length === 0) return fail("Không có trường nào để cập nhật");

    const changed = Object.keys(data).filter(
      (k) => String((current as Record<string, unknown>)[k] ?? "") !== String(data[k] ?? "")
    );

    for (const patch of componentPatch) {
      const target = current.components.find((c) => c.groupLabel === patch.groupLabel && c.status === patch.status);
      if (!target) return fail(`Không có linh kiện ${patch.groupLabel} / ${patch.status}`);
      // "Khả dụng" và "Bất khả dụng" là hai thái cực LOẠI TRỪ nhau — tích ô này thì
      // tự bỏ tích ô kia. Các lỗi ở giữa vẫn tích được nhiều cùng lúc.
      for (const change of applyTccToggle(current.components, patch.groupLabel, patch.status, Boolean(patch.checked))) {
        const cell = current.components.find((c) => c.groupLabel === change.groupLabel && c.status === change.status);
        if (!cell || cell.checked === change.checked) continue;
        await prisma.pcccCabinetComponent.update({ where: { id: cell.id }, data: { checked: change.checked } });
        cell.checked = change.checked;
        changed.push(`${change.groupLabel}/${change.status}=${change.checked ? "☑" : "☐"}`);
      }
    }

    const updated = await prisma.pcccCabinet.update({
      where: { id: current.id },
      data: { ...data, tinhTrangTongThe: deriveCabinetStatus(current.components) },
      include: { components: { orderBy: [{ groupOrder: "asc" }, { statusOrder: "asc" }] } },
    });
    if (changed.length > 0) await clearSignature("CABINET", current.id);

    await audit(
      user.id,
      "UPDATE_PCCC_CABINET",
      "PcccCabinet",
      current.id,
      auditDetailWithPosition(user, `${current.period.label} · ${current.ma}`),
      { beforeData: current, afterData: updated, changedFields: changed }
    );
    return ok({ ...updated, signature: null, signatureCleared: changed.length > 0 });
  });
}
