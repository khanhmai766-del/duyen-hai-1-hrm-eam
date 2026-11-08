import { CTKTKT_INPUT_FIELDS } from './ctktkt-fields.generated';
import { CTKTKT_EXTRA_INPUT_FIELDS } from './ctktkt-extra-fields';
import { CTKTKT_BCSX_LINKED_CELLS } from './ctktkt-bcsx-link';
import { CTKTKT_WATER_LINKED_CELLS } from './ctktkt-water-link';
import { NH3_DCS_START_METER_CELLS } from './ctktkt-report';

/** Shared by correction picker and API: linked readings are edited at their source. */
export const REPORT_WRITABLE_FIELDS = [...CTKTKT_INPUT_FIELDS, ...CTKTKT_EXTRA_INPUT_FIELDS]
  .filter((field, index, all) => all.findIndex(item => item.cell === field.cell) === index)
  .filter(field => !CTKTKT_BCSX_LINKED_CELLS.has(field.cell)
    && !CTKTKT_WATER_LINKED_CELLS.has(field.cell)
    && !NH3_DCS_START_METER_CELLS.has(field.cell));
export const REPORT_WRITABLE_CELLS = new Set<string>(REPORT_WRITABLE_FIELDS.map(field => field.cell));
