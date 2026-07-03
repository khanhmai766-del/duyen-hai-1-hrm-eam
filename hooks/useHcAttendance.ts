"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export interface HcMember {
  id: string;
  userId: string;
  hours: number;
  isApproved: boolean;
  note: string | null;
  isRegistered: boolean;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; position: string | null; avatarUrl: string | null; phone: string | null };
}
export interface HcGroup {
  id: string;
  date: string;
  content: string;
  hours: number;
  period: "FULL_DAY" | "MORNING" | "MORNING_OFF" | "AFTERNOON" | null;
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
  });
}

export function useHcRegistrations(from: string) {
  return useQuery({
    queryKey: ["hc-registrations", from],
    queryFn: () => apiGet<HcRegistration[]>(`/api/hc-registrations?from=${from}`),
  });
}

export function useCreateHcGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; content: string; hours: number; period?: "FULL_DAY" | "MORNING" | "AFTERNOON" }) => apiMutate("/api/hc-groups", "POST", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hc-groups"] }),
  });
}

export function useUpdateHcGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; content?: string; hours?: number; period?: "FULL_DAY" | "MORNING" | "AFTERNOON" }) => apiMutate("/api/hc-groups", "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hc-groups"] }),
  });
}

export function useDeleteHcGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/hc-groups?id=${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hc-groups"] }),
  });
}

export function useHcCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body:
        | { groupId: string; hours: number }
        | { date: string; period: "FULL_DAY" | "MORNING" | "MORNING_OFF" | "AFTERNOON"; note?: string; workNote?: string }
    ) =>
      apiMutate("/api/hc-groups/checkin", "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hc-groups"] });
      qc.invalidateQueries({ queryKey: ["hc-registrations"] });
      qc.invalidateQueries({ queryKey: ["me-dashboard"] });
    },
  });
}

export function useHcRecall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => apiMutate(`/api/hc-groups/checkin?groupId=${groupId}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hc-groups"] });
      qc.invalidateQueries({ queryKey: ["me-dashboard"] });
    },
  });
}

export function useHcApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { groupId: string; ids?: string[]; note?: string }) => apiMutate("/api/hc-groups/checkin", "PUT", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hc-groups"] });
      qc.invalidateQueries({ queryKey: ["hc-registrations"] });
      qc.invalidateQueries({ queryKey: ["me-dashboard"] });
    },
  });
}

export function useHcUpdateRegistrationNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { groupId: string; id: string; note: string }) =>
      apiMutate("/api/hc-groups/checkin", "PUT", { groupId: body.groupId, ids: [body.id], note: body.note, action: "NOTE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hc-groups"] });
      qc.invalidateQueries({ queryKey: ["hc-registrations"] });
      qc.invalidateQueries({ queryKey: ["me-dashboard"] });
    },
  });
}

export function useHcUpdateWorkNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { groupId: string; id: string; note: string }) =>
      apiMutate("/api/hc-groups/checkin", "PUT", { groupId: body.groupId, ids: [body.id], note: body.note, action: "NOTE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hc-groups"] });
      qc.invalidateQueries({ queryKey: ["hc-registrations"] });
      qc.invalidateQueries({ queryKey: ["me-dashboard"] });
    },
  });
}

export function useHcCancelRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (checkInId: string) => apiMutate(`/api/hc-groups/checkin?checkInId=${checkInId}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hc-groups"] });
      qc.invalidateQueries({ queryKey: ["hc-registrations"] });
      qc.invalidateQueries({ queryKey: ["me-dashboard"] });
    },
  });
}
