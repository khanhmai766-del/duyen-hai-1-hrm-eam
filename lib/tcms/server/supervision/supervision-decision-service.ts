import { z } from "zod";

import {
  SUPERVISION_DECISION_STATUSES,
  type SupervisionDecision,
  type SupervisionDecisionInput,
} from "../../types/supervision-decision";

const optionalText = (maximum: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).max(maximum).optional(),
);
const optionalDate = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.iso.date().optional(),
);

const assignmentSchema = z.object({
  userId: z.uuid(),
  workScopeId: z.preprocess((value) => value === "" || value === null ? undefined : value, z.uuid().optional()),
  supervisorRole: z.string().trim().min(2).max(120),
  responsibility: optionalText(1000),
  activeFrom: optionalDate,
  activeUntil: optionalDate,
}).strict().superRefine((value, context) => {
  if (value.activeFrom && value.activeUntil && value.activeUntil < value.activeFrom) {
    context.addIssue({ code: "custom", message: "ASSIGNMENT_DATE_RANGE_INVALID" });
  }
});

const decisionSchema = z.object({
  contractId: z.uuid(),
  decisionNumber: z.string().trim().min(1).max(120),
  decisionDate: z.iso.date(),
  title: z.string().trim().min(2).max(500),
  effectiveFrom: z.iso.date(),
  effectiveUntil: optionalDate,
  status: z.enum(SUPERVISION_DECISION_STATUSES),
  notes: optionalText(2000),
  assignments: z.array(assignmentSchema).min(1).max(100),
}).strict().superRefine((value, context) => {
  if (value.effectiveUntil && value.effectiveUntil < value.effectiveFrom) {
    context.addIssue({ code: "custom", message: "DECISION_DATE_RANGE_INVALID" });
  }
  const keys = value.assignments.map((item) => `${item.userId}:${item.workScopeId ?? "CONTRACT"}:${item.supervisorRole.toLocaleLowerCase("vi")}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: "custom", message: "DUPLICATE_SUPERVISION_ASSIGNMENT" });
  }
  value.assignments.forEach((item, index) => {
    const from = item.activeFrom ?? value.effectiveFrom;
    const until = item.activeUntil ?? value.effectiveUntil;
    if (from < value.effectiveFrom || value.effectiveUntil && (!until || until > value.effectiveUntil)) {
      context.addIssue({ code: "custom", path: ["assignments", index], message: "ASSIGNMENT_OUTSIDE_DECISION_PERIOD" });
    }
  });
});

export function parseSupervisionDecisionInput(value: unknown): SupervisionDecisionInput {
  const result = decisionSchema.safeParse(value);
  if (!result.success) throw new SyntaxError(result.error.issues[0]?.message ?? "INVALID_SUPERVISION_DECISION_FIELDS");
  return result.data;
}

export function parseSupervisionDecisionVersion(value: unknown) {
  const result = z.coerce.number().int().positive().safeParse(value);
  if (!result.success) throw new SyntaxError("INVALID_SUPERVISION_DECISION_VERSION");
  return result.data;
}

function comparable(value: SupervisionDecision | SupervisionDecisionInput) {
  return {
    contractId:value.contractId, decisionNumber:value.decisionNumber, decisionDate:value.decisionDate,
    title:value.title, effectiveFrom:value.effectiveFrom, effectiveUntil:value.effectiveUntil, notes:value.notes,
    assignments:value.assignments.map((item) => ({ userId:item.userId,workScopeId:item.workScopeId,
      supervisorRole:item.supervisorRole,responsibility:item.responsibility,activeFrom:item.activeFrom,activeUntil:item.activeUntil })),
  };
}

export function supervisionAssignmentsChanged(current: SupervisionDecision, input: SupervisionDecisionInput) {
  return JSON.stringify(comparable(current).assignments) !== JSON.stringify(comparable(input).assignments);
}

export function assertSupervisionDecisionUpdate(current: SupervisionDecision, input: SupervisionDecisionInput) {
  if (current.status === "DRAFT") return;
  const contentChanged = JSON.stringify(comparable(current)) !== JSON.stringify(comparable(input));
  const closesIssuedDecision = current.status === "ISSUED" && (input.status === "REVOKED" || input.status === "SUPERSEDED");
  if (contentChanged || !closesIssuedDecision) throw new Error("SUPERVISION_DECISION_IMMUTABLE");
}
