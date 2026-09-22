export const DEFAULT_PERMIT_MANAGING_UNIT = "Phân xưởng Vận hành 1";
export const DEFAULT_PERMIT_PLANT = "Duyên Hải 1";
export const PERMIT_MAX_EQUIPMENT = 30;
export const PERMIT_MAX_ATTACHMENTS = 10;
export const PERMIT_MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export type PermitEquipmentItem = {
  sourceSeq?: string;
  code: string;
  name: string;
  kks: string;
  technicalSpec: string;
};

export type PermitAttachment = {
  id: string;
  permitId: string;
  originalName: string;
  mimeType: string;
  bytes: number;
  createdAt: string;
};

export function permitEquipmentItems(value: unknown): PermitEquipmentItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PermitEquipmentItem => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item) => ({ sourceSeq: typeof item.sourceSeq === "string" ? item.sourceSeq : undefined,
      code: String(item.code ?? ""), name: String(item.name ?? ""),
      kks: String(item.kks ?? ""), technicalSpec: String(item.technicalSpec ?? "") }));
}
