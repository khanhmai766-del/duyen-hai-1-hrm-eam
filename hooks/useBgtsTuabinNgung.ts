"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import {
  BGTS_TUABIN_NGUNG_FIELD_KEYS,
  BGTS_TUABIN_NGUNG_HOURS,
  type BgtsTuabinNgungFieldKey,
} from "@/lib/bgts-tuabin-ngung";

export type BgtsTuabinNgungRow = {
  id?: string;
  recordId?: string;
  timeHour: number;
} & Record<BgtsTuabinNgungFieldKey, number | null>;

export interface BgtsTuabinNgungRecord {
  id: string;
  unit: string;
  date: string;
  dayShiftSigner: string | null;
  middleShiftSigner: string | null;
  nightShiftSigner: string | null;
  dayShiftConfirmedAt: string | null;
  middleShiftConfirmedAt: string | null;
  nightShiftConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BgtsTuabinNgungData {
  record: BgtsTuabinNgungRecord | null;
  rows: BgtsTuabinNgungRow[];
}

export interface BgtsTuabinNgungArchiveItem {
  id: string;
  unit: string;
  date: string;
  dayShiftSigner: string | null;
  middleShiftSigner: string | null;
  nightShiftSigner: string | null;
  dayShiftConfirmedAt: string | null;
  middleShiftConfirmedAt: string | null;
  nightShiftConfirmedAt: string | null;
  updatedAt: string;
}

export interface BgtsTuabinNgungArchiveData {
  items: BgtsTuabinNgungArchiveItem[];
}

export interface BgtsTuabinNgungInput {
  unit: string;
  date: string;
  dayShiftSigner?: string | null;
  middleShiftSigner?: string | null;
  nightShiftSigner?: string | null;
  confirmShift?: "day" | "middle" | "night";
  rows: BgtsTuabinNgungRow[];
}

export function createEmptyBgtsRows(): BgtsTuabinNgungRow[] {
  return BGTS_TUABIN_NGUNG_HOURS.map((timeHour) => ({
    timeHour,
    ...Object.fromEntries(BGTS_TUABIN_NGUNG_FIELD_KEYS.map((key) => [key, null])),
  })) as BgtsTuabinNgungRow[];
}

export function mergeBgtsRows(rows: BgtsTuabinNgungRow[]) {
  const byHour = new Map(rows.map((row) => [row.timeHour, row]));
  return createEmptyBgtsRows().map((emptyRow) => ({
    ...emptyRow,
    ...(byHour.get(emptyRow.timeHour) ?? {}),
  }));
}

export function useBgtsTuabinNgung(unit: string, date: string) {
  return useQuery({
    queryKey: ["bgts-tuabin-ngung", unit, date],
    queryFn: async () => {
      const res = await apiGet<BgtsTuabinNgungData>(
        `/api/bgts-tuabin-ngung?unit=${encodeURIComponent(unit)}&date=${encodeURIComponent(date)}`
      );
      return { ...res.data, rows: mergeBgtsRows(res.data.rows) };
    },
    enabled: Boolean(unit && date),
  });
}

export function useBgtsTuabinNgungArchive(unit: string) {
  return useQuery({
    queryKey: ["bgts-tuabin-ngung-archive", unit],
    queryFn: async () => {
      const res = await apiGet<BgtsTuabinNgungArchiveData>(
        `/api/bgts-tuabin-ngung?unit=${encodeURIComponent(unit)}&archive=1`
      );
      return res.data;
    },
    enabled: Boolean(unit),
  });
}

export function useSaveBgtsTuabinNgung() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BgtsTuabinNgungInput) => apiMutate<BgtsTuabinNgungData>("/api/bgts-tuabin-ngung", "POST", body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["bgts-tuabin-ngung", variables.unit, variables.date] });
      qc.invalidateQueries({ queryKey: ["bgts-tuabin-ngung-archive", variables.unit] });
    },
  });
}

export function useResetBgtsTuabinNgungSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { unit: string; date: string; resetShift: "day" | "middle" | "night" }) =>
      apiMutate<BgtsTuabinNgungData>("/api/bgts-tuabin-ngung", "PATCH", body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["bgts-tuabin-ngung", variables.unit, variables.date] });
      qc.invalidateQueries({ queryKey: ["bgts-tuabin-ngung-archive", variables.unit] });
    },
  });
}
