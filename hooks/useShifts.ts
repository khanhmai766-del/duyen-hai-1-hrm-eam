"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { ShiftAssignmentWithUser, CheckInWithUser } from "@/types";

export interface ShiftDetail {
  id: string;
  date: string;
  shiftType: string;
  unit: string;
  isAttendanceLocked: boolean;
  assignments: ShiftAssignmentWithUser[];
  checkIns: CheckInWithUser[];
  handovers: any[];
}

export function useShift(
  params: { date: string; shiftType?: string; unit?: string },
  options: { refetchInterval?: number | false } = {}
) {
  const qs = new URLSearchParams();
  qs.set("date", params.date);
  if (params.shiftType) qs.set("shiftType", params.shiftType);
  if (params.unit) qs.set("unit", params.unit);
  return useQuery({
    queryKey: ["shift", params],
    queryFn: () => apiGet<ShiftDetail | null>(`/api/shifts?${qs.toString()}`),
    staleTime: 15 * 1000,
    refetchInterval: options.refetchInterval,
    refetchIntervalInBackground: Boolean(options.refetchInterval),
  });
}

export function useShifts() {
  return useQuery({
    queryKey: ["shifts"],
    queryFn: () => apiGet<any[]>("/api/shifts"),
    staleTime: 60 * 1000,
  });
}

export interface TimesheetEntry {
  userId: string;
  day: number;
  shiftType: string;
  hours: number;
  isApproved: boolean;
}
export interface HcEntry {
  userId: string;
  day: number;
  hours: number;
  content: string;
  note: string | null;
  period: string | null;
}
export interface TimesheetOverride {
  userId: string;
  date: string;
  day: number;
  line: "shift1" | "shift2" | "hc";
  value: string;
  note: string | null;
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
}
export interface Timesheet {
  month: number;
  year: number;
  entries: TimesheetEntry[];
  hcEntries: HcEntry[];
  overrides: TimesheetOverride[];
  canEdit: boolean;
  canEditOwn: boolean;
}

/** Approved attendance (bảng công) for a month — `month` is "YYYY-MM". */
export function useTimesheet(month: string, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: ["timesheet", month],
    queryFn: () => apiGet<Timesheet>(`/api/shifts/timesheet?month=${month}`),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useUpdateTimesheetOverride(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { userId: string; date: string; line: "shift1" | "shift2" | "hc"; value: string | null; note?: string }) =>
      apiMutate("/api/shifts/timesheet", "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timesheet", month] }),
  });
}

export interface RosterSchedule {
  url: string | null;
  name?: string;
  uploadedAt?: string;
  uploadedBy?: string;
}

/** The official roster PDF (Lịch trực ca) uploaded by an admin. */
export function useRosterSchedule(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: ["roster-schedule"],
    queryFn: () => apiGet<RosterSchedule>("/api/roster-schedule"),
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

/** Upload (ADMIN) a new roster PDF — multipart, so it bypasses apiMutate. */
export function useUploadRoster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/roster-schedule", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Tải lên thất bại");
      return json.data as RosterSchedule;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roster-schedule"] }),
  });
}

/** Remove (ADMIN) the current roster PDF. */
export function useDeleteRoster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiMutate("/api/roster-schedule", "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roster-schedule"] }),
  });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { shiftId: string; userId: string; action: string; status?: string; note?: string }) =>
      apiMutate("/api/check-in", "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift"] });
      qc.invalidateQueries({ queryKey: ["me-dashboard"] });
    },
  });
}

export function useCheckInOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      date: string;
      shiftType: string;
      unit: string;
      positionLabel: string;
      hours?: number;
      swap?: boolean;
      swapNote?: string; // ghi chú trực đổi ca (đổi với ai, kíp/ca nào)
      userId?: string; // admin/Trưởng ca assigning another user (the "Thêm" picker)
    }) => apiMutate("/api/shifts/assign", "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift"] });
      qc.invalidateQueries({ queryKey: ["me-dashboard"] });
    },
  });
}

export function useRecallCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { date: string; shiftType: string; unit: string }) => {
      const qs = new URLSearchParams(params).toString();
      return apiMutate(`/api/shifts/assign?${qs}`, "DELETE");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift"] });
      qc.invalidateQueries({ queryKey: ["me-dashboard"] });
    },
  });
}

export function useApproveAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; shiftType: string; unit: string; ids?: string[] }) =>
      apiMutate("/api/shifts/assign", "PUT", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift"] });
      qc.invalidateQueries({ queryKey: ["me-dashboard"] });
    },
  });
}

export function useRemoveAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/shifts/assign?id=${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift"] });
      qc.invalidateQueries({ queryKey: ["me-dashboard"] });
    },
  });
}

export function useApproveCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (checkInId: string) => apiMutate("/api/check-in", "PUT", { checkInId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift"] });
      qc.invalidateQueries({ queryKey: ["me-dashboard"] });
    },
  });
}

export function useCreateHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { shiftId: string; fromUserId: string; toUserId: string; notes?: string; issues?: string }) =>
      apiMutate("/api/handover", "POST", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift"] }),
  });
}
