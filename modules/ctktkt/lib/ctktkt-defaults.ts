export const CTKTKT_INSTALLED_CAPACITY_CELL = "C181";
export const CTKTKT_INSTALLED_CAPACITY_MW = "1245";

export function applyCtktktFixedValue(cell: string, value: unknown) {
  return cell === CTKTKT_INSTALLED_CAPACITY_CELL
    ? CTKTKT_INSTALLED_CAPACITY_MW
    : String(value ?? "");
}
