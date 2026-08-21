"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, apiUpload } from "@/lib/fetcher";

/**
 * Hooks của module Tồn kho hóa chất.
 *
 * Không dùng `any`, không gọi `fetch` trực tiếp. Mọi kiểu ở đây phải khớp với thứ
 * `lib/chemical-inventory/queries.ts` trả về — Decimal đã được đổi sang `number` ở
 * tầng API, nên phía client luôn làm việc với số nguyên thủy.
 */

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

export type BaseUnit = "KG" | "TON" | "LITER";
export type ChemicalItemType = "CHEMICAL" | "HFO" | "DIESEL" | "OTHER";
export type PermissionLevel = "none" | "read" | "personal" | "manage" | "full";

export interface ChemicalItem {
  id: string;
  code: string;
  name: string;
  itemType: ChemicalItemType;
  baseUnit: BaseUnit;
  displayUnit: BaseUnit | null;
  trackingMode: "MONTHLY" | "DAILY";
  materialCode: string | null;
  /** Cương vị nhận hàng mặc định — điền sẵn khi tạo phiếu nhập. */
  defaultPosition: string | null;
  tankCapacity: number | null;
  lowStockThreshold: number | null;
}

export interface ChemicalPeriod {
  periodKey: string;
  status: "DRAFT" | "LOCKED";
  isSeed: boolean;
  generationMwh: number | null;
  lockedAt: string | null;
  note: string | null;
}

export interface GridCell {
  readingId: string | null;
  quantity: number | null;
  /** Nguyên văn khi ô nguồn ghi bằng chữ, ví dụ mức bồn đo bằng mm. */
  rawText: string | null;
  note: string | null;
  source: string | null;
}

export interface MonthlyGridRow {
  itemId: string;
  code: string;
  name: string;
  itemType: ChemicalItemType;
  baseUnit: BaseUnit;
  displayUnit: BaseUnit | null;
  trackingMode: "MONTHLY" | "DAILY";
  sheetRow: number | null;
  tankCapacity: number | null;
  lowStockThreshold: number | null;
  cells: Record<string, GridCell>;
  closingTotal: number | null;
  openingTotal: number | null;
  receivedTotal: number | null;
  consumedTotal: number | null;
  receiptCount: number;
  /** false với mặt hàng theo dõi hằng ngày — ô tồn cuối do hệ thống sinh. */
  editable: boolean;
  warnings: string[];
}

export interface MonthlyGrid {
  period: ChemicalPeriod & { exists: boolean };
  previousPeriodKey: string;
  positions: { code: string; label: string }[];
  rows: MonthlyGridRow[];
  totalsByUnit: Record<string, { closing: number | null; received: number | null; consumed: number | null }>;
  specificConsumption: number | null;
  warningCount: number;
}

export interface MonthlyGridMeta {
  items: ChemicalItem[];
  periods: ChemicalPeriod[];
  level: PermissionLevel;
  actingPosition: string | null;
}

export interface DailyTruck {
  id: string;
  vehicleNumber: string | null;
  vehicleRef: string | null;
  acceptedWeight: number;
  plantWeight: number | null;
  contractorWeight: number | null;
  source: string;
  materialTicketId: string | null;
  warnings: string[];
}

export interface DailyLogRow {
  date: string;
  day: number;
  readingId: string | null;
  openingStock: number | null;
  importedToday: number | null;
  closingStock: number | null;
  used: number | null;
  trucks: DailyTruck[];
  warnings: string[];
}

export interface DailyLog {
  item: {
    id: string;
    code: string;
    name: string;
    baseUnit: BaseUnit;
    displayUnit: BaseUnit | null;
    defaultPosition: string | null;
    tankCapacity: number | null;
    lowStockThreshold: number | null;
  };
  period: { periodKey: string; status: "DRAFT" | "LOCKED"; generationMwh: number | null; exists: boolean };
  rows: DailyLogRow[];
  monthOpening: number | null;
  monthReceived: number | null;
  monthClosing: number | null;
  monthConsumed: number | null;
  medianUsage: number | null;
  specificConsumption: number | null;
}

export interface AnnualRow {
  itemId: string;
  code: string;
  name: string;
  itemType: ChemicalItemType;
  baseUnit: BaseUnit;
  /** 12 phần tử; null = tháng chưa có dữ liệu, KHÔNG phải 0. */
  received: (number | null)[];
  consumed: (number | null)[];
  closing: (number | null)[];
  receivedTotal: number | null;
  consumedTotal: number | null;
  yearEndClosing: number | null;
}

export interface AnnualSummary {
  year: number;
  months: string[];
  rows: AnnualRow[];
  openPeriods: string[];
}

export interface ChemicalReceipt {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  baseUnit: BaseUnit;
  receivedAt: string;
  periodKey: string;
  vehicleNumber: string | null;
  vehicleRef: string | null;
  plantWeight: number | null;
  contractorWeight: number | null;
  acceptedWeight: number;
  receivingPosition: string | null;
  receivingPositionLabel: string | null;
  receivingPositionRaw: string | null;
  note: string | null;
  source: string;
  materialTicketId: string | null;
  warnings: string[];
  deletable: boolean;
}

