import type { EquipmentNode } from "@prisma/client";
import { scopeKks, type EquipmentMachine } from "@/lib/equipment-units";

type ProfileFields = Pick<EquipmentNode, "name" | "kks" | "imageUrl" | "attachedInfo" | "documentUrl">;

/** Cây và QR cùng đọc hồ sơ tổ máy; chuỗi rỗng là chủ động xóa phần kế thừa. */
export function equipmentProfileFields(node: Pick<ProfileFields, "name"> & Partial<ProfileFields>, profile: Partial<Omit<ProfileFields, "name"> & { name: string | null }> | null | undefined, machine: EquipmentMachine) {
  const imageUrl = profile?.imageUrl ?? (machine === "S2" ? null : node.imageUrl);
  return {
    name: profile?.name ?? node.name,
    kks: profile?.kks ?? scopeKks(node.kks ?? null, machine),
    images: imageUrl ? [imageUrl] : [],
    attachedInfo: profile?.attachedInfo ?? (machine === "S2" ? null : node.attachedInfo) ?? null,
    documentUrl: profile?.documentUrl ?? (machine === "S2" ? null : node.documentUrl) ?? null,
  };
}

export const EQUIPMENT_DEVICE_SELECT = {
  seq: true,
  name: true,
  parentSeq: true,
  imageUrl: true,
  attachedInfo: true,
  documentUrl: true,
} as const;

export type EquipmentDeviceNode = Pick<
  EquipmentNode,
  "seq" | "name" | "parentSeq" | "imageUrl" | "attachedInfo" | "documentUrl"
>;

export function equipmentNodeToDevice(node: EquipmentDeviceNode | null | undefined) {
  if (!node) return null;
  return {
    id: node.seq,
    code: node.seq,
    name: node.name,
    system: null as string | null,
    managingPosition: null as string | null,
    images: node.imageUrl ? [node.imageUrl] : [],
    attachedInfo: node.attachedInfo ?? null,
    documentUrl: node.documentUrl ?? null,
  };
}

export function withDeviceAlias<T extends { deviceSeq?: string | null; device?: EquipmentDeviceNode | null }>(row: T) {
  return {
    ...row,
    deviceId: row.deviceSeq ?? null,
    device: equipmentNodeToDevice(row.device),
  };
}
