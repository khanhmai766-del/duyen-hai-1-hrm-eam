import assert from "node:assert/strict";
import test from "node:test";

import {
  authorize,
  type ContractSecurityResource,
  type Role,
  type SecurityPrincipal,
} from "../../lib/tcms/lib/security/authorization";
import {
  AUDIT_REDACTED,
  createAuditEvent,
} from "../../lib/tcms/lib/security/audit";

const openContract: ContractSecurityResource = {
  id: "contract-203",
  departmentIds: ["PXVH1", "P_KY_THUAT", "P_AN_TOAN"],
  status: "IN_PROGRESS",
};

function principal(
  roles: readonly Role[],
  overrides: Partial<SecurityPrincipal> = {}
): SecurityPrincipal {
  return {
    userId: "user-test",
    active: true,
    mfaVerified: true,
    roles,
    departmentIds: ["PXVH1"],
    assignedContractIds: [],
    ...overrides,
  };
}

test("viewer can read only contracts inside data scope", () => {
  assert.deepEqual(authorize(principal(["VIEWER"]), "contract.read", openContract), {
    allowed: true,
    reason: "ALLOWED",
  });

  assert.deepEqual(
    authorize(
      principal(["VIEWER"], { departmentIds: ["OTHER_DEPARTMENT"] }),
      "contract.read",
      openContract
    ),
    { allowed: false, reason: "OUTSIDE_DATA_SCOPE" }
  );
});

test("changing an URL id does not bypass contract scope", () => {
  const attacker = principal(["CONTRACT_EDITOR"], {
    departmentIds: ["OTHER_DEPARTMENT"],
    assignedContractIds: ["another-contract"],
  });

  assert.deepEqual(
    authorize(attacker, "contract.progress.update", openContract),
    { allowed: false, reason: "OUTSIDE_DATA_SCOPE" }
  );
});

test("three assigned supervision groups have equal progress update rights", () => {
  for (const departmentId of ["PXVH1", "P_KY_THUAT", "P_AN_TOAN"]) {
    const supervisor = principal(["SUPERVISOR"], {
      departmentIds: [departmentId],
    });

    assert.deepEqual(
      authorize(supervisor, "contract.progress.update", openContract),
      { allowed: true, reason: "ALLOWED" }
    );
  }
});

test("system administrator does not receive business edit permission", () => {
  assert.deepEqual(
    authorize(principal(["SYSTEM_ADMIN"]), "contract.progress.update", openContract),
    { allowed: false, reason: "PERMISSION_NOT_GRANTED" }
  );
});

test("contract editor cannot update finance fields", () => {
  assert.deepEqual(
    authorize(principal(["CONTRACT_EDITOR"]), "contract.finance.update", openContract),
    { allowed: false, reason: "PERMISSION_NOT_GRANTED" }
  );
});

test("closed contracts reject ordinary changes", () => {
  assert.deepEqual(
    authorize(principal(["SUPERVISOR"]), "contract.progress.update", {
      ...openContract,
      status: "CLOSED",
    }),
    { allowed: false, reason: "CONTRACT_STATE_FORBIDS_CHANGE" }
  );
});

test("sensitive actions require both MFA and approval", () => {
  const managerWithoutMfa = principal(["CONTRACT_MANAGER"], {
    mfaVerified: false,
  });

  assert.deepEqual(
    authorize(managerWithoutMfa, "contract.status.transition", openContract, {
      approvedSensitiveAction: true,
    }),
    { allowed: false, reason: "MFA_REQUIRED" }
  );

  assert.deepEqual(
    authorize(principal(["CONTRACT_MANAGER"]), "contract.status.transition", openContract),
    { allowed: false, reason: "APPROVAL_REQUIRED" }
  );

  assert.deepEqual(
    authorize(principal(["CONTRACT_MANAGER"]), "contract.status.transition", openContract, {
      approvedSensitiveAction: true,
    }),
    { allowed: true, reason: "ALLOWED" }
  );
});

test("audit helper redacts secrets recursively", () => {
  const event = createAuditEvent({
    eventId: "event-test",
    occurredAtUtc: "2026-08-25T00:00:00.000Z",
    environment: "test",
    actorId: "user-test",
    action: "CONTRACT_UPDATED",
    resourceType: "contract",
    resourceId: "contract-203",
    result: "SUCCESS",
    reason: null,
    correlationId: "request-test",
    sourceIp: null,
    userAgent: null,
    appVersion: "test",
    before: { progressPercent: 20, accessToken: "must-not-appear" },
    after: {
      progressPercent: 30,
      nested: { databasePassword: "must-not-appear" },
    },
  });

  assert.deepEqual(event.before, {
    progressPercent: 20,
    accessToken: AUDIT_REDACTED,
  });
  assert.deepEqual(event.after, {
    progressPercent: 30,
    nested: { databasePassword: AUDIT_REDACTED },
  });
});
