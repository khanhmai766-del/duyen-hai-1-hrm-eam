export const AUDIT_REDACTED = "[REDACTED]";

const sensitiveKeyPattern =
  /(password|passcode|token|secret|api[-_]?key|authorization|cookie|credential|private[-_]?key|encryption[-_]?key|session[-_]?id)/i;

export type AuditResult = "SUCCESS" | "FAILURE" | "DENIED";

export type AuditAction =
  | "AUTH_LOGIN"
  | "AUTH_LOGOUT"
  | "AUTHORIZATION_DENIED"
  | "CONTRACT_READ"
  | "CONTRACT_CREATED"
  | "CONTRACT_UPDATED"
  | "CONTRACT_STATUS_CHANGED"
  | "CONTRACT_ARCHIVED"
  | "CONTRACT_DELETED"
  | "SUPERVISOR_ASSIGNED"
  | "SUPERVISOR_UPDATED"
  | "SUPERVISOR_REMOVED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_UPDATED"
  | "DOCUMENT_SCAN_UPDATED"
  | "DOCUMENT_DOWNLOADED"
  | "DOCUMENT_ARCHIVED"
  | "ROLE_GRANTED"
  | "ROLE_REVOKED"
  | "DATA_EXPORTED"
  | "BACKUP_STARTED"
  | "BACKUP_COMPLETED"
  | "RESTORE_STARTED"
  | "RESTORE_COMPLETED"
  | "RELEASE_DEPLOYED";

export type AuditEvent = {
  eventId: string;
  occurredAtUtc: string;
  environment: "development" | "test" | "production";
  actorId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  result: AuditResult;
  reason: string | null;
  before: unknown;
  after: unknown;
  correlationId: string;
  sourceIp: string | null;
  userAgent: string | null;
  appVersion: string;
};

export type CreateAuditEventInput = Omit<
  AuditEvent,
  "eventId" | "occurredAtUtc" | "before" | "after"
> & {
  eventId?: string;
  occurredAtUtc?: string;
  before?: unknown;
  after?: unknown;
};

function redactAuditValue(value: unknown, depth: number): unknown {
  if (depth > 8) {
    return "[MAX_DEPTH]";
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactAuditValue(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKeyPattern.test(key)
          ? AUDIT_REDACTED
          : redactAuditValue(item, depth + 1),
      ])
    );
  }

  return String(value);
}

export function sanitizeAuditPayload(value: unknown) {
  return redactAuditValue(value, 0);
}

export function createAuditEvent(input: CreateAuditEventInput): AuditEvent {
  return {
    ...input,
    eventId: input.eventId ?? crypto.randomUUID(),
    occurredAtUtc: input.occurredAtUtc ?? new Date().toISOString(),
    before: sanitizeAuditPayload(input.before ?? null),
    after: sanitizeAuditPayload(input.after ?? null),
  };
}
