import type { Role } from "../lib/security/authorization";

export type RoleScopeType = "GLOBAL" | "DEPARTMENT" | "CONTRACT";

export type PersonnelRoleAssignment = {
  id: string;
  roleCode: Role;
  roleName: string;
  scopeType: RoleScopeType;
  departmentId: string | null;
  departmentName: string | null;
  contractId: string | null;
  contractNumber: string | null;
  validFrom: string;
  validUntil: string | null;
};

export type Personnel = {
  id: string;
  identitySubject: string;
  username: string;
  displayName: string;
  primaryDepartmentId: string | null;
  primaryDepartmentName: string | null;
  active: boolean;
  version: number;
  lastIdentitySyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  roleAssignments: PersonnelRoleAssignment[];
};

export type PersonnelRoleAssignmentInput = {
  roleCode: Role;
  scopeType: RoleScopeType;
  departmentId: string | null;
  contractId: string | null;
  validFrom: string | null;
  validUntil: string | null;
};

export type CreatePersonnelInput = {
  identitySubject: string;
  username: string;
  displayName: string;
  primaryDepartmentId: string | null;
  active: boolean;
  roleAssignments: PersonnelRoleAssignmentInput[];
};

export type UpdatePersonnelInput = Omit<CreatePersonnelInput, "identitySubject">;

export type PersonnelOption = { id: string; code: string; name: string };
export type PersonnelRoleOption = { code: Role; name: string };
export type PersonnelContractOption = { id: string; contractNumber: string; packageName: string };
