import type {
  User,
  Device,
  RepairLog,
  Material,
  Shift,
  ShiftAssignment,
  CheckIn,
  ShiftHandover,
  DeviceMaterial,
  AuditLog,
} from "@prisma/client";

export type {
  User,
  Device,
  RepairLog,
  Material,
  Shift,
  ShiftAssignment,
  CheckIn,
  ShiftHandover,
  DeviceMaterial,
  AuditLog,
};

// Standard API envelope
export interface ApiResponse<T> {
  data: T | null;
  meta?: Record<string, unknown> | null;
  error?: string | null;
}

export type SafeUser = Omit<User, "passwordHash">;

export interface DeviceWithRelations extends Device {
  repairLogs: RepairLog[];
  materials: (DeviceMaterial & { material: Material })[];
}

export interface RepairLogWithRelations extends RepairLog {
  device: Pick<Device, "id" | "code" | "name" | "system">;
  createdBy: Pick<User, "id" | "name" | "position">;
  approvedBy: Pick<User, "id" | "name"> | null;
}

export interface ShiftAssignmentWithUser extends ShiftAssignment {
  user: Pick<User, "id" | "name" | "phone" | "avatarUrl" | "signatureUrl" | "position">;
}

export interface CheckInWithUser extends CheckIn {
  user: Pick<User, "id" | "name" | "position" | "avatarUrl">;
}

export interface OrgChartNodeData {
  id: string;
  positionLabel: string;
  parentId: string | null;
  isApproved: boolean;
  user: { id: string; name: string; phone: string | null; avatarUrl: string | null };
  children: OrgChartNodeData[];
}

export interface DeviceStatusCount {
  status: string;
  count: number;
}
