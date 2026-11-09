import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ktktUtcNow, ktktWrite } from "@/modules/ctktkt/db/prisma";
import { operationalWriteKeysFor } from "@/modules/ctktkt/lib/operational-query-policy";
import { SHIFT_METRICS, SHIFT_TIME_SLOTS } from "@/modules/ctktkt/lib/bcsx";
import { requirePermission, requireSession } from "@/modules/ctktkt/lib/auth/server";

const units = new Set(["S1", "S2"]);
const metrics = new Set(SHIFT_METRICS.map(m => m.key));
const slots = new Set(SHIFT_TIME_SLOTS);
const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const unavailable = () => fail("Chưa truy cập được kho dữ liệu. Nội dung trên màn hình vẫn được giữ để bạn thử lưu lại.", 503);

export async function GET(request: Request) {
  const session = await requireSession(); if (!session.ok) return session.response;
  const date = new URL(request.url).searchParams.get("date") || "";
  if (!datePattern.test(date)) return fail("Ngày không hợp lệ.", 400);
  try {
    // Không sắp thứ tự — như SQL cũ (trang tự xếp theo mốc giờ).
    const rows = await prisma.ctktktShiftReadings.findMany({ where: { operating_date: date }, select: { unit: true, time_slot: true, metric: true, value: true } });
    return ok({ entries: rows.map(r => ({ unit: r.unit, timeSlot: r.time_slot, metric: r.metric, value: r.value })) });
  } catch { return unavailable(); }
}

export async function POST(request: Request) {
  const guard = await requirePermission("edit_bcsx"); if (!guard.ok) return guard.response;
  if (!isCtktktSameOrigin(request)) return fail("Nguồn yêu cầu không hợp lệ.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("Yêu cầu phải là JSON.", 415);
  try {
    const raw = await request.text();
    if (raw.length > 300_000) return fail("Dữ liệu gửi lên quá lớn.", 413);
    const body = JSON.parse(raw) as { date?: unknown; entries?: unknown };
    if (typeof body.date !== "string" || !datePattern.test(body.date) || !Array.isArray(body.entries) || body.entries.length > 400) throw new Error("Dữ liệu không hợp lệ.");
    const clean = body.entries.map(item => {
      if (!item || typeof item !== "object") throw new Error("Một ô dữ liệu không hợp lệ.");
      const e = item as Record<string, unknown>;
      const unit = String(e.unit || ""), timeSlot = String(e.timeSlot || ""), metric = String(e.metric || ""), value = String(e.value ?? "").trim();
      if (!units.has(unit) || !slots.has(timeSlot) || !metrics.has(metric as never)) throw new Error("Tổ máy, mốc giờ hoặc thông số không hợp lệ.");
      if (value !== "" && !/^-?\d+(?:[.,]\d+)?$/.test(value)) throw new Error(`Giá trị tại ${timeSlot} phải là số.`);
      if (value.length > 40) throw new Error("Giá trị quá dài.");
      return { unit, timeSlot, metric, value: value.replace(",", ".") };
    });
    // Ô rỗng = xoá; còn lại thêm/sửa. Cả lượt một giao dịch.
    if (clean.length) {
      const date = body.date, updatedAt = ktktUtcNow();
      await ktktWrite(operationalWriteKeysFor("shift_readings", [date]), async tx => {
        for (const e of clean) {
          const key = { operating_date: date, unit: e.unit, time_slot: e.timeSlot, metric: e.metric };
          if (e.value === "") await tx.ctktktShiftReadings.deleteMany({ where: key });
          else await tx.ctktktShiftReadings.upsert({
            where: { operating_date_unit_time_slot_metric: key },
            create: { ...key, value: e.value },
            update: { value: e.value, updated_at: updatedAt },
          });
        }
      });
    }
    return ok({ saved: clean.length });
  } catch (error) {
    return fail(error instanceof SyntaxError ? "Dữ liệu JSON không hợp lệ." : error instanceof Error ? error.message : "Dữ liệu không hợp lệ.", 400);
  }
}
