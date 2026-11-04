export const qlktFieldLabels: Record<string, string> = {
  B: "Đầu cực S1",
  C: "Điểm bán S1",
  F: "Số giờ phát S1",
  H: "Đầu cực S2",
  I: "Điểm bán S2",
  L: "Số giờ phát S2",
  X: "Dầu FO tiêu thụ",
  AE: "Than tiêu thụ S1",
  AF: "Than tiêu thụ S2",
  AJ: "Nhiệt trị",
  AR: "Than tồn kho 06h00",
  AT: "Than nhập trong ngày",
  CC: "Nước bổ sung S1",
  CD: "Nước bổ sung S2",
  CS: "Thời gian dự phòng",
  CT: "Thời gian sự cố",
  CU: "Thời gian sửa chữa, bảo dưỡng",
  CV: "Thời gian khởi động",
  GRID_RECEIVE_S1: "Điện nhận lưới S1 · xuất tuyến 285",
  GRID_RECEIVE_S2: "Điện nhận lưới S2 · xuất tuyến 283",
  DA: "Công suất đầu cực BQ S1",
  DB: "Công suất đầu cực BQ S2",
  DC: "Tổn thất khói khô BQ S1",
  DD: "Tổn thất khói khô BQ S2",
  DE: "Chân không bình ngưng BQ S1",
  DF: "Chân không bình ngưng BQ S2",
  DG: "Nhiệt độ nước làm mát tuần hoàn BQ S1",
  DH: "Nhiệt độ nước làm mát tuần hoàn BQ S2",
  J157: "Điện đầu cực PMIS S1 (MW)",
  K157: "Điện xuất tuyến PMIS S1 (MW)",
  J158: "Điện đầu cực PMIS S2 (MW)",
  K158: "Điện xuất tuyến PMIS S2 (MW)",
  C181: "02-PĐ Công suất đặt (MW)",
  D181: "02-PĐ Điện năng tác dụng đầu cực (Tr. kWh)",
  E181: "02-PĐ Điện năng phản kháng đầu cực (Tr. kVArh)",
  F181: "02-PĐ Điện năng giao (Tr. kWh)",
  G181: "02-PĐ Điện năng nhận (Tr. kWh)",
  H181: "02-PĐ Điện năng nhận chạy bù (Tr. kWh)",
  I181: "02-PĐ Tổn thất MBA kích từ (Tr. kWh)",
  J181: "02-PĐ Tổn thất MBA nâng (Tr. kWh)",
  K181: "02-PĐ Điện năng tự dùng (Tr. kWh)",
  L181: "02-PĐ Tỷ lệ tự dùng (%)",
  M181: "02-PĐ Nhiên liệu sử dụng (Tr. Tấn)",
  N181: "02-PĐ Suất hao nhiên liệu thô (g/kWh)",
  O181: "02-PĐ Suất hao nhiên liệu tinh (g/kWh)",
  P181: "02-PĐ Suất hao nhiệt thô (kJ/kWh)",
  Q181: "02-PĐ Suất hao nhiệt tinh (kJ/kWh)",
  R181: "02-PĐ Hệ số sử dụng",
  S181: "02-PĐ Hệ số đáp ứng",
  T181: "02-PĐ Độ phát thải",
};

export type QlktSyncEntry = {
  fieldCode: string;
  value: string;
  sourceLabel: string;
};

export type QlktSyncPayload = {
  version: 1;
  operatingDate: string;
  sourcePage: string;
  entries: QlktSyncEntry[];
  unavailableHeatRateUnits?: ("1" | "2")[];
};

export type QlktPpaReading = {
  meter: string;
  channel: string;
  operatingDate: string;
  total: number;
  intervals: number[];
  sourceName: string;
};

export type QlktPpaSyncPayload = {
  version: 1;
  kind: "ppa-meter";
  operatingDate: string;
  sourcePage: string;
  readings: QlktPpaReading[];
  missingReceiveMeters?: string[];
};

export type QlktOperatingEvent = {
  startAt: string;
  endAt: string;
  eventType: number;
  description: string;
};

export type QlktEventSyncPayload = {
  version: 1;
  operatingDate: string;
  s1: QlktOperatingEvent[];
  s2: QlktOperatingEvent[];
  totalCount: number;
};

export type QlktUnifiedSyncPayload = {
  version: 1;
  kind: "unified-sync";
  operatingDate: string;
  sourcePage: string;
  daily: QlktSyncPayload;
  ppa: QlktPpaSyncPayload;
  heatRate: QlktSyncPayload;
  events: QlktEventSyncPayload;
  pmis02Pd: QlktSyncPayload;
};

