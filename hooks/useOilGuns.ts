"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export interface OilGun {
  id: string;
  machine: string;
  code: string;
  wall: "REAR" | "FRONT";
  position: number;
  status: "available" | "unavailable";
  defect: string | null; // legacy — giữ tương thích, không dùng để nhập mới
  defectSccn: string | null; // Khiếm khuyết SCCN (sửa chữa cơ nhiệt)
  defectScd: string | null; // Khiếm khuyết SCĐ (sửa chữa điện)
  forceFlame: boolean; // Force tín hiệu ngọn lửa vòi dầu
  updatedBy: string | null;
  updatedAt: string;
}

export interface OilGunSummary {
  total: number;
  available: number;
  defective: number;
  unavailable: number;
}

function oilGunHasDefect(g: OilGun) {
  return !!(g.defectSccn?.trim() || g.defectScd?.trim());
}

function summarizeOilGuns(guns: OilGun[]): OilGunSummary {
  return {
    total: guns.length,
    available: guns.filter((g) => g.status === "available" && !oilGunHasDefect(g)).length,
    defective: guns.filter((g) => g.status === "available" && oilGunHasDefect(g)).length,
    unavailable: guns.filter((g) => g.status === "unavailable").length,
  };
}

export function useOilGuns(machine: string) {
  return useQuery({
    queryKey: ["oil-guns", machine],
    queryFn: async () => {
      const res = await apiGet<OilGun[]>(`/api/oil-guns?machine=${machine}`);
      return { guns: res.data, summary: res.meta?.summary as OilGunSummary | undefined };
    },
  });
}

export interface OilGunUpdate {
  machine: string;
  code: string;
  status?: "available" | "unavailable";
  defectSccn?: string | null;
  defectScd?: string | null;
  forceFlame?: boolean;
}

export function useUpdateOilGun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OilGunUpdate) => apiMutate<OilGun>("/api/oil-guns", "PUT", body),
    onSuccess: (updated, vars) => {
      qc.setQueryData<{ guns: OilGun[]; summary?: OilGunSummary }>(["oil-guns", vars.machine], (current) => {
        if (!current) return current;

        const guns = current.guns.map((gun) => (gun.id === updated.id ? updated : gun));
        return { guns, summary: summarizeOilGuns(guns) };
      });
      return qc.invalidateQueries({ queryKey: ["oil-guns", vars.machine] });
    },
  });
}
