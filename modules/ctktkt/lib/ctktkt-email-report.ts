// Node's built-in TypeScript test runner requires the explicit extension here.
import type { CtktktDayEntries } from "./ctktkt-report";
import { calculateCtktktMeterSummary, calculateCtktktSummary, calculateNh3Summary, deriveNh3OpeningStock, NH3_OPENING_STOCK_CELL } from "./ctktkt-report";

export interface CtktktEmailReportMetrics {
  // S1
  grossMwhS1: number | null;
  netMwhS1: number | null;
  auxMwhS1: number | null;
  auxPercentS1: number | null;
  coalTonnesS1: number | null;
  netCoalRateS1: number | null;
  hhvKjKgS1: number | null;
  netHeatRateS1: number | null;
  steamTonnesS1: number | null;
  steamRateGrossS1: number | null;
  steamRateNetS1: number | null;
  deminWaterS1: number | null;

  // S2
  grossMwhS2: number | null;
  netMwhS2: number | null;
  auxMwhS2: number | null;
  auxPercentS2: number | null;
  coalTonnesS2: number | null;
  netCoalRateS2: number | null;
  hhvKjKgS2: number | null;
  netHeatRateS2: number | null;
  steamTonnesS2: number | null;
  steamRateGrossS2: number | null;
  steamRateNetS2: number | null;
  deminWaterS2: number | null;

  // Chung toàn nhà máy
  deminWaterTotal: number | null;
  coalIntake24h: number | null;
  nh3UsedTonnes: number | null;
  nh3RateGross: number | null;
  nh3RateNet: number | null;
  nh3Stock24h: number | null;
  nh3IntakeDay: number | null;
}

