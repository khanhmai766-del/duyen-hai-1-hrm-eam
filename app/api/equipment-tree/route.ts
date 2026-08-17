import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { assertSeqEditable, filterEquipmentNodesForUser } from "@/lib/server-access";
import { getCachedEquipmentNodeList, invalidateEquipmentNodeCache } from "@/lib/equipment-node-cache";
import { maybeUploadDataUrl } from "@/lib/s3";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";
import { requireDeviceManage, requireDeviceView } from "@/lib/device-permissions";
import { canBypassEquipmentPositionScope } from "@/lib/material-equipment-access";
import { getProfileOverrides } from "@/lib/equipment-profile-cache";
import { parseScopeParam, seqInScope } from "@/lib/equipment-units";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

// Toàn bộ cây danh mục thiết bị (phẳng) — client tự dựng cây từ seq/parentSeq.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireDeviceView(user);
    const adminTree = req.nextUrl.searchParams.get("adminTree") === "1";
    if (adminTree) {
      await requirePermissionLevel(user, "rbac-manage", ["full"], "Không đủ quyền đọc toàn bộ cây để phân quyền");
    }
    const scope = parseScopeParam(req.nextUrl.searchParams.get("scope"));
    const canAccessAllNodes = adminTree || await canBypassEquipmentPositionScope(
      user,
      req.nextUrl.searchParams.get("permissionScope")
    );
    const normalizedNodes = await getCachedEquipmentNodeList();
    const visibleNodes = canAccessAllNodes
      ? normalizedNodes
      : await filterEquipmentNodesForUser(user, normalizedNodes);
    const scopedNodes = scope ? visibleNodes.filter((node) => seqInScope(node.seq, scope)) : visibleNodes;
    const overrideOf = scope ? await getProfileOverrides(scope) : () => undefined;

    // ?foldersOnly=1 — màn Phân quyền hệ thống chỉ gán quyền ở node THƯ MỤC, thiết bị lá chỉ
    // được ĐẾM. Trả riêng thư mục kèm `leafCount` cắt payload S1 từ 16.312 node / 2.789 KB
    // xuống 1.614 node / 244 KB (đo 17/08/2026), giữ nguyên con số tổng kết trên giao diện.
    if (req.nextUrl.searchParams.get("foldersOnly") === "1") {
      const leafCountOf = new Map<string, number>();
      const isFolder = new Set(scopedNodes.map((node) => node.parentSeq).filter(Boolean) as string[]);
      for (const node of scopedNodes) {
        if (isFolder.has(node.seq) || !node.parentSeq) continue;
        leafCountOf.set(node.parentSeq, (leafCountOf.get(node.parentSeq) ?? 0) + 1);
      }
      return ok(scopedNodes
        .filter((node) => isFolder.has(node.seq))
        .map((node) => ({
          seq: node.seq,
          parentSeq: node.parentSeq,
          name: overrideOf(node.seq)?.name ?? node.name,
          drawing: node.drawing,
          depth: node.depth,
          deviceId: node.deviceId ?? null,
          leafCount: leafCountOf.get(node.seq) ?? 0,
        })));
    }

    return ok(scopedNodes.map((node) => ({
      seq: node.seq,
      parentSeq: node.parentSeq,
      name: overrideOf(node.seq)?.name ?? node.name,
      drawing: node.drawing,
      depth: node.depth,
      deviceId: node.deviceId ?? null,
    })));
  });
}

// Cập nhật thông tin/tài liệu/ảnh người dùng bổ sung cho một node (theo seq).
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireDeviceManage(user, "Bạn không có quyền cập nhật cây thiết bị");
    const body = await req.json();
    const seq = String(body.seq ?? "").trim();
    if (!seq) return fail("Thiếu số thứ tự");
    await assertSeqEditable(user, seq);
    const data: Record<string, unknown> = {};
    if (body.attachedInfo !== undefined) data.attachedInfo = body.attachedInfo || null;
    if (body.documentUrl !== undefined) {
      // Tầng 3: dán data URL cũng được đẩy lên MinIO; DB chỉ giữ URL ngắn.
      data.documentUrl = await maybeUploadDataUrl({ value: body.documentUrl || null, folder: "equipment/documents", preset: "document-image" });
    }
    if (body.imageUrl !== undefined) {
      data.imageUrl = await maybeUploadDataUrl({ value: body.imageUrl || null, folder: "equipment/images", preset: "image" });
    }
    const node = await prisma.equipmentNode.update({ where: { seq }, data });
    await audit(user.id, "UPDATE_EQUIPMENT_NODE", "EquipmentNode", node.id, node.name);
    invalidateEquipmentNodeCache();
    invalidateDeviceListCache();
    return ok({ seq: node.seq });
  });
}
