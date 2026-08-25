"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiUpload } from "@/lib/fetcher";
import type { AnnualPlanImportPreview } from "@/lib/material-annual-plan-import";
import type { AnnualPlanSummaryRow } from "@/lib/material-annual-plan-summary";

export type MaterialAnnualPlanSummary = {
  year: number;
  rows: AnnualPlanSummaryRow[];
  periods: Array<{ periodKey: string; status: string }>;
  summary: {
    rowCount: number;
    chemicalRows: number;
    materialRows: number;
    lockedChemicalPeriods: number;
    draftChemicalPeriods: number;
  };
};

const annualPlanKey = (year: number) => ["material-annual-plans", year] as const;

export function useMaterialAnnualPlans(year: number) {
  return useQuery({
    queryKey: annualPlanKey(year),
    queryFn: () => apiGet<MaterialAnnualPlanSummary>(`/api/material-annual-plans?year=${year}`).then((response) => response.data),
    enabled: Number.isInteger(year),
    staleTime: 30_000,
  });
}

function annualPlanForm(file: File, sheetName?: string | null) {
  const form = new FormData();
  form.set("file", file);
  if (sheetName) form.set("sheetName", sheetName);
  return form;
}

export function usePreviewMaterialAnnualPlan() {
  return useMutation({
    mutationFn: ({ file, sheetName }: { file: File; sheetName?: string | null }) =>
      apiUpload<AnnualPlanImportPreview>(
        "/api/material-annual-plans/import/preview",
        annualPlanForm(file, sheetName),
      ),
  });
}

export function useCommitMaterialAnnualPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      sheetName,
      expectedHash,
      resolutions,
    }: {
      file: File;
      sheetName: string;
      expectedHash: string;
      resolutions: Record<string, number>;
    }) => {
      const form = annualPlanForm(file, sheetName);
      form.set("expectedHash", expectedHash);
      form.set("resolutions", JSON.stringify(resolutions));
      return apiUpload<{ year: number; created: number; updated: number; total: number; selectedSheet: string }>(
        "/api/material-annual-plans/import/commit",
        form,
      );
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: annualPlanKey(result.year) });
    },
  });
}

/* ---------- Biểu tháng QLVT.20, truy ngược luỹ kế và dự toán năm sau ---------- */

import { apiMutate } from "@/lib/fetcher";
import type { MonthlyReportResult } from "@/lib/material-monthly-report";
import type { ForecastResult } from "@/lib/material-annual-forecast";

export type MonthlyUsageRow = {
  id: string;
  replacedAt: string;
  periodKey: string;
  usedQuantity: number | null;
  plannedQuantity: number | null;
  unitLabel: string | null;
  unplanned: boolean;
  materialName: string | null;
  deviceLabel: string | null;
  systemLabel: string | null;
  pctNumber: string | null;
  requestNumber: string | null;
  bbntDoNumber: string | null;
  bbntDoUrl: string | null;
  proposalNumber: string | null;
  deliveryNoteNumber: string | null;
  doneByName: string | null;
  note: string | null;
  ticketId: string | null;
  ticketNumber: string | null;
  ticketStatus: string | null;
};

const monthlyKey = (periodKey: string) => ["material-monthly-report", periodKey] as const;

export function useMaterialMonthlyReport(periodKey: string) {
  return useQuery({
    queryKey: monthlyKey(periodKey),
    queryFn: () =>
      apiGet<MonthlyReportResult>(`/api/material-annual-plans/monthly?period=${periodKey}`).then((r) => r.data),
    enabled: /^\d{4}-\d{2}$/.test(periodKey),
    staleTime: 15_000,
  });
}

export function useSaveMonthlyRequest(periodKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown> & { id?: string }) =>
      body.id
        ? apiMutate(`/api/material-annual-plans/monthly/${body.id}`, "PUT", body)
        : apiMutate("/api/material-annual-plans/monthly", "POST", { ...body, periodKey }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: monthlyKey(periodKey) }),
  });
}

export function useDeleteMonthlyRequest(periodKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/material-annual-plans/monthly/${id}`, "DELETE", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: monthlyKey(periodKey) }),
  });
}

/** Chỉ tải khi người dùng thật sự bấm vào ô luỹ kế — dữ liệu này kéo theo cả phiếu vật tư. */
export function useMaterialUsageDetail(
  params: { year: number; category: string; nameKey: string; month?: number | null } | null,
) {
  return useQuery({
    queryKey: ["material-usage-detail", params?.year, params?.category, params?.nameKey, params?.month ?? "ALL"] as const,
    queryFn: () => {
      const search = new URLSearchParams({
        year: String(params!.year),
        category: params!.category,
        nameKey: params!.nameKey,
      });
      if (params?.month) search.set("month", String(params.month));
      return apiGet<{ year: number; month: number | null; rows: MonthlyUsageRow[]; total: number; unplannedTotal: number }>(
        `/api/material-annual-plans/usage?${search.toString()}`,
      ).then((r) => r.data);
    },
    enabled: Boolean(params),
    staleTime: 15_000,
  });
}

export function useMaterialAnnualForecast(year: number, enabled: boolean) {
  return useQuery({
    queryKey: ["material-annual-forecast", year] as const,
    queryFn: () => apiGet<ForecastResult>(`/api/material-annual-plans/forecast?year=${year}`).then((r) => r.data),
    enabled: enabled && Number.isInteger(year),
    staleTime: 60_000,
  });
}
