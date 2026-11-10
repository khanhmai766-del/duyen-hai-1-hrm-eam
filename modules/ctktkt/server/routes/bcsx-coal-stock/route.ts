import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { ok, fail } from "@/lib/api";
import { writeDailyInputs } from "@/modules/ctktkt/lib/daily-input-store";
import { ktktUtcNow, ktktWrite } from "@/modules/ctktkt/db/prisma";
import { operationalWriteKeysFor } from "@/modules/ctktkt/lib/operational-query-policy";
import { requirePermission } from "@/modules/ctktkt/lib/auth/server";
import { BCSX_COAL_STOCK_24H_CODE } from "@/modules/ctktkt/lib/ctktkt-bcsx-link";
import { isFutureOperatingDate } from "@/modules/ctktkt/lib/operating-date";
import { rethrowKtktServerFault } from "@/modules/ctktkt/server/server-fault";

const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export async function POST(request: Request) {
  const guard = await requirePermission("edit_bcsx");
  if (!guard.ok) return guard.response;
  if (!isCtktktSameOrigin(request)) return fail("Nguồn yêu cầu không hợp lệ.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("Yêu cầu phải là JSON.", 415);
  try {
    const body = await request.json() as { operatingDate?: unknown; value?: unknown };
    const operatingDate = String(body.operatingDate || "");
    const valueText = String(body.value ?? "").trim().replace(",", ".");
    const value = Number(valueText);
    if (!datePattern.test(operatingDate)) throw new Error("Ngày vận hành không hợp lệ.");
    if (isFutureOperatingDate(operatingDate)) throw new Error("Không thể lưu dữ liệu cho ngày trong tương lai.");
    if (!valueText || !Number.isFinite(value) || value < 0 || value > 10_000_000) throw new Error("Than tồn kho 24h phải là số không âm hợp lệ.");
    // Thêm/sửa ô than tồn 24h, giữ ghi chú ô; nhật ký sửa ô cùng giao dịch.
    const user = guard.user, updatedAt = ktktUtcNow();
    await ktktWrite(operationalWriteKeysFor("daily_inputs", [operatingDate]), tx => writeDailyInputs(tx, user, "bcsx-coal-stock",
      [{ kind: "upsert", operatingDate, fieldCode: BCSX_COAL_STOCK_24H_CODE, value: String(value), keepNote: true }], updatedAt));
    return ok({ saved: true, value: String(value) });
  } catch (error) {
    rethrowKtktServerFault(error);
    return fail(error instanceof Error ? error.message : "Không lưu được than tồn kho 24h.", 400);
  }
}