const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const numericPattern = /^-?\d+(?:\.\d+)?$/;

export function validateQlktSyncPayload(value: unknown): QlktSyncPayload | null {
  try {
    const raw = value as Partial<QlktSyncPayload>;
    if (raw.version !== 1 || typeof raw.operatingDate !== "string" || !datePattern.test(raw.operatingDate) || typeof raw.sourcePage !== "string" || !Array.isArray(raw.entries)) return null;
    const seen = new Set<string>();
    const entries = raw.entries.flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const fieldCode = String(item.fieldCode || ""), value = String(item.value || "").trim(), sourceLabel = String(item.sourceLabel || "QLKT").slice(0, 160);
      if (!(fieldCode in qlktFieldLabels) || seen.has(fieldCode)) return [];
      if (fieldCode !== "T181" && !numericPattern.test(value)) return [];
      seen.add(fieldCode);
      return [{ fieldCode, value, sourceLabel }];
    });
    const unavailableHeatRateUnits = raw.unavailableHeatRateUnits;
    if (unavailableHeatRateUnits !== undefined && (!Array.isArray(unavailableHeatRateUnits)
      || unavailableHeatRateUnits.some(unit => unit !== "1" && unit !== "2"))) return null;
    if (unavailableHeatRateUnits?.some(unit => (unit === "1" ? ["DA", "DC", "DE", "DG"] : ["DB", "DD", "DF", "DH"])
      .some(code => entries.some(entry => entry.fieldCode === code)))) return null;
    const bothStopped = unavailableHeatRateUnits?.includes("1") && unavailableHeatRateUnits.includes("2") && raw.entries.length === 0;
    return entries.length || bothStopped ? { version: 1, operatingDate: raw.operatingDate, sourcePage: raw.sourcePage.slice(0, 500), entries,
      ...(unavailableHeatRateUnits?.length ? { unavailableHeatRateUnits: [...new Set(unavailableHeatRateUnits)] } : {}) } : null;
  } catch {
    return null;
  }
}

export function decodeQlktSyncHash(hash: string): QlktSyncPayload | null {
  const prefix = "#qlkt-sync=";
  if (!hash.startsWith(prefix)) return null;
  try {
    const encoded = hash.slice(prefix.length).replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0));
    return validateQlktSyncPayload(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

export function validateQlktPpaSyncPayload(value: unknown): QlktPpaSyncPayload | null {
  try {
    const raw = value as Partial<QlktPpaSyncPayload>;
    if (raw.version !== 1 || raw.kind !== "ppa-meter" || typeof raw.operatingDate !== "string" || !datePattern.test(raw.operatingDate) || typeof raw.sourcePage !== "string" || !Array.isArray(raw.readings)) return null;
    const requiredReadings = new Set(["DHA_S1|kwhgiao", "DH1_285M|kwhgiao", "DH1_285M|kwhnhan", "DHA_S2|kwhgiao", "DH1_283M|kwhgiao", "DH1_283M|kwhnhan"]), seen = new Set<string>();
    const readings = raw.readings.flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const meter = String(item.meter || "").toUpperCase(), channelKey = String(item.channel || "").toLowerCase(), key = [meter, channelKey].join("|");
      if (!requiredReadings.has(key) || seen.has(key) || item.operatingDate !== raw.operatingDate || !Array.isArray(item.intervals) || item.intervals.length !== 48) return [];
      const intervals = item.intervals.map(Number), total = Number(item.total);
      if (!Number.isFinite(total) || total < 0 || intervals.some(value => !Number.isFinite(value) || value < 0)) return [];
      seen.add(key);
      return [{ meter, channel: channelKey === "kwhnhan" ? "kWhNhan" : "kWhGiao", operatingDate: raw.operatingDate, total, intervals, sourceName: String(item.sourceName || "QLKT · Số liệu đo đếm công tơ").slice(0, 500) }];
    });
    const missingReceiveMeters = raw.missingReceiveMeters === undefined ? [] : raw.missingReceiveMeters;
    if (!Array.isArray(missingReceiveMeters) || new Set(missingReceiveMeters).size !== missingReceiveMeters.length) return null;
    for (const meter of missingReceiveMeters) {
      if (!["DH1_285M", "DH1_283M"].includes(meter) || seen.has(`${meter}|kwhnhan`) ||
        raw.readings.some(item => item && String(item.meter).toUpperCase() === meter && String(item.channel).toLowerCase() === "kwhnhan")) return null;
      const grossMeter = meter === "DH1_285M" ? "DHA_S1" : "DHA_S2";
      if (![meter, grossMeter].every(code => readings.some(item => item.meter === code && item.channel === "kWhGiao" && item.total === 0 && item.intervals.every(value => value === 0)))) return null;
      requiredReadings.delete(`${meter}|kwhnhan`);
    }
    return readings.length === requiredReadings.size && [...requiredReadings].every(key => seen.has(key))
      ? { version: 1, kind: "ppa-meter", operatingDate: raw.operatingDate, sourcePage: raw.sourcePage.slice(0, 500), readings,
        ...(missingReceiveMeters.length ? { missingReceiveMeters } : {}) } : null;
  } catch {
    return null;
  }
}

