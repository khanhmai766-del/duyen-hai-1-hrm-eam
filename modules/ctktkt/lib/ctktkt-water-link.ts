import { calculateDailyWaterUsages, type WaterShiftLog } from "./water-report/calculations";

export const CTKTKT_WATER_LINKS = [
  { cell: "W72", label: "Công tơ nước demin S1 · 24h ngày D-1" },
  { cell: "X72", label: "Công tơ nước demin S1 · 24h ngày D" },
  { cell: "Z72", label: "Nước tái sinh hạt S1" },
  { cell: "W73", label: "Công tơ nước demin S2 · 24h ngày D-1" },
  { cell: "X73", label: "Công tơ nước demin S2 · 24h ngày D" },
  { cell: "Z73", label: "Nước tái sinh hạt S2" },
] as const;

// Các ô công tơ nước demin 24h (W72, X72, Z72, W73, X73, Z73) nay do Trưởng kíp điện nhập tay
// tại mốc 24h mỗi ngày trong Báo cáo Chỉ tiêu KTKT (nhóm tkd_trend), không còn bị khóa tự động từ mốc 22h.
export const CTKTKT_WATER_LINKED_CELLS = new Set<string>();

export function ctktktWaterLogFromRow(row: Record<string, unknown>): WaterShiftLog {
  return {
    logDate: String(row.logDate || row.log_date || ""),
    shiftTime: String(row.shiftTime || row.shift_time || ""),
    shiftTeam: "",
    shiftLeader: "",
    elecRecS1: 0,
    elecRecS2: 0,
    elecGenS1: 0,
    elecGenS2: 0,
    waterRecS1: Number(row.waterRecS1 ?? row.water_rec_s1 ?? 0),
    waterRecS2: Number(row.waterRecS2 ?? row.water_rec_s2 ?? 0),
    waterUsedS1: 0,
    waterUsedS2: 0,
    waterRatioS1: 0,
    waterRatioS2: 0,
    condenserRecS1: 0,
    condenserRecS2: 0,
    condenserUsedS1: 0,
    condenserUsedS2: 0,
    resinWaterS1_24h: Number(row.resinWaterS1_24h ?? row.resin_water_s1_24h ?? 0),
    resinWaterS2_24h: Number(row.resinWaterS2_24h ?? row.resin_water_s2_24h ?? 0),
  };
}

export function deriveCtktktCellsFromWater(shifts: WaterShiftLog[], operatingDate: string): Record<string, string> {
  const result: Record<string, string> = {};
  const dayShifts = shifts.filter(s => s.logDate === operatingDate);

  let s1 = 0;
  let s2 = 0;
  let hasShifts = false;

  for (const shift of dayShifts) {
    hasShifts = true;
    if (Number(shift.resinWaterS1_24h) > 0) {
      s1 = Math.max(s1, Number(shift.resinWaterS1_24h));
    }
    if (Number(shift.resinWaterS2_24h) > 0) {
      s2 = Math.max(s2, Number(shift.resinWaterS2_24h));
    }
  }

  if (!hasShifts) {
    const daily = calculateDailyWaterUsages(shifts).get(operatingDate);
    if (daily) {
      s1 = daily.resinWaterS1_24h;
      s2 = daily.resinWaterS2_24h;
      hasShifts = true;
    }
  }

  if (hasShifts) {
    result.Z72 = String(s1);
    result.Z73 = String(s2);
  }

  return result;
}
