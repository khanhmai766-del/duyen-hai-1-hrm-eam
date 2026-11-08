import {CAPACITY_KW, compareHeatRate, displayPpaRate, ppaCurveForYear, type PpaSourceData, type UnitDetail} from "./ppa-heat-rate";
import type {SheetJsLib} from "./sheetjs-loader";
export type PpaSheetRow = {
  date: string;
  ppaPlant: number | null; actualPlant: number | null;
  ppaS1: number | null; actualS1: number | null;
  ppaS2: number | null; actualS2: number | null;
  netS1Kwh: number | null; netS2Kwh: number | null;
  availableCapacityS1Mw: number | null; availableCapacityS2Mw: number | null;
  noteS1: string; noteS2: string;
};
const fullDate=(iso:string)=>iso.split("-").reverse().join("/");
// ddMM (không có năm) — đúng cách đặt tên ngày trong file mẫu gốc (cột "Ngày" của sheet S1/S2
// và tên các sheet công tơ từng ngày, ví dụ "0108" = 01/08).
const ddMM = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}`;
const sumRange = (values: number[], from: number, to: number) => values.slice(from, to).reduce((sum, value) => sum + value, 0);

const S1S2_HEADER = ["NỘI DUNG", "Đơn vị", "Ngày", "Tổng", ...Array.from({ length: 48 }, (_, index) => `H${index + 1}`), "Sáng (0h-08h00)", "Chiều (08h00-16h00)", "Đêm (16h00-24h00)"];

// Hàng dữ liệu cho 3 khối "Sản lượng đầu cực" / "Sản lượng xuất tuyến" / "Nhiệt lượng theo PPA":
// Tổng/Sáng/Chiều/Đêm là tổng cộng dồn các chu kỳ trong khoảng đó (đã đối chiếu đúng với file mẫu gốc).
function metricBlockRow(iso: string, values: number[], label: string | null, unit: string | null) {
  return [label, unit, ddMM(iso), values.reduce((sum, value) => sum + value, 0), ...values, sumRange(values, 0, 16), sumRange(values, 16, 32), sumRange(values, 32, 48)];
}

// Hàng dữ liệu cho khối "SHN tổ máy theo PPA" (đơn vị kJ/kWh — là 1 suất hao nhiệt, không phải
// đại lượng cộng dồn được): Tổng/Sáng/Chiều/Đêm = (tổng nhiệt lượng)/(tổng sản lượng xuất tuyến)
// của đúng khoảng chu kỳ đó — đã đối chiếu khớp chính xác với file mẫu gốc (không phải trung bình
// cộng hay tổng cộng dồn giá trị suất hao nhiệt từng chu kỳ).
function rateBlockRow(iso: string, intervals: UnitDetail["intervals"], label: string | null, unit: string | null) {
  const rates = intervals.map(item => item.netKwh > 0 ? item.rate : null);
  const heat = intervals.map(item => item.heatKj), net = intervals.map(item => item.netKwh);
  const weighted = (from: number, to: number) => {
    const netSum = sumRange(net, from, to);
    return netSum > 0 ? sumRange(heat, from, to) / netSum : null;
  };
  return [label, unit, ddMM(iso), weighted(0, 48), ...rates, weighted(0, 16), weighted(16, 32), weighted(32, 48)];
}

export function buildUnitSheet(XLSX: SheetJsLib, days: { iso: string; detail: UnitDetail }[], year: number) {
  const curve = ppaCurveForYear(year);
  const rows: (string | number | null)[][] = [
    ["Công suất", "kW", CAPACITY_KW.full, CAPACITY_KW.seventyFive, CAPACITY_KW.half],
    ["SHN", "kJ/kWh", curve.full, curve.seventyFive, curve.half],
    S1S2_HEADER,
  ];
  const blocks: { label: string; unit: string; pick?: (detail: UnitDetail) => number[]; rate?: boolean }[] = [
    { label: "Sản lượng đầu cực", unit: "kWh", pick: detail => detail.intervals.map(item => item.grossKwh) },
    { label: "Sản lượng xuất tuyến", unit: "kWh", pick: detail => detail.intervals.map(item => item.netKwh) },
    { label: "Nhiệt lượng theo PPA", unit: "kJ", pick: detail => detail.intervals.map(item => item.heatKj) },
    { label: "SHN tổ máy theo PPA", unit: "kJ/kWh", rate: true },
  ];
  for (const block of blocks) {
    days.forEach((day, index) => {
      const label = index === 0 ? block.label : null, unit = index === 0 ? block.unit : null;
      rows.push(block.rate ? rateBlockRow(day.iso, day.detail.intervals, label, unit) : metricBlockRow(day.iso, block.pick!(day.detail), label, unit));
    });
  }
  return XLSX.utils.aoa_to_sheet(rows);
}

// 1 sheet/ngày mô phỏng bảng số liệu công tơ gốc — chỉ gồm đúng 4 điểm đo (kênh kWhGiao) mà ứng
// dụng thực sự dùng để tính SHN theo PPA (DHA_S1/DH1_285M/DHA_S2/DH1_283M), vì đây là toàn bộ dữ
// liệu công tơ được lưu lại khi nhập ngày đó — file mẫu gốc có thêm nhiều điểm đo/kênh khác không
// dùng cho phép tính nên không có trong dữ liệu đã lưu.
const METER_ROWS: { key: keyof PpaSourceData; meter: string }[] = [
  { key: "grossS1", meter: "DHA_S1" },
  { key: "netS1", meter: "DH1_285M" },
  { key: "grossS2", meter: "DHA_S2" },
  { key: "netS2", meter: "DH1_283M" },
];

export function buildMeterSheet(XLSX: SheetJsLib, iso: string, source: PpaSourceData) {
  const full = fullDate(iso);
  const rows: (string | number | null)[][] = [
    ["Công ty Nhiệt điện Duyên Hải"],
    ["Nhà máy: Duyên Hải 1"],
    [`Số liệu đo đếm công tơ ngày: ${full}`],
    ["Tên điểm đo", "Kênh", "Ngày", "Tổng", ...Array.from({ length: 48 }, (_, index) => `H${index + 1}`)],
    ["Điểm đo giao nhận"],
  ];
  for (const { key, meter } of METER_ROWS) {
    const values = source[key];
    rows.push([meter, "kWhGiao", full, values.reduce((sum, value) => sum + value, 0), ...values]);
  }
  return XLSX.utils.aoa_to_sheet(rows);
}

const PLANT_SHEET_HEADER = [
  "Ngày", "PPA chung", "PPA S1", "PPA S2", "Thực tế chung", "Thực tế S1", "Thực tế S2",
  "CL chung (kJ/kWh)", "CL chung (%)", "Đánh giá chung",
  "CL S1 (kJ/kWh)", "CL S1 (%)", "Đánh giá S1",
  "CL S2 (kJ/kWh)", "CL S2 (%)", "Đánh giá S2",
  "Nguyên nhân S1", "Nguyên nhân S2",
];

// Bình quân gia quyền theo sản lượng điểm bán (netKwh) trong tháng — đúng bản chất suất hao nhiệt
// (= tổng nhiệt lượng / tổng sản lượng), không phải trung bình cộng đơn giản theo số ngày.
function weightedAverage(values: (number | null)[], weights: (number | null)[]) {
  let sumValue = 0, sumWeight = 0;
  values.forEach((value, index) => {
    const weight = weights[index];
    if (value === null || weight === null || !Number.isFinite(value) || !Number.isFinite(weight)) return;
    sumValue += value * weight; sumWeight += weight;
  });
  return sumWeight > 0 ? sumValue / sumWeight : null;
}

export function buildPlantSheet(XLSX: SheetJsLib, rowsByMonthLocal: [string, PpaSheetRow[]][]) {
  const rowsOut: (string | number | null)[][] = [PLANT_SHEET_HEADER];
  for (const [, monthRows] of rowsByMonthLocal) {
    for (const row of monthRows) {
      const plant = compareHeatRate(row.actualPlant, row.ppaPlant, row.netS1Kwh === null || row.netS2Kwh === null ? null : row.netS1Kwh + row.netS2Kwh), s1 = compareHeatRate(row.actualS1, row.ppaS1, row.netS1Kwh), s2 = compareHeatRate(row.actualS2, row.ppaS2, row.netS2Kwh);
      rowsOut.push([
        fullDate(row.date), displayPpaRate(row.ppaPlant, row.netS1Kwh === null || row.netS2Kwh === null ? null : row.netS1Kwh + row.netS2Kwh), displayPpaRate(row.ppaS1, row.netS1Kwh), displayPpaRate(row.ppaS2, row.netS2Kwh), row.actualPlant, row.actualS1, row.actualS2,
        plant.difference, plant.percent, plant.status,
        s1.difference, s1.percent, s1.status,
        s2.difference, s2.percent, s2.status,
        row.noteS1 || "", row.noteS2 || "",
      ]);
    }
    const netS1 = monthRows.map(row => row.netS1Kwh), netS2 = monthRows.map(row => row.netS2Kwh);
    const netPlant = monthRows.map(row => row.netS1Kwh === null && row.netS2Kwh === null ? null : (row.netS1Kwh ?? 0) + (row.netS2Kwh ?? 0));
    const ppaPlantAvg = weightedAverage(monthRows.map(row => row.ppaPlant), netPlant);
    const actualPlantAvg = weightedAverage(monthRows.map(row => row.actualPlant), netPlant);
    const ppaS1Avg = weightedAverage(monthRows.map(row => row.ppaS1), netS1);
    const actualS1Avg = weightedAverage(monthRows.map(row => row.actualS1), netS1);
    const ppaS2Avg = weightedAverage(monthRows.map(row => row.ppaS2), netS2);
    const actualS2Avg = weightedAverage(monthRows.map(row => row.actualS2), netS2);
    const plantCmp = compareHeatRate(actualPlantAvg, ppaPlantAvg), s1Cmp = compareHeatRate(actualS1Avg, ppaS1Avg), s2Cmp = compareHeatRate(actualS2Avg, ppaS2Avg);
    rowsOut.push([
      "Cả tháng", ppaPlantAvg, ppaS1Avg, ppaS2Avg, actualPlantAvg, actualS1Avg, actualS2Avg,
      plantCmp.difference, plantCmp.percent, plantCmp.status,
      s1Cmp.difference, s1Cmp.percent, s1Cmp.status,
      s2Cmp.difference, s2Cmp.percent, s2Cmp.status,
      "", "",
    ]);
  }
  return XLSX.utils.aoa_to_sheet(rowsOut);
}

