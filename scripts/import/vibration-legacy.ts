/**
 * Nhập dữ liệu độ rung từ bản sao lưu VibraControl cũ (backup-*.json.gz) vào Postgres.
 *
 *   npx tsx scripts/import/vibration-legacy.ts [--file "<đường dẫn .json.gz>"] [--dry-run]
 *
 * Chạy lại được (idempotent):
 *  - Thiết bị: gộp theo config.id (dòng updated_at/id mới nhất thắng), upsert theo legacyId. KHÔNG đụng cột ánh xạ
 *    (equipmentSeq/mapStatus/mapScore/mapNote) của thiết bị đã có.
 *  - Số đo: chỉ thêm bản ghi chưa có (theo id cũ), không ghi đè bản đã có / đã sửa trên web.
 * Phân loại số đo: Mill theo ca → MILL, TBNT theo ca → TBNT, "Nhập liệu" của 14 động cơ MNK → MNK (ca theo tên máy),
 * "Nhập liệu" còn lại → WEEKLY, file Excel lịch sử → HISTORY_XLSX.
 */
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { classifyDevice } from "../../lib/vibration/classify";
import { VIB_LABELS, VIB_VALUE_COUNT, type ShiftId, type VibKind } from "../../lib/vibration/constants";

const DEFAULT_FILE = "D:\\Dự an AI\\Web PXVH1\\vibracontrol-backup\\2026\\backup-2026-11-22.json.gz";
const prisma = new PrismaClient();

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dryRun = process.argv.includes("--dry-run");

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const parse = (s: unknown): Json => {
  try { const v = typeof s === "string" ? JSON.parse(s) : s; return isObj(v) ? v : {}; } catch { return {}; }
};
/** PHP đổi {} rỗng thành [] — coi [] / {} rỗng là null. */
const objOrNull = (v: unknown): Json | null => (isObj(v) && Object.keys(v).length ? v : null);
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const canonArea = (a: string) => a.replace(/^MILL S([12])$/i, "Máy nghiền S$1");

interface DeviceRow { id: number; active: number; system_name: string; sort_order: number; config: string; updated_at: string | null }
interface RecordRow { id: string; device_id: string; rec_date: string | null; data: string; created_at: string | null }

function buildLabels(raw: unknown): string[] {
  const labels = Array.isArray(raw) && raw.length === VIB_VALUE_COUNT ? raw.map(String) : [...VIB_LABELS];
  return labels.map((l) => l.replace(/(Biên độ [XY]) \(mm\)/, "$1 (µm)"));
}