function numberOf(entries: CtktktDayEntries | undefined, cell: string): number | null {
  const raw = entries?.[cell]?.trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function formatMetricNumber(
  value: number | null | undefined,
  decimals = 2,
  fallback = "—",
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  // Nếu là số nguyên và yêu cầu hiển thị đẹp (hoặc 0)
  if (Math.abs(value) < 1e-9) return "0";
  return value.toFixed(decimals);
}

export function extractCtktktEmailMetrics(
  current: CtktktDayEntries,
  previous?: CtktktDayEntries,
): CtktktEmailReportMetrics {
  const summary = calculateCtktktSummary(current, previous);
  // The workbook divides steam by the meter generation (Z59 = Z58 / E20, Z60 = Z58 / E21), not by PMIS.
  const meterSummary = calculateCtktktMeterSummary(current, previous);

  // S1 metrics
  const grossMwhS1 = summary.s1.grossMwh;
  const netMwhS1 = summary.s1.netMwh;
  const auxMwhS1 = summary.s1.auxiliaryMwh;
  const auxPercentS1 = summary.s1.auxiliaryPercent;
  const coalTonnesS1 = summary.s1.adjustedCoalTonnes;
  const netCoalRateS1 = summary.s1.netCoalRate;
  const hhvKjKgS1 =
    summary.s1.hhvKjKg ??
    summary.plant.hhvKjKg ??
    numberOf(current, "M169") ??
    numberOf(current, "AT87");
  const netHeatRateS1 = summary.s1.netHeatRate;

  // Hơi S1: Ô Z58 hoặc tích lũy AB54
  const steamTonnesS1 = numberOf(current, "Z58") ?? numberOf(current, "AB54");
  const steamRateGrossS1 =
    numberOf(current, "Z59") ??
    (steamTonnesS1 != null && meterSummary.s1.grossMwh ? (steamTonnesS1 * 1000) / meterSummary.s1.grossMwh : null);
  const steamRateNetS1 =
    numberOf(current, "Z60") ??
    (steamTonnesS1 != null && meterSummary.s1.netMwh ? (steamTonnesS1 * 1000) / meterSummary.s1.netMwh : null);

  // Nước demin S1 (Hàng 72): Cột Y = Cột X (24h ngày D) − Cột W (24h ngày D-1) + Hiệu chỉnh
  const waterX72 = numberOf(current, "X72");
  // W trống thì kế thừa X (24h) của ngày D-1, giống bảng trên web.
  const waterW72 = numberOf(current, "W72") ?? numberOf(previous, "X72");
  const deminWaterS1 = waterX72 != null && waterW72 != null ? waterX72 - waterW72 + (numberOf(current, "WATER_ADJ_S1") ?? 0) : null;

  // S2 metrics
  const grossMwhS2 = summary.s2.grossMwh;
  const netMwhS2 = summary.s2.netMwh;
  const auxMwhS2 = summary.s2.auxiliaryMwh;
  const auxPercentS2 = summary.s2.auxiliaryPercent;
  const coalTonnesS2 = summary.s2.adjustedCoalTonnes;
  const netCoalRateS2 = summary.s2.netCoalRate;
  const hhvKjKgS2 =
    summary.s2.hhvKjKg ??
    summary.s1.hhvKjKg ??
    summary.plant.hhvKjKg ??
    numberOf(current, "M171") ??
    numberOf(current, "AT87");
  const netHeatRateS2 = summary.s2.netHeatRate;

  // Hơi S2: Ô AJ58 hoặc tích lũy AL54
  const steamTonnesS2 = numberOf(current, "AJ58") ?? numberOf(current, "AL54");
  const steamRateGrossS2 =
    numberOf(current, "AJ59") ??
    (steamTonnesS2 != null && meterSummary.s2.grossMwh ? (steamTonnesS2 * 1000) / meterSummary.s2.grossMwh : null);
  const steamRateNetS2 =
    numberOf(current, "AJ60") ??
    (steamTonnesS2 != null && meterSummary.s2.netMwh ? (steamTonnesS2 * 1000) / meterSummary.s2.netMwh : null);

  // Nước demin S2 (Hàng 73): Cột Y = Cột X (24h ngày D) − Cột W (24h ngày D-1) + Hiệu chỉnh
  const waterX73 = numberOf(current, "X73");
  const waterW73 = numberOf(current, "W73") ?? numberOf(previous, "X73");
  const deminWaterS2 = waterX73 != null && waterW73 != null ? waterX73 - waterW73 + (numberOf(current, "WATER_ADJ_S2") ?? 0) : null;

  // Tổng lượng nước demin sử dụng ngày D của 2 tổ máy (Hàng 74)
  const deminWaterTotal = deminWaterS1 === null && deminWaterS2 === null ? null : (deminWaterS1 ?? 0) + (deminWaterS2 ?? 0);

  // Than nhập kho 24h
  const coalIntake24h = numberOf(current, "I36") ?? numberOf(current, "W87") ?? 0;

  // NH3 mirrors P74, P75 and P77:Q77 from the workbook.
  const nh3IntakeDay = numberOf(current, "P72") ?? 0;
  const plantGrossMwh = summary.plant.grossMwh;
  const plantNetMwh = summary.plant.netMwh;
  const nh3 = calculateNh3Summary({ ...current, [NH3_OPENING_STOCK_CELL]: deriveNh3OpeningStock(previous) }, plantGrossMwh, plantNetMwh);
  const nh3Stock24h = numberOf(current, "P74") ?? nh3.stock24h;
  const nh3UsedTonnes = numberOf(current, "P75") ?? nh3.usedTonnes;
  const nh3RateGross = numberOf(current, "P77") ?? nh3.rateGross;
  const nh3RateNet = numberOf(current, "Q77") ?? nh3.rateNet;

  return {
    grossMwhS1,
    netMwhS1,
    auxMwhS1,
    auxPercentS1,
    coalTonnesS1,
    netCoalRateS1,
    hhvKjKgS1,
    netHeatRateS1,
    steamTonnesS1,
    steamRateGrossS1,
    steamRateNetS1,
    deminWaterS1,

    grossMwhS2,
    netMwhS2,
    auxMwhS2,
    auxPercentS2,
    coalTonnesS2,
    netCoalRateS2,
    hhvKjKgS2,
    netHeatRateS2,
    steamTonnesS2,
    steamRateGrossS2,
    steamRateNetS2,
    deminWaterS2,

    deminWaterTotal,
    coalIntake24h,
    nh3UsedTonnes,
    nh3RateGross,
    nh3RateNet,
    nh3Stock24h,
    nh3IntakeDay,
  };
}

export function generateEmailReportText(
  metrics: CtktktEmailReportMetrics,
  shiftName = "Tổ C",
): string {
  const lines: string[] = [
    `${shiftName}- PXVH1 xin gửi các anh (chị) báo cáo gồm:`,
    "1. Chỉ tiêu kinh tế kỹ thuật:",
    "- Tổ máy S1 vận hành:",
    `+ Tổng sản lượng đầu cực máy phát S1: ${formatMetricNumber(metrics.grossMwhS1, 2)} (MWh)`,
    `+ Tổng sản lượng tại điểm mua bán điện S1: ${formatMetricNumber(metrics.netMwhS1, 2)} (MWh)`,
    `+ Lượng điện tự dùng S1: ${formatMetricNumber(metrics.auxMwhS1, 2)} (MWh)`,
    `+ Phần trăm điện tự dùng S1: ${formatMetricNumber(metrics.auxPercentS1, 2)} % (đã bao gồm tổn thất MBA)`,
    `+ Tổng lượng than tiêu thụ S1: ${formatMetricNumber(metrics.coalTonnesS1, 3)} (tấn) - đã quy ẩm về 8.5%`,
    `+ Suất tiêu hao than tinh S1: ${formatMetricNumber(metrics.netCoalRateS1, 3)} (g/kWh)`,
    `+ Nhiệt trị than quy ẩm: ${formatMetricNumber(metrics.hhvKjKgS1, 2)} (kJ/kg)`,
    `+ Suất hao nhiệt tinh S1: ${formatMetricNumber(metrics.netHeatRateS1, 3)} (kJ/kWh)`,
    `+ Tổng lượng hơi tiêu thụ S1: ${formatMetricNumber(metrics.steamTonnesS1, 2)} (tấn)`,
    `+ Suất tiêu hao hơi theo sản lượng đầu cực S1: ${formatMetricNumber(metrics.steamRateGrossS1, 2)} (g/kWh)`,
    `+ Suất tiêu hao hơi theo sản lượng phát lưới S1: ${formatMetricNumber(metrics.steamRateNetS1, 2)} (g/kWh)`,
    `+ Lượng nước demin sử dụng S1: ${formatMetricNumber(metrics.deminWaterS1, 2)} (m³)`,
    "- Tổ máy S2 vận hành:",
    `+ Tổng sản lượng đầu cực máy phát S2: ${formatMetricNumber(metrics.grossMwhS2, 2)} (MWh)`,
    `+ Tổng sản lượng tại điểm mua bán điện S2: ${formatMetricNumber(metrics.netMwhS2, 2)} (MWh)`,
    `+ Lượng điện tự dùng S2: ${formatMetricNumber(metrics.auxMwhS2, 2)} (MWh)`,
    `+ Phần trăm điện tự dùng S2: ${formatMetricNumber(metrics.auxPercentS2, 2)} % (đã bao gồm tổn thất MBA)`,
    `+ Tổng lượng than tiêu thụ S2: ${formatMetricNumber(metrics.coalTonnesS2, 3)} (tấn) - đã quy ẩm về 8.5%`,
    `+ Suất tiêu hao than tinh S2: ${formatMetricNumber(metrics.netCoalRateS2, 3)} (g/kWh)`,
    `+ Nhiệt trị than quy ẩm: ${formatMetricNumber(metrics.hhvKjKgS2, 2)} (kJ/kg)`,
    `+ Suất hao nhiệt tinh S2: ${formatMetricNumber(metrics.netHeatRateS2, 3)} (kJ/kWh)`,
    `+ Tổng lượng hơi tiêu thụ S2: ${formatMetricNumber(metrics.steamTonnesS2, 2)} (tấn)`,
    `+ Suất tiêu hao hơi theo sản lượng đầu cực S2: ${formatMetricNumber(metrics.steamRateGrossS2, 2)} (g/kWh)`,
    `+ Suất tiêu hao hơi theo sản lượng phát lưới S2: ${formatMetricNumber(metrics.steamRateNetS2, 2)} (g/kWh)`,
    `+ Lượng nước demin sử dụng S2: ${formatMetricNumber(metrics.deminWaterS2, 2)} (m³)`,
    "",
    `- Tổng lượng nước demin sử dụng ngày D của 2 tổ máy: ${formatMetricNumber(metrics.deminWaterTotal, 2)} (m³)`,
    `- Tổng lượng than nhập kho 24h theo số liệu từ PX nhiêu liệu: ${formatMetricNumber(metrics.coalIntake24h, 2)} (tấn)`,
    `- Tổng lượng NH3 tiêu thụ trong ngày: ${formatMetricNumber(metrics.nh3UsedTonnes, 2)} (tấn)`,
    `- Suất tiêu hao NH3 theo sản lượng đầu cực: ${formatMetricNumber(metrics.nh3RateGross, 2)} (g/kWh)`,
    `- Suất tiêu hao NH3 theo sản lượng phát lưới: ${formatMetricNumber(metrics.nh3RateNet, 2)} (g/kWh)`,
    `- Tổng lượng NH3 tồn kho: ${formatMetricNumber(metrics.nh3Stock24h, 3)} (tấn)`,
    `- NH3 nhập trong ngày: ${formatMetricNumber(metrics.nh3IntakeDay, 2)} (tấn)`,
    "2. Báo cáo bao gồm các file:",
    "- CTKTKT;",
    "- BCSX NMĐ S1;",
    "- BCSX NMĐ S2;",
    "- BCSX NMĐ A0;",
    "- Bảng theo dõi nước bổ sung trong ca;",
    "",
    "Trân trọng!",
  ];

  return lines.join("\n");
}

export function generateEmailReportHtml(
  metrics: CtktktEmailReportMetrics,
  shiftName = "Tổ C",
): string {
  const p = (content: string, bold = false, style = "") =>
    `<p style="margin: 0 0 2px 0; font-family: 'Times New Roman', Times, serif; font-size: 13.5pt; line-height: 1.35; color: #000000; ${bold ? "font-weight: bold;" : ""} ${style}">${bold ? `<strong>${content}</strong>` : content}</p>`;

  return [
    `<div style="font-family: 'Times New Roman', Times, serif; font-size: 13.5pt; line-height: 1.35; color: #000000;">`,
    p(`${shiftName}- PXVH1 xin gửi các anh (chị) báo cáo gồm:`, true, "margin-bottom: 3px;"),
    p("1. Chỉ tiêu kinh tế kỹ thuật:", true, "margin-bottom: 3px;"),
    p("- Tổ máy S1 vận hành:", true),
    p(`+ Tổng sản lượng đầu cực máy phát S1: ${formatMetricNumber(metrics.grossMwhS1, 2)} (MWh)`),
    p(`+ Tổng sản lượng tại điểm mua bán điện S1: ${formatMetricNumber(metrics.netMwhS1, 2)} (MWh)`),
    p(`+ Lượng điện tự dùng S1: ${formatMetricNumber(metrics.auxMwhS1, 2)} (MWh)`),
    p(`+ Phần trăm điện tự dùng S1: ${formatMetricNumber(metrics.auxPercentS1, 2)} % (đã bao gồm tổn thất MBA)`),
    p(`+ Tổng lượng than tiêu thụ S1: ${formatMetricNumber(metrics.coalTonnesS1, 3)} (tấn) - đã quy ẩm về 8.5%`),
    p(`+ Suất tiêu hao than tinh S1: ${formatMetricNumber(metrics.netCoalRateS1, 3)} (g/kWh)`),
    p(`+ Nhiệt trị than quy ẩm: ${formatMetricNumber(metrics.hhvKjKgS1, 2)} (kJ/kg)`),
    p(`+ Suất hao nhiệt tinh S1: ${formatMetricNumber(metrics.netHeatRateS1, 3)} (kJ/kWh)`),
    p(`+ Tổng lượng hơi tiêu thụ S1: ${formatMetricNumber(metrics.steamTonnesS1, 2)} (tấn)`),
    p(`+ Suất tiêu hao hơi theo sản lượng đầu cực S1: ${formatMetricNumber(metrics.steamRateGrossS1, 2)} (g/kWh)`),
    p(`+ Suất tiêu hao hơi theo sản lượng phát lưới S1: ${formatMetricNumber(metrics.steamRateNetS1, 2)} (g/kWh)`),
    p(`+ Lượng nước demin sử dụng S1: ${formatMetricNumber(metrics.deminWaterS1, 2)} (m³)`),
    p("- Tổ máy S2 vận hành:", true),
    p(`+ Tổng sản lượng đầu cực máy phát S2: ${formatMetricNumber(metrics.grossMwhS2, 2)} (MWh)`),
    p(`+ Tổng sản lượng tại điểm mua bán điện S2: ${formatMetricNumber(metrics.netMwhS2, 2)} (MWh)`),
    p(`+ Lượng điện tự dùng S2: ${formatMetricNumber(metrics.auxMwhS2, 2)} (MWh)`),
    p(`+ Phần trăm điện tự dùng S2: ${formatMetricNumber(metrics.auxPercentS2, 2)} % (đã bao gồm tổn thất MBA)`),
    p(`+ Tổng lượng than tiêu thụ S2: ${formatMetricNumber(metrics.coalTonnesS2, 3)} (tấn) - đã quy ẩm về 8.5%`),
    p(`+ Suất tiêu hao than tinh S2: ${formatMetricNumber(metrics.netCoalRateS2, 3)} (g/kWh)`),
    p(`+ Nhiệt trị than quy ẩm: ${formatMetricNumber(metrics.hhvKjKgS2, 2)} (kJ/kg)`),
    p(`+ Suất hao nhiệt tinh S2: ${formatMetricNumber(metrics.netHeatRateS2, 3)} (kJ/kWh)`),
    p(`+ Tổng lượng hơi tiêu thụ S2: ${formatMetricNumber(metrics.steamTonnesS2, 2)} (tấn)`),
    p(`+ Suất tiêu hao hơi theo sản lượng đầu cực S2: ${formatMetricNumber(metrics.steamRateGrossS2, 2)} (g/kWh)`),
    p(`+ Suất tiêu hao hơi theo sản lượng phát lưới S2: ${formatMetricNumber(metrics.steamRateNetS2, 2)} (g/kWh)`),
    p(`+ Lượng nước demin sử dụng S2: ${formatMetricNumber(metrics.deminWaterS2, 2)} (m³)`),
    `<div style="height: 12px;"></div>`,
    p(`- Tổng lượng nước demin sử dụng ngày D của 2 tổ máy: ${formatMetricNumber(metrics.deminWaterTotal, 2)} (m³)`),
    p(`- Tổng lượng than nhập kho 24h theo số liệu từ PX nhiêu liệu: ${formatMetricNumber(metrics.coalIntake24h, 2)} (tấn)`),
    p(`- Tổng lượng NH3 tiêu thụ trong ngày: ${formatMetricNumber(metrics.nh3UsedTonnes, 2)} (tấn)`),
    p(`- Suất tiêu hao NH3 theo sản lượng đầu cực: ${formatMetricNumber(metrics.nh3RateGross, 2)} (g/kWh)`),
    p(`- Suất tiêu hao NH3 theo sản lượng phát lưới: ${formatMetricNumber(metrics.nh3RateNet, 2)} (g/kWh)`),
    p(`- Tổng lượng NH3 tồn kho: ${formatMetricNumber(metrics.nh3Stock24h, 3)} (tấn)`),
    p(`- NH3 nhập trong ngày: ${formatMetricNumber(metrics.nh3IntakeDay, 2)} (tấn)`),
    p("2. Báo cáo bao gồm các file:", true, "margin-top: 6px; margin-bottom: 3px;"),
    p("- CTKTKT;"),
    p("- BCSX NMĐ S1;"),
    p("- BCSX NMĐ S2;"),
    p("- BCSX NMĐ A0;"),
    p("- Bảng theo dõi nước bổ sung trong ca;"),
    `<div style="height: 12px;"></div>`,
    p("Trân trọng!"),
    `</div>`,
  ].join("\n");
}
