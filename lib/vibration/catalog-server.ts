import type { Prisma, VibrationDevice } from "@prisma/client";
import { fail } from "@/lib/api";
import { alertError, normalizeAlertConfig, normalizeMeasurementConfig, type DevicePatch } from "./catalog";

const key = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");

export const sameDeviceKey = (a: { area: string; system: string; name: string }, b: { area: string; system: string; name: string }) =>
  a.area === b.area && key(a.system) === key(b.system) && key(a.name) === key(b.name);

const asObj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Gộp patch vào bản ghi hiện có → dữ liệu Prisma. Ném Response 400 nếu cấu hình không hợp lệ. */
export function buildUpdate(current: VibrationDevice, patch: DevicePatch): Prisma.VibrationDeviceUpdateInput {
  const data: Prisma.VibrationDeviceUpdateInput = {};
  if (patch.area !== undefined) data.area = patch.area;
  if (patch.system !== undefined) data.system = patch.system;
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.active !== undefined) data.active = patch.active;
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (patch.measureGroups) data.measureGroups = { set: patch.measureGroups };
  if (patch.measurementConfig) {
    const cur = normalizeMeasurementConfig(current.measurementConfig);
    const next = { ...asObj(current.measurementConfig) } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch.measurementConfig)) {
      if (v) next[k] = { ...cur[k as keyof typeof cur], ...(v.enabled !== undefined ? { enabled: v.enabled } : {}), ...(v.area ? { area: v.area } : {}) };
    }
    data.measurementConfig = next as Prisma.InputJsonValue;
  }
  if (patch.alertConfig) {
    const next = { ...normalizeAlertConfig(current.alertConfig), ...patch.alertConfig };
    const err = alertError(next);
    if (err) throw fail(`${current.name}: ${err}`, 400);
    data.alertConfig = { ...asObj(current.alertConfig), ...next } as Prisma.InputJsonValue;
  }
  if (patch.machine) data.machine = { ...asObj(current.machine), ...patch.machine } as Prisma.InputJsonValue;
  return data;
}

/** Cặp dự phòng A/B đối xứng: gán A↔B thì B cũng trỏ về A (bỏ cặp cũ nếu có). */
export async function syncSparePair(tx: Prisma.TransactionClient, device: VibrationDevice, nextPair: string) {
  const old = String(asObj(device.machine).sparePair ?? "");
  if (old === nextPair) return;
  const setPair = async (legacyId: string, value: string) => {
    const d = await tx.vibrationDevice.findUnique({ where: { legacyId } });
    if (!d) return;
    const m = asObj(d.machine);
    if (value === "" && m.sparePair !== device.legacyId) return;
    await tx.vibrationDevice.update({ where: { id: d.id }, data: { machine: { ...m, sparePair: value } as Prisma.InputJsonValue } });
  };
  if (old) await setPair(old, "");
  if (nextPair) await setPair(nextPair, device.legacyId);
}
