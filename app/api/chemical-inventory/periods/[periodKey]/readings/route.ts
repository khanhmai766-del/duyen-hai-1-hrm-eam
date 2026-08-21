import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { CHEMICAL_PERMISSION_ID } from "@/lib/chemical-inventory/constants";
import { saveMonthEndReadings, type ReadingWrite } from "@/lib/chemical-inventory/readings";
import { getMonthlyGrid } from "@/lib/chemical-inventory/queries";
import { parsePeriodKey, validateReadingInput } from "@/lib/chemical-inventory/validation";
import { assertPositionScope, effectiveLevel, WRITE_LEVELS } from "@/lib/chemical-inventory/permissions";

export const dynamic = "force-dynamic";

/**
 * PUT /api/chemical-inventory/periods/[periodKey]/readings
 * Body: { readings: [{ itemId, positionCode, quantity, note }] }
 *
 * Cập nhật các ô tồn cuối của lưới tháng, trong một transaction.
 *
 * CHỈ nhận `quantity` của từng ô. Tồn đầu, tổng nhập và lượng sử dụng đều là số dẫn
 * xuất — có gửi lên cũng bị bỏ qua.
 */
export async function PUT(req: NextRequest, { params }: { params: { periodKey: string } }) {
  return handle(async () => {
    const user = await requireUser();
    await requirePermissionLevel(user, CHEMICAL_PERMISSION_ID, [...WRITE_LEVELS], "Không đủ quyền sửa tồn kho hóa chất");

    const period = parsePeriodKey(params.periodKey);
    if (!period.ok) throw fail(period.error, 400);

    const body = (await req.json().catch(() => ({}))) as { readings?: unknown };
    if (!Array.isArray(body.readings) || body.readings.length === 0) {
      throw fail("Không có ô nào để lưu", 400);
    }
    if (body.readings.length > 200) throw fail("Gửi quá nhiều ô trong một lần lưu", 400);

    const level = await effectiveLevel(user);
    const inputs: ReadingWrite[] = [];

    for (const raw of body.readings) {
      const parsed = validateReadingInput(raw as Record<string, unknown>);
      if (!parsed.ok) throw fail(parsed.error, 400);
      assertPositionScope(user, parsed.value.positionCode, level === "read" || level === "none" ? "personal" : level);
      inputs.push(parsed.value);
    }

    const written = await prisma.$transaction((tx) => saveMonthEndReadings(tx, period.value, inputs, user.id));

    await audit(
      user.id,
      "UPDATE_CHEMICAL_READINGS",
      "ChemicalStockReading",
      period.value,
      auditDetailWithPosition(user, `Cập nhật ${written} ô tồn cuối kỳ ${period.value}`)
    );

    return ok(await getMonthlyGrid(prisma, period.value), { written });
  });
}
