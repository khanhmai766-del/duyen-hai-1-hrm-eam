export const CONTRACT_ITEM_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "ACCEPTED", "CANCELLED"] as const;
export type ContractItemStatus = (typeof CONTRACT_ITEM_STATUSES)[number];

export interface ContractItem {
  id: string;
  contractId: string;
  sequenceNumber: number;
  workScopeId?: string;
  itemCode?: string;
  groupCode?: string;
  groupName?: string;
  serviceDescription: string;
  workContent?: string;
  quantity?: number;
  completedQuantity?: number;
  unit?: string;
  serviceLocation?: string;
  completionDurationDays?: number;
  weightPercent: number;
  progressPercent: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status: ContractItemStatus;
  progressNote?: string;
  acceptanceStatus?: string;
  version: number;
}

export interface ContractItemChecklistItem {
  id: string;
  contractItemId: string;
  sequenceNumber: number;
  description: string;
  isCompleted: boolean;
  completedAt: string | null;
  completedBy: string | null;
  version: number;
}

export interface ContractItemDailyLog {
  id: string;
  contractItemId: string;
  logDate: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface ContractItemTracking {
  checklistItems: ContractItemChecklistItem[];
  dailyLogs: ContractItemDailyLog[];
  checklistCompletionPercent: number | null;
}

export type ContractItemInput = Omit<ContractItem, "id" | "contractId" | "sequenceNumber" | "version">;

export type ContractItemSummary = {
  totalItems: number;
  completedItems: number;
  allocatedWeightPercent: number;
  weightedProgressPercent: number | null;
  weightComplete: boolean;
};
