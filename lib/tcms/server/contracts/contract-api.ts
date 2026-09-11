import type { Contract } from "../../types/contract";
import { authorize, permissionsForRoles, type Permission, type SecurityPrincipal } from "../../lib/security/authorization";

export type ContractInput = Omit<Contract, "id" | "stt" | "version">;

export function parseContractInput(value: unknown): ContractInput {
  if (!value || typeof value !== "object") throw new SyntaxError("INVALID_JSON");
  const input = value as Partial<ContractInput>;
  if (!input.contractNumber?.trim() || !input.packageName?.trim() || !input.leadDepartment?.trim() || !input.contractorName?.trim()) throw new SyntaxError("MISSING_REQUIRED_FIELDS");
  if (!input.contractorId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.contractorId)) throw new SyntaxError("CONTRACTOR_REQUIRED");
  if (!Array.isArray(input.supervisors) || typeof input.progressPercent !== "number" || input.progressPercent < 0 || input.progressPercent > 100) throw new SyntaxError("INVALID_CONTRACT_FIELDS");
  if (input.contractDurationDays !== undefined && (!Number.isInteger(input.contractDurationDays) || input.contractDurationDays < 0)) throw new SyntaxError("INVALID_CONTRACT_FIELDS");
  if (input.serviceProvisionDurationDays !== undefined && (!Number.isInteger(input.serviceProvisionDurationDays) || input.serviceProvisionDurationDays < 0)) throw new SyntaxError("INVALID_CONTRACT_FIELDS");
  if (input.unitExecutionDurationDays !== undefined && (!Number.isInteger(input.unitExecutionDurationDays) || input.unitExecutionDurationDays <= 0)) throw new SyntaxError("INVALID_CONTRACT_FIELDS");
  return input as ContractInput;
}

export function requireRolePermission(principal: SecurityPrincipal, permission: Permission) {
  if (!principal.active || !permissionsForRoles(principal.roles).has(permission)) throw new Error("ACCESS_DENIED");
}

export function requireContractPermission(principal: SecurityPrincipal, permission: Permission, contract: Contract) {
  if (!canContractPermission(principal, permission, contract)) throw new Error("ACCESS_DENIED");
}

export function canContractPermission(principal: SecurityPrincipal, permission: Permission, contract: Contract) {
  const decision = authorize(principal, permission, {
    id: contract.id,
    departmentIds: contract.departmentIds ?? [],
    status: contract.status,
  });
  return decision.allowed;
}
