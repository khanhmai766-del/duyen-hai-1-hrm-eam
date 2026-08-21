import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { listReceipts } from "@/lib/chemical-inventory/queries";
import { createReceipt } from "@/lib/chemical-inventory/receipts";
import { validateReceiptInput } from "@/lib/chemical-inventory/validation";
import { assertPositionScope, effectiveLevel, READ_LEVELS, WRITE_LEVELS } from "@/lib/chemical-inventory/permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/chemical-inventory/receipts?month=&itemId=&position=&q=&page=&pageSize=
 * Mặc định lọc theo một tháng; bỏ `month` để xem toàn bộ.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...READ_LEVELS], "Không đủ quyền xem phiếu nhập hóa chất");

    const sp = req.nextUrl.searchParams;
    const result = await listReceipts(prisma, {
      periodKey: sp.get("month")?.trim() || undefined,
      itemId: sp.get("itemId")?.trim() || undefined,
      position: sp.get("position")?.trim() || undefined,
      q: sp.get("q")?.trim() || undefined,
      page: Number(sp.get("page")) || 1,
      pageSize: Number(sp.get("pageSize")) || 50,
    });

    return ok(result.rows, {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      level: await effectiveLevel(user),
    });
  });
}

/**
 * POST /api/chemical-inventory/receipts
 *
 * Tạo một chuyến xe. KHÔNG nhận `acceptedWeight` và `periodKey` từ client —
 * server tính từ hai số cân và từ ngày nhập.
 *
 * Nếu chuyến xe đó đã được ghi từ cửa khác (nhật ký ngày hoặc phiếu vật tư), phiếu
 * mới sẽ được GẮN vào dòng cũ và trả `status: "linked"` kèm thông báo — không tạo
 * dòng thứ hai.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...WRITE_LEVELS], "Không đủ quyền tạo phiếu nhập hóa chất");

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = validateReceiptInput(body);
    if (!input.ok) throw fail(input.error, 400);

    const level = await effectiveLevel(user);
    assertPositionScope(
      user,
      input.value.receivingPosition ?? "",
      level === "read" || level === "none" ? "personal" : level
    );

    const result = await prisma.$transaction((tx) =>
      createReceipt(tx, input.value, { source: "MANUAL", userId: user.id })
    );

    await audit(
      user.id,
      result.status === "linked" ? "LINK_CHEMICAL_RECEIPT" : "CREATE_CHEMICAL_RECEIPT",
      "ChemicalReceipt",
      result.id,
      auditDetailWithPosition(
        user,
        `Ngày ${input.value.receivedAt.toISOString().slice(0, 10)}, biển số ${input.value.vehicleNumber ?? "(không có)"}`
      )
    );

    return ok(result);
  });
}