export interface ChemicalContract {
  id: string;
  year: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  baseUnit: BaseUnit;
  materialCode: string | null;
  supplier: string | null;
  origin: string | null;
  contractQuantity: number;
  forecastDemand: number;
  received: number;
  remaining: number;
  shortfall: number;
  surplus: number;
  progress: number;
  note: string | null;
}

export interface ImportIssue {
  severity: "error" | "warning" | "info";
  sheet: string;
  row?: number;
  column?: string;
  code: string;
  message: string;
}

export interface ImportPreview {
  fileName: string;
  fileHash: string;
  bySheet: { sheet: string; role: string; rowsRead: number; rowsValid: number; rowsSkipped: number; rowsError: number }[];
  summary: {
    periods: number;
    readings: number;
    receipts: number;
    contracts: number;
    errorCount: number;
    warningCount: number;
  };
  issueCountByCode: Record<string, number>;
  issues: ImportIssue[];
  reconcile: {
    itemCode: string;
    periodKey: string;
    field: string;
    computed: number | null;
    sheetValue: number | null;
    delta: number | null;
    kind: string;
  }[];
  canCommit: boolean;
}

export interface ImportCommitResult {
  batchId: string;
  periodsUpserted: number;
  readingsUpserted: number;
  receiptsCreated: number;
  receiptsUpdated: number;
  receiptsLinked: number;
  contractsUpserted: number;
  itemsUpdated: number;
  plan: ImportPreview;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  fileHash: string;
  status: string;
  importedRows: number;
  updatedRows: number;
  skippedRows: number;
  errorRows: number;
  detail: unknown;
  createdById: string;
  createdAt: string;
}

export interface ReceiptFilters {
  month?: string;
  itemId?: string;
  position?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ReceiptPayload {
  itemId: string;
  receivedAt: string;
  vehicleNumber?: string | null;
  plantWeight?: number | null;
  contractorWeight?: number | null;
  receivingPosition?: string | null;
  note?: string | null;
}

// ---------------------------------------------------------------------------
// Khóa cache
// ---------------------------------------------------------------------------

export const chemicalKeys = {
  inventory: (month: string, filters?: Record<string, string | undefined>) =>
    ["chemical-inventory", month, filters ?? {}] as const,
  daily: (month: string, itemId: string) => ["chemical-daily", month, itemId] as const,
  annual: (year: number) => ["chemical-inventory-annual", year] as const,
  receipts: (filters: ReceiptFilters) => ["chemical-receipts", filters] as const,
  contracts: (year: number) => ["chemical-contracts", year] as const,
  importHistory: () => ["chemical-import-history"] as const,
};

/**
 * Mọi thay đổi số liệu đều làm sai lệch lưới tháng, nhật ký, tổng hợp năm và tiến
 * độ hợp đồng cùng lúc — nên làm mới tất cả, đừng đoán xem cái nào còn đúng.
 */
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["chemical-inventory"] });
  qc.invalidateQueries({ queryKey: ["chemical-daily"] });
  qc.invalidateQueries({ queryKey: ["chemical-inventory-annual"] });
  qc.invalidateQueries({ queryKey: ["chemical-receipts"] });
  qc.invalidateQueries({ queryKey: ["chemical-contracts"] });
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  return search.toString();
};

// ---------------------------------------------------------------------------
// Truy vấn
// ---------------------------------------------------------------------------

export function useChemicalInventory(
  month: string,
  filters: { q?: string; itemType?: string; position?: string } = {}
) {
  return useQuery({
    queryKey: chemicalKeys.inventory(month, filters),
    enabled: Boolean(month),
    queryFn: async () => {
      const res = await apiGet<MonthlyGrid>(`/api/chemical-inventory?${qs({ month, ...filters })}`);
      return { grid: res.data, meta: res.meta as MonthlyGridMeta };
    },
  });
}

export function useChemicalDailyLog(month: string, itemId: string | null) {
  return useQuery({
    queryKey: chemicalKeys.daily(month, itemId ?? ""),
    enabled: Boolean(month && itemId),
    queryFn: async () =>
      (await apiGet<DailyLog>(`/api/chemical-inventory/daily?${qs({ month, itemId })}`)).data,
  });
}

export function useChemicalAnnualSummary(year: number) {
  return useQuery({
    queryKey: chemicalKeys.annual(year),
    queryFn: async () => (await apiGet<AnnualSummary>(`/api/chemical-inventory/annual?year=${year}`)).data,
  });
}

export function useChemicalReceipts(filters: ReceiptFilters) {
  return useQuery({
    queryKey: chemicalKeys.receipts(filters),
    queryFn: async () => {
      const res = await apiGet<ChemicalReceipt[]>(`/api/chemical-inventory/receipts?${qs({ ...filters })}`);
      return { rows: res.data, meta: res.meta as { total: number; page: number; pageSize: number; level: PermissionLevel } };
    },
  });
}

