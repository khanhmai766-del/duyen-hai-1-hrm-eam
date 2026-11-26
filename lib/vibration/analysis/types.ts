/* eslint-disable @typescript-eslint/no-explicit-any */
// Kiểu dữ liệu của bộ phân tích rung.

/** Bản ghi đo đã chuẩn hoá về dạng bộ phân tích cần (cùng hình dạng `record` của ứng dụng VibraControl cũ). */
export interface AnalysisRecord {
  id?: string;
  date: string | null;
  measureTime?: string;
  person?: string;
  /** 23 giá trị (số/null; bản Excel lịch sử có thể là chuỗi). */
  values: unknown[];
  extra?: Record<string, unknown> | null;
  note?: string;
  savedAt?: string;
  /** Loại bản ghi: WEEKLY | MNK | MILL | TBNT | HISTORY_XLSX. */
  kind?: string;
  shift?: string | null;
  /** MILL: b{1..6}v{X,Y,Z}, b{1..6}d{X,Y,Z}, b{1..6}t, gearSmall, gearRing, oil. */
  millData?: Record<string, unknown> | null;
}

export interface AnalysisAlertConfig {
  enabled: boolean;
  vibration: number;
  vibrationDanger: number;
  temperature: number;
  temperatureDanger: number;
}

/** Thiết bị cho bộ phân tích (tương đương `d` của ứng dụng cũ: có `records`). */
export interface AnalysisDevice {
  id: string;
  /** Mã cũ (legacyId) — để nhận liên kết sâu ?device=<mã cũ>. */
  legacyId?: string;
  name: string;
  area: string;
  system: string;
  machine?: Record<string, any> | null;
  alertConfig?: Partial<AnalysisAlertConfig> | null;
  /** `analysis.baselineFrom`: đặt lại mức nền sau sửa chữa / đại tu. */
  analysis?: { baselineFrom?: string } | null;
  records: AnalysisRecord[];
}

/** Tham số phân tích (vibration-analysis.js:analysisDefaults; lưu cài đặt chung của người dùng). */
export interface AnalysisSettings {
  requirePerson: boolean;
  loadTolerance: number;
  tempRise: number;
  changeRatio: number;
  baselineMin: number;
  baselineMax: number;
  stepRatio: number;
}

export interface BearingDef {
  key: string;
  label: string;
  name: string;
  part: "motor" | "machine";
  vx: number;
  dx: number;
  vy: number;
  dy: number;
  t: number;
}
