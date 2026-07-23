import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requestAuditMeta } from "@/lib/activity-log";
import { s3ProxyUrl, userWithSignedMedia } from "@/lib/s3";
import { avatarUpdate, signatureUpdate } from "@/lib/user-avatar-storage";
import { DEFAULT_PASSWORD, passwordPolicyMessage } from "@/lib/password-policy";
import { effectiveUserPosition, isValidCurrentPosition } from "@/lib/current-position";
import { getOrSetUserSummaryCache, invalidateUserSummaryCache } from "@/lib/user-summary-cache";
import { hasPermissionLevel, requirePermissionLevel } from "@/lib/rbac-guard";
import { requireUserAdminReadAccess } from "@/lib/user-admin-access";

export const dynamic = "force-dynamic";
const PERMANENT_DELETE_CONFIRMATION = "xác nhận xóa";

// Bản "summary": đủ trường cho danh sách/dropdown/sidebar nhưng KHÔNG kèm chữ ký
// (signatureUrl là base64 lớn, không danh sách nào hiển thị). Giữ nguyên hình dạng
// SafeUser để mọi nơi tiêu thụ không phải đổi kiểu.
const SUMMARY_SELECT = {
  id: true,
  name: true,
  employeeId: true,
  email: true,
  workEmail: true,
  username: true,
  phone: true,
  avatarUrl: true,
  avatarKey: true,
  role: true,
  position: true,
  secondaryPosition: true,
  secondaryPosition2: true,
  currentPosition: true,
  department: true,
  isActive: true,
  lockedAt: true,
  failedLoginAttempts: true,
  mustChangePassword: true,
  passwordChangedAt: true,
  createdAt: true,
} as const;

