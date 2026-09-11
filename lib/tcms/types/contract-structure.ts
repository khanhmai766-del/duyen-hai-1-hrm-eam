export const TIME_RULE_SCOPE_TYPES = ["CONTRACT", "WORK_SCOPE", "SERVICE", "GOODS", "ITEM", "UNIT", "OTHER"] as const;
export const DURATION_UNITS = ["DAY", "HOUR", "MONTH", "OTHER"] as const;
export const WORK_SCOPE_TYPES = ["LOT", "PACKAGE", "SYSTEM", "SUBSYSTEM", "EQUIPMENT", "LOCATION", "WORK_GROUP", "OTHER"] as const;

export type TimeRuleScopeType = (typeof TIME_RULE_SCOPE_TYPES)[number];
export type DurationUnit = (typeof DURATION_UNITS)[number];
export type WorkScopeType = (typeof WORK_SCOPE_TYPES)[number];

export interface ContractTimeRule {
  id: string;
  contractId: string;
  scopeType: TimeRuleScopeType;
  workScopeId?: string;
  ruleType?: string;
  durationValue?: number;
  durationUnit?: DurationUnit;
  isContinuous?: boolean;
  startTriggerType?: string;
  startTriggerDescription?: string;
  endTriggerType?: string;
  endTriggerDescription?: string;
  rawClause?: string;
  sourcePage?: number;
  evidence?: string;
  confidence?: number;
  sequence: number;
  version: number;
}

export type ContractTimeRuleInput = Omit<ContractTimeRule, "id" | "contractId" | "sequence" | "version">;

export interface WorkScope {
  id: string;
  contractId: string;
  parentScopeId?: string;
  scopeType: WorkScopeType;
  code?: string;
  name: string;
  description?: string;
  sequence: number;
  sourcePage?: number;
  evidence?: string;
  confidence?: number;
  version: number;
}

export type WorkScopeInput = Omit<WorkScope, "id" | "contractId" | "sequence" | "version">;

export interface WorkScopeNode extends WorkScope {
  children: WorkScopeNode[];
}
