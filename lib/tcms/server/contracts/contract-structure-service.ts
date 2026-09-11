import { z } from "zod";

import type { Contract } from "../../types/contract";
import {
  DURATION_UNITS,
  TIME_RULE_SCOPE_TYPES,
  WORK_SCOPE_TYPES,
  type ContractTimeRuleInput,
  type WorkScope,
  type WorkScopeInput,
  type WorkScopeNode,
} from "../../types/contract-structure";

const optionalText = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);
const optionalNumber = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.coerce.number().finite().optional(),
);

const timeRuleSchema = z.object({
  scopeType: z.enum(TIME_RULE_SCOPE_TYPES),
  workScopeId: z.uuid().optional().nullable().transform((value) => value ?? undefined),
  ruleType: optionalText,
  durationValue: optionalNumber.refine((value) => value === undefined || value >= 0),
  durationUnit: z.enum(DURATION_UNITS).optional().nullable().transform((value) => value ?? undefined),
  isContinuous: z.boolean().optional().nullable().transform((value) => value ?? undefined),
  startTriggerType: optionalText,
  startTriggerDescription: optionalText,
  endTriggerType: optionalText,
  endTriggerDescription: optionalText,
  rawClause: optionalText,
  sourcePage: optionalNumber.refine((value) => value === undefined || Number.isInteger(value) && value > 0),
  evidence: optionalText,
  confidence: optionalNumber.refine((value) => value === undefined || value >= 0 && value <= 1),
}).strict().superRefine((rule, context) => {
  if ((rule.durationValue === undefined) !== (rule.durationUnit === undefined)) {
    context.addIssue({ code: "custom", message: "durationValue and durationUnit must be provided together" });
  }
  if (rule.scopeType === "WORK_SCOPE" && !rule.workScopeId) {
    context.addIssue({ code: "custom", message: "WORK_SCOPE requires workScopeId" });
  }
  if (rule.scopeType !== "WORK_SCOPE" && rule.workScopeId) {
    context.addIssue({ code: "custom", message: "workScopeId is only valid for WORK_SCOPE" });
  }
});

const workScopeSchema = z.object({
  parentScopeId: z.uuid().optional().nullable().transform((value) => value ?? undefined),
  scopeType: z.enum(WORK_SCOPE_TYPES),
  code: optionalText,
  name: z.string().trim().min(1),
  description: optionalText,
  sourcePage: optionalNumber.refine((value) => value === undefined || Number.isInteger(value) && value > 0),
  evidence: optionalText,
  confidence: optionalNumber.refine((value) => value === undefined || value >= 0 && value <= 1),
}).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new SyntaxError("INVALID_CONTRACT_STRUCTURE_FIELDS");
  return result.data;
}

export function parseContractTimeRuleInput(value: unknown): ContractTimeRuleInput {
  return parse(timeRuleSchema, value);
}

export function parseWorkScopeInput(value: unknown): WorkScopeInput {
  return parse(workScopeSchema, value);
}

export function parseExpectedVersion(value: unknown) {
  return parse(z.coerce.number().int().positive(), value);
}

export function buildWorkScopeTree(scopes: readonly WorkScope[]): WorkScopeNode[] {
  const nodes = new Map(scopes.map((scope) => [scope.id, { ...scope, children: [] as WorkScopeNode[] }]));
  const roots: WorkScopeNode[] = [];
  for (const scope of scopes) {
    const node = nodes.get(scope.id)!;
    const parent = scope.parentScopeId ? nodes.get(scope.parentScopeId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (items: WorkScopeNode[]) => {
    items.sort((a, b) => a.sequence - b.sequence);
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

function triggerType(text?: string) {
  if (!text) return undefined;
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  if (normalized.includes("ban giao mat bang")) return "SITE_HANDOVER";
  if (normalized.includes("hop dong co hieu luc") || normalized.includes("ngay co hieu luc")) return "CONTRACT_EFFECTIVE";
  return "OTHER";
}

export function legacyContractTimeRuleDrafts(contract: Pick<Contract,
  "contractDurationDays" | "serviceProvisionDurationDays" | "serviceDurationText" |
  "unitExecutionDurationDays" | "unitExecutionContinuous" | "unitExecutionTriggerText" | "effectiveConditionText"
>): ContractTimeRuleInput[] {
  const drafts: ContractTimeRuleInput[] = [];
  const sharedClause = contract.serviceDurationText;
  const legacyTrigger = contract.unitExecutionTriggerText;
  if (contract.contractDurationDays !== undefined) drafts.push({
    scopeType: "CONTRACT", durationValue: contract.contractDurationDays, durationUnit: "DAY",
    startTriggerType: triggerType(legacyTrigger ?? contract.effectiveConditionText),
    startTriggerDescription: legacyTrigger ?? contract.effectiveConditionText, rawClause: sharedClause,
  });
  if (contract.serviceProvisionDurationDays !== undefined) drafts.push({
    scopeType: "SERVICE", durationValue: contract.serviceProvisionDurationDays, durationUnit: "DAY", rawClause: sharedClause,
  });
  if (contract.unitExecutionDurationDays !== undefined) drafts.push({
    scopeType: "UNIT", durationValue: contract.unitExecutionDurationDays, durationUnit: "DAY",
    isContinuous: contract.unitExecutionContinuous, startTriggerType: triggerType(legacyTrigger),
    startTriggerDescription: legacyTrigger, rawClause: sharedClause,
  });
  return drafts;
}
