import type { QlktSyncPayload } from './qlkt-sync';

/** Only invalidate the four unavailable heat-rate fields of confirmed stopped units. */
export function pmisShutdownEntries(payload: QlktSyncPayload) {
  return (payload.unavailableHeatRateUnits || []).flatMap(unit =>
    (unit === '1' ? ['DA', 'DC', 'DE', 'DG'] : ['DB', 'DD', 'DF', 'DH'])
      .map(fieldCode => ({ fieldCode, value: '', sourceLabel: `S${unit} ngừng — bỏ số liệu cũ, không gán 0` })),
  );
}
