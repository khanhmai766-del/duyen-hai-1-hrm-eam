export const ROLES = [
  "SYSTEM_ADMIN",
  "SECURITY_AUDITOR",
  "CONTRACT_MANAGER",
  "CONTRACT_EDITOR",
  "SUPERVISOR",
  "FINANCE_EDITOR",
  "VIEWER",
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "contract.read",
  "contract.create",
  "contract.identity.update",
  "contract.progress.update",
  "contract.acceptance.update",
  "contract.finance.update",
  "contract.assignment.manage",
  "contract.status.transition",
  "document.read",
  "document.upload",
  "document.archive",
  "data.export",
  "user.manage",
  "role.manage",
  "audit.read.business",
  "audit.read.security",
  "system.configure",
  "backup.restore",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type ContractSecurityResource = {
  id: string;
  departmentIds: readonly string[];
  status: string;
};

export type SecurityPrincipal = {
  userId: string;
  active: boolean;
  mfaVerified: boolean;
  websiteSession?: boolean;
  roles: readonly Role[];
  departmentIds: readonly string[];
  assignedContractIds: readonly string[];
  globalContractScope?: boolean;
};

export type AuthorizationOptions = {
  approvedSensitiveAction?: boolean;
};

export type AuthorizationDecision =
  | { allowed: true; reason: "ALLOWED" }
  | {
      allowed: false;
      reason:
        | "INACTIVE_PRINCIPAL"
        | "PERMISSION_NOT_GRANTED"
        | "MFA_REQUIRED"
        | "APPROVAL_REQUIRED"
        | "RESOURCE_REQUIRED"
        | "OUTSIDE_DATA_SCOPE"
        | "CONTRACT_STATE_FORBIDS_CHANGE";
    };

const rolePermissions: Record<Role, readonly Permission[]> = {
  SYSTEM_ADMIN: [
    "contract.read",
    "document.read",
    "user.manage",
    "role.manage",
    "audit.read.business",
    "audit.read.security",
    "system.configure",
    "backup.restore",
  ],
  SECURITY_AUDITOR: [
    "contract.read",
    "document.read",
    "data.export",
    "audit.read.business",
    "audit.read.security",
  ],
  CONTRACT_MANAGER: [
    "contract.read",
    "contract.create",
    "contract.identity.update",
    "contract.progress.update",
    "contract.acceptance.update",
    "contract.finance.update",
    "contract.assignment.manage",
    "contract.status.transition",
    "document.read",
    "document.upload",
    "document.archive",
    "data.export",
    "audit.read.business",
  ],
  CONTRACT_EDITOR: [
    "contract.read",
    "contract.identity.update",
    "contract.progress.update",
    "contract.acceptance.update",
    "document.read",
    "document.upload",
  ],
  SUPERVISOR: [
    "contract.read",
    "contract.progress.update",
    "contract.acceptance.update",
    "document.read",
    "document.upload",
  ],
  FINANCE_EDITOR: [
    "contract.read",
    "contract.finance.update",
    "document.read",
    "document.upload",
    "data.export",
  ],
  VIEWER: ["contract.read", "document.read"],
};

const contractScopedPermissions = new Set<Permission>([
  "contract.read",
  "contract.create",
  "contract.identity.update",
  "contract.progress.update",
  "contract.acceptance.update",
  "contract.finance.update",
  "contract.assignment.manage",
  "contract.status.transition",
  "document.read",
  "document.upload",
  "document.archive",
]);

const mfaRequiredPermissions = new Set<Permission>([
  "contract.status.transition",
  "document.archive",
  "data.export",
  "user.manage",
  "role.manage",
  "audit.read.security",
  "system.configure",
  "backup.restore",
]);

const approvalRequiredPermissions = new Set<Permission>([
  "contract.status.transition",
  "document.archive",
  "data.export",
  "backup.restore",
]);

const stateChangingPermissions = new Set<Permission>([
  "contract.identity.update",
  "contract.progress.update",
  "contract.acceptance.update",
  "contract.finance.update",
  "contract.assignment.manage",
  "document.upload",
]);

const immutableContractStatuses = new Set(["CLOSED", "CANCELLED"]);

export function permissionsForRoles(roles: readonly Role[]): ReadonlySet<Permission> {
  return new Set(roles.flatMap((role) => rolePermissions[role]));
}

export function isContractInScope(
  principal: SecurityPrincipal,
  resource: ContractSecurityResource
) {
  if (principal.globalContractScope) {
    return true;
  }

  if (principal.assignedContractIds.includes(resource.id)) {
    return true;
  }

  return resource.departmentIds.some((departmentId) =>
    principal.departmentIds.includes(departmentId)
  );
}

export function authorize(
  principal: SecurityPrincipal,
  permission: Permission,
  resource?: ContractSecurityResource,
  options: AuthorizationOptions = {}
): AuthorizationDecision {
  if (!principal.active) {
    return { allowed: false, reason: "INACTIVE_PRINCIPAL" };
  }

  const grantedPermissions = permissionsForRoles(principal.roles);

  if (!grantedPermissions.has(permission)) {
    return { allowed: false, reason: "PERMISSION_NOT_GRANTED" };
  }

  const websiteStatusChange = principal.websiteSession === true && permission === "contract.status.transition";
  if (mfaRequiredPermissions.has(permission) && !principal.mfaVerified && !websiteStatusChange) {
    return { allowed: false, reason: "MFA_REQUIRED" };
  }

  if (
    approvalRequiredPermissions.has(permission) &&
    !options.approvedSensitiveAction && !websiteStatusChange
  ) {
    return { allowed: false, reason: "APPROVAL_REQUIRED" };
  }

  if (contractScopedPermissions.has(permission)) {
    if (!resource) {
      return { allowed: false, reason: "RESOURCE_REQUIRED" };
    }

    if (!isContractInScope(principal, resource)) {
      return { allowed: false, reason: "OUTSIDE_DATA_SCOPE" };
    }

    if (
      stateChangingPermissions.has(permission) &&
      immutableContractStatuses.has(resource.status)
    ) {
      return { allowed: false, reason: "CONTRACT_STATE_FORBIDS_CHANGE" };
    }
  }

  return { allowed: true, reason: "ALLOWED" };
}
