import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { auditedDailyBatch } from "@/modules/ctktkt/lib/daily-input-audit";
import { getRawDb } from "@/modules/ctktkt/db";
import { requirePermission } from "@/modules/ctktkt/lib/auth/server";
import { BCSX_COAL_STOCK_24H_CODE } from "@/modules/ctktkt/lib/ctktkt-bcsx-link";
import { isFutureOperatingDate } from "@/modules/ctktkt/lib/operating-date";

const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export async function POST(request: Request) {
  const guard = await requirePermission("edit_bcsx");
  if (!guard.ok) return guard.response;
  if (!isCtktktSameOrigin(request)) return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Yêu cầu phải là JSON." }, { status: 415 });
  try {
    const body = await request.json() as { operatingDate?: unknown; value?: unknown };
    const operatingDate = String(body.operatingDate || "");
    const valueText = String(body.value ?? "").trim().replace(",", ".");
    const value = Number(valueText);
    if (!datePattern.test(operatingDate)) throw new Error("Ngày vận hành không hợp lệ.");
    if (isFutureOperatingDate(operatingDate)) throw new Error("Không thể lưu dữ liệu cho ngày trong tương lai.");
    if (!valueText || !Number.isFinite(value) || value < 0 || value > 10_000_000) throw new Error("Than tồn kho 24h phải là số không âm hợp lệ.");
    const db = getRawDb();
    await auditedDailyBatch(db, guard.user, "bcsx-coal-stock", [db.prepare(
      "INSERT INTO daily_inputs (operating_date, field_code, value, note, updated_at) VALUES (?, ?, ?, '', CURRENT_TIMESTAMP) ON CONFLICT(operating_date, field_code) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
    ).bind(operatingDate, BCSX_COAL_STOCK_24H_CODE, String(value))]);
    return Response.json({ saved: true, value: String(value) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không lưu được than tồn kho 24h." }, { status: 400 });
  }
}
