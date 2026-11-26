import type { VibrationDevice, VibrationRecord } from "@prisma/client";
import { fail, requireUser } from "@/lib/api";
import { requirePermissionLevel } from "@/lib/rbac-guard";
import { VIBRATION_ENTRY_LEVELS, VIBRATION_MANAGE_LEVELS, VIBRATION_VIEW_LEVELS } from "@/lib/vibration-permissions";
import { classifyDevice } from "./classify";
import { canEditVibrationArea, vibrationAccessFor, vibrationDenyMessage, type VibrationUserLike } from "./position-access";
import type { VibKind } from "./constants";
import type { ShiftId } from "./constants";
import type { VibrationDeviceDto, VibrationRecordDto, MapStatus } from "./types";

export async function requireVibrationView() {
  const user = await requireUser();
  await requirePermissionLevel(user, "vibration-view", [...VIBRATION_VIEW_LEVELS], "Bạn không có quyền xem số đo độ rung");
  return user;
}
export async function requireVibrationEntry() {
  const user = await requireUser();
  await requirePermissionLevel(user, "vibration-view", [...VIBRATION_VIEW_LEVELS], "Bạn không có quyền xem số đo độ rung");
  // Như web độ rung cũ: người giữ cương vị vận hành có thiết bị rung được nhập (giới hạn theo cương vị ở
  // assertVibrationAreasEditable) bất kể vai trò; quyền "vibration-entry" theo vai trò dành cho người không có cương vị đó.
  if (vibrationAccessFor(user).editAreas.length > 0) return user;
  await requirePermissionLevel(user, "vibration-entry", [...VIBRATION_ENTRY_LEVELS], "Bạn không có quyền nhập số đo độ rung");
  return user;
}
export async function requireVibrationManage() {
  const user = await requireUser();
  await requirePermissionLevel(user, "vibration-view", [...VIBRATION_VIEW_LEVELS], "Bạn không có quyền xem số đo độ rung");
  await requirePermissionLevel(user, "vibration-manage", [...VIBRATION_MANAGE_LEVELS], "Bạn không có quyền quản lý ánh xạ thiết bị độ rung");
  return user;
}

/** Phân quyền theo cương vị (app cũ): chỉ admin vượt qua; còn lại chỉ ghi thiết bị có area thuộc editAreas. Ném 403 nếu có thiết bị ngoài phạm vi. */
export function assertVibrationAreasEditable(user: VibrationUserLike, devices: { area: string; name: string }[]) {
  const access = vibrationAccessFor(user);
  if (access.admin || !devices.length) return;
  const denied = devices.filter((d) => !canEditVibrationArea(access, d.area));
  if (denied.length) throw fail(vibrationDenyMessage(access, denied.map((d) => d.name)), 403);
}

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function toDeviceDto(row: VibrationDevice, equipmentName: string | null = null, suggestName: string | null = null): VibrationDeviceDto {
  const { kind, shift } = classifyDevice(row);
  return {
    id: row.id,
    legacyId: row.legacyId,
    area: row.area,
    system: row.system,
    name: row.name,
    active: row.active,
    sortOrder: row.sortOrder,
    labels: Array.isArray(row.labels) ? (row.labels as string[]) : [],
    measurementConfig: obj(row.measurementConfig) as VibrationDeviceDto["measurementConfig"],
    alertConfig: obj(row.alertConfig),
    machine: row.machine ? obj(row.machine) : null,
    measureGroups: row.measureGroups,
    kind,
    shift,
    equipmentSeq: row.equipmentSeq,
    equipmentName,
    mapStatus: row.mapStatus as MapStatus,
    mapScore: row.mapScore,
    mapNote: row.mapNote,
    suggestSeq: row.suggestSeq,
    suggestName,
    suggestScore: row.suggestScore,
  };
}

export function toRecordDto(r: VibrationRecord): VibrationRecordDto {
  return {
    id: r.id,
    deviceId: r.deviceId,
    date: r.date,
    kind: r.kind as VibKind,
    shift: (r.shift as ShiftId | null) ?? null,
    person: r.person,
    measureTime: r.measureTime,
    power: r.power,
    values: Array.isArray(r.values) ? (r.values as unknown[]) : [],
    millData: r.millData ? obj(r.millData) : null,
    note: r.note,
    sourceLabel: r.sourceLabel,
    savedAt: r.savedAt.toISOString(),
  };
}
