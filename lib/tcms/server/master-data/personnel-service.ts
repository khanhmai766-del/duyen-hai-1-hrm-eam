import { z } from "zod";

import { ROLES } from "../../lib/security/authorization";
import type { CreatePersonnelInput, UpdatePersonnelInput } from "../../types/personnel";

const nullableUuid = z.union([z.uuid(), z.null()]);
const nullableDateTime = z.union([z.iso.datetime({ offset: true }), z.null()]);

const assignmentSchema = z.object({
  roleCode: z.enum(ROLES),
  scopeType: z.enum(["GLOBAL", "DEPARTMENT", "CONTRACT"]),
  departmentId: nullableUuid,
  contractId: nullableUuid,
  validFrom: nullableDateTime,
  validUntil: nullableDateTime,
}).strict().superRefine((value, context) => {
  const validScope =
    (value.scopeType === "GLOBAL" && value.departmentId === null && value.contractId === null) ||
    (value.scopeType === "DEPARTMENT" && value.departmentId !== null && value.contractId === null) ||
    (value.scopeType === "CONTRACT" && value.departmentId === null && value.contractId !== null);
  if (!validScope) context.addIssue({ code: "custom", message: "INVALID_ROLE_SCOPE" });
  if (value.validFrom && value.validUntil && value.validUntil <= value.validFrom) {
    context.addIssue({ code: "custom", message: "INVALID_ROLE_VALIDITY" });
  }
  if ((value.roleCode === "SYSTEM_ADMIN" || value.roleCode === "SECURITY_AUDITOR") && value.scopeType !== "GLOBAL") {
    context.addIssue({ code: "custom", message: "GLOBAL_ROLE_REQUIRED" });
  }
  if (value.roleCode === "SYSTEM_ADMIN" && value.validUntil !== null) {
    context.addIssue({ code: "custom", message: "SYSTEM_ADMIN_CANNOT_EXPIRE" });
  }
});

const commonSchema = z.object({
  username: z.string().trim().min(3).max(200).transform((value) => value.toLocaleLowerCase("vi")),
  displayName: z.string().trim().min(2).max(200),
  primaryDepartmentId: nullableUuid,
  active: z.boolean(),
  roleAssignments: z.array(assignmentSchema).min(1).max(30),
}).strict().superRefine((value, context) => {
  const keys = value.roleAssignments.map((item) => `${item.roleCode}:${item.scopeType}:${item.departmentId ?? item.contractId ?? "GLOBAL"}`);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", message: "DUPLICATE_ROLE_SCOPE" });

  const hasGlobal = value.roleAssignments.some((item) => item.scopeType === "GLOBAL");
  const uniqueRoles = new Set(value.roleAssignments.map((item) => item.roleCode));
  // The current RLS context aggregates scopes. Prevent combinations that could
  // accidentally apply a stronger role to another role's narrower scope.
  if (!hasGlobal && uniqueRoles.size > 1) context.addIssue({ code: "custom", message: "MIXED_SCOPED_ROLES_NOT_SUPPORTED" });
  if (hasGlobal && value.roleAssignments.some((item) => item.scopeType !== "GLOBAL")) {
    context.addIssue({ code: "custom", message: "MIXED_GLOBAL_AND_SCOPED_ROLES_NOT_SUPPORTED" });
  }
});

const createSchema = commonSchema.extend({
  identitySubject: z.string().trim().min(2).max(300),
}).strict();

export function parseCreatePersonnelInput(value: unknown): CreatePersonnelInput {
  const result = createSchema.safeParse(value);
  if (!result.success) throw new SyntaxError(result.error.issues[0]?.message ?? "INVALID_PERSONNEL_FIELDS");
  return result.data;
}

export function parseUpdatePersonnelInput(value: unknown): UpdatePersonnelInput {
  const result = commonSchema.safeParse(value);
  if (!result.success) throw new SyntaxError(result.error.issues[0]?.message ?? "INVALID_PERSONNEL_FIELDS");
  return result.data;
}

export function parsePersonnelVersion(value: unknown) {
  const result = z.coerce.number().int().positive().safeParse(value);
  if (!result.success) throw new SyntaxError("INVALID_PERSONNEL_VERSION");
  return result.data;
}
