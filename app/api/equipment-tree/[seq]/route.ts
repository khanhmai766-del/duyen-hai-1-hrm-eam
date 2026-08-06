import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { assertSeqEditable, assertSeqViewable } from "@/lib/server-access";
import { normalizeEquipmentNodeName } from "@/lib/equipment-tree";
import { getProfileOverrides, invalidateEquipmentProfileCache } from "@/lib/equipment-profile-cache";
import { parseScope, scopeCode, scopeKks } from "@/lib/equipment-units";
import { canBypassEquipmentPositionScope } from "@/lib/material-equipment-access";
import { requireDeviceView } from "@/lib/device-permissions";
import { requireDeviceManage } from "@/lib/device-permissions";
import { resolveEquipmentTreeRequestUser } from "@/lib/equipment-tree-request-access";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { seq: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requireDeviceView(user);
    const seq = decodeURIComponent(params.seq ?? "").trim();
    if (!seq) return fail("Thiếu số thứ tự thiết bị");
    // `seq` luôn là mã chuẩn S1; phạm vi chỉ đổi mã hiển thị/KKS và phần ghi đè.
    const scope = parseScope(req.nextUrl.searchParams.get("machine"));

    const canAccessAllNodes = await canBypassEquipmentPositionScope(
      user,
      req.nextUrl.searchParams.get("permissionScope")
    );
    const requestedTreeUser = await resolveEquipmentTreeRequestUser(
      user,
      req.nextUrl.searchParams.get("positionScope")
    );
    const treeUser = canAccessAllNodes
      ? { ...requestedTreeUser, role: "ADMIN" }
      : requestedTreeUser;
    if (!canAccessAllNodes) await assertSeqViewable(treeUser, seq);
    const [node, overrideOf] = await Promise.all([
      prisma.equipmentNode.findUnique({
        where: { seq },
        select: {
          seq: true,
          parentSeq: true,
          name: true,
          kks: true,
          drawing: true,
          depth: true,
          attachedInfo: true,
          documentUrl: true,
          imageUrl: true,
        },
      }),
      getProfileOverrides(scope),
    ]);
    if (!node) return fail("Không tìm thấy thiết bị", 404);
    const override = overrideOf(node.seq);

    return ok({
      ...node,
      machine: scope,
      fullCode: scopeCode(node.seq, scope),
      kks: override?.kks ?? scopeKks(node.kks, scope),
      name: override?.name ?? normalizeEquipmentNodeName(node.seq, node.name),
      baseName: normalizeEquipmentNodeName(node.seq, node.name),
      hasNameOverride: override?.name != null,
      deviceId: null,
    });
  });
}

/** Lưu tên riêng cho đúng hình chiếu S1 hoặc S2; cấu trúc cây vẫn dùng chung. */
export async function PUT(req: NextRequest, { params }: { params: { seq: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requireDeviceManage(user, "Bạn không có quyền cập nhật tên thiết bị");
    const seq = decodeURIComponent(params.seq ?? "").trim();
    if (!seq) return fail("Thiếu số thứ tự thiết bị");
    await assertSeqEditable(user, seq);

    const body = await req.json();
    const machine = String(body.machine ?? "").trim().toUpperCase();
    if (machine !== "S1" && machine !== "S2") {
      return fail("Tên riêng chỉ áp dụng cho thiết bị thuộc Tổ máy S1 hoặc S2");
    }
    const name = body.name == null ? null : String(body.name).trim();
    if (name !== null && !name) return fail("Tên thiết bị không được để trống");
    if (name && name.length > 200) return fail("Tên thiết bị không được vượt quá 200 ký tự");

    const node = await prisma.equipmentNode.findUnique({ where: { seq }, select: { id: true, name: true } });
    if (!node) return fail("Không tìm thấy thiết bị", 404);
    await prisma.equipmentProfile.upsert({
      where: { nodeSeq_machine: { nodeSeq: seq, machine } },
      create: { nodeSeq: seq, machine, name, createdById: user.id },
      update: { name },
    });

    invalidateEquipmentProfileCache();
    await audit(
      user.id,
      name ? "UPDATE_EQUIPMENT_PROFILE_NAME" : "RESET_EQUIPMENT_PROFILE_NAME",
      "EquipmentNode",
      node.id,
      name ? `${machine}: ${name}` : `${machine}: dùng tên mặc định`
    );
    return ok({ seq, machine, name, effectiveName: name ?? normalizeEquipmentNodeName(seq, node.name) });
  });
}
