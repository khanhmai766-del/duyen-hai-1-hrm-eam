import type { EquipmentNode } from "@prisma/client";

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