function validateEventPayload(value: unknown, operatingDate: string): QlktEventSyncPayload | null {
  try {
    const raw = value as Partial<QlktEventSyncPayload>;
    if (raw.version !== 1 || raw.operatingDate !== operatingDate || !Array.isArray(raw.s1) || !Array.isArray(raw.s2)) return null;
    const clean = (items: QlktOperatingEvent[]) => items.map(item => {
      const startAt = String(item?.startAt || ""), endAt = String(item?.endAt || "");
      const eventType = Number(item?.eventType), description = String(item?.description || "").trim();
      if (!new RegExp(`^${operatingDate} (?:[01]\\d|2[0-3]):[0-5]\\d$`).test(startAt) || (endAt && !/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d$/.test(endAt)) || !Number.isInteger(eventType) || eventType < 1 || eventType > 5 || description.length > 500) {
        throw new Error("Sự kiện QLKT không hợp lệ.");
      }
      return { startAt, endAt, eventType, description };
    });
    const s1 = clean(raw.s1), s2 = clean(raw.s2);
    return { version: 1, operatingDate, s1, s2, totalCount: s1.length + s2.length };
  } catch {
    return null;
  }
}

export function validateQlktUnifiedSyncPayload(value: unknown): QlktUnifiedSyncPayload | null {
  try {
    const raw = value as Partial<QlktUnifiedSyncPayload>;
    if (raw.version !== 1 || raw.kind !== "unified-sync" || typeof raw.operatingDate !== "string" || !datePattern.test(raw.operatingDate) || typeof raw.sourcePage !== "string") return null;
    const daily = validateQlktSyncPayload(raw.daily);
    const ppa = validateQlktPpaSyncPayload(raw.ppa);
    const heatRate = validateQlktSyncPayload(raw.heatRate);
    const events = validateEventPayload(raw.events, raw.operatingDate);
    const pmis02Pd = validateQlktSyncPayload(raw.pmis02Pd);
    if (!daily || !ppa || ppa.readings.length !== 6 || !heatRate || !events || !pmis02Pd) return null;
    if ([daily.operatingDate, ppa.operatingDate, heatRate.operatingDate, pmis02Pd.operatingDate].some(date => date !== raw.operatingDate)) return null;
    const hasCodes = (payload: QlktSyncPayload, codes: string[]) => codes.every(code => payload.entries.some(entry => entry.fieldCode === code));
    if (!hasCodes(daily, ["F", "L", "AR", "CC", "CD", "CS", "CT", "CU", "CV"])) return null;
    const hasS1HeatRate = hasCodes(heatRate, ["DA", "DC", "DE", "DG"]);
    const hasS2HeatRate = hasCodes(heatRate, ["DB", "DD", "DF", "DH"]);
    if (!hasS1HeatRate && !heatRate.unavailableHeatRateUnits?.includes("1")) return null;
    if (!hasS2HeatRate && !heatRate.unavailableHeatRateUnits?.includes("2")) return null;
    if (!hasCodes(pmis02Pd, ["J157", "K157", "J158", "K158", "C181", "D181", "F181"])) return null;
    return { version: 1, kind: "unified-sync", operatingDate: raw.operatingDate, sourcePage: raw.sourcePage.slice(0, 500), daily, ppa, heatRate, events, pmis02Pd };
  } catch {
    return null;
  }
}

export function decodeQlktPpaSyncHash(hash: string): QlktPpaSyncPayload | null {
  const prefix = "#qlkt-sync=";
  if (!hash.startsWith(prefix)) return null;
  try {
    const encoded = hash.slice(prefix.length).replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0));
    return validateQlktPpaSyncPayload(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

export function normalizeQlktValue(value: string) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  const parsed = Number(clean);
  // Keep the precision reported by QLKT. In particular, daily electricity is
  // converted from MWh to million kWh before reaching this function, so two
  // decimal places would discard up to 10,000 kWh and distort heat-rate
  // calculations. String(Number(...)) only normalizes the numeric text; it
  // does not intentionally round the source value.
  return Number.isFinite(parsed) ? String(parsed) : clean;
}
