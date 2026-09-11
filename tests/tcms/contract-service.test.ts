import assert from "node:assert/strict";
import test from "node:test";

import type { AuditEvent } from "../../lib/tcms/lib/security/audit";
import type { SecurityPrincipal } from "../../lib/tcms/lib/security/authorization";
import type { Contract } from "../../lib/tcms/types/contract";
import {
  AccessDeniedError,
  ContractApplicationService,
  type ContractCreateInput,
  type ContractRecord,
  type ContractRepository,
  type RequestSecurityContext,
} from "../../lib/tcms/server/contracts/contract-service";

function createFixture() {
  const initialContract: Contract = {
    id: "contract-203",
    stt: 2,
    contractNumber: "203/HĐ-NĐDH.26",
    packageName: "Hợp đồng kiểm thử phân quyền",
    leadDepartment: "PXSCCN",
    contractorId: "11111111-1111-4111-8111-111111111111",
    contractorName: "Nhà thầu kiểm thử",
    supervisors: [],
    isExtended: false,
    progressPercent: 35,
    progressNote: "Đang thực hiện theo kế hoạch.",
    managementDirection: "",
    paymentSettlementStatus: "Chưa quyết toán",
    status: "IN_PROGRESS",
  };
  let record: ContractRecord = {
    contract: structuredClone(initialContract),
    departmentIds: ["PXVH1", "PXSCCN"],
    version: 1,
  };
  const audits: AuditEvent[] = [];
  let progressUpdateCount = 0;

  const repository: ContractRepository = {
    async findById(id) {
      return id === record.contract.id ? structuredClone(record) : null;
    },
    async create(input: ContractCreateInput) {
      record = {
        contract: {
          ...input,
          id: "created-contract",
          stt: 99,
        },
        departmentIds: input.departmentIds,
        version: 1,
      };
      return structuredClone(record);
    },
    async updateProgress(id, expectedVersion, changes) {
      assert.equal(id, record.contract.id);
      assert.equal(expectedVersion, record.version);
      progressUpdateCount += 1;
      record = {
        ...record,
        contract: { ...record.contract, ...changes },
        version: record.version + 1,
      };
      return structuredClone(record);
    },
    async updateFinance(id, expectedVersion, changes) {
      assert.equal(id, record.contract.id);
      assert.equal(expectedVersion, record.version);
      record = {
        ...record,
        contract: { ...record.contract, ...changes },
        version: record.version + 1,
      };
      return structuredClone(record);
    },
  };

  const service = new ContractApplicationService(
    repository,
    {
      async write(event) {
        audits.push(event);
      },
    },
    { environment: "test", appVersion: "security-test" }
  );

  return {
    service,
    audits,
    getProgressUpdateCount: () => progressUpdateCount,
    getRecord: () => record,
  };
}

function context(principal: SecurityPrincipal): RequestSecurityContext {
  return {
    principal,
    correlationId: "test-request",
    sourceIp: null,
    userAgent: "node-test",
  };
}

function testPrincipal(overrides: Partial<SecurityPrincipal> = {}): SecurityPrincipal {
  return {
    userId: "test-user",
    active: true,
    mfaVerified: true,
    roles: ["SUPERVISOR"],
    departmentIds: ["PXVH1"],
    assignedContractIds: [],
    ...overrides,
  };
}

test("server service blocks repository writes when authorization is denied", async () => {
  const fixture = createFixture();

  await assert.rejects(
    fixture.service.updateProgress(
      context(testPrincipal({ departmentIds: ["OTHER_DEPARTMENT"] })),
      "contract-203",
      1,
      {
        progressPercent: 50,
        progressNote: "Không được phép ghi",
        managementDirection: "",
      }
    ),
    AccessDeniedError
  );

  assert.equal(fixture.getProgressUpdateCount(), 0);
  assert.equal(fixture.audits.length, 1);
  assert.equal(fixture.audits[0].action, "AUTHORIZATION_DENIED");
  assert.equal(fixture.audits[0].result, "DENIED");
});

test("server service writes business audit after an authorized update", async () => {
  const fixture = createFixture();

  const updated = await fixture.service.updateProgress(
    context(testPrincipal()),
    "contract-203",
    1,
    {
      progressPercent: 55,
      progressNote: "Đã cập nhật từ service an toàn",
      managementDirection: "Theo dõi hàng tuần",
    }
  );

  assert.equal(updated.contract.progressPercent, 55);
  assert.equal(updated.version, 2);
  assert.equal(fixture.getProgressUpdateCount(), 1);
  assert.equal(fixture.audits.length, 1);
  assert.equal(fixture.audits[0].action, "CONTRACT_UPDATED");
  assert.equal(fixture.audits[0].result, "SUCCESS");
  assert.deepEqual(fixture.audits[0].before, {
    progressPercent: 35,
    progressNote: "Đang thực hiện theo kế hoạch.",
    managementDirection: "",
    version: 1,
  });
});

test("finance update remains separated from contract editor permission", async () => {
  const fixture = createFixture();

  await assert.rejects(
    fixture.service.updateFinance(
      context(testPrincipal({ roles: ["CONTRACT_EDITOR"] })),
      "contract-203",
      1,
      {
        paymentSettlementStatus: "Đã thanh toán",
        costNote: "Không được phép",
      }
    ),
    AccessDeniedError
  );

  assert.equal(fixture.getRecord().contract.paymentSettlementStatus, "Chưa quyết toán");
  assert.equal(fixture.audits[0].result, "DENIED");
});
