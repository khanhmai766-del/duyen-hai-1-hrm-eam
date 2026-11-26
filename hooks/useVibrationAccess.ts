"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import { canEditVibrationArea, vibrationReadOnlyNotice, type VibrationAccess } from "@/lib/vibration/position-access";

/** Quyền nhập theo cương vị (GET /api/vibration/access). Chưa tải xong → coi là chỉ xem (máy chủ vẫn là chốt chặn cuối). */
export function useVibrationAccess() {
  const q = useQuery({
    queryKey: ["vibration-access"],
    queryFn: () => apiGet<VibrationAccess>("/api/vibration/access").then((r) => r.data),
    staleTime: 60_000,
  });
  const access = q.data ?? null;
  return {
    access,
    isLoading: q.isLoading,
    /** Được nhập thiết bị thuộc cương vị này (chưa tải xong → false). */
    canEditArea: (area: string) => !!access && canEditVibrationArea(access, area),
    /** Cương vị mặc định của ô chọn: cương vị nhập đầu tiên của người dùng có trong danh sách, không có thì phần tử đầu. */
    defaultArea: (areas: readonly string[]) => (access?.editAreas.find((a) => areas.includes(a)) ?? areas[0] ?? ""),
    /** Màn nhập (như app cũ): người vận hành chỉ thấy cương vị của mình trong ô chọn; admin / giám sát / chưa gán → đủ danh sách (chỉ xem). */
    entryAreas: (areas: readonly string[]) => {
      if (!access || access.admin || !access.editAreas.length) return [...areas];
      const own = areas.filter((a) => access.editAreas.includes(a));
      return own.length ? own : [...areas];
    },
    /** Thông báo chỉ-xem theo cương vị (null nếu được nhập). */
    notice: (area?: string) => (access ? vibrationReadOnlyNotice(access, area) : null),
  };
}
