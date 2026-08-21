import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { saveDailyReading } from "@/lib/chemical-inventory/readings";
import { periodKeyOf } from "@/lib/chemical-inventory/normalize";
import { parseDateOnly, parseQuantity } from "@/lib/chemical-inventory/validation";
import { assertPositionScope, effectiveLevel, WRITE_LEVELS } from "@/lib/chemical-inventory/permissions";
import { getDailyLog } from "@/lib/chemical-inventory/queries";

export const dynamic = "force-dynamic";

/**
 * PUT /api/chemical-inventory/daily/[date]
 * Body: { itemId, positionCode, quantity, note }
 *
 * Ghi tồn 24h của một ngày. Chỉ nhận tồn 24h — tồn 00h và lượng đã dùng đều là số
 * dẫn xuất, server tự tính; nhận từ client là mở đường cho số liệu bịa.
 *
 * Kỳ được suy từ chính `date`, không lấy từ body.
 */
export async function PUT(req: NextRequest, { params }: { params: { date: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...WRITE_LEVELS], "Không đủ quyền ghi nhật ký hóa chất");

    const parsedDate = parseDateOnly(params.date, "Ngày");
    if (!parsedDate.ok) throw fail(parsedDate.error, 400);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const itemId = String(body.itemId ?? "").trim();
    if (!itemId) throw fail("Thiếu mặt hàng", 400);

    const positionCode = String(body.positionCode ?? "").trim();
    if (!positionCode) throw fail("Thiếu cương vị", 400);

    // Để trống là hợp lệ và mang nghĩa "chưa đo", khác hẳn số 0.
    const quantity = parseQuantity(body.quantity, "Tồn 24h", { allowNull: true });
    if (!quantity.ok) throw fail(quantity.error, 400);

    const level = await effectiveLevel(user);
    assertPositionScope(user, positionCode, level === "read" || level === "none" ? "personal" : level);

    const periodKey = periodKeyOf(parsedDate.value);

    await prisma.$transaction(async (tx) => {
      await saveDailyReading(
        tx,
        {
          itemId,
          periodKey,
          readDate: parsedDate.value,
          positionCode,
          quantity: quantity.value,
          note: String(body.note ?? "").trim() || null,
        },
        user.id
      );
    });

    await audit(
      user.id,
      "UPDATE_CHEMICAL_DAILY_READING",
      "ChemicalStockReading",
      `${itemId}|${params.date}`,
      auditDetailWithPosition(user, `Tồn 24h ngày ${params.date}: ${quantity.value ?? "(xóa)"}`)
    );

    // Trả lại cả nhật ký để giao diện cập nhật chuỗi tồn mà không phải gọi thêm.
    return ok(await getDailyLog(prisma, periodKey, itemId));
  });
}
