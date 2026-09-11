import type { Contract } from "./contract";
import type {
  ContractItemImportDraft,
  ContractItemWeightAllocationMethod,
  PdfImportPreviewResponse,
} from "./contract-item-import";

export type ContractFormImportDraft = Partial<
  Omit<Contract, "id" | "stt" | "version" | "supervisors">
>;

export type ContractEvidenceField =
  | "contractNumber"
  | "signedDate"
  | "packageName"
  | "contractorName"
  | "contractorAddress"
  | "contractorPhone"
  | "contractorRepresentative"
  | "contractDurationDays"
  | "serviceProvisionDurationDays"
  | "serviceDurationText"
  | "unitExecutionDurationDays"
  | "unitExecutionContinuous"
  | "unitExecutionTriggerText"
  | "effectiveConditionText";

export interface ContractFieldEvidence {
  field: ContractEvidenceField;
  sourcePage: number | null;
  evidence: string;
  confidence: number | null;
}

export interface ContractCreatePdfPreviewResponse
  extends Omit<PdfImportPreviewResponse, "drafts"> {
  contractDraft: ContractFormImportDraft;
  contractEvidence: ContractFieldEvidence[];
  drafts: ContractItemImportDraft[];
}

export type PendingContractPdfImport = {
  items: ContractItemImportDraft[];
  weightAllocationMethod: ContractItemWeightAllocationMethod;
  redactionConfirmed: true;
};
