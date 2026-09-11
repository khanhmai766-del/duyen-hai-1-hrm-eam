import type { ContractItemStatus } from "./contract-item";

export type PdfImportSource = "ai" | "openai" | "text" | "ocr";

export interface ContractItemImportDraft {
  draftId: string;
  itemCode: string;
  groupCode: string;
  groupName: string;
  serviceDescription: string;
  workContent: string;
  checklistItems: string[];
  quantity: number | null;
  unit: string;
  serviceLocation: string;
  completionDurationDays: number | null;
  weightPercent: number | null;
  plannedStartDate: string;
  plannedEndDate: string;
  progressPercent: number;
  status: ContractItemStatus;
  sourcePage: number | null;
  evidence: string;
  confidence: number | null;
  issues: string[];
}

export type ContractItemWeightAllocationMethod = "EQUAL" | "MANUAL";

export interface PdfImportPreviewResponse {
  file: { name: string; size: number; type: string };
  provider: { id: string; model: string | null };
  extraction: {
    source: PdfImportSource;
    pageCount: number | null;
    textLength: number | null;
    textPreview: string;
  };
  drafts: ContractItemImportDraft[];
  message: string;
}
