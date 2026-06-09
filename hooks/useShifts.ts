"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { ShiftAssignmentWithUser, CheckInWithUser } from "@/types";

export interface ShiftDetail {
  id: string;
  date: string;
  shiftType: string;
  unit: string;
  assignments: ShiftAssignmentWithUser[];
  checkIns: CheckInWithUser[];
  handovers: any[];
}

export function useShift(params: { date: string; shiftType?: string; unit?: string }) {
  const qs = new URLSearchParams();
  qs.set("date", params.date);
  if (params.shiftType) qs.set("shiftType", params.shiftType);
  if (params.unit) qs.set("unit", params.unit);
  return useQuery({
    queryKey: ["shift", params],
    queryFn: () => apiGet<ShiftDetail | null>(`/api/shifts?${qs.toString()}`),
  });
}

export function useShifts() {
  return useQuery({ queryKey: ["shifts"], queryFn: () => apiGet<any[]>("/api/shifts") });
}

export interface TimesheetEntry {
  userId: string;
  day: number;
  shiftType: string;
}
export interface HcEntry {
  userId: string;
  day: number;
  hours: number;
  content: string;
}
export interface Timesheet {
  month: number;
  year: number;
  entries: TimesheetEntry[];
  hcEntries: HcEntry[];
}

/** Approved attendance (bảng công) for a month — `month` is "YYYY-MM". */
export function useTimesheet(month: string) {
  return useQuery({
    queryKey: ["timesheet", month],
    queryFn: () => apiGet<Timesheet>(`/api/shifts/timesheet?month=${month}`),
  });
}

export interface RosterSchedule {
  url: string | null;
  name?: string;
  uploadedAt?: string;
  uploadedBy?: string;
}

/** The official roster PDF (Lịch trực ca) uploaded by an admin. */
export function useRosterSchedule() {
  return useQuery({
    queryKey: ["roster-schedule"],
    queryFn: () => apiGet<RosterSchedule>("/api/roster-schedule"),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift"] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift"] }),
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
