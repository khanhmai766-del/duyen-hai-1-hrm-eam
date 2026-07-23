import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, ok, requireUser } from "@/lib/api";
import { userWithSignedMedia } from "@/lib/s3";
import { requireUserAdminReadAccess } from "@/lib/user-admin-access";

export const dynamic = "force-dynamic";

const ADMIN_USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  workEmail: true,
  username: true,
  employeeId: true,
  phone: true,
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
  avatarUrl: true,
  avatarKey: true,
  signatureUrl: true,
  signatureKey: true,
  createdAt: true,
} as const;

function numberParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

async function safeUser<T extends { passwordHash?: string; avatarUrl?: string | null; signatureUrl?: string | null; avatarKey?: string | null; signatureKey?: string | null }>(user: T) {
  const { passwordHash, ...safe } = user;
  return userWithSignedMedia(safe);
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requireUserAdminReadAccess(user);

    const page = numberParam(req.nextUrl.searchParams.get("page"), 1, 1, 100_000);
    const pageSize = numberParam(req.nextUrl.searchParams.get("pageSize"), 10, 5, 50);
    const q = String(req.nextUrl.searchParams.get("q") ?? "").trim();
    const position = String(req.nextUrl.searchParams.get("position") ?? "").trim();
    const where: Prisma.UserWhereInput = {};

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { employeeId: { contains: q, mode: "insensitive" } },
        { username: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { workEmail: { contains: q, mode: "insensitive" } },
      ];
    }
    if (position && position !== "ALL") {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { OR: [{ position }, { secondaryPosition: position }, { secondaryPosition2: position }] },
      ];
    }

    const [total, rows] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: [{ employeeId: "asc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: ADMIN_USER_LIST_SELECT,
      }),
    ]);

    return ok({
      rows: await Promise.all(rows.map(safeUser)),
      total,
      page,
      pageSize,
    });
  });
}
