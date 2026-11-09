"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { ChemicalCatalogItem, ChemicalCode } from "@/modules/ctktkt/lib/chemical-usage/catalog";

/** Một lượt sử dụng hoá chất — đúng các cột GET /api/ctktkt/chemical-usage trả về. */
export type ChemicalRecord = {
  id: number;
  usage_date: string;
  chemical_code: ChemicalCode;
  material_code: string;
  chemical_name: string;
  unit: string;
  quantity: number;
  purpose: string;
  plant_unit: string;
  reference: string;
  entered_by_user_id: string;
  entered_by_name: string;
  entered_by_position: string;
  updated_by_user_id: string | null;
  updated_by_name: string;
  updated_by_position: string;
  created_at: string;
  updated_at: string;
};

export type ChemicalUsageMonth = {
  ok: true;
  month: string;
  records: ChemicalRecord[];
  catalog: ChemicalCatalogItem[];
  editableCodes: ChemicalCode[];
};

export type ChemicalUsageInput = {
  id?: number | null;
  usageDate: string;
  chemicalCode: string;
  quantity: number;
  purpose: string;
  reference: string;
};

const URL = "/api/ctktkt/chemical-usage";
/** Nằm dưới ["ctktkt"]: lượt ghi KTKT khác (làm cũ ["ctktkt"]) cũng làm mới dữ liệu này. */
const KEY = ["ctktkt", "chemical-usage"] as const;

/** Nhật ký hoá chất một tháng (YYYY-MM). */
export function useChemicalUsageMonth(month: string) {
  return useQuery({
    queryKey: [...KEY, month],
    queryFn: async ({ signal }) => (await apiGet<ChemicalUsageMonth>(`${URL}?month=${month}`, { signal })).data,
    enabled: /^\d{4}-\d{2}$/.test(month),
    staleTime: 30_000,
  });
}

/** Thêm (không có id) hoặc sửa (có id) một lượt sử dụng. */
export function useSaveChemicalUsage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChemicalUsageInput) => apiMutate<{ ok: true; id: number }>(URL, input.id ? "PUT" : "POST", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Xoá mềm (chỉ quản trị) — bản ghi được ẩn và lưu người xoá để truy vết. */
export function useDeleteChemicalUsage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiMutate<{ ok: true; id: number }>(`${URL}?id=${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
