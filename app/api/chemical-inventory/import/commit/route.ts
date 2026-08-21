import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { buildImportPlan } from "@/lib/chemical-inventory/importer";
import { commitImportPlan } from "@/lib/chemical-inventory/import-commit";
import { FULL_LEVELS } from "@/lib/chemical-inventory/permissions";
import { readUploadedWorkbook, summarizePlan } from "../shared";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/chemical-inventory/import/commit  (multipart/form-data, field "file")
 *
 * Ghi thật, trong một transaction. Cần mức `full`.
 *
 * CỐ Ý đọc lại tệp và dựng lại kế hoạch ở server thay vì nhận kế hoạch do client
 * gửi lên: kế hoạch quyết định ghi cái gì vào sổ, nhận từ client là mở toang cửa.
 * Client gửi kèm `expectedHash` để chắc chắn đang ghi đúng tệp vừa xem trước.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...FULL_LEVELS], "Không đủ quyền ghi dữ liệu nhập hóa chất");

    const { buffer, fileName, form } = await readUploadedWorkbook(req);
    const plan = buildImportPlan(buffer, fileName);

    const expectedHash = String(form.get("expectedHash") ?? "").trim();
    if (expectedHash && expectedHash !== plan.fileHash) {
      throw fail("Tệp đã thay đổi so với lần xem trước — hãy xem trước lại rồi ghi", 409);
    }

    const errors = plan.issues.filter((i) => i.severity === "error");
    if (errors.length > 0) {
      throw fail(`Còn ${errors.length} lỗi phải xử lý trước khi ghi`, 422);
    }

    const result = await commitImportPlan(prisma, plan, user.id);

    await audit(
      user.id,
      "IMPORT_CHEMICAL_INVENTORY",
      "ChemicalImportBatch",
      result.batchId,
      auditDetailWithPosition(
        user,
        `Tệp ${fileName}: ${result.receiptsCreated} phiếu mới, ${result.receiptsLinked} phiếu gắn vào bản ghi cũ, ${result.readingsUpserted} ô tồn`
      )
    );

    return ok({ ...result, plan: summarizePlan(plan) });
  });
}
