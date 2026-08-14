import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const RETENTION_DAYS = 30;
const VALID_STATUSES = new Set(["SUCCESS", "PARTIAL", "FAILED", "SAVED", "UNKNOWN"]);

async function purgeExpired() {
  await prisma.shnPpaRecord.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}

export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await purgeExpired();
    const id = request.nextUrl.searchParams.get("id");
    if (id) {
      const record = await prisma.shnPpaRecord.findUnique({
        where: { id },
        include: { createdBy: { select: { name: true, position: true } } },
      });
      if (!record) return fail("Không tìm thấy kết quả hoặc kết quả đã hết hạn", 404);
      return ok({ ...record, canDelete: record.createdById === user.id || user.systemRole === "ADMIN" });
    }
    const records = await prisma.shnPpaRecord.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, createdById: true, fileNames: true, month: true, year: true, dayFrom: true, dayTo: true,
        syncStatus: true, syncMessage: true, resultCount: true, createdAt: true, expiresAt: true,
        createdBy: { select: { name: true, position: true } },
      },
    });
    return ok(records.map((record) => {
      const { createdById, ...visible } = record;
      return { ...visible, canDelete: createdById === user.id || user.systemRole === "ADMIN" };
    }), { retentionDays: RETENTION_DAYS });
  });
}

export async function DELETE(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return fail("Thiếu mã kết quả cần xóa");
    const record = await prisma.shnPpaRecord.findUnique({
      where: { id },
      select: { id: true, createdById: true },
    });
    if (!record) return fail("Không tìm thấy kết quả hoặc kết quả đã hết hạn", 404);
    if (record.createdById !== user.id && user.systemRole !== "ADMIN") {
      return fail("Bạn không có quyền xóa kết quả này", 403);
    }
    await prisma.shnPpaRecord.delete({ where: { id } });
    await audit(user.id, "DELETE_SHN_PPA_RESULT", "ShnPpaRecord", id, "Xóa kết quả SHN/PPA đã lưu", { actorName: user.name });
    return ok({ id });
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || !body.snapshot || typeof body.snapshot !== "object") {
      return fail("Kết quả lưu trữ không hợp lệ");
    }
    const fileNames = Array.isArray(body.fileNames)
      ? body.fileNames.filter((name): name is string => typeof name === "string").slice(0, 10).map((name) => name.slice(0, 255))
      : [];
    const syncStatus = typeof body.syncStatus === "string" && VALID_STATUSES.has(body.syncStatus)
      ? body.syncStatus : "UNKNOWN";
    const snapshotText = JSON.stringify(body.snapshot);
    if (snapshotText.length > 2_500_000) return fail("Kết quả quá lớn để lưu trữ");
    const numberOrNull = (value: unknown) => Number.isInteger(value) ? Number(value) : null;
    const expiresAt = new Date(Date.now() + RETENTION_DAYS * 86400000);
    await purgeExpired();
    const record = await prisma.shnPpaRecord.create({
      data: {
        createdById: user.id,
        fileNames,
        month: numberOrNull(body.month), year: numberOrNull(body.year),
        dayFrom: numberOrNull(body.dayFrom), dayTo: numberOrNull(body.dayTo),
        syncStatus,
        syncMessage: typeof body.syncMessage === "string" ? body.syncMessage.slice(0, 2000) : null,
        resultCount: Math.max(0, numberOrNull(body.resultCount) ?? 0),
        snapshot: body.snapshot as Prisma.InputJsonValue,
        expiresAt,
      },
      select: { id: true, createdAt: true, expiresAt: true },
    });
    await audit(user.id, "SAVE_SHN_PPA_RESULT", "ShnPpaRecord", record.id,
      `Lưu kết quả SHN/PPA (${syncStatus}), tự xoá sau ${RETENTION_DAYS} ngày`, { actorName: user.name });
    return ok(record);
  });
}
