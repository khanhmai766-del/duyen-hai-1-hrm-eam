import type { ShiftId, VibKind } from "./constants";

export type MapStatus = "none" | "auto" | "confirmed";
/** Màn nhập mà thiết bị thuộc về (WEEKLY = Theo kỳ). */
export type DeviceKind = "WEEKLY" | "MNK" | "MILL" | "TBNT";

export interface AlertConfig {
  enabled: boolean;
  vibration: number;
  vibrationDanger: number;
  temperature: number;
  temperatureDanger: number;
}

/** Ô nhập: số không âm hoặc null. */
export type VibCell = number | null;

export interface VibrationDeviceDto {
  id: string;
  legacyId: string;
  area: string;
  system: string;
  name: string;
  active: boolean;
  sortOrder: number;
  labels: string[];
  measurementConfig: Record<string, { enabled?: boolean } | undefined>;
  alertConfig: Partial<AlertConfig>;
  machine: Record<string, unknown> | null;
  measureGroups: string[];
  kind: DeviceKind;
  /** Ca của thiết bị (chỉ MNK / MILL; suy ra từ tên). */
  shift: ShiftId | null;
  equipmentSeq: string | null;
  equipmentName: string | null;
  mapStatus: MapStatus;
  mapScore: number | null;
  mapNote: string | null;
  /** Gợi ý tốt nhất cho thiết bị chưa gán (null khi đã gán/không có). */
  suggestSeq: string | null;
  suggestName: string | null;
  suggestScore: number | null;
}

export interface VibrationRecordDto {
  id: string;
  deviceId: string;
  date: string | null;
  kind: VibKind;
  shift: ShiftId | null;
  person: string;
  measureTime: string;
  power: number | null;
  values: unknown[];
  millData: Record<string, unknown> | null;
  note: string;
  sourceLabel: string;
  savedAt: string;
}

export interface VibrationRecordInput {
  deviceId: string;
  person: string;
  measureTime?: string;
  power?: number | null;
  values?: VibCell[];
  millData?: Record<string, number | null> | null;
  note?: string;
}

/** Một dòng "Lịch sử đo độ rung" của thiết bị trong cây (GET /api/vibration/history). */
export interface VibrationHistoryRow {
  id: string;
  deviceId: string;
  deviceName: string;
  date: string | null;
  kind: VibKind;
  shift: ShiftId | null;
  person: string;
  maxVelocity: number | null; // mm/s
  maxTemp: number | null; // °C
  note: string;
}
