import { isCoalStock24hStartEntryRequired, COAL_STOCK_24H_START_CELL } from "./coal-stock";
import { CTKTKT_CARRY_FORWARD_INPUT_CELLS, CTKTKT_OPERATING_HOURS_CELLS } from "./ctktkt-extra-fields";
import { CTKTKT_INSTALLED_CAPACITY_CELL } from "./ctktkt-defaults";
import { PMIS_PRODUCTION_CELLS } from "./ctktkt-pmis-sync";
import { NH3_DCS_START_METER_CELLS, NH3_START_LEVEL_CELLS, NH3_OPENING_STOCK_CELL } from "./ctktkt-report";

/** Returns false when a blank field is filled automatically by the report rules. */
export function shouldShowCtktktMissingField(
  cell: string,
  date: string,
  entriesByDate: Readonly<Record<string, Readonly<Record<string, string>>>>,
) {
  // The exported workbook supplies these defaults when no override is entered.
  if (cell === "E39" || cell === "H39") return false;
  if (cell === "NH3_DCS_RESET_S1" || cell === "NH3_DCS_RESET_S2") return false;
  if (cell.startsWith("ELEC_RESET_")) return false;
  if (cell.startsWith("PMIS_AUX_")) return false;
  if (cell === COAL_STOCK_24H_START_CELL) return isCoalStock24hStartEntryRequired(date);
  if (
    (PMIS_PRODUCTION_CELLS as readonly string[]).includes(cell)
    || cell === CTKTKT_INSTALLED_CAPACITY_CELL
    || NH3_START_LEVEL_CELLS.has(cell)
    || NH3_DCS_START_METER_CELLS.has(cell)
    || cell === NH3_OPENING_STOCK_CELL
  ) return false;
  if (cell === "W86" && !isCoalStock24hStartEntryRequired(date)) return false;
  if ((CTKTKT_OPERATING_HOURS_CELLS as readonly string[]).includes(cell)) return false;
  if (!CTKTKT_CARRY_FORWARD_INPUT_CELLS.has(cell)) return true;

  return !Object.keys(entriesByDate).some(earlierDate => {
    if (earlierDate >= date) return false;
    const raw = entriesByDate[earlierDate]?.[cell]?.trim().replace(/\s/g, "").replace(",", ".");
    return raw !== undefined && raw !== "" && Number.isFinite(Number(raw));
  });
}
