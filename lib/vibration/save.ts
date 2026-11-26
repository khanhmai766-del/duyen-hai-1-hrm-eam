import type { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { classifyDevice } from "./classify";
import { MEASURE_GROUP_RANGES, SHIFT_IDS, VIB_ENTRY_KINDS, VIB_VALUE_COUNT, type ShiftId } from "./constants";
import { actualDateOf, CELL_ERROR, isValidDate, normalizeTime, parseCell, timeInShift } from "./parse";
import type { DeviceKind } from "./types";

type EntryKind = (typeof VIB_ENTRY_KINDS)[number];

/** Màn nhập nào được ghi cho loại thiết bị nào (Theo kỳ nhận mọi thiết bị trừ 14 động cơ MNK). */
const ALLOWED: Record<EntryKind, DeviceKind[]> = {
  WEEKLY: ["WEEKLY", "MILL", "TBNT"],
  MNK: ["MNK"],
  MILL: ["MILL"],
  TBNT: ["TBNT"],
};
const MILL_KEY_RE = /^(b[1-6](v|d)[XYZ]|b[1-6]t|gearSmall|gearRing|oil)$/;

export interface SaveBody {
  kind?: unknown;
  date?: unknown;
  shift?: unknown;
  items?: unknown;
}

function enabledForIndex(config: unknown, i: number) {
  const cfg = config && typeof config === "object" ? (config as Record<string, { enabled?: boolean } | undefined>) : {};
  const group = MEASURE_GROUP_RANGES.find((g) => i >= g.from && i <= g.to);
  return !group || cfg[group.key]?.enabled !== false;
}

/** Kiểm tra toàn bộ rồi upsert trong một transaction. Ném Response (fail) nếu sai. */
export async function saveVibrationRecords(userId: string, body: SaveBody) {
  const kind = body.kind as EntryKind;
  if (!VIB_ENTRY_KINDS.includes(kind)) throw fail("Loại số đo không hợp lệ", 400);
  if (!isValidDate(body.date)) throw fail("Ngày không hợp lệ (định dạng YYYY-MM-DD)", 400);
  const date = body.date;
  const needsShift = kind === "MILL" || kind === "TBNT";
  let shift: ShiftId | null = null;
  if (needsShift) {
    if (!SHIFT_IDS.includes(body.shift as ShiftId)) throw fail("Vui lòng chọn ca (sang, chieu, dem)", 400);
    shift = body.shift as ShiftId;
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 200) {
    throw fail("Danh sách thiết bị cần lưu không hợp lệ", 400);
  }

  const items = body.items as Record<string, unknown>[];
  const ids = items.map((it) => String(it?.deviceId ?? ""));
  if (new Set(ids).size !== ids.length) throw fail("Một thiết bị xuất hiện nhiều lần trong danh sách", 400);
  const devices = await prisma.vibrationDevice.findMany({ where: { id: { in: ids } } });
  const byId = new Map(devices.map((d) => [d.id, d]));

  const existingWhere: Prisma.VibrationRecordWhereInput = { deviceId: { in: ids }, date, kind, ...(shift ? { shift } : {}) };
  const existing = await prisma.vibrationRecord.findMany({ where: existingWhere, orderBy: { savedAt: "desc" } });
  const existingByDevice = new Map<string, (typeof existing)[number]>();
  for (const r of existing) if (!existingByDevice.has(r.deviceId)) existingByDevice.set(r.deviceId, r);

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const skipped: string[] = [];

  for (const item of items) {
    const deviceId = String(item.deviceId ?? "");
    const device = byId.get(deviceId);
    if (!device) throw fail("Không tìm thấy thiết bị độ rung đã chọn", 404);
    const label = `${device.name}`;
    if (!ALLOWED[kind].includes(classifyDevice(device).kind)) throw fail(`Thiết bị “${label}” không thuộc màn nhập này`, 400);
    const prev = existingByDevice.get(deviceId);

    const person = String(item.person ?? "").trim().slice(0, 120);
    if (!person && !prev) throw fail("Vui lòng nhập người đo.", 400);

    let measureTime: string | undefined;
    if (item.measureTime !== undefined) {
      const t = normalizeTime(item.measureTime);
      if (t === null) throw fail(`Giờ đo của “${label}” không hợp lệ (dùng HH:mm, ví dụ 14:30)`, 400);
      if (t && shift && !timeInShift(t, shift)) throw fail("Giờ đo không thuộc ca đã chọn.", 400);
      measureTime = t;
    }
    const note = item.note === undefined ? undefined : String(item.note ?? "").trim().slice(0, 500);

    let values: (number | null)[] = Array.from({ length: VIB_VALUE_COUNT }, () => null);
    if (kind !== "MILL") {
      if (item.values !== undefined) {
        if (!Array.isArray(item.values) || item.values.length !== VIB_VALUE_COUNT) throw fail(`Cần đủ ${VIB_VALUE_COUNT} ô số đo cho “${label}”`, 400);
        values = item.values.map((raw, i) => {
          const n = parseCell(raw);
          if (n === undefined) throw fail(`${CELL_ERROR} (“${label}”, ô ${i + 1})`, 400);
          return enabledForIndex(device.measurementConfig, i) ? n : null;
        });
      } else if (prev && Array.isArray(prev.values)) {
        values = (prev.values as unknown[]).map((v) => (typeof v === "number" ? v : null));
      }
    } else values = [];

    let power: number | null | undefined;
    if (item.power !== undefined && (kind === "WEEKLY" || kind === "MNK")) {
      const p = parseCell(item.power);
      if (p === undefined) throw fail(`Công suất của “${label}” phải là số không âm`, 400);
      power = p;
    }

    let millData: Record<string, unknown> | undefined;
    if (kind === "MILL") {
      const incoming = item.millData && typeof item.millData === "object" ? (item.millData as Record<string, unknown>) : {};
      const merged: Record<string, unknown> =
        prev?.millData && typeof prev.millData === "object" ? { ...(prev.millData as Record<string, unknown>) } : {};
      for (const [key, raw] of Object.entries(incoming)) {
        if (!MILL_KEY_RE.test(key)) continue;
        const n = parseCell(raw);
        if (n === undefined) throw fail(`${CELL_ERROR} (“${label}”, ${key})`, 400);
        merged[key] = n;
      }
      const time = measureTime ?? prev?.measureTime ?? "";
      millData = { ...merged, schemaVersion: 1, shift, actualDate: actualDateOf(date, shift!, time) };
    }

    const hasNumber =
      values.some((v) => v !== null) ||
      (millData ? Object.entries(millData).some(([k, v]) => MILL_KEY_RE.test(k) && typeof v === "number") : false);
    const finalNote = note ?? prev?.note ?? "";
    if (!hasNumber && !finalNote) {
      skipped.push(deviceId);
      continue;
    }

    const data = {
      person: person || prev?.person || "",
      measureTime: measureTime ?? prev?.measureTime ?? "",
      note: finalNote,
      values: values as Prisma.InputJsonValue,
      ...(power !== undefined ? { power } : {}),
      ...(millData ? { millData: millData as Prisma.InputJsonValue } : {}),
      savedAt: new Date(),
      updatedById: userId,
    };
    ops.push(
      prev
        ? prisma.vibrationRecord.update({ where: { id: prev.id }, data })
        : prisma.vibrationRecord.create({
            data: { ...data, deviceId, date, kind, shift: kind === "MNK" ? classifyDevice(device).shift : shift, sourceLabel: "Nhập liệu web", createdById: userId },
          })
    );
  }

  if (!ops.length) throw fail("Chưa có thiết bị nào được nhập thông số hoặc nhận xét.", 400);
  const saved = (await prisma.$transaction(ops)) as Awaited<ReturnType<typeof prisma.vibrationRecord.create>>[];
  return { saved, skipped, kind, date, shift };
}
