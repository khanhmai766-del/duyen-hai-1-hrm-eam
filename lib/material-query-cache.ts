import type { QueryClient } from "@tanstack/react-query";

/** Danh mục, kho lô, phiếu và lịch cùng đọc một nguồn vật tư. */
export function invalidateMaterialQueries(qc: QueryClient) {
  return Promise.all(["materials", "material-stock-lots", "other-material-stock", "oil-stock", "device",
    "device-material-options", "material-ticket-options", "material-tickets", "replacements", "replacement",
    "replacement-history", "replacement-device-options", "replacement-point-options", "equipment-dashboard", "ticket-lots"]
    .map(key => qc.invalidateQueries({ queryKey: [key] })));
}
