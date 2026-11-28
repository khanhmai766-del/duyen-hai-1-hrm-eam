import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { isLubricantSupervisor } from "@/lib/lubricant-access";
import { positionsMatch } from "@/lib/position-catalog";
import { lubricantChainConveyors, lubricantCoalFeeders, lubricantHvacPumps } from "@/lib/lubricant-source-splits";
import groups from "@/app/(dashboard)/replacements/lubricant-statistics.json";

const permission = "replacement-manage";
const sourcePositions = new Map(groups.flatMap((group) => group.rows.flatMap((row, index): Array<[string, string]> => {
  const key = `${group.name}:${index}`;
  const feeders = lubricantCoalFeeders(group.name, row[2]);
  if (feeders.length) return feeders.map((feeder) => [`${key}:${feeder.suffix}`, row[1]]);
  const chains = lubricantChainConveyors(group.name, row[2]);
  if (chains.length) return chains.map((chain) => [`${key}:${chain.suffix}`, row[1]]);
  const pumps = lubricantHvacPumps(group.name, row[2]);
  if (pumps.length) return pumps.map((pump) => [`${key}:${pump.suffix}`, row[1]]);
  return /^Dầu bôi trơn gối chặn,\s+gối dẫn hướng APH [12][AB]$/.test(row[2])
    ? [[`${key}:chan`, row[1]], [`${key}:dan huong`, row[1]]]
    : [[key, row[1]]];
})));

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!isLubricantSupervisor(user)) await requirePermissionLevel(user, permission, ["read", "personal", "manage", "full"], "Không đủ quyền xem lịch thay dầu mỡ");
    const rows = await prisma.$queryRaw<Array<{ sourceKey: string; date: string }>>`
      SELECT "sourceKey", to_char("lastReplacedAt", 'YYYY-MM-DD') AS date
      FROM "LubricantSourceDate"
    `;
    return ok(Object.fromEntries(rows.map(({ sourceKey, date }) => [sourceKey, date])));
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (!isLubricantSupervisor(user)) await requirePermissionLevel(user, permission, ["manage", "full"], "Không đủ quyền sửa ngày thay dầu mỡ");
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || !("sourceKey" in body) || !("date" in body)) {
      return fail("Thiếu thiết bị hoặc ngày thay gần nhất");
    }
    const { sourceKey, date } = body;
    if (typeof sourceKey !== "string" || !sourcePositions.has(sourceKey)) return fail("Không tìm thấy dòng thiết bị", 404);
    if (!positionsMatch(user.currentPosition, sourcePositions.get(sourceKey))) {
      return fail("Chỉ cương vị quản lý thiết bị được sửa ngày thay này", 403);
    }
    if (typeof date !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date)) return fail("Ngày thay gần nhất không hợp lệ");
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      return fail("Ngày thay gần nhất không hợp lệ");
    }
    await prisma.$executeRaw`
      INSERT INTO "LubricantSourceDate" ("sourceKey", "lastReplacedAt") VALUES (${sourceKey}, ${date}::date)
      ON CONFLICT ("sourceKey") DO UPDATE SET "lastReplacedAt" = EXCLUDED."lastReplacedAt"
    `;
    await audit(user.id, "UPDATE_LUBRICANT_SOURCE_DATE", "LubricantSourceDate", sourceKey, JSON.stringify({ date }));
    return ok({ sourceKey, date });
  });
}
