import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { assertSeqEditable, equipmentSeqWhere, resolveEquipmentAccessForUser } from "@/lib/server-access";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import type { Prisma } from "@prisma/client";
import { EQUIPMENT_DEVICE_SELECT, withDeviceAlias } from "@/lib/equipment-device";
import { invalidateDeviceListCache } from "@/lib/device-list-cache";
import { maybeUploadDataUrlList } from "@/lib/s3";

// Tầng 4: bảng lịch sử phình theo năm tháng — GET luôn có trần, không findMany không giới hạn.
const HISTORY_TAKE = 300;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const deviceId = sp.get("deviceId");
    const status = sp.get("status");
    const priority = sp.get("priority");
    const technicianId = sp.get("technicianId");
    const from = sp.get("from");
    const to = sp.get("to");

    const where: Prisma.RepairLogWhereInput = {};
    const access = await resolveEquipmentAccessForUser(user);
    if (deviceId) {
      where.deviceSeq = access.canViewSeq(deviceId) ? deviceId : "__NO_ACCESS__";
    } else {
      // Lọc quyền bằng prefix nhánh (index text_pattern_ops) — không gửi IN-list nghìn seq.
      const scopeWhere = equipmentSeqWhere(access.branchFilter, "deviceSeq") as Prisma.RepairLogWhereInput | null;
      if (scopeWhere) where.AND = [scopeWhere];
    }
    if (status && status !== "ALL") where.status = status as any;
    if (priority && priority !== "ALL") where.priority = priority as any;
    if (technicianId && technicianId !== "ALL") where.createdById = technicianId;
    if (from || to) {
      where.startedAt = {};
      if (from) where.startedAt.gte = new Date(from);
      if (to) where.startedAt.lte = new Date(to + "T23:59:59");
    }

    const logs = await prisma.repairLog.findMany({
      where,
      orderBy: { startedAt: "desc" },
      include: {
        device: { select: EQUIPMENT_DEVICE_SELECT },
        createdBy: { select: { id: true, name: true, position: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      take: HISTORY_TAKE,
    });
    return ok(logs.map(withDeviceAlias), { total: logs.length, capped: logs.length === HISTORY_TAKE });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "repair-create", ["create", "manage", "full"], "Không đủ quyền tạo phiếu sửa chữa");
    const body = await req.json();
    if (!body.deviceId || !body.title || !body.action) {
      return fail("Thiếu thông tin bắt buộc (thiết bị, tiêu đề, hành động)");
    }
    await assertSeqEditable(user, String(body.deviceId));
    const log = await prisma.repairLog.create({
      data: {
        deviceSeq: body.deviceId,
        title: body.title,
        description: body.description || "",
        symptom: body.symptom || null,
        cause: body.cause || null,
        action: body.action,
        result: body.result || null,
        startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
        completedAt: body.completedAt ? new Date(body.completedAt) : null,
        status: body.status || "OPEN",
        priority: body.priority || "MEDIUM",
        cost: body.cost != null ? Number(body.cost) : null,
        downtime: body.downtime != null ? Number(body.downtime) : null,
        createdById: user.id,
        // Tầng 3: base64 → MinIO, DB chỉ giữ URL ngắn.
        attachments: await maybeUploadDataUrlList(body.attachments, "repair-logs/attachments", "image"),
      },
    });
    await audit(user.id, "CREATE_REPAIR", "RepairLog", log.id, log.title);
    invalidateDeviceListCache();
    return ok(log);
  });
}
