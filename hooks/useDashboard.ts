"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import { fetchWeather, PLANT_LOCATION } from "@/lib/weather";
import {
  getBrowserLocation,
  reverseGeocode,
  fetchPlaceImages,
  type Coords,
  type PlaceInfo,
} from "@/lib/location";

export interface MyDashboard {
  avatarUrl: string | null;
  workingDays: number;
  attendanceDays: number[];
  adminDays: { day: number; hours: number }[];
  daysInMonth: number;
  position: string | null;
  unit: string | null;
  pendingPosition: string | null;
  dutyDate: string | null;
  dutyShiftType: string | null;
  checkedInToday: boolean;
  checkInStatus: string | null;
  month: number;
  year: number;
}

export function useMyDashboard(month?: string) {
  const qs = month ? `?month=${month}` : "";
  return useQuery({
    queryKey: ["me-dashboard", month ?? "current"],
    queryFn: () => apiGet<MyDashboard>(`/api/me/dashboard${qs}`),
    staleTime: 30 * 1000,
  });
}

export interface OperationEvent {
  id: string;
  type: string;
  title: string;
  date: string;
  note: string | null;
  createdBy: { name: string };
}

export interface SafeOperationSetting {
  id: string;
  unit: "S1" | "S2";
  startedAt: string | null;
  pausedAt: string | null;
  updatedAt: string;
}

export function useSafeOperations() {
  return useQuery({
    queryKey: ["safe-operation"],
    queryFn: () => apiGet<SafeOperationSetting[]>("/api/safe-operation"),
    staleTime: 60 * 1000,
  });
}

export function useUpdateSafeOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { unit: "S1" | "S2"; action: "SET_START"; startedAt: string } | { unit: "S1" | "S2"; action: "TOGGLE_PAUSE" | "RESET" }) =>
      apiMutate<SafeOperationSetting>("/api/safe-operation", "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["safe-operation"] }),
  });
}

export function useOperations(month?: string) {
  return useQuery({
    queryKey: ["operations", month ?? "recent"],
    queryFn: () => apiGet<OperationEvent[]>(`/api/operations${month ? `?month=${month}` : ""}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: string; title: string; date: string; note?: string }) =>
      apiMutate("/api/operations", "POST", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operations"] }),
  });
}

export function useUpdateOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; type: string; title: string; date: string; note?: string }) =>
      apiMutate("/api/operations", "PUT", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operations"] }),
  });
}

export function useDeleteOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiMutate(`/api/operations?id=${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operations"] }),
  });
}

export function useWeather(coords?: Coords) {
  return useQuery({
    queryKey: ["weather", coords?.latitude ?? "plant", coords?.longitude ?? "plant"],
    queryFn: () => fetchWeather(coords),
    staleTime: 1000 * 60 * 10,
    refetchInterval: 1000 * 60 * 15,
  });
}

/** The user's geolocation (browser GPS). Resolves null if denied/unavailable. */
export function useUserLocation() {
  return useQuery({
    queryKey: ["user-location"],
    queryFn: getBrowserLocation,
    staleTime: Infinity, // ask once per session
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** Place name + representative photos for the user's coordinate (Wikimedia Commons).
   With no GPS coordinate we keep the fixed plant identity (name + bundled photos). */
export function usePlaceInfo(coords?: Coords) {
  return useQuery<PlaceInfo>({
    queryKey: ["place-info", coords?.latitude ?? "plant", coords?.longitude ?? "plant"],
    queryFn: async () => {
      if (!coords) return { name: PLANT_LOCATION.name, images: [] };
      const [name, images] = await Promise.all([reverseGeocode(coords), fetchPlaceImages(coords)]);
      return { name: name ?? PLANT_LOCATION.name, images };
    },
    staleTime: 1000 * 60 * 60, // place imagery rarely changes
    refetchOnWindowFocus: false,
  });
}
