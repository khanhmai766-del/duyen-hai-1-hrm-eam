export const SUPERVISION_DECISION_STATUSES = ["DRAFT", "ISSUED", "SUPERSEDED", "REVOKED"] as const;

export type SupervisionDecisionStatus = (typeof SUPERVISION_DECISION_STATUSES)[number];

export interface SupervisionAssignment {
  id: string;
  userId: string;
  displayName: string;
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  workScopeId?: string;
  workScopeCode?: string;
  workScopeName?: string;
  supervisorRole: string;
  responsibility?: string;
  activeFrom?: string;
  activeUntil?: string;
}

export interface SupervisionDecision {
  id: string;
  contractId: string;
  contractNumber: string;
  packageName: string;
  decisionNumber: string;
  decisionDate: string;
  title: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  status: SupervisionDecisionStatus;
  notes?: string;
  assignments: SupervisionAssignment[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type SupervisionAssignmentInput = Pick<SupervisionAssignment,
  "userId" | "workScopeId" | "supervisorRole" | "responsibility" | "activeFrom" | "activeUntil">;

export type SupervisionDecisionInput = Pick<SupervisionDecision,
  "contractId" | "decisionNumber" | "decisionDate" | "title" | "effectiveFrom" | "effectiveUntil" | "status" | "notes"> & {
    assignments: SupervisionAssignmentInput[];
  };

export interface SupervisionDecisionOptions {
  contracts: Array<{ id: string; contractNumber: string; packageName: string }>;
  personnel: Array<{ id: string; displayName: string; departmentId: string | null; departmentCode: string | null; departmentName: string | null }>;
  workScopes: Array<{ id: string; contractId: string; code?: string; name: string }>;
}
