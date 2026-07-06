import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { passwordPolicyMessage } from "../lib/password-policy";

const CONFIRM_ENV = "ADMIN_RESET_CONFIRM";
const CONFIRM_VALUE = "RESET_ADMIN";
const PASSWORD_ENV = "ADMIN_RESET_PASSWORD";

const prisma = new PrismaClient();

function usage() {
  console.log(`
Reset mật khẩu khẩn cấp cho tài khoản ADMIN.

Cách dùng:
  ${CONFIRM_ENV}=${CONFIRM_VALUE} npm run admin:reset -- <email|user|ma-nhan-vien> [mat-khau-moi]

Ghi chú:
  - Bắt buộc truyền mật khẩu tạm qua tham số [mat-khau-moi] hoặc biến môi trường ${PASSWORD_ENV}.
  - Mật khẩu tạm phải đáp ứng chính sách mật khẩu mạnh.
  - Tài khoản sẽ được mở khóa, kích hoạt lại và bắt buộc đổi mật khẩu sau khi đăng nhập.
  - Script chỉ reset tài khoản có role ADMIN.
`);
}

async function ensureLoginLockColumns() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3)
  `);
}

async function listAdmins() {
  const admins = await prisma.user.findMany({
    where: { role: Role.ADMIN },
    orderBy: [{ isActive: "desc" }, { email: "asc" }],
    select: {
      name: true,
      email: true,
      username: true,
      employeeId: true,
      isActive: true,
      failedLoginAttempts: true,
      lockedAt: true,
    },
  });

  if (admins.length === 0) {
    console.log("Không tìm thấy tài khoản ADMIN nào trong hệ thống.");
    return;
  }

  console.log("Danh sách tài khoản ADMIN:");
  for (const admin of admins) {
    const status = [
      admin.isActive ? "đang hoạt động" : "ngừng hoạt động",
      admin.lockedAt ? `bị khóa từ ${admin.lockedAt.toISOString()}` : "không bị khóa",
      `sai mật khẩu ${admin.failedLoginAttempts} lần`,
    ].join(", ");
    console.log(`- ${admin.name} | email: ${admin.email} | user: ${admin.username ?? "-"} | mã NV: ${admin.employeeId} | ${status}`);
  }
}

function safeUserSnapshot(user: {
  id: string;
  name: string;
  email: string;
  username: string | null;
  employeeId: string;
  role: Role;
  isActive: boolean;
  failedLoginAttempts: number;
  lockedAt: Date | null;
  mustChangePassword: boolean;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    employeeId: user.employeeId,
    role: user.role,
    isActive: user.isActive,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedAt: user.lockedAt,
    mustChangePassword: user.mustChangePassword,
  };
}

async function writeBreakGlassAudit(beforeData: unknown, afterData: unknown, targetId: string) {
  try {
    await prisma.systemAuditLog.create({
      data: {
        actorUserId: "break-glass-cli",
        actorName: "Break-glass CLI",
        action: "BREAK_GLASS_RESET_ADMIN_PASSWORD",
        targetType: "User",
        targetId,
        beforeData: beforeData as any,
        afterData: afterData as any,
        changedFields: ["passwordHash", "mustChangePassword", "passwordChangedAt", "failedLoginAttempts", "lockedAt", "isActive"],
        userAgent: "scripts/reset-admin-password.ts",
      },
    });
  } catch (error) {
    console.warn("Cảnh báo: không thể ghi SystemAuditLog cho thao tác break-glass.", error);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  await ensureLoginLockColumns();

  const login = args[0]?.trim();
  if (!login) {
    usage();
    await listAdmins();
    process.exitCode = 1;
    return;
  }

  if (process.env[CONFIRM_ENV] !== CONFIRM_VALUE) {
    console.error(`Thiếu xác nhận an toàn. Hãy chạy lại với ${CONFIRM_ENV}=${CONFIRM_VALUE}.`);
    process.exitCode = 1;
    return;
  }

  const password = args[1] ?? process.env[PASSWORD_ENV];
  if (!password) {
    console.error(`Thiếu mật khẩu tạm. Hãy truyền [mat-khau-moi] hoặc biến môi trường ${PASSWORD_ENV}.`);
    process.exitCode = 1;
    return;
  }

  const policyError = passwordPolicyMessage(password);
  if (policyError) {
    console.error(policyError);
    process.exitCode = 1;
    return;
  }

  const lowerLogin = login.toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: lowerLogin }, { username: login }, { employeeId: login }],
    },
  });

  if (!user) {
    console.error(`Không tìm thấy tài khoản với định danh "${login}".`);
    await listAdmins();
    process.exitCode = 1;
    return;
  }

  if (user.role !== Role.ADMIN) {
    console.error(`Tài khoản "${user.email}" không phải ADMIN nên không được reset bằng cơ chế khẩn cấp này.`);
    process.exitCode = 1;
    return;
  }

  const beforeData = safeUserSnapshot(user);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      mustChangePassword: true,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedAt: null,
      isActive: true,
    },
  });

  await writeBreakGlassAudit(beforeData, safeUserSnapshot(updated), updated.id);

  console.log(`Đã reset mật khẩu và mở khóa ADMIN: ${updated.name} (${updated.email}).`);
  console.log("Tài khoản đã được kích hoạt và sẽ phải đổi mật khẩu sau khi đăng nhập.");
  console.log("Mật khẩu tạm thời: giá trị đã truyền vào script.");
}

main()
  .catch((error) => {
    console.error("Reset mật khẩu ADMIN thất bại:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
