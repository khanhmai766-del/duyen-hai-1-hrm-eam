import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export type ScheduleVersion = {
  id: string; unit: string; year: number; month: number; versionNumber: number;
  status: "DRAFT" | "REVIEW" | "APPROVED" | "PUBLISHED" | "SUPERSEDED";
  generatedFromDate: string; basedOnVersionId: string | null; generationReason: string;
  generationWarnings: Array<{ date: string; positionId: string; positionName?: string; shiftType: string; message: string }> | null;
  approvedAt?: string | null; publishedAt?: string | null;
  rotationGroups?: Array<{
    templateId: string; templateCode: string; templateName: string;
    positions: Array<{ id: string; name: string }>;
  }>;
  createdAt: string; createdBy: { name: string }; _count?: { entries: number };
  entries?: ScheduleEntry[];
};
export type ScheduleEntry = {
  id: string; date: string; shiftType: "MORNING" | "AFTERNOON" | "NIGHT";
  positionConfigId: string; stationCode: "S1" | "S2" | null; employeeId: string;
  userName?: string;
  crewCode?: string | null;
  source: "GENERATED" | "MANUAL"; isLocked: boolean; note: string | null;
  positionConfig?: { name: string; positionType?: "SINGLE" | "S1_S2" | null };
};
export type ScheduleListData = {
  versions: ScheduleVersion[];
  positions: Array<{ id: string; name: string }>;
  events: Array<{
    id: string; employeeId: string; changeType: string; sourcePositionId: string | null;
    targetPositionId: string | null; effectiveDate: string; reason: string; createdAt: string;
  }>;
};
export type ScheduleComparison = {
  summary: { totalEntries: number; unchanged: number; added: number; removed: number; changed: number; warnings: number; affectedEmployees: number };
  added: ScheduleEntry[]; removed: ScheduleEntry[];
  warnings: Array<{ date: string; positionId: string; shiftType: string; message: string }>;
};

export function useShiftScheduleVersions(year: number, month: number) {
  return useQuery({
    queryKey: ["shift-schedule-versions", year, month],
    queryFn: () => apiGet<ScheduleListData>(`/api/shift-schedule-versions?year=${year}&month=${month}`),
  });
}
export function useShiftScheduleVersion(id?: string) {
  return useQuery({
    queryKey: ["shift-schedule-version", id],
    queryFn: () => apiGet<ScheduleVersion>(`/api/shift-schedule-versions?id=${id}`),
    enabled: !!id,
  });
}
export function useCompareShiftSchedules(left?: string, right?: string) {
  return useQuery({
    queryKey: ["shift-schedule-compare", left, right],
    queryFn: () => apiGet<ScheduleComparison>(`/api/shift-schedule-versions/compare?left=${left}&right=${right}`),
    enabled: !!left && !!right && left !== right,
  });
}
export function useGenerateShiftSchedule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiMutate("/api/shift-schedule-versions", "POST", body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["shift-schedule-versions"] });
      client.invalidateQueries({ queryKey: ["shift-schedule-version"] });
      client.invalidateQueries({ queryKey: ["shift-schedule-compare"] });
    },
  });
}
