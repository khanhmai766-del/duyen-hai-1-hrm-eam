import { calculateAuxiliaryElectricity } from "./auxiliary-electricity";

export type DailyProductionRow = Record<string, string | undefined>;

function decimal(value?: string) {
  if (!value?.trim()) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function divide(a: number | null, b: number | null, multiplier = 1) {
  return a === null || b === null || b === 0 ? null : a / b * multiplier;
}

/**
 * Calculate the daily KTKT fields from full-precision source values.
 *
 * Source units:
 * - B/C/H/I: million kWh
 * - F/L: hours
 * - AE/AF/BN/BQ/BR: tonnes
 * - AJ: kJ/kg
 *
 * No display rounding is performed here. The UI formats the returned numbers
 * separately, while exports and downstream calculations retain the numbers.
 */
export function calculateDailyProduction(row: DailyProductionRow): Record<string, number | null> {
  const n = (code: string) => decimal(row[code]);
  const B = n("B"), C = n("C"), F = n("F"), H = n("H"), I = n("I"), L = n("L");
  const AE = n("AE"), AF = n("AF"), AE_ADJ = n("AE_ADJ"), AF_ADJ = n("AF_ADJ"), AJ = n("AJ"), CJ = n("CJ"), CX = n("CX"), BN = n("BN"), BQ = n("BQ"), BR = n("BR");
  const gridReceivedS1 = n("GRID_RECEIVE_S1"), gridReceivedS2 = n("GRID_RECEIVE_S2");
  const adjustedCoal = (raw: number | null, linkedAdjusted: number | null) => linkedAdjusted ?? (raw === null || CJ === null ? null : raw * (1 - CJ / 100) / (1 - 0.085));
  const adjustedAE = adjustedCoal(AE, AE_ADJ);
  const adjustedAF = adjustedCoal(AF, AF_ADJ);
  const auxiliaryS1 = calculateAuxiliaryElectricity(B === null ? null : B * 1000, C === null ? null : C * 1000, gridReceivedS1);
  const auxiliaryS2 = calculateAuxiliaryElectricity(H === null ? null : H * 1000, I === null ? null : I * 1000, gridReceivedS2);
  const D = auxiliaryS1.totalMwh;
  const J = auxiliaryS2.totalMwh;
  const N = B === null || H === null ? null : (B + H) * 1000;
  const O = C === null || I === null ? null : (C + I) * 1000;
  const plantAuxiliary = calculateAuxiliaryElectricity(N, O);
  const T = AE === null || AF === null ? null : AE + AF;
  const BS = BQ === null || BR === null ? null : BQ + BR;
  const shTho = divide(T, N, 1000);
  const adjustedTotal = adjustedAE === null || adjustedAF === null ? null : adjustedAE + adjustedAF;
  const shTinh = divide(adjustedTotal, O, 1000);
  const shTinhS1 = divide(adjustedAE, C);
  const shTinhS2 = divide(adjustedAF, I);

  return {
    D, E: auxiliaryS1.percent, G: divide(B, F, 1000),
    J, K: auxiliaryS2.percent, M: divide(H, L, 1000),
    N, O,
    P: auxiliaryS1.totalMwh === null || auxiliaryS2.totalMwh === null ? null : auxiliaryS1.totalMwh + auxiliaryS2.totalMwh,
    Q: plantAuxiliary.percent,
    R: F === null || L === null ? null : F + L,
    S: N === null || F === null || L === null ? null : divide(N, F + L),
    T,
    U: shTho,
    // QLKT 02-PD defines these two heat-rate indicators from coal and coal
    // HHV only. HFO/DO consumption is tracked separately and is intentionally
    // excluded so the web result remains directly comparable with QLKT.
    V: shTho === null || AJ === null ? null : shTho * AJ / 1000,
    W: shTinh === null || AJ === null ? null : shTinh * AJ / 1000,
    Y: divide(AE, B), Z: divide(AF, H), AA: shTinh,
    AG: shTinhS1, AH: shTinhS2,
    AI: shTinh,
    AL: shTinhS1 === null || AJ === null ? null : shTinhS1 * AJ / 1000,
    AM: shTinhS2 === null || AJ === null ? null : shTinhS2 * AJ / 1000,
    AN: divide(AE, B) === null || AJ === null ? null : divide(AE, B)! * AJ / 1000,
    AO: divide(AF, H) === null || AJ === null ? null : divide(AF, H)! * AJ / 1000,
    AP: shTinhS1 === null || CX === null ? null : shTinhS1 * CX / 1000,
    AQ: shTinhS2 === null || CX === null ? null : shTinhS2 * CX / 1000,
    AE_ADJ: adjustedAE, AF_ADJ: adjustedAF,
    AK: AJ === null ? null : AJ / 4.1868,
    BO: divide(BN, N, 1000),
    BP: divide(BN, O === null ? null : O / 1000),
    BS,
    BT: divide(BQ, B), BU: divide(BQ, C),
    BV: divide(BR, H), BW: divide(BR, I),
    BX: divide(BS, B === null || H === null ? null : B + H),
    BY: divide(BS, C === null || I === null ? null : C + I),
  };
}
