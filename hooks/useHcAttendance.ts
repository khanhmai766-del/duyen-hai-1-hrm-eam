"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { HcPeriod } from "@/lib/hc-period";

function invalidateHcAttendance(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["hc-groups"] });
  void qc.invalidateQueries({ queryKey: ["hc-registrations"] });
  void qc.invalidateQueries({ queryKey: ["me-dashboard"] });
}

export interface HcMember {
  id: string;
  userId: string;
  hours: number;
  isApproved: boolean;
  note: string | null;
  isRegistered: boolean;
  registrationStatus: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  cancellationReason: string | null;
  rejectionCount: number;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; position: string | null; avatarUrl: string | null; phone: string | null };
}
export interface HcGroup {
  id: string;
  date: string;
  content: string;
  hours: number;
  period: HcPeriod | null;
  unit: string | null;
  createdById: string;
  createdBy: { id: string; name: string };
  members: HcMember[];
}
export interface HcRegistration extends HcMember {
  group: Omit<HcGroup, "members">;
}
export function useHcGroups(date: string) {
  return useQuery({
    queryKey: ["hc-groups", date],
    queryFn: () => apiGet<HcGroup[]>(`/api/hc-groups?date=${date}`),
    refetchInterval: 30_000,
  });
}

type HcRegistrationQueryOptions = {
  archive?: boolean;
  enabled?: boolean;
};

export function useHcRegistrations(from: string, to?: string, options: HcRegistrationQueryOptions = {}) {
  const qs = new URLSearchParams({ from });
  if (to) qs.set("to", to);
  if (options.archive) qs.set("scope", "archive");
  return useQuery({
    queryKey: ["hc-registrations", options.archive ? "archive" : "timeline", from, to ?? ""],
    queryFn: () => apiGet<HcRegistration[]>(`/api/hc-registrations?${qs.toString()}`),
    enabled: options.enabled ?? true,
    refetchInterval: 30_000,
  });
}

export function useCreateHcGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; content: string; hours: number; period?: HcPeriod }) => apiMutate("/api/hc-groups", "POST", body),
    onSuccess: () => invalidateHcAttendance(qc),
  });
}

export function useUpdateHcGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; content?: string; hours?: number; period?: HcPeriod }) => apiMutate("/api/hc-groups", "PUT", body),
    onSuccess: () => invalidateHcAttendance(qc),
  });
}

export function useDeleteHcGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/hc-groups?id=${id}`, "DELETE"),
    onSuccess: () => invalidateHcAttendance(qc),
  });
}

export function useHcCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body:
        | { groupId: string; hours: number }
        | { date: string; period: HcPeriod; note?: string; workNote?: string }
    ) =>
      apiMutate("/api/hc-groups/checkin", "POST", body),
    onSuccess: () => invalidateHcAttendance(qc),
  });
}

export function useHcRecall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => apiMutate(`/api/hc-groups/checkin?groupId=${groupId}`, "DELETE"),
    onSuccess: () => invalidateHcAttendance(qc),
  });
}

export function useHcApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { groupId: string; ids?: string[]; note?: string }) => apiMutate("/api/hc-groups/checkin", "PUT", body),
    onSuccess: () => invalidateHcAttendance(qc),
  });
}

export function useHcUpdateRegistrationNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { groupId: string; id: string; note: string }) =>
      apiMutate("/api/hc-groups/checkin", "PUT", { groupId: body.groupId, ids: [body.id], note: body.note, action: "NOTE" }),
    onSuccess: () => invalidateHcAttendance(qc),
  });
}

export function useHcUpdateWorkNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { groupId: string; id: string; note: string }) =>
      apiMutate("/api/hc-groups/checkin", "PUT", { groupId: body.groupId, ids: [body.id], note: body.note, action: "NOTE" }),
    onSuccess: () => invalidateHcAttendance(qc),
  });
}

export function useHcCancelRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: string | { checkInId: string; action: "REJECT" | "CANCEL"; reason?: string; note?: string }) =>
      typeof input === "string"
        ? apiMutate(`/api/hc-groups/checkin?checkInId=${input}`, "DELETE")
        : apiMutate("/api/hc-groups/checkin", "PATCH", input),
    onSuccess: () => invalidateHcAttendance(qc),
  });
}
