/** Two independent workflow permissions; read access remains unchanged. */
export const PERMIT_ISSUE_PERMISSION = "work-permit-issue";
export const PERMIT_EXECUTE_PERMISSION = "work-permit-execute";
export const PERMIT_EXECUTION_FIELDS = ["authorizerName", "authorizedAt", "closedAt", "result", "progress"] as const;
export const PERMIT_EXECUTION_STATUSES = ["ACTIVE", "PAUSED", "WAITING", "CLOSED"] as const;

function comparable(key: string, value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (key.endsWith("At")) return new Date(value as string | Date).getTime();
  return typeof value === "string" ? value.trim() : value;
}
export function permitIssueUpdateNeedsExecution(before: Record<string, unknown>, after: Record<string, unknown>) {
  return PERMIT_EXECUTION_FIELDS.some(key => key in after && comparable(key, before[key]) !== comparable(key, after[key]))
    || (after.status !== before.status && PERMIT_EXECUTION_STATUSES.includes(after.status as typeof PERMIT_EXECUTION_STATUSES[number]));
}

export const PERMIT_EXECUTION_INPUT_FIELDS = ["version", "status", ...PERMIT_EXECUTION_FIELDS, "statusReason"] as const;
export function isPermitExecutionInput(body: Record<string, unknown>) {
  return Object.keys(body).every(key => (PERMIT_EXECUTION_INPUT_FIELDS as readonly string[]).includes(key));
}
