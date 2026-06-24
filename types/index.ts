import type {
  AuditLog,
  CheckIn,
  EquipmentMaterial,
  Material,
  RepairLog,
  Shift,
  ShiftAssignment,
  ShiftHandover,
  User,
} from "@prisma/client";

export type {
  AuditLog,
  CheckIn,
  EquipmentMaterial,
  Material,
  RepairLog,
  Shift,
  ShiftAssignment,
  ShiftHandover,
  User,
};

export interface Device {
  id: string;
  code: string;
  name: string;
  system: string | null;
  managingPosition?: string | null;
  images?: string[];
  attachedInfo?: string | null;
  documentUrl?: string | null;
  qrCodeData?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

// Standard API envelope
export interface ApiResponse<T> {
  data: T | null;
  meta?: Record<string, unknown> | null;
  error?: string | null;
}

export type SafeUser = Omit<User, "passwordHash">;

export interface DeviceWithRelations extends Device {
  repairLogs: RepairLog[];
  materials: (EquipmentMaterial & { material: Material })[];
}

export interface RepairLogWithRelations extends RepairLog {
  deviceId?: string;
  device: Device;
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
