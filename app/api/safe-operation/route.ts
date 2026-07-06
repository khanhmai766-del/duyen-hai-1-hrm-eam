import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";

export const dynamic = "force-dynamic";

const SAFE_OPERATION_UNITS = ["S1", "S2"] as const;
type SafeOperationUnit = (typeof SAFE_OPERATION_UNITS)[number];
const SAFE_OPERATION_CATEGORIES = ["continuous", "standby", "maintenance", "incident"] as const;
type SafeOperationCategory = (typeof SAFE_OPERATION_CATEGORIES)[number];

function parseUnit(value: unknown): SafeOperationUnit | null {
  const unit = String(value ?? "").trim().toUpperCase();
  return SAFE_OPERATION_UNITS.includes(unit as SafeOperationUnit) ? (unit as SafeOperationUnit) : null;
}

function parseCategory(value: unknown): SafeOperationCategory | null {
  const category = String(value ?? "").trim();
  return SAFE_OPERATION_CATEGORIES.includes(category as SafeOperationCategory) ? (category as SafeOperationCategory) : null;
}

function parseLocalDateTime(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) ||
    date.getMinutes() !== Number(minute)
  ) {
    return null;
  }
  return date;
}

type SafeOperationEventRow = {
  id: string;
  unit: SafeOperationUnit;
  category: SafeOperationCategory;
  startedAt: Date;
  endedAt: Date | null;
  reason: string | null;
  isAdded: boolean;
  createdAt: Date;
};

async function listSafeOperationEvents() {
  return prisma.$queryRaw<SafeOperationEventRow[]>`
    SELECT
      "id",
      "unit",
      "category",
      "startedAt",
      "endedAt",
      "reason",
      "isAdded",
      "createdAt"
    FROM "SafeOperationEvent"
    ORDER BY "createdAt" ASC
  `;
}

export async function GET() {
  return handle(async () => {
    await requireUser();
    return ok(await listSafeOperationEvents());
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, "operation-events", ["manage", "full"], "Không đủ quyền cập nhật vận hành an toàn");
    
    const body = await req.json();
    const unit = parseUnit(body.unit);
    const action = String(body.action ?? "");
    
    if (!unit) return fail("Tổ máy không hợp lệ");

    switch (action) {
      case "ADD_ENTRY": {
        const { category, start, end } = body;
        const parsedCategory = parseCategory(category);
        const startedAt = parseLocalDateTime(start);
        const endedAt = end ? parseLocalDateTime(end) : null;
        const reason = String(body.reason ?? "").trim();
        if (!parsedCategory) return fail("Hạng mục không hợp lệ");
        if (!startedAt) return fail("Thời gian bắt đầu không hợp lệ");
        if (parsedCategory !== "continuous") {
          if (!endedAt) return fail("Thời gian kết thúc không hợp lệ");
          if (endedAt <= startedAt) return fail("Thời gian kết thúc phải sau thời gian bắt đầu");
        }
        if ((parsedCategory === "maintenance" || parsedCategory === "incident") && !reason) {
          return fail("Vui lòng nhập lý do");
        }
        
        if (parsedCategory === "continuous") {
          await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`
              DELETE FROM "SafeOperationEvent"
              WHERE "unit" = ${unit} AND "category" = ${parsedCategory}
            `;
            await tx.$executeRaw`
              INSERT INTO "SafeOperationEvent" ("id", "unit", "category", "startedAt", "endedAt", "reason", "isAdded", "createdAt")
              VALUES (${randomUUID()}, ${unit}, ${parsedCategory}, ${startedAt}, NULL, NULL, false, NOW())
            `;
          });
        } else {
          await prisma.$executeRaw`
            INSERT INTO "SafeOperationEvent" ("id", "unit", "category", "startedAt", "endedAt", "reason", "isAdded", "createdAt")
            VALUES (${randomUUID()}, ${unit}, ${parsedCategory}, ${startedAt}, ${endedAt}, ${reason || null}, false, NOW())
          `;
        }
        await audit(user.id, "UPDATE_SAFE_OPERATION", "SafeOperationEvent", unit, `Thêm mốc thời gian ${parsedCategory}`);
        break;
      }
      
      case "TOGGLE_ENTRY": {
        const { entryId, isAdded } = body;
        if (!entryId) return fail("Thiếu ID");

        const count = await prisma.$executeRaw`
          UPDATE "SafeOperationEvent"
          SET "isAdded" = ${Boolean(isAdded)}
          WHERE "id" = ${entryId} AND "unit" = ${unit}
        `;
        if (count === 0) return fail("Không tìm thấy mốc thời gian", 404);
        await audit(user.id, "UPDATE_SAFE_OPERATION", "SafeOperationEvent", entryId, `Cập nhật trạng thái cộng gộp ${isAdded}`);
        break;
      }

      case "REMOVE_ENTRY": {
        const { entryId } = body;
        if (!entryId) return fail("Thiếu ID");
        
        const count = await prisma.$executeRaw`
          DELETE FROM "SafeOperationEvent"
          WHERE "id" = ${entryId} AND "unit" = ${unit}
        `;
        if (count === 0) return fail("Không tìm thấy mốc thời gian", 404);
        await audit(user.id, "UPDATE_SAFE_OPERATION", "SafeOperationEvent", entryId, `Xóa mốc thời gian`);
        break;
      }

      case "RESET_CATEGORY": {
        const category = parseCategory(body.category);
        if (!category) return fail("Hạng mục không hợp lệ");
        
        await prisma.$executeRaw`
          DELETE FROM "SafeOperationEvent"
          WHERE "unit" = ${unit} AND "category" = ${category}
        `;
        await audit(user.id, "UPDATE_SAFE_OPERATION", "SafeOperationEvent", unit, `Xóa tất cả mốc của ${category}`);
        break;
      }

      default:
        return fail("Thao tác không hợp lệ");
    }

    return ok(await listSafeOperationEvents());
  });
}
