// POST /api/vat-tu/oil-grouping/sync
// Chạy engine gợi ý cho mọi mã UNMAPPED/SUGGESTED. Gọi tay từ nút
// "Quét gợi ý" trên UI (hoặc gọi runOilGroupingSync trực tiếp sau nhập Excel).
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { canManageMaterialCatalog } from "@/lib/constants";
import { runOilGroupingSync } from "@/lib/oil-grouping-sync";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được quét gợi ý gom nhóm", 403);
    }

    const result = await runOilGroupingSync();
    await audit(user.id, "OIL_GROUPING_SYNC", "ErpMaterial", undefined, `Quét gợi ý gom nhóm dầu: ${result.suggested}/${result.scanned} mã có gợi ý`);
    return ok(result);
  });
}
