import { meterFromCompactFileName, parseMeterCsv, type MeterReading } from "./ppa-heat-rate";
import { GRID_RECEIVE_CELLS, type GridReceiveCell } from "./auxiliary-electricity";

export const productionCsvMeters = [
  { cell: "J157", meter: "DHA_S1", label: "Đầu cực S1" },
  { cell: "K157", meter: "DH1_285M", label: "Điểm bán S1" },
  { cell: "J158", meter: "DHA_S2", label: "Đầu cực S2" },
  { cell: "K158", meter: "DH1_283M", label: "Điểm bán S2" },
] as const;

export type ProductionCsvPreview = {
  operatingDate: string;
  entries: { cell: string; label: string; meter: string; kwh: number; value: string; defaulted: boolean }[];
  gridReceived: { cell: GridReceiveCell; label: string; value: string }[];
  sourceFiles: string[];
};

// The daily export also includes other measurement points. These compact
// filenames use DDMM followed by the four-digit meter code.
const dailyMeterFile = /^\d{8}(?:\s*\(\d+\))?\.{1,2}csv$/i;
const compactReading = /^\uFEFF?\s*"?\d{1,2}[-/]\d{1,2}[-/]\d{2,4}"?\s*[,;\t]\s*"?kwhgiao"?\s*[,;\t]/i;

function sumMeterChannel(matches: MeterReading[], label: string) {
  const first = matches[0];
  for (const item of matches) {
    if (item.intervals.length !== 48 || item.intervals.some(value => !Number.isFinite(value) || value < 0)) throw new Error(`${label}: cần đủ 48 giá trị kWh không âm.`);
    const sum = item.intervals.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(sum) || !Number.isFinite(item.total) || Math.abs(sum - item.total) > Math.max(0.1, Math.abs(sum) * 1e-8)) throw new Error(`${label}: cột Tổng không khớp tổng 48 chu kỳ.`);
    if (item.intervals.some((value, i) => value !== first.intervals[i])) throw new Error(`${label}: có CSV trùng nhưng khác số liệu.`);
  }
  return first.intervals.reduce((a, b) => a + b, 0);
}

/** CSV contains energy in kWh per half hour, not average power in kW. */
export function calculateCsvProduction(files: { name: string; text: string }[]): ProductionCsvPreview {
  if (!files.length) throw new Error("Chưa chọn CSV công tơ.");
  const readings: MeterReading[] = files.flatMap(file => {
    if (dailyMeterFile.test(file.name) && compactReading.test(file.text) && !meterFromCompactFileName(file.name)) return [];
    return parseMeterCsv(file.text, file.name, { includeGridReceived: true });
  });
  const relevant = readings.filter(item => productionCsvMeters.some(m => m.meter === item.meter.toUpperCase()) && item.channel.toLowerCase() === "kwhgiao");
  if (!relevant.length) throw new Error("Không tìm thấy CSV của các công tơ sản lượng 6001, 6002, 6301 hoặc 6303.");
  const dates = new Set(relevant.map(item => item.operatingDate));
  if (dates.size !== 1) throw new Error("Chỉ nhập các CSV cùng một ngày; không trộn dữ liệu nhiều ngày.");
  const operatingDate = [...dates][0];
  const instant = new Date(operatingDate + "T00:00:00Z");
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(operatingDate) || !Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== operatingDate) throw new Error("Ngày trong CSV không hợp lệ.");
  const entries = productionCsvMeters.map(meter => {
    const matches = relevant.filter(item => item.meter.toUpperCase() === meter.meter);
    if (!matches.length) return { ...meter, kwh: 0, value: "0", defaulted: true };
    const kwh = sumMeterChannel(matches, meter.label);
    return { ...meter, kwh, value: String(kwh / 1000), defaulted: false };
  });
  const gridReceived = [
    { cell: GRID_RECEIVE_CELLS[0], meter: "DH1_285M", label: "Điện nhận lưới S1" },
    { cell: GRID_RECEIVE_CELLS[1], meter: "DH1_283M", label: "Điện nhận lưới S2" },
  ].flatMap(({ cell, meter, label }) => {
    const matches = readings.filter(item => item.meter.toUpperCase() === meter && item.channel.toLowerCase() === "kwhnhan");
    if (!matches.length) return [];
    if (matches.some(item => item.operatingDate !== operatingDate)) throw new Error(`${label}: ngày của kênh KwhNhan không khớp ngày sản lượng.`);
    const mwh = sumMeterChannel(matches, label) / 1000;
    return [{ cell, label, value: String(Number(mwh.toPrecision(15))) }];
  });
  const sourceNames = relevant.map(item => item.sourceName).filter((name): name is string => name !== undefined);
  return { operatingDate, entries, gridReceived, sourceFiles: [...new Set(sourceNames)] };
}
