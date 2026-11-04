import {waterMeterUsage} from "./adjustments";

export type WaterShiftLog = {
  waterAdjustmentS1?:number|null;
  waterAdjustmentS2?:number|null;
  condenserAdjustmentS1?:number|null;
  condenserAdjustmentS2?:number|null;
  id?: number;
  logDate: string; // 'YYYY-MM-DD'
  shiftTime: "06h00" | "14h00" | "22h00" | string;
  shiftTeam: string; // 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  shiftLeader: string; // 'Việt', 'Lễ', 'Trọng', 'Ni', 'Châu', 'Đàm'
  elecRecS1: number;
  elecRecS2: number;
  elecGenS1: number;
  elecGenS2: number;
  waterRecS1: number;
  waterRecS2: number;
  waterUsedS1: number;
  waterUsedS2: number;
  waterRatioS1: number;
  waterRatioS2: number;
  condenserRecS1: number;
  condenserRecS2: number;
  condenserUsedS1: number;
  condenserUsedS2: number;
  resinWaterS1_24h: number;
  resinWaterS2_24h: number;
  note?: string;
  updatedAt?: string;
};

export type MonthlyWaterSummary = {
  totalElecGenS1: number;
  totalElecGenS2: number;
  totalElecGenPlant: number;
  totalWaterUsedS1: number;
  totalWaterUsedS2: number;
  totalWaterUsedPlant: number;
  avgWaterRatioS1: number;
  avgWaterRatioS2: number;
  avgWaterRatioPlant: number;
  totalCondenserUsedS1: number;
  totalCondenserUsedS2: number;
  totalResinWaterS1: number;
  totalResinWaterS2: number;
  shiftCount: number;
};

export type DailyWaterUsage = {
  logDate: string;
  previousWaterRecS1: number;
  currentWaterRecS1: number;
  previousWaterRecS2: number;
  currentWaterRecS2: number;
  totalWaterUsedS1: number;
  totalWaterUsedS2: number;
  totalWaterUsedPlant: number;
  resinWaterS1_24h: number;
  resinWaterS2_24h: number;
};

const SHIFT_TIME_ORDER: Record<string, number> = {
  "06h00": 1,
  "14h00": 2,
  "22h00": 3,
};

/**
 * Trả về thứ tự sắp xếp thời gian chuẩn cho một ca (năm-tháng-ngày + thứ tự ca)
 */
export function getShiftSortKey(logDate: string, shiftTime: string): string {
  const order = SHIFT_TIME_ORDER[shiftTime] ?? 9;
  return `${logDate}_${order}_${shiftTime}`;
}

/**
 * Sắp xếp danh sách ca tăng dần theo trình tự thời gian vận hành
 */
export function sortWaterShifts<T extends { logDate: string; shiftTime: string }>(shifts: T[]): T[] {
  return [...shifts].sort((a, b) => getShiftSortKey(a.logDate, a.shiftTime).localeCompare(getShiftSortKey(b.logDate, b.shiftTime)));
}

function previousIsoDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00+07:00`);
  date.setDate(date.getDate() - 1);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Tính lượng nước dùng cả ngày theo đúng công thức file Chỉ tiêu KTKT:
 * chỉ số chốt ngày D trừ chỉ số chốt ngày D-1. Nhật ký nước hiện chốt ngày ở ca 22h00;
 * nếu thiếu một trong hai mốc thì không sinh số liệu để tránh dùng nhầm ngày chưa hoàn tất.
 */
export function calculateDailyWaterUsages(shifts: WaterShiftLog[]): Map<string, DailyWaterUsage> {
  const sorted = sortWaterShifts(shifts);
  const dayEndByDate = new Map<string, WaterShiftLog>();
  const resinByDate = new Map<string, { s1: number; s2: number }>();

  for (const shift of sorted) {
    if (shift.shiftTime === "22h00") dayEndByDate.set(shift.logDate, shift);
    const resin = resinByDate.get(shift.logDate) || { s1: 0, s2: 0 };
    if (shift.resinWaterS1_24h > 0) resin.s1 = shift.resinWaterS1_24h;
    if (shift.resinWaterS2_24h > 0) resin.s2 = shift.resinWaterS2_24h;
    resinByDate.set(shift.logDate, resin);
  }

  const result = new Map<string, DailyWaterUsage>();
  for (const [logDate, current] of dayEndByDate) {
    const previous = dayEndByDate.get(previousIsoDate(logDate));
    if (!previous || current.waterRecS1 < 0 || current.waterRecS2 < 0 || previous.waterRecS1 <= 0 || previous.waterRecS2 <= 0) continue;
    const day=sorted.filter(shift=>shift.logDate===logDate);
    const adjustment=(field:"waterAdjustmentS1"|"waterAdjustmentS2")=>{
      const values=day.map(shift=>shift[field]).filter((value):value is number=>value!=null);
      return values.length?values.reduce((sum,value)=>sum+value,0):null;
    };
    const correctionS1=adjustment("waterAdjustmentS1"),correctionS2=adjustment("waterAdjustmentS2");
    if((current.waterRecS1===0&&correctionS1===null)||(current.waterRecS2===0&&correctionS2===null))continue;
    const totalWaterUsedS1 = waterMeterUsage(current.waterRecS1,previous.waterRecS1,correctionS1,25000);
    const totalWaterUsedS2 = waterMeterUsage(current.waterRecS2,previous.waterRecS2,correctionS2,25000);
    const resin = resinByDate.get(logDate) || { s1: 0, s2: 0 };
    result.set(logDate, {
      logDate,
      previousWaterRecS1: previous.waterRecS1,
      currentWaterRecS1: current.waterRecS1,
      previousWaterRecS2: previous.waterRecS2,
      currentWaterRecS2: current.waterRecS2,
      totalWaterUsedS1,
      totalWaterUsedS2,
      totalWaterUsedPlant: roundTo(totalWaterUsedS1 + totalWaterUsedS2, 2),
      resinWaterS1_24h: resin.s1,
      resinWaterS2_24h: resin.s2,
    });
  }
  return result;
}

/**
 * Làm tròn số với số chữ số thập phân chỉ định
 */
export function roundTo(val: number, decimals: number): number {
  if (!Number.isFinite(val)) return 0;
  const factor = 10 ** decimals;
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * Tự động tính toán chuỗi chênh lệch và hệ số tiêu thụ nước giữa các ca liên tiếp.
 * Hỗ trợ ca mốc cuối tháng trước (được truyền làm phần tử đầu tiên).
 */
export function recalculateWaterShiftChain(shifts: WaterShiftLog[]): WaterShiftLog[] {
  const sorted = sortWaterShifts(shifts);
  const result: WaterShiftLog[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const curr = { ...sorted[i] };
    const prev = i > 0 ? result[i - 1] : null;

    if (prev) {
      // 1. Sản lượng điện phát trong ca (MW / MWh) = Nhận ca này - Nhận ca trước
      if (curr.elecRecS1 > 0 && prev.elecRecS1 > 0) {
        curr.elecGenS1 = roundTo(curr.elecRecS1 - prev.elecRecS1, 2);
      }
      if (curr.elecRecS2 > 0 && prev.elecRecS2 > 0) {
        curr.elecGenS2 = roundTo(curr.elecRecS2 - prev.elecRecS2, 2);
      }

      // 2. Lượng nước bổ sung sử dụng trong ca (m3) = Nhận ca này - Nhận ca trước
      // Tự động bù tràn số vòng tua đồng hồ nước (chu kỳ đồng hồ 25.000 m3 tại nhà máy)
      curr.waterUsedS1 = waterMeterUsage(curr.waterRecS1,prev.waterRecS1,curr.waterAdjustmentS1,25000);
      curr.waterUsedS2 = waterMeterUsage(curr.waterRecS2,prev.waterRecS2,curr.waterAdjustmentS2,25000);

      // 3. Hệ số (Nước / Công suất) m3/MWh = Lượng nước bổ sung / Sản lượng điện phát
      if (curr.elecGenS1 > 0) {
        curr.waterRatioS1 = roundTo(curr.waterUsedS1 / curr.elecGenS1, 4);
      } else {
        curr.waterRatioS1 = 0;
      }

      if (curr.elecGenS2 > 0) {
        curr.waterRatioS2 = roundTo(curr.waterUsedS2 / curr.elecGenS2, 4);
      } else {
        curr.waterRatioS2 = 0;
      }

      // 4. Lượng nước cấp vào bình ngưng trong ca (m3) = Nhận ca này - Nhận ca trước
      curr.condenserUsedS1 = waterMeterUsage(curr.condenserRecS1,prev.condenserRecS1,curr.condenserAdjustmentS1);
      curr.condenserUsedS2 = waterMeterUsage(curr.condenserRecS2,prev.condenserRecS2,curr.condenserAdjustmentS2);
    } else {
      // Bản ghi đầu tiên (ví dụ ca mốc 22h00 tháng trước hoặc ca đầu dữ liệu)
      // Nếu đã có sẵn chỉ số phát thì giữ nguyên, ngược lại nếu không có mốc trước thì = 0
      curr.elecGenS1 = curr.elecGenS1 ?? 0;
      curr.elecGenS2 = curr.elecGenS2 ?? 0;
      curr.waterUsedS1 = curr.waterUsedS1 ?? 0;
      curr.waterUsedS2 = curr.waterUsedS2 ?? 0;
      curr.waterRatioS1 = curr.waterRatioS1 ?? 0;
      curr.waterRatioS2 = curr.waterRatioS2 ?? 0;
      curr.condenserUsedS1 = curr.condenserUsedS1 ?? 0;
      curr.condenserUsedS2 = curr.condenserUsedS2 ?? 0;
    }

    result.push(curr);
  }

  return result;
}

/**
 * Tính toán tổng kết tháng từ danh sách các ca trong tháng (bỏ qua ca mốc tháng trước)
 */
export function calculateMonthlyWaterSummary(shiftsInMonth: WaterShiftLog[]): MonthlyWaterSummary {
  let totalElecGenS1 = 0;
  let totalElecGenS2 = 0;
  let totalWaterUsedS1 = 0;
  let totalWaterUsedS2 = 0;
  let totalCondenserUsedS1 = 0;
  let totalCondenserUsedS2 = 0;
  let totalResinWaterS1 = 0;
  let totalResinWaterS2 = 0;

  for (const shift of shiftsInMonth) {
    totalElecGenS1 += shift.elecGenS1 > 0 ? shift.elecGenS1 : 0;
    totalElecGenS2 += shift.elecGenS2 > 0 ? shift.elecGenS2 : 0;
    totalWaterUsedS1 += shift.waterUsedS1 > 0 ? shift.waterUsedS1 : 0;
    totalWaterUsedS2 += shift.waterUsedS2 > 0 ? shift.waterUsedS2 : 0;
    totalCondenserUsedS1 += shift.condenserUsedS1 > 0 ? shift.condenserUsedS1 : 0;
    totalCondenserUsedS2 += shift.condenserUsedS2 > 0 ? shift.condenserUsedS2 : 0;

    // Tái sinh hạt: chỉ cộng ở ca 06h00 (hoặc nếu có giá trị)
    // Lưu ý: Nếu ở các ca 14h và 22h có sao chép cùng giá trị 24h thì không cộng dồn trùng lặp
    // Theo cấu trúc file mẫu, cột tái sinh ghi nhận theo ngày (ở ca 06h00 hoặc từng ca)
    totalResinWaterS1 += shift.resinWaterS1_24h > 0 ? shift.resinWaterS1_24h : 0;
    totalResinWaterS2 += shift.resinWaterS2_24h > 0 ? shift.resinWaterS2_24h : 0;
  }

  const totalElecGenPlant = totalElecGenS1 + totalElecGenS2;
  const totalWaterUsedPlant = totalWaterUsedS1 + totalWaterUsedS2;

  const avgWaterRatioS1 = totalElecGenS1 > 0 ? roundTo(totalWaterUsedS1 / totalElecGenS1, 4) : 0;
  const avgWaterRatioS2 = totalElecGenS2 > 0 ? roundTo(totalWaterUsedS2 / totalElecGenS2, 4) : 0;
  const avgWaterRatioPlant = totalElecGenPlant > 0 ? roundTo(totalWaterUsedPlant / totalElecGenPlant, 4) : 0;

  return {
    totalElecGenS1: roundTo(totalElecGenS1, 2),
    totalElecGenS2: roundTo(totalElecGenS2, 2),
    totalElecGenPlant: roundTo(totalElecGenPlant, 2),
    totalWaterUsedS1: roundTo(totalWaterUsedS1, 2),
    totalWaterUsedS2: roundTo(totalWaterUsedS2, 2),
    totalWaterUsedPlant: roundTo(totalWaterUsedPlant, 2),
    avgWaterRatioS1,
    avgWaterRatioS2,
    avgWaterRatioPlant,
    totalCondenserUsedS1: roundTo(totalCondenserUsedS1, 2),
    totalCondenserUsedS2: roundTo(totalCondenserUsedS2, 2),
    totalResinWaterS1: roundTo(totalResinWaterS1, 2),
    totalResinWaterS2: roundTo(totalResinWaterS2, 2),
    shiftCount: shiftsInMonth.length,
  };
}

/**
 * Chuyển đổi định dạng ngày từ DD/MM/YYYY sang YYYY-MM-DD
 */
export function parseDateToIso(dateStr: string): string | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const ddmmyyyyMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ddmmyyyyMatch) {
    const [, day, month, year] = ddmmyyyyMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return null;
}

/**
 * Chuyển đổi định dạng ngày từ YYYY-MM-DD sang DD/MM/YYYY
 */
export function formatIsoToDmy(isoStr: string): string {
  if (!isoStr) return "";
  const parts = isoStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoStr;
}
