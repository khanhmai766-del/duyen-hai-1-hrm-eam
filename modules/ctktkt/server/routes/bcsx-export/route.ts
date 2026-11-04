import { requireSession } from "@/modules/ctktkt/lib/auth/server";
import { getRawDb } from "@/modules/ctktkt/db";
import { calculateCoalStock24h } from "@/modules/ctktkt/lib/coal-stock";
import { buildBcsxWorkbook, deriveA0Readings, fileNameFor, SHIFT_METRICS, SHIFT_TIME_SLOTS, type ExportUnit, type OperatingEvent, type ShiftMetric, type UnitTotals } from "@/modules/ctktkt/lib/bcsx";
import { deriveCtktktCellsFromBcsx, type CtktktBcsxReading } from "@/modules/ctktkt/lib/ctktkt-bcsx-link";
import { deriveDailyValuesFromCtktkt } from "@/modules/ctktkt/lib/daily-source-links";
import { previousIsoDate, type CtktktDayEntries } from "@/modules/ctktkt/lib/ctktkt-report";

const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const exportUnits = new Set(["S1", "S2", "A0"]);

async function loadUnitData(date: string, unit: "S1" | "S2") {
  const db = getRawDb();
  const previousDate = previousIsoDate(date);
  // The 24h coal stock chains from day 01 of the month, whose consumption needs the day before.
  const rangeStart = previousIsoDate(`${date.slice(0, 8)}01`);
  const [readingsRes, eventsRes, stockRes, ktktRes, ktktShiftRes] = await Promise.all([
    db.prepare("SELECT time_slot AS timeSlot, metric, value FROM shift_readings WHERE operating_date = ? AND unit = ?").bind(date, unit).all(),
    db.prepare("SELECT start_at AS startAt, end_at AS endAt, event_type AS eventType, description FROM operating_events WHERE operating_date = ? AND unit = ? ORDER BY start_at").bind(date, unit).all(),
    db.prepare("SELECT field_code AS fieldCode, value FROM daily_inputs WHERE operating_date = ? AND field_code IN (?, ?)").bind(date, "GRID_RECEIVE_S1", "GRID_RECEIVE_S2").all(),
    db.prepare("SELECT operating_date AS operatingDate, substr(field_code, 6) AS cell, value FROM daily_inputs WHERE operating_date BETWEEN ? AND ? AND field_code LIKE 'KTKT:%'").bind(rangeStart, date).all(),
    db.prepare("SELECT operating_date AS operatingDate, unit, time_slot AS timeSlot, metric, value FROM shift_readings WHERE operating_date IN (?, ?)").bind(previousDate, date).all(),
  ]);

  const readings: Partial<Record<ShiftMetric, (number | null)[]>> = {};
  for (const m of SHIFT_METRICS) readings[m.key] = new Array(SHIFT_TIME_SLOTS.length).fill(null);
  const slotIndex = new Map(SHIFT_TIME_SLOTS.map((slot, i) => [slot, i]));
  for (const row of readingsRes.results as { timeSlot: string; metric: ShiftMetric; value: string }[]) {
    const idx = slotIndex.get(row.timeSlot);
    if (idx === undefined) continue;
    const arr = readings[row.metric];
    if (arr) arr[idx] = Number(row.value);
  }

  const ktktByDate = new Map<string, CtktktDayEntries>();
  for (const row of ktktRes.results as Array<{ operatingDate: string; cell: string; value: string }>) {
    const values = ktktByDate.get(row.operatingDate) || {};
    values[row.cell] = row.value;
    ktktByDate.set(row.operatingDate, values);
  }
  const shiftsByDate = new Map<string, CtktktBcsxReading[]>();
  for (const row of ktktShiftRes.results as CtktktBcsxReading[]) {
    const operatingDate = row.operatingDate || "";
    if (!operatingDate) continue;
    const values = shiftsByDate.get(operatingDate) || [];
    values.push(row);
    shiftsByDate.set(operatingDate, values);
  }
  for (const operatingDate of [previousDate, date]) {
    const values = ktktByDate.get(operatingDate) || {};
    Object.assign(values, deriveCtktktCellsFromBcsx(shiftsByDate.get(operatingDate) || []).entries);
    ktktByDate.set(operatingDate, values);
  }
  const linked = deriveDailyValuesFromCtktkt(ktktByDate.get(date) || {}, ktktByDate.get(previousDate));
  const dailyValues = new Map((stockRes.results as Array<{ fieldCode: string; value: string }>).map(item => [item.fieldCode, item.value]));
  const stock24h = calculateCoalStock24h(ktktByDate, date).stock;
  const numeric = (value?: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const toMwh = (value?: string) => {
    const parsed = numeric(value);
    return parsed === null ? null : parsed * 1000;
  };

  const totals: UnitTotals = unit === "S1"
    ? {
        dauCuc: toMwh(linked.B),
        thuongPham: toMwh(linked.C),
        gridReceivedMwh: numeric(dailyValues.get("GRID_RECEIVE_S1")),
        thanTieuThu: numeric(linked.AE_ADJ),
        thanTonKho: stock24h,
      }
    : {
        dauCuc: toMwh(linked.H),
        thuongPham: toMwh(linked.I),
        gridReceivedMwh: numeric(dailyValues.get("GRID_RECEIVE_S2")),
        thanTieuThu: numeric(linked.AF_ADJ),
        thanTonKho: stock24h,
      };

  const events = eventsRes.results as OperatingEvent[];
  return { readings, totals, events };
}

function sumMaybe(a: number | null | undefined, b: number | null | undefined) {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

export async function GET(request: Request) {
  const session = await requireSession(); if (!session.ok) return session.response;
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || "";
  const unit = (url.searchParams.get("unit") || "") as ExportUnit;
  if (!datePattern.test(date)) return Response.json({ error: "Ngày không hợp lệ." }, { status: 400 });
  if (!exportUnits.has(unit)) return Response.json({ error: "Tổ máy không hợp lệ." }, { status: 400 });

  try {
    let payload;
    if (unit === "S1" || unit === "S2") {
      const data = await loadUnitData(date, unit);
      payload = { operatingDate: date, unit, ...data };
    } else {
      const [s1, s2] = await Promise.all([loadUnitData(date, "S1"), loadUnitData(date, "S2")]);
      // A0 cộng P/Q/P điểm bán của S1+S2; riêng Utc 220 kV luôn lấy S1.
      const readings = deriveA0Readings(s1.readings, s2.readings);
      const totals: UnitTotals = {
        dauCuc: sumMaybe(s1.totals.dauCuc, s2.totals.dauCuc),
        thuongPham: sumMaybe(s1.totals.thuongPham, s2.totals.thuongPham),
        gridReceivedMwh: sumMaybe(s1.totals.gridReceivedMwh, s2.totals.gridReceivedMwh),
        thanTieuThu: sumMaybe(s1.totals.thanTieuThu, s2.totals.thanTieuThu),
        // Than tồn kho là 1 kho dùng chung cho cả nhà máy (không phải 2 kho
        // riêng theo tổ máy) — người dùng đã xác nhận KHÔNG cộng đôi (17/09/2026).
        thanTonKho: s1.totals.thanTonKho ?? s2.totals.thanTonKho,
      };
      // Tình hình vận hành ở A0: các hàng của S1 đứng trước, S2 tiếp theo sau —
      // KHÔNG sắp xếp lại theo thời gian (đúng yêu cầu của người dùng).
      const events = [...s1.events, ...s2.events];
      payload = { operatingDate: date, unit: "A0" as ExportUnit, readings, totals, events };
    }

    const buffer = await buildBcsxWorkbook(payload);
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileNameFor(unit, date)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Không xuất được file.", error);
    return Response.json({ error: "Không xuất được file." }, { status: 500 });
  }
}
