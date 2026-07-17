import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, requireRole, handle, audit } from "@/lib/api";
import { getWorkflowRoleMap, invalidateWorkflowConfigCache, WORKFLOW_STEPS, type WorkflowStep } from "@/lib/material-workflow";

export const dynamic = "force-dynamic";

/** GET — cấu hình phân quyền các bước quy trình phiếu vật tư (chỉ ADMIN). */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    return ok(await getWorkflowRoleMap());
  });
}

/**
 * PUT — ADMIN lưu toàn bộ cấu hình: { roles: { create: string[], confirm: string[], accept: string[], manage: string[] } }.
 * Bước để TRỐNG = dùng mặc định cũ (Trưởng Ca/KTV/Quản trị...).
 */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const body = await req.json();
    const roles = (body?.roles ?? {}) as Record<string, unknown>;

    const rows: { step: WorkflowStep; position: string }[] = [];
    for (const step of WORKFLOW_STEPS) {
      const list = roles[step];
      if (list == null) continue;
      if (!Array.isArray(list)) return fail(`Danh sách cương vị của bước "${step}" không hợp lệ`);
      for (const raw of list) {
        const position = String(raw ?? "").trim();
        if (position && !rows.some((r) => r.step === step && r.position === position)) {
          rows.push({ step, position });
        }
      }
    }

    await prisma.$transaction([
      prisma.materialWorkflowRole.deleteMany({}),
      ...(rows.length ? [prisma.materialWorkflowRole.createMany({ data: rows })] : []),
    ]);
    // Cấu hình vừa đổi — xóa cache RAM để request kế tiếp đọc bản mới ngay.
    invalidateWorkflowConfigCache();
    await audit(
      user.id,
      "MT_WORKFLOW_ROLES",
      "MaterialWorkflowRole",
      undefined,
      WORKFLOW_STEPS.map((s) => `${s}: ${rows.filter((r) => r.step === s).map((r) => r.position).join(", ") || "(mặc định)"}`).join(" | ")
    );
    return ok(await getWorkflowRoleMap());
  });
}
