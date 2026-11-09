import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { ok, fail } from "@/lib/api";
import { writeDailyInputs, type DailyInputWrite } from "@/modules/ctktkt/lib/daily-input-store";
import { ktktUtcNow, ktktWrite } from "@/modules/ctktkt/db/prisma";
import { operationalWriteKeysFor } from "@/modules/ctktkt/lib/operational-query-policy";
import { isFutureOperatingDate } from "@/modules/ctktkt/lib/operating-date";
import { requireAnyPermission } from "@/modules/ctktkt/lib/auth/server";
import { parseAvailableCapacity, PPA_AVAILABLE_CAPACITY_S1_CODE, PPA_AVAILABLE_CAPACITY_S2_CODE, PPA_OPERATING_EVENT_S1_CODE, PPA_OPERATING_EVENT_S2_CODE } from "@/modules/ctktkt/lib/google-sheet-sync";

const datePattern = /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

export async function POST(request: Request) {
  const guard = await requireAnyPermission("edit_ppa"); if (!guard.ok) return guard.response;
  if (!isCtktktSameOrigin(request)) return fail("Nguồn yêu cầu không hợp lệ.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("Yêu cầu phải là JSON.", 415);
  try {
    const raw = await request.text();
    if (raw.length > 600_000) return fail("Dữ liệu gửi lên quá lớn.", 413);
    const body = JSON.parse(raw) as { entries?: unknown };
    if (!Array.isArray(body.entries) || body.entries.length > 500) throw new Error("Danh sách đánh giá lịch sử không hợp lệ.");
    const seen = new Set<string>();
    const entries = body.entries.map(item => {
      if (!item || typeof item !== "object") throw new Error("Một dòng đánh giá không hợp lệ.");
      const value = item as Record<string, unknown>;
      const operatingDate = String(value.operatingDate || "");
      const noteS1 = String(value.noteS1 || "").trim(), noteS2 = String(value.noteS2 || "").trim();
      const hasEventS1 = Object.hasOwn(value, "eventS1"), hasEventS2 = Object.hasOwn(value, "eventS2");
      const eventS1 = String(value.eventS1 || "").trim(), eventS2 = String(value.eventS2 || "").trim();
      const hasAvailableCapacityS1 = Object.hasOwn(value, "availableCapacityS1Mw");
      const hasAvailableCapacityS2 = Object.hasOwn(value, "availableCapacityS2Mw");
      const availableCapacityS1Mw = hasAvailableCapacityS1 ? parseAvailableCapacity(value.availableCapacityS1Mw, "Công suất khả dụng S1") : null;
      const availableCapacityS2Mw = hasAvailableCapacityS2 ? parseAvailableCapacity(value.availableCapacityS2Mw, "Công suất khả dụng S2") : null;
      if (!datePattern.test(operatingDate) || seen.has(operatingDate)) throw new Error("Ngày đánh giá không hợp lệ hoặc bị trùng.");
      if (isFutureOperatingDate(operatingDate)) throw new Error("Không thể đánh giá hoặc lưu dữ liệu cho ngày trong tương lai.");
      if (noteS1.length > 1000 || noteS2.length > 1000) throw new Error(`Đánh giá ngày ${operatingDate} dài quá 1.000 ký tự.`);
      if (eventS1.length > 1000 || eventS2.length > 1000) throw new Error(`Tình hình vận hành ngày ${operatingDate} dài quá 1.000 ký tự.`);
      seen.add(operatingDate);
      return { operatingDate, noteS1, noteS2, hasEventS1, hasEventS2, eventS1, eventS2, hasAvailableCapacityS1, hasAvailableCapacityS2, availableCapacityS1Mw, availableCapacityS2Mw };
    });
    // Ô dữ liệu ngày đi kèm (công suất khả dụng, tình hình vận hành): rỗng = xoá; có giá trị = thêm/sửa, GIỮ ghi chú ô.
    const dailyWrites: DailyInputWrite[] = [];
    for (const entry of entries) {
      const capacities = [
        [entry.hasAvailableCapacityS1, PPA_AVAILABLE_CAPACITY_S1_CODE, entry.availableCapacityS1Mw],
        [entry.hasAvailableCapacityS2, PPA_AVAILABLE_CAPACITY_S2_CODE, entry.availableCapacityS2Mw],
      ] as const;
      for (const [present, fieldCode, value] of capacities) {
        if (!present) continue;
        dailyWrites.push(value === null
          ? { kind: "delete", operatingDate: entry.operatingDate, fieldCode }
          : { kind: "upsert", operatingDate: entry.operatingDate, fieldCode, value: String(value), keepNote: true });
      }
      const events = [
        [entry.hasEventS1, PPA_OPERATING_EVENT_S1_CODE, entry.eventS1],
        [entry.hasEventS2, PPA_OPERATING_EVENT_S2_CODE, entry.eventS2],
      ] as const;
      for (const [present, fieldCode, value] of events) {
        if (!present) continue;
        dailyWrites.push(value === ""
          ? { kind: "delete", operatingDate: entry.operatingDate, fieldCode }
          : { kind: "upsert", operatingDate: entry.operatingDate, fieldCode, value, keepNote: true });
      }
    }
    // Như bản cũ: ghi chú đánh giá trước (ngày chưa có PPA → tạo dòng số 0, chỉ có ghi chú), rồi các ô dữ liệu ngày.
    // updated = số ngày ghi được ghi chú (thêm hoặc sửa đều tính 1, như ON CONFLICT DO UPDATE của Postgres).
    if (entries.length) {
      const user = guard.user, updatedAt = ktktUtcNow();
      const keys = [...new Set([
        ...entries.flatMap(entry => operationalWriteKeysFor("ppa_heat_rate_daily", [entry.operatingDate])),
        ...dailyWrites.flatMap(write => operationalWriteKeysFor("daily_inputs", [write.operatingDate])),
      ])];
      await ktktWrite(keys, async tx => {
        for (const entry of entries) {
          await tx.ctktktPpaHeatRateDaily.upsert({
            where: { operating_date: entry.operatingDate },
            create: {
              operating_date: entry.operatingDate, source_data: "{}", source_files: "[]",
              gross_s1_kwh: "0", net_s1_kwh: "0", gross_s2_kwh: "0", net_s2_kwh: "0", ppa_plant: "0", ppa_s1: "0", ppa_s2: "0",
              note_s1: entry.noteS1, note_s2: entry.noteS2,
            },
            update: { note_s1: entry.noteS1, note_s2: entry.noteS2, updated_at: updatedAt },
          });
        }
        await writeDailyInputs(tx, user, "ppa-heat-rate/notes", dailyWrites, updatedAt);
      });
    }
    const updated = entries.length;
    return ok({ received: entries.length, updated, skipped: entries.length - updated });
  } catch (error) {
    return fail(error instanceof SyntaxError ? "Dữ liệu JSON không hợp lệ." : error instanceof Error ? error.message : "Dữ liệu không hợp lệ.", 400);
  }
}
