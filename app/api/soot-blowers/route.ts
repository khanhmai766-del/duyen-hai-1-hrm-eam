import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { assertOilSootAccess } from "@/lib/server-access";
import { parseSootBlowerMachine as parseMachine, SOOT_BLOWER_TAGS } from "@/lib/soot-blower-layout";

export const dynamic = "force-dynamic";

// Lịch sử (khiếm khuyết đã xử lý) chỉ trả về chừng này dòng gần nhất mỗi tổ máy.
const HISTORY_LIMIT = 500;
const VALID_STATUS = ["available", "unavailable"];

// GET /api/soot-blowers?machine=S1 -> vòi bất khả dụng + khiếm khuyết đang mở + lịch sử gần nhất
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await assertOilSootAccess(user); // chặn cứng theo chức vụ, giống sơ đồ vòi đốt
    const machine = parseMachine(req.nextUrl.searchParams.get("machine"));
    if (!machine) return fail("Tổ máy không hợp lệ");

    const [blowers, open, history] = await Promise.all([
      prisma.sootBlower.findMany({ where: { machine }, orderBy: { tag: "asc" } }),
      prisma.sootBlowerDefect.findMany({ where: { machine, resolvedAt: null }, orderBy: { createdAt: "asc" } }),
      prisma.sootBlowerDefect.findMany({
        where: { machine, resolvedAt: { not: null } },
        orderBy: { resolvedAt: "desc" },
        take: HISTORY_LIMIT,
      }),
    ]);
    return ok({ blowers, defects: [...open, ...history] }, { machine });
  });
}

// PUT /api/soot-blowers { machine, tag, status } -> đổi trạng thái vận hành 1 vòi
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await assertOilSootAccess(user);
    await requirePermissionLevel(user, "archive-oil-gun-data", ["manage", "full"], "Không đủ quyền cập nhật dữ liệu vòi thổi bụi");

    const body = await req.json().catch(() => ({}));
    const machine = parseMachine(body.machine);
    const tag = String(body.tag || "").trim().toUpperCase();
    if (!machine) return fail("Tổ máy không hợp lệ");
    if (!SOOT_BLOWER_TAGS.has(tag)) return fail(`Không có vòi "${tag}" trên sơ đồ`);
    if (!VALID_STATUS.includes(body.status)) return fail("Trạng thái không hợp lệ");

    const blower = await prisma.sootBlower.upsert({
      where: { machine_tag: { machine, tag } },
      update: { status: body.status, updatedBy: user.name ?? null },
      create: { machine, tag, status: body.status, updatedBy: user.name ?? null },
    });
    await audit(user.id, "UPDATE_SOOT_BLOWER", "SootBlower", blower.id, `${machine}/${tag} → ${blower.status}`);
    return ok(blower);
  });
}
