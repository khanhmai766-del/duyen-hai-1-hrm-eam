export type AuxiliaryElectricityResult = {
  internalMwh: number | null;
  gridReceivedMwh: number;
  totalMwh: number | null;
  percent: number | null;
};

function normalizedGridReceived(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

export function calculateAuxiliaryElectricity(
  grossMwh: number | null,
  netMwh: number | null,
  gridReceivedMwh?: number | null,
): AuxiliaryElectricityResult {
  const internalMwh = grossMwh === null || netMwh === null ? null : grossMwh - netMwh;
  const receivedMwh = normalizedGridReceived(gridReceivedMwh);
  return {
    internalMwh,
    gridReceivedMwh: receivedMwh,
    totalMwh: internalMwh === null ? null : internalMwh + receivedMwh,
    percent: internalMwh === null || grossMwh === null || grossMwh === 0 ? null : internalMwh / grossMwh * 100,
  };
}