// DDL chỉ chạy 1 lần mỗi process — ALTER TABLE (kể cả IF NOT EXISTS no-op) chiếm khóa
// ACCESS EXCLUSIVE trên "User", chạy mỗi request sẽ tuần tự hóa mọi truy vấn user.
let userColumnsReady = false;
async function ensureUserSecondaryPositionColumn() {
  if (userColumnsReady) return;
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "secondaryPosition" TEXT,
    ADD COLUMN IF NOT EXISTS "secondaryPosition2" TEXT,
    ADD COLUMN IF NOT EXISTS "currentPosition" TEXT,
    ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3)
  `);
  userColumnsReady = true;
}

async function safe<T extends { passwordHash?: string; avatarUrl?: string | null; signatureUrl?: string | null; avatarKey?: string | null; signatureKey?: string | null }>(u: T) {
  const { passwordHash, ...rest } = u;
  return userWithSignedMedia(rest);
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await ensureUserSecondaryPositionColumn();
    // ?summary=1 → trả bản nhẹ (bỏ chữ ký base64; avatar qua proxy S3 nếu đã migrate).
    // Dùng cho sidebar (mọi trang), dropdown chọn người, danh sách chức vụ...
    // Quản trị người dùng dùng /api/admin/users để phân trang từ server.
    if (req.nextUrl.searchParams.get("summary") === "1") {
      const data = await getOrSetUserSummaryCache(async () => {
        const users = await prisma.user.findMany({ orderBy: { employeeId: "asc" }, select: SUMMARY_SELECT });
        return users.map((u) => ({
          ...u,
          avatarUrl: u.avatarKey ? s3ProxyUrl(u.avatarKey) : u.avatarUrl && !u.avatarUrl.startsWith("data:") ? u.avatarUrl : null,
          signatureUrl: null as string | null,
          signatureKey: null as string | null,
        }));
      });
      return ok(data);
    }
    await requireUserAdminReadAccess(user);
    const users = await prisma.user.findMany({ orderBy: { employeeId: "asc" } });
    return ok(await Promise.all(users.map(safe)));
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "user-manage", ["manage", "full"], "Không đủ quyền tạo người dùng");
    await ensureUserSecondaryPositionColumn();
    const body = await req.json();
    const username = String(body.username ?? "").trim() || null;
    const email = String(body.email ?? "").trim().toLowerCase();
    const workEmail = String(body.workEmail ?? "").trim().toLowerCase() || null;
    if (!body.name || !email || !body.employeeId || !username) return fail("Thiếu thông tin bắt buộc");
    const exists = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { employeeId: body.employeeId },
          ...(username ? [{ username }] : []),
        ],
      },
    });
    if (exists) return fail("Email, user hoặc mã nhân viên đã tồn tại");
    const password = String(body.password || DEFAULT_PASSWORD);
    const avatarData = await avatarUpdate(body.avatarUrl, body.employeeId);
    const signatureData = await signatureUpdate(body.signatureUrl, body.employeeId);
    const initialPositions = {
      position: body.position || null,
      secondaryPosition: body.secondaryPosition || null,
      secondaryPosition2: body.secondaryPosition2 || null,
      currentPosition: body.currentPosition || body.position || null,
    };
    const initialCurrentPosition = isValidCurrentPosition(initialPositions, initialPositions.currentPosition)
      ? initialPositions.currentPosition
      : effectiveUserPosition({ ...initialPositions, currentPosition: null });
    const created = await prisma.user.create({
      data: {
        name: body.name,
        email,
        workEmail,
        username,
        employeeId: body.employeeId,
        phone: body.phone || null,
        role: body.role || "VIEWER",
        position: body.position || null,
        secondaryPosition: body.secondaryPosition || null,
        secondaryPosition2: body.secondaryPosition2 || null,
        currentPosition: initialCurrentPosition,
        department: body.department || null,
        avatarUrl: null,
        signatureUrl: null,
        avatarKey: body.avatarKey || null,
        signatureKey: body.signatureKey || null,
        ...avatarData,
        ...signatureData,
        passwordHash: await bcrypt.hash(password, 10),
        mustChangePassword: password === DEFAULT_PASSWORD,
        passwordChangedAt: new Date(),
      },
    });
    await audit(user.id, "CREATE_USER", "User", created.id, created.name, {
      actorName: user.name,
      afterData: await safe(created),
      changedFields: ["created"],
      ...requestAuditMeta(req),
    });
    invalidateUserSummaryCache();
    return ok(await safe(created));
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await ensureUserSecondaryPositionColumn();
    const body = await req.json();
    if (!body.id) return fail("Thiếu id");
    if (body.resetPassword) {
      const before = await prisma.user.findUnique({ where: { id: body.id } });
      if (!before) return fail("Không tìm thấy người dùng", 404);
      const newPassword = String(body.newPassword ?? "");
      if (!newPassword) return fail("Vui lòng nhập mật khẩu tạm thời");
      const policyError = passwordPolicyMessage(newPassword);
      if (policyError) return fail(policyError);
      const canManageUsers = await hasPermissionLevel(user, "user-manage", ["manage", "full"]);
      if (!canManageUsers) {
        await requirePermissionLevel(user, "user-reset-viewer-password", ["approve", "manage", "full"], "Không đủ quyền reset mật khẩu Người xem");
        if (before.role !== "VIEWER") return fail("Chỉ được reset mật khẩu tài khoản Người xem", 403);
      }
      const updated = await prisma.user.update({
        where: { id: body.id },
        data: {
          passwordHash: await bcrypt.hash(newPassword, 10),
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedAt: null,
        },
      });
      await audit(user.id, "RESET_PASSWORD", "User", updated.id, updated.name, {
        actorName: user.name,
        beforeData: before ? await safe(before) : null,
        afterData: await safe(updated),
        changedFields: ["passwordHash", "mustChangePassword", "passwordChangedAt", "failedLoginAttempts", "lockedAt"],
        ...requestAuditMeta(req),
      });
      return ok(await safe(updated));
    }
    await requirePermissionLevel(user, "user-manage", ["manage", "full"], "Không đủ quyền cập nhật người dùng");
    const before = await prisma.user.findUnique({ where: { id: body.id } });
    const data: any = {};
    if (body.role) data.role = body.role;
    if (body.isActive != null) data.isActive = body.isActive;
    if (body.name) data.name = body.name;
    if (body.position !== undefined) data.position = body.position;
    if (body.secondaryPosition !== undefined) data.secondaryPosition = body.secondaryPosition || null;
    if (body.secondaryPosition2 !== undefined) data.secondaryPosition2 = body.secondaryPosition2 || null;
    if (body.currentPosition !== undefined) data.currentPosition = body.currentPosition || null;
    if (body.department !== undefined) data.department = body.department;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.email) data.email = String(body.email).trim().toLowerCase();
    if (body.workEmail !== undefined) data.workEmail = String(body.workEmail || "").trim().toLowerCase() || null;
    if (body.username !== undefined) data.username = String(body.username || "").trim() || null;
    if (body.employeeId) data.employeeId = body.employeeId;

    if (data.email) {
      const ex = await prisma.user.findFirst({ where: { email: data.email, NOT: { id: body.id } } });
      if (ex) return fail("Email đã tồn tại");
    }
    if (data.employeeId) {
      const ex = await prisma.user.findFirst({ where: { employeeId: data.employeeId, NOT: { id: body.id } } });
      if (ex) return fail("Mã nhân viên đã tồn tại");
    }
    if (data.username) {
      const ex = await prisma.user.findFirst({ where: { username: data.username as string, NOT: { id: body.id } } });
      if (ex) return fail("User đã tồn tại");
    }
    const nextPositions = {
      position: (data.position as string | null | undefined) ?? before?.position ?? null,
      secondaryPosition: (data.secondaryPosition as string | null | undefined) ?? before?.secondaryPosition ?? null,
      secondaryPosition2: (data.secondaryPosition2 as string | null | undefined) ?? before?.secondaryPosition2 ?? null,
      currentPosition: (data.currentPosition as string | null | undefined) ?? before?.currentPosition ?? null,
    };
    if (!isValidCurrentPosition(nextPositions, nextPositions.currentPosition)) {
      data.currentPosition = effectiveUserPosition({ ...nextPositions, currentPosition: null });
    }

    const employeeId = String(data.employeeId ?? before?.employeeId ?? "").trim();
    Object.assign(data, await avatarUpdate(body.avatarUrl, employeeId));
    if (body.avatarKey !== undefined && body.avatarUrl === undefined) data.avatarKey = body.avatarKey || null;
    Object.assign(data, await signatureUpdate(body.signatureUrl, employeeId));
    if (body.signatureKey !== undefined && body.signatureUrl === undefined) data.signatureKey = body.signatureKey || null;

    const updated = await prisma.user.update({ where: { id: body.id }, data });
    const beforeSafe = before ? await safe(before) : null;
    const afterSafe = await safe(updated);
    const changedFields = Object.keys(data);
    const action = changedFields.length === 1 && changedFields[0] === "isActive"
      ? updated.isActive ? "ACTIVATE_USER" : "DEACTIVATE_USER"
      : "UPDATE_USER";
    await audit(user.id, action, "User", updated.id, updated.name, {
      actorName: user.name,
      beforeData: beforeSafe,
      afterData: afterSafe,
      changedFields,
      ...requestAuditMeta(req),
    });
    invalidateUserSummaryCache();
    return ok(await safe(updated));
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "user-manage", ["full"], "Không đủ quyền xoá người dùng");
    const id = req.nextUrl.searchParams.get("id");
    const permanent = req.nextUrl.searchParams.get("permanent") === "true";
    if (!id) return fail("Thiếu id");
    if (id === user.id) return fail("Không thể xoá chính tài khoản đang đăng nhập");
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return fail("Không tìm thấy người dùng", 404);
    if (permanent) {
      const body = await req.json().catch(() => ({}));
      const confirmation = String(body.confirmation ?? "").trim().toLocaleLowerCase("vi");
      if (confirmation !== PERMANENT_DELETE_CONFIRMATION) return fail('Nhập đúng "xác nhận xóa" để xoá vĩnh viễn người dùng');

      await prisma.$transaction(async (tx) => {
        await tx.digitalDocument.updateMany({ where: { createdById: id }, data: { createdById: null } });
        await tx.digitalDocument.updateMany({ where: { updatedById: id }, data: { updatedById: null } });
        await tx.rbacConfig.updateMany({ where: { updatedById: id }, data: { updatedById: null } });
        await tx.systemBroadcast.updateMany({ where: { createdById: id }, data: { createdById: null, createdByName: null } });
        await tx.rotationTemplate.updateMany({ where: { createdById: id }, data: { createdById: null } });
        await tx.rotationTemplate.updateMany({ where: { updatedById: id }, data: { updatedById: null } });
        await tx.positionRotationAssignment.updateMany({ where: { createdById: id }, data: { createdById: user.id } });
        await tx.positionRotationAssignment.updateMany({ where: { updatedById: id }, data: { updatedById: user.id } });
        await tx.shiftPositionConfig.updateMany({ where: { createdById: id }, data: { createdById: user.id } });
        await tx.shiftPositionConfig.updateMany({ where: { updatedById: id }, data: { updatedById: user.id } });
        await tx.shiftStaffingAssignment.deleteMany({ where: { userId: id } });
        await tx.shiftStaffingAssignment.updateMany({ where: { createdById: id }, data: { createdById: user.id } });
        await tx.shiftStaffingAssignment.updateMany({ where: { updatedById: id }, data: { updatedById: user.id } });
        await tx.crewRotationConfig.updateMany({ where: { createdById: id }, data: { createdById: user.id } });
        await tx.crewRotationConfig.updateMany({ where: { updatedById: id }, data: { updatedById: user.id } });
        await tx.staffingChangeEvent.updateMany({ where: { createdById: id }, data: { createdById: user.id } });
        await tx.shiftScheduleVersion.updateMany({ where: { createdById: id }, data: { createdById: user.id } });
        await tx.shiftScheduleVersion.updateMany({ where: { approvedById: id }, data: { approvedById: null } });

        await tx.announcementRead.deleteMany({ where: { userId: id } });
        await tx.announcement.deleteMany({ where: { createdById: id } });
        await tx.operationEvent.deleteMany({ where: { createdById: id } });
        await tx.shiftAssignment.deleteMany({ where: { userId: id } });
        await tx.checkIn.updateMany({ where: { approvedBy: id }, data: { approvedBy: null } });
        await tx.checkIn.deleteMany({ where: { userId: id } });
        await tx.shiftHandover.deleteMany({ where: { OR: [{ fromUserId: id }, { toUserId: id }] } });
        await tx.repairLog.updateMany({ where: { approvedById: id }, data: { approvedById: null } });
        await tx.repairLog.deleteMany({ where: { createdById: id } });
        await tx.materialReplacementLog.deleteMany({ where: { doneById: id } });
        await tx.materialReplacement.deleteMany({ where: { createdById: id } });
        await tx.defect.deleteMany({ where: { createdById: id } });
        await tx.defectHistory.deleteMany({ where: { createdById: id } });
        await tx.auditLog.deleteMany({ where: { userId: id } });
        await tx.hcCheckIn.deleteMany({ where: { userId: id } });
        await tx.hcGroup.deleteMany({ where: { createdById: id } });
        await tx.forumReply.deleteMany({ where: { authorId: id } });
        await tx.forumPost.deleteMany({ where: { authorId: id } });
        await tx.webAuthnCredential.deleteMany({ where: { userId: id } });
        await tx.user.delete({ where: { id } });
      });

      await audit(user.id, "PERMANENT_DELETE_USER", "User", id, target.name, {
        actorName: user.name,
        beforeData: await safe(target),
        afterData: null,
        changedFields: ["deleted"],
        ...requestAuditMeta(req),
      });
      invalidateUserSummaryCache();
      return ok({ id, permanent: true });
    }

    try {
      await prisma.user.delete({ where: { id } });
    } catch (e: any) {
      // Foreign-key constraint (has check-ins / repairs / etc.) → deactivate instead.
      if (e?.code === "P2003") {
        const updated = await prisma.user.update({ where: { id }, data: { isActive: false } });
        await audit(user.id, "DEACTIVATE_USER", "User", id, target.name, {
          actorName: user.name,
          beforeData: await safe(target),
          afterData: await safe(updated),
          changedFields: ["isActive"],
          ...requestAuditMeta(req),
        });
        invalidateUserSummaryCache();
        return ok({ id, deactivated: true, message: "Người dùng có dữ liệu liên quan nên đã chuyển sang trạng thái ngừng hoạt động." });
      }
      throw e;
    }
    await audit(user.id, "DELETE_USER", "User", id, target.name, {
      actorName: user.name,
      beforeData: await safe(target),
      afterData: null,
      changedFields: ["deleted"],
      ...requestAuditMeta(req),
    });
    invalidateUserSummaryCache();
    return ok({ id });
  });
}
