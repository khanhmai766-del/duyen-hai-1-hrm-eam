import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { parseDateInput } from "@/lib/utils";
import { resolveEquipmentAccessForUser } from "@/lib/server-access";
import { canEditMaterialReplacement } from "@/lib/material-replacement-access";
import { positionCodeOf, positionLabelOf } from "@/lib/position-catalog";
import { MATERIAL_CATEGORIES } from "@/lib/constants";
import { assertSeqEditable } from "@/lib/server-access";
import { normalizePctNumber, normalizeReplacementSourceNote } from "@/lib/material-replacement-source";

export const dynamic = "force-dynamic";

async function assertCanEditLog(user: Awaited<ReturnType<typeof requireUser>>, id: string, levels: Array<"manage" | "full">) {
  await requirePermissionLevel(user, "replacement-manage", levels, "Không đủ quyền thao tác lịch sử thay thế vật tư");
  const log = await prisma.materialReplacementLog.findUnique({
    where: { id },
    include: { replacement: { select: { id: true, deviceSeq: true, system: true } } },
  });
  if (!log) throw fail("Không tìm thấy ghi nhận thay thế", 404);
  const access = await resolveEquipmentAccessForUser(user);
  // Điểm theo dõi bị gỡ sau mỗi lần ghi nhận và có thể bị xoá hẳn, khi đó
  // replacementId = null. Phải xét quyền theo snapshot trên chính dòng lịch sử,
  // nếu không mọi dòng sinh từ SYC đều bị chặn 403 khi sửa/xoá.
  const scope = {
    deviceSeq: log.deviceSeq ?? log.replacement?.deviceSeq ?? null,
    system: log.systemLabel ?? log.replacement?.system ?? null,
  };
  if (!canEditMaterialReplacement(access, scope)) {
    throw fail("Cương vị của bạn không có quyền thao tác lịch sử thay thế này", 403);
  }
  return log;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await assertCanEditLog(user, params.id, ["manage", "full"]);

    const body = await req.json().catch(() => ({}));
    const replacedAtText = String(body.replacedAt || "").trim();
    if (!replacedAtText) return fail("Vui lòng chọn ngày thay thế");
    const replacedAt = parseDateInput(replacedAtText);
    if (Number.isNaN(replacedAt.getTime())) return fail("Ngày thay thế không hợp lệ");

    const quantityRaw = body.quantity;
    let quantity: number | null = null;
    if (quantityRaw !== undefined && quantityRaw !== null && quantityRaw !== "") {
      const n = Number(quantityRaw);
      if (!Number.isFinite(n) || n < 0) return fail("Số lượng thay thế không hợp lệ");
      quantity = Math.trunc(n);
    }

    // Các thẻ chỉ sửa được trên DÒNG LƯU TRỮ (nhập từ sổ theo dõi). Dòng do web tự
    // sinh lấy các giá trị này từ điểm thay thế / phiếu SYC, sửa tay ở đây sẽ làm dữ
    // liệu lệch khỏi nguồn gốc của nó.
    const current = await prisma.materialReplacementLog.findUnique({
      where: { id: params.id },
      select: { importSource: true, pctNumber: true },
    });
    if (!current) return fail("Không tìm thấy ghi nhận thay thế", 404);
    const archiveFields: Prisma.MaterialReplacementLogUpdateInput = {};
    if (current.importSource) {
      const text = (v: unknown) => {
        const t = String(v ?? "").trim();
        return t ? t : null;
      };
      if (body.machine !== undefined) {
        const m = text(body.machine);
        if (m && !["S1", "S2", "COMMON"].includes(m)) return fail("Tổ máy không hợp lệ");
        archiveFields.machine = m;
      }
      if (body.managingPosition !== undefined) {
        const raw = text(body.managingPosition);
        // Quy về nhãn chuẩn để rào cương vị (so theo MÃ chức danh) luôn nhận ra.
        const code = raw ? positionCodeOf(raw) : null;
        if (raw && !code) return fail(`Cương vị "${raw}" không thuộc danh mục chức danh`);
        archiveFields.managingPosition = code ? positionLabelOf(code) : null;
      }
      if (body.materialCategory !== undefined) {
        const c = text(body.materialCategory);
        if (c && !(MATERIAL_CATEGORIES as readonly string[]).includes(c)) return fail("Loại vật tư không hợp lệ");
        archiveFields.materialCategory = c;
      }
      if (body.materialNameLabel !== undefined) archiveFields.materialNameLabel = text(body.materialNameLabel);
      const effectivePctNumber =
        body.pctNumber !== undefined
          ? normalizePctNumber(String(body.pctNumber ?? ""))
          : normalizePctNumber(current.pctNumber);
      if (body.pctNumber !== undefined) archiveFields.pctNumber = effectivePctNumber || null;
      if (body.sourceNote !== undefined) {
        archiveFields.sourceNote =
          normalizeReplacementSourceNote(String(body.sourceNote ?? ""), effectivePctNumber) || null;
      }
      if (body.unitLabel !== undefined) archiveFields.unitLabel = text(body.unitLabel);
      if (body.materialId !== undefined) {
        const id = text(body.materialId);
        if (id && !(await prisma.material.findUnique({ where: { id }, select: { id: true } })))
          return fail("Vật tư được chọn không tồn tại", 404);
        archiveFields.material = id ? { connect: { id } } : { disconnect: true };
      }
      if (body.deviceSeq !== undefined) {
        const seq = text(body.deviceSeq);
        if (seq) {
          const node = await prisma.equipmentNode.findUnique({ where: { seq }, select: { seq: true, name: true } });
          if (!node) return fail("Thiết bị được chọn không tồn tại trên cây", 404);
          // Cùng rào phạm vi với mọi thao tác thiết bị khác.
          await assertSeqEditable(user, seq);
          archiveFields.deviceSeq = seq;
          archiveFields.deviceLabel = node.name;
        } else {
          archiveFields.deviceSeq = null;
          archiveFields.deviceLabel = null;
        }
      }
    }

    const log = await prisma.materialReplacementLog.update({
      where: { id: params.id },
      data: {
        replacedAt,
        quantity,
        note: body.note?.trim() || null,
        ...archiveFields,
      },
    });
    await audit(user.id, "UPDATE_REPLACEMENT_LOG", "MaterialReplacementLog", log.id, auditDetailWithPosition(user));
    return ok(log);
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await assertCanEditLog(user, params.id, ["manage", "full"]);

    await prisma.materialReplacementLog.delete({ where: { id: params.id } });
    await audit(user.id, "DELETE_REPLACEMENT_LOG", "MaterialReplacementLog", params.id, auditDetailWithPosition(user));
    return ok({ id: params.id });
  });
}
