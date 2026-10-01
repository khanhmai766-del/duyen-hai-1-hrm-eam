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
  coalStatus: "available" | "unavailable"; // lớp vòi than
  coalDefectNote: string | null; // khiếm khuyết vòi than (1 ô)
  coalUpdatedBy: string | null;
  coalUpdatedAt: string | null;
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

/** Thông tin ảnh chụp khi xem ngày cũ: `sourceDate` là ngày của bản được dùng (gần nhất <= ngày xem). */
export interface OilGunSnapshotInfo { date: string; sourceDate: string; capturedAt: string }

/** `date` rỗng = hiện tại (sửa được); có ngày cũ = trạng thái cuối ngày đó từ ảnh chụp hằng ngày (chỉ xem). */
export function useOilGuns(machine: string, date = "") {
  return useQuery({
    queryKey: ["oil-guns", machine, date],
    retry: false,
    queryFn: async () => {
      const res = await apiGet<OilGun[]>(`/api/oil-guns?machine=${machine}${date ? `&date=${date}` : ""}`);
      return {
        guns: res.data,
        summary: res.meta?.summary as OilGunSummary | undefined,
        note: (res.meta?.note as string | undefined) ?? "",
        noteUpdatedBy: (res.meta?.noteUpdatedBy as string | null | undefined) ?? null,
        noteUpdatedAt: (res.meta?.noteUpdatedAt as string | null | undefined) ?? null,
        snapshot: (res.meta?.snapshot as OilGunSnapshotInfo | null | undefined) ?? null,
        today: (res.meta?.today as string | undefined) ?? "",
        firstSnapshotDate: (res.meta?.firstSnapshotDate as string | null | undefined) ?? null,
      };
    },
  });
}

type OilGunQueryData = {
  guns: OilGun[];
  summary?: OilGunSummary;
  note?: string;
  noteUpdatedBy?: string | null;
  noteUpdatedAt?: string | null;
};

export interface OilGunUpdate {
  machine: string;
  code: string;
  status?: "available" | "unavailable";
  defectSccn?: string | null;
  defectScd?: string | null;
  forceFlame?: boolean;
  coalStatus?: "available" | "unavailable";
  coalDefectNote?: string | null;
}

export function useUpdateOilGun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OilGunUpdate) => apiMutate<OilGun>("/api/oil-guns", "PUT", body),
    onSuccess: (updated, vars) => {
      // Khoá "" = dữ liệu hiện tại (xem useOilGuns); ảnh chụp ngày cũ không đổi khi sửa.
      qc.setQueryData<OilGunQueryData>(["oil-guns", vars.machine, ""], (current) => {
        if (!current) return current;

        const guns = current.guns.map((gun) => (gun.id === updated.id ? updated : gun));
        return { ...current, guns, summary: summarizeOilGuns(guns) };
      });
      return qc.invalidateQueries({ queryKey: ["oil-guns", vars.machine] });
    },
  });
}

export function useUpdateOilGunNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { machine: string; note: string }) => apiMutate("/api/oil-guns/note", "PUT", body),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["oil-guns", vars.machine] }),
  });
}