async function main() {
  const file = arg("--file") ?? DEFAULT_FILE;
  const backup = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as { tables: { devices: DeviceRow[]; records: RecordRow[] } };
  const { devices: deviceRows, records: recordRows } = backup.tables;

  // ---- Thiết bị: dedupe theo config.id, bản mới nhất thắng ----
  const newest = new Map<string, { row: DeviceRow; cfg: Json }>();
  for (const row of deviceRows) {
    const cfg = parse(row.config);
    const legacyId = String(cfg.id ?? "");
    if (!legacyId) continue;
    const cur = newest.get(legacyId);
    const better = !cur || String(row.updated_at ?? "") > String(cur.row.updated_at ?? "") ||
      (String(row.updated_at ?? "") === String(cur.row.updated_at ?? "") && row.id > cur.row.id);
    if (better) newest.set(legacyId, { row, cfg });
  }

  const deviceIdByLegacy = new Map<string, string>();
  const kindCounts: Record<string, number> = {};
  let createdDevices = 0;
  for (const [legacyId, { row, cfg }] of newest) {
    const area = canonArea(String(cfg.area ?? ""));
    const name = String(cfg.name ?? "");
    const active = typeof cfg.active === "boolean" ? cfg.active : row.active !== 0;
    const data = {
      area,
      system: String(cfg.system ?? row.system_name ?? ""),
      name,
      active,
      sortOrder: row.sort_order ?? 0,
      labels: buildLabels(cfg.labels),
      measurementConfig: (isObj(cfg.measurementConfig) ? cfg.measurementConfig : {}) as Prisma.InputJsonValue,
      alertConfig: (isObj(cfg.alertConfig) ? cfg.alertConfig : {}) as Prisma.InputJsonValue,
      machine: (objOrNull(cfg.machine) ?? undefined) as Prisma.InputJsonValue | undefined,
      measureGroups: Array.isArray(cfg.measureGroups) ? cfg.measureGroups.filter((g): g is string => typeof g === "string") : [],
    };
    const k = classifyDevice({ area, name, active }).kind;
    kindCounts[k] = (kindCounts[k] ?? 0) + 1;
    if (dryRun) { deviceIdByLegacy.set(legacyId, legacyId); continue; }
    const existing = await prisma.vibrationDevice.findUnique({ where: { legacyId }, select: { id: true } });
    const saved = existing
      ? await prisma.vibrationDevice.update({ where: { legacyId }, data: { ...data, machine: data.machine ?? undefined } })
      : await prisma.vibrationDevice.create({ data: { legacyId, ...data } });
    if (!existing) createdDevices++;
    deviceIdByLegacy.set(legacyId, saved.id);
  }

  // ---- Số đo ----
  type Out = Prisma.VibrationRecordCreateManyInput;
  const out: Out[] = [];
  const perKind: Record<string, number> = {};
  let orphan = 0;
  for (const r of recordRows) {
    const deviceId = deviceIdByLegacy.get(r.device_id);
    const dev = newest.get(r.device_id);
    if (!deviceId || !dev) { orphan++; continue; }
    const data = parse(r.data);
    const source = String(data.source ?? "");
    const area = canonArea(String(dev.cfg.area ?? ""));
    const name = String(dev.cfg.name ?? "");
    const date = typeof data.date === "string" && data.date ? data.date : r.rec_date;
    let kind: VibKind;
    let shift: ShiftId | null = null;
    let millData: Json | null = null;
    if (source === "Mill theo ca") {
      kind = "MILL";
      millData = parse(data.millData);
      shift = (millData.shift as ShiftId) ?? null;
    } else if (source === "TBNT theo ca") {
      kind = "TBNT";
      shift = (data.tbntShift as ShiftId) ?? null;
    } else if (source === "Nhập liệu") {
      const c = classifyDevice({ area, name, active: true });
      if (c.kind === "MNK") { kind = "MNK"; shift = c.shift; } else kind = "WEEKLY";
    } else kind = "HISTORY_XLSX";

    const values = Array.isArray(data.values) ? data.values : [];
    const savedAt = typeof data.savedAt === "string" && !Number.isNaN(Date.parse(data.savedAt))
      ? new Date(data.savedAt)
      : r.created_at ? new Date(r.created_at.replace(" ", "T") + "Z") : new Date();
    out.push({
      id: String(data.id ?? r.id),
      deviceId,
      date: date || null,
      kind,
      shift,
      person: String(data.person ?? ""),
      measureTime: String(data.measureTime ?? ""),
      power: num(data.power),
      values: values as Prisma.InputJsonValue,
      millData: (millData ?? undefined) as Prisma.InputJsonValue | undefined,
      note: String(data.note ?? ""),
      sourceLabel: source,
      savedAt,
      legacy: true,
    });
  }

  // Một bản / thiết bị / ngày (WEEKLY, MNK) hoặc / ngày / ca (MILL, TBNT): giữ bản lưu sau cùng.
  const keyed = new Map<string, Out>();
  const keep: Out[] = [];
  let droppedDup = 0;
  for (const rec of out) {
    if (rec.kind === "HISTORY_XLSX" || !rec.date) { keep.push(rec); continue; }
    const key = [rec.deviceId, rec.date, rec.kind, rec.kind === "MILL" || rec.kind === "TBNT" ? rec.shift : ""].join("|");
    const prev = keyed.get(key);
    if (!prev) { keyed.set(key, rec); continue; }
    droppedDup++;
    if ((rec.savedAt as Date) > (prev.savedAt as Date)) keyed.set(key, rec);
  }
  keep.push(...keyed.values());
  for (const rec of keep) perKind[rec.kind as string] = (perKind[rec.kind as string] ?? 0) + 1;

  let inserted = 0;
  let refreshed = 0;
  if (!dryRun) {
    for (let i = 0; i < keep.length; i += 500) {
      const res = await prisma.vibrationRecord.createMany({ data: keep.slice(i, i + 500), skipDuplicates: true });
      inserted += res.count;
    }
    // Bản đã có: chỉ cập nhật khi vẫn nguyên từ web cũ (legacy, chưa ai sửa trên web mới) và web cũ lưu sau hơn.
    const existing = await prisma.vibrationRecord.findMany({
      where: { id: { in: keep.map((r) => r.id as string) }, legacy: true, updatedById: null },
      select: { id: true, savedAt: true },
    });
    const savedAtById = new Map(existing.map((r) => [r.id, r.savedAt]));
    for (const rec of keep) {
      const old = savedAtById.get(rec.id as string);
      if (!old || (rec.savedAt as Date) <= old) continue;
      const { id, ...data } = rec;
      await prisma.vibrationRecord.update({ where: { id: id as string }, data });
      refreshed++;
    }
  }

  console.log(`${dryRun ? "[DRY-RUN] " : ""}File: ${file}`);
  console.log(`Dòng thiết bị trong sao lưu: ${deviceRows.length} → thiết bị duy nhất: ${newest.size} (mới tạo: ${createdDevices})`);
  console.log(`  Đang hoạt động: ${[...newest.values()].filter(({ row, cfg }) => (typeof cfg.active === "boolean" ? cfg.active : row.active !== 0)).length}`);
  console.log("  Theo màn nhập (phân loại):", JSON.stringify(kindCounts));
  console.log(`Số đo trong sao lưu: ${recordRows.length}; mồ côi (không thấy thiết bị): ${orphan}; trùng khoá bị gộp: ${droppedDup}`);
  console.log("  Theo loại (sau gộp):", JSON.stringify(perKind));
  if (!dryRun) console.log(`  Ghi mới vào DB: ${inserted}; cập nhật bản web cũ đã sửa: ${refreshed} (đã có từ trước: ${keep.length - inserted})`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
