import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { assertOilSootAccess } from "@/lib/server-access";
import { parseSootBlowerMachine as parseMachine, SOOT_BLOWER_DEPTS, SOOT_BLOWER_TAGS } from "@/lib/soot-blower-layout";

export const dynamic = "force-dynamic";

// POST /api/soot-blowers/defects { machine, tag, dept, description, reportedBy? } -> ghi nhận khiếm khuyết
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await assertOilSootAccess(user);
    await requirePermissionLevel(user, "archive-oil-gun-data", ["manage", "full"], "Không đủ quyền ghi nhận khiếm khuyết vòi thổi bụi");

    const body = await req.json().catch(() => ({}));
    const machine = parseMachine(body.machine);
    const tag = String(body.tag || "").trim().toUpperCase();
    const dept = String(body.dept || "");
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const reportedBy = typeof body.reportedBy === "string" ? body.reportedBy.trim() || null : null;
    if (!machine) return fail("Tổ máy không hợp lệ");
    if (!SOOT_BLOWER_TAGS.has(tag)) return fail(`Không có vòi "${tag}" trên sơ đồ`);
    if (!(SOOT_BLOWER_DEPTS as readonly string[]).includes(dept)) return fail("Đơn vị xử lý không hợp lệ");
    if (!description) return fail("Chưa nhập mô tả khiếm khuyết");
    if (description.length > 2000) return fail("Mô tả khiếm khuyết quá dài (tối đa 2000 ký tự)");

    const defect = await prisma.sootBlowerDefect.create({
      data: { machine, tag, dept, description, reportedBy: reportedBy ?? user.name ?? null, createdById: user.id },
    });
    await audit(user.id, "CREATE_SOOT_BLOWER_DEFECT", "SootBlowerDefect", defect.id, `${machine}/${tag} [${dept}] ${description}`);
    return ok(defect);
  });
}
