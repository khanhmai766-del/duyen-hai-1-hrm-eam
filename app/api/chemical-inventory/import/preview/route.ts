import type { NextRequest } from "next/server";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { buildImportPlan } from "@/lib/chemical-inventory/importer";
import { MANAGE_LEVELS } from "@/lib/chemical-inventory/permissions";
import { readUploadedWorkbook, summarizePlan } from "../shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/chemical-inventory/import/preview  (multipart/form-data, field "file")
 *
 * Thử khô: đọc, chuẩn hóa, đối soát rồi trả kết quả. KHÔNG ghi gì vào DB.
 * Đây là bước hay dùng nhất nên cố ý không đòi mức quyền cao nhất.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...MANAGE_LEVELS], "Không đủ quyền nhập dữ liệu hóa chất");

    const { buffer, fileName } = await readUploadedWorkbook(req);
    const plan = buildImportPlan(buffer, fileName);

    await audit(
      user.id,
      "PREVIEW_CHEMICAL_IMPORT",
      "ChemicalImportBatch",
      plan.fileHash,
      auditDetailWithPosition(user, `Thử khô tệp ${fileName}`)
    );

    return ok(summarizePlan(plan));
  });
}

export function GET() {
  return fail("Dùng POST kèm tệp .xlsx", 405);
}