export function useChemicalContracts(year: number) {
  return useQuery({
    queryKey: chemicalKeys.contracts(year),
    queryFn: async () => (await apiGet<ChemicalContract[]>(`/api/chemical-inventory/contracts?year=${year}`)).data,
  });
}

export function useChemicalImportHistory() {
  return useQuery({
    queryKey: chemicalKeys.importHistory(),
    queryFn: async () => (await apiGet<ImportBatch[]>("/api/chemical-inventory/import/history")).data,
  });
}

// ---------------------------------------------------------------------------
// Phiếu nhập
// ---------------------------------------------------------------------------

export function useCreateChemicalReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReceiptPayload) =>
      apiMutate<{ status: "created" | "linked"; id: string; message?: string }>(
        "/api/chemical-inventory/receipts",
        "POST",
        payload
      ),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateChemicalReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: ReceiptPayload & { id: string }) =>
      apiMutate<{ id: string }>(`/api/chemical-inventory/receipts/${id}`, "PUT", payload),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteChemicalReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate<{ id: string }>(`/api/chemical-inventory/receipts/${id}`, "DELETE"),
    onSuccess: () => invalidateAll(qc),
  });
}

// ---------------------------------------------------------------------------
// Bản đọc tồn
// ---------------------------------------------------------------------------

export function useUpdateChemicalReadings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      periodKey,
      readings,
    }: {
      periodKey: string;
      readings: { itemId: string; positionCode: string; quantity: number | null; note?: string | null }[];
    }) => apiMutate<MonthlyGrid>(`/api/chemical-inventory/periods/${periodKey}/readings`, "PUT", { readings }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSaveChemicalDailyReading() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      date,
      ...payload
    }: {
      date: string;
      itemId: string;
      positionCode: string;
      quantity: number | null;
      note?: string | null;
    }) => apiMutate<DailyLog>(`/api/chemical-inventory/daily/${date}`, "PUT", payload),
    onSuccess: () => invalidateAll(qc),
  });
}

// ---------------------------------------------------------------------------
// Kỳ
// ---------------------------------------------------------------------------

export function useOpenChemicalPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodKey: string) =>
      apiMutate<{ periodKey: string; status: string; created: boolean }>(
        `/api/chemical-inventory/periods/${periodKey}/open`,
        "POST"
      ),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useLockChemicalPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ periodKey, note }: { periodKey: string; note?: string }) =>
      apiMutate<{ periodKey: string; status: string; lockedAt: string | null }>(
        `/api/chemical-inventory/periods/${periodKey}/lock`,
        "POST",
        { note }
      ),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUnlockChemicalPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ periodKey, reason }: { periodKey: string; reason: string }) =>
      apiMutate<{ periodKey: string; status: string }>(
        `/api/chemical-inventory/periods/${periodKey}/unlock`,
        "POST",
        { reason }
      ),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdatePeriodGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ periodKey, generationMwh }: { periodKey: string; generationMwh: number | null }) =>
      apiMutate<{ periodKey: string; generationMwh: number | null }>(
        `/api/chemical-inventory/periods/${periodKey}/generation`,
        "PUT",
        { generationMwh }
      ),
    onSuccess: () => invalidateAll(qc),
  });
}

// ---------------------------------------------------------------------------
// Hợp đồng
// ---------------------------------------------------------------------------

export interface ContractPayload {
  year: number;
  itemId: string;
  materialCode?: string | null;
  supplier?: string | null;
  origin?: string | null;
  contractQuantity: number;
  forecastDemand?: number;
  note?: string | null;
}

export function useUpsertChemicalContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: ContractPayload & { id?: string }) =>
      id
        ? apiMutate<{ id: string }>(`/api/chemical-inventory/contracts/${id}`, "PUT", payload)
        : apiMutate<{ id: string }>("/api/chemical-inventory/contracts", "POST", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chemical-contracts"] });
    },
  });
}

export function useDeleteChemicalContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate<{ id: string }>(`/api/chemical-inventory/contracts/${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chemical-contracts"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Nhập từ Excel
// ---------------------------------------------------------------------------

/** Thử khô — không ghi gì, nên KHÔNG làm mới cache. */
export function useChemicalImportPreview() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiUpload<ImportPreview>("/api/chemical-inventory/import/preview", form);
    },
  });
}

export function useCommitChemicalImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, expectedHash }: { file: File; expectedHash?: string }) => {
      const form = new FormData();
      form.append("file", file);
      // Chốt đúng tệp vừa xem trước: đổi tệp giữa hai bước là ghi nhầm dữ liệu.
      if (expectedHash) form.append("expectedHash", expectedHash);
      return apiUpload<ImportCommitResult>("/api/chemical-inventory/import/commit", form);
    },
    onSuccess: () => {
      invalidateAll(qc);
      qc.invalidateQueries({ queryKey: chemicalKeys.importHistory() });
      // Phiếu vật tư có thể đã được gắn thêm chuyến xe.
      qc.invalidateQueries({ queryKey: ["material-tickets"] });
    },
  });
}
