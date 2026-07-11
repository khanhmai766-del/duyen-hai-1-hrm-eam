// POST /api/vat-tu/oil-grouping/sync
// Body (tuỳ chọn): { category?: "Dầu bôi trơn" | "Lõi lọc dầu" | "Hóa Chất" | "Bi Nghiền Than" }
// Chạy engine gợi ý cho mọi mã UNMAPPED/SUGGESTED (của một loại nếu truyền
// category, ngược lại tất cả các loại). Gọi tay từ nút "Quét gợi ý" trên UI
// (hoặc gọi runOilGroupingSync trực tiếp sau nhập Excel).
import type { NextRequest } from "next/server";
import { ok, fail, requireUser, handle, audit } from "@/lib/api";
import { canManageMaterialCatalog } from "@/lib/constants";
import { runOilGroupingSync, isGroupableCategory } from "@/lib/oil-grouping-sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được quét gợi ý gom nhóm", 403);
    }

    const body = await req.json().catch(() => null);
    const category = isGroupableCategory(body?.category) ? body.category : undefined;

    const result = await runOilGroupingSync(category);
    await audit(user.id, "OIL_GROUPING_SYNC", "ErpMaterial", undefined, `Quét gợi ý gom nhóm${category ? ` [${category}]` : ""}: ${result.suggested}/${result.scanned} mã có gợi ý`);
    return ok(result);
  });
}
