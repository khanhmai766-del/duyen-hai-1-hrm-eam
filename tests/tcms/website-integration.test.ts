import assert from "node:assert/strict";
import test from "node:test";
import { canContractPermission } from "../../lib/tcms/server/contracts/contract-api";
import { authorize, type SecurityPrincipal } from "../../lib/tcms/lib/security/authorization";
import type { Contract } from "../../lib/tcms/types/contract";

const user: SecurityPrincipal = { userId: "operator", roles: ["CONTRACT_MANAGER"], active: true, mfaVerified: false, websiteSession: true, departmentIds: ["department-a"], assignedContractIds: [] };
const contract = { id: "contract-b", departmentIds: ["department-b"], status: "ACTIVE" } as Contract;

test("an unrelated department cannot gain access by using its own scope as the contract scope", () => {
  assert.equal(canContractPermission(user, "contract.identity.update", contract), false);
  assert.equal(canContractPermission({ ...user, assignedContractIds: [contract.id] }, "contract.identity.update", contract), true);
  assert.equal(canContractPermission(user, "contract.read", { ...contract, departmentIds: undefined }), false);
});
test("website status changes still require manager permission and the actual contract scope", () => {
  const resource = { id: contract.id, departmentIds: contract.departmentIds!, status: "ACTIVE" };
  assert.equal(authorize(user, "contract.status.transition", resource).allowed, false);
  assert.equal(authorize({ ...user, assignedContractIds: [contract.id] }, "contract.status.transition", resource).allowed, true);
  assert.equal(authorize({ ...user, roles: ["VIEWER"], assignedContractIds: [contract.id] }, "contract.status.transition", resource).allowed, false);
  assert.equal(authorize({ ...user, active: false, assignedContractIds: [contract.id] }, "contract.status.transition", resource).allowed, false);
});
test("website login does not pretend to verify MFA or authorize exports", () => {
  assert.equal(user.mfaVerified, false);
  assert.equal(authorize(user, "data.export").allowed, false);
  assert.equal(authorize({ ...user, websiteSession: undefined, assignedContractIds: [contract.id] }, "contract.status.transition", { id: contract.id, departmentIds: contract.departmentIds!, status: "ACTIVE" }).allowed, false);
});
