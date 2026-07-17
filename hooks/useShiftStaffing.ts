import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";

export type StaffingPosition = {
  id: string | null;
  name: string;
  requiredPerShift: number | null;
  requiredMorningStaff: number | null;
  requiredAfternoonStaff: number | null;
  requiredNightStaff: number | null;
  positionType: "SINGLE" | "S1_S2" | null;
  trainingRowName: string | null;
  showTrainingRow: boolean;
  isActive: boolean;
};
export type StaffingUser = {
  id: string;
  employeeId: string;
  name: string;
  position: string | null;
};
export type StaffingAssignment = {
  id: string;
  userId: string;
  positionId: string;
  rosterColumn: string | null;
  isTrainingRow: boolean;
  crewCode: string | null;
  phaseIndex: number | null;
  cycleStartDate: string | null;
  rosterStation: "S1" | "S2" | "FLEX" | null;
  stationCode: "S1" | "S2" | "FLEX" | null;
  assignmentType:
    "OFFICIAL" | "BACKUP" | "TRAINING" | "TEMPORARY" | "ADMINISTRATIVE";
  startDate: string;
  endDate: string | null;
  status: "ACTIVE" | "ENDED";
  changeReason: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; employeeId: string; name: string };
  position: {
    id: string;
    name: string;
    positionType: "SINGLE" | "S1_S2" | null;
  };
  createdBy: { name: string };
  updatedBy: { name: string };
};
export type RotationTemplate = {
  id: string;
  code: string;
  name: string;
  cycleLength: number;
  cyclePattern: Array<"MORNING" | "AFTERNOON" | "NIGHT" | "OFF">;
  description: string | null;
  isActive: boolean;
};
export type PositionRotation = {
  id: string;
  positionConfigId: string;
  rotationTemplateId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string;
  isActive: boolean;
  rotationTemplate: RotationTemplate;
  createdBy: { name: string };
  updatedBy: { name: string };
};
export type ShiftStaffingData = {
  positions: StaffingPosition[];
  assignments: StaffingAssignment[];
  users: StaffingUser[];
  rotationTemplates: RotationTemplate[];
  positionRotations: PositionRotation[];
  permissionLevel: string;
};

export function useShiftStaffing() {
  return useQuery({
    queryKey: ["shift-staffing"],
    queryFn: () => apiGet<ShiftStaffingData>("/api/shift-staffing"),
  });
}
export function useMutateShiftStaffing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiMutate("/api/shift-staffing", "POST", body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["shift-staffing"] }),
  });
}
