import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { dateRange } from "@/lib/utils";
import { HC_REGISTRATION_CONTENTS } from "@/lib/hc-period";

export const dynamic = "force-dynamic";

const REGISTRATION_ACTIONS = [
  "HC_REGISTER",
  "HC_REGISTER_RESUBMIT",
  "HC_NOTE_UPDATE",
  "HC_REGISTER_CANCEL",
  "HC_REGISTER_APPROVE",
  "HC_REGISTER_REJECT",
];

/** Nhật ký thao tác hành chính phát sinh trong một ngày, kể cả dữ liệu đã bị xoá. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(
      user,
      "hc-attendance-approve",
      ["approve", "manage", "full"],
      "Không đủ quyền xem nhật ký đăng ký đi hành chính"
    );
    const date = req.nextUrl.searchParams.get("date");
    const { start, end } = dateRange(date);

    const registrationGroups = await prisma.hcGroup.findMany({
      where: {
        date: { gte: start, lte: end },
        content: { in: HC_REGISTRATION_CONTENTS },
      },
      select: {
        id: true,
        members: { where: { isRegistered: true }, select: { id: true } },
      },
    });
    const registrationEntityIds = registrationGroups.flatMap((group) => [
      group.id,
      ...group.members.map((member) => member.id),
    ]);

    if (!registrationEntityIds.length) return ok([]);

    const candidateLogs = await prisma.auditLog.findMany({
      where: {
        action: { in: [...REGISTRATION_ACTIONS, "HC_APPROVE"] },
        entityId: { in: registrationEntityIds },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { id: true, name: true } } },
    });

    // Các log cũ chỉ ghi số lượng khi duyệt. Nếu nhóm vẫn còn, bổ sung tên
    // nhân sự hiện đang được duyệt để người quản lý có thể tra cứu ngay.
    const legacyApprovalGroupIds = Array.from(new Set(
      candidateLogs
        .filter((log) => log.action === "HC_APPROVE" && !log.detail?.includes(" cho ") && log.entityId)
        .map((log) => log.entityId as string)
    ));
    const legacyGroups = legacyApprovalGroupIds.length
      ? await prisma.hcGroup.findMany({
          where: { id: { in: legacyApprovalGroupIds } },
          select: {
            id: true,
            members: {
              where: { isApproved: true, isRegistered: true },
              select: { user: { select: { name: true } } },
            },
          },
        })
      : [];
    const approvedNamesByGroup = new Map(
      legacyGroups.map((group) => [group.id, group.members.map((member) => member.user.name)])
    );

    return ok(candidateLogs.flatMap((log) => {
      const approvedNames = log.entityId ? approvedNamesByGroup.get(log.entityId) : undefined;
      if (log.action === "HC_APPROVE") {
        return approvedNames?.length
          ? [{ ...log, action: "HC_REGISTER_APPROVE", detail: `Duyệt đăng ký đi hành chính cho ${approvedNames.join(", ")}` }]
          : [];
      }
      return [log];
    }));
  });
}
