import type { Contract } from "../../types/contract";
import {
  authorize,
  type ContractSecurityResource,
  type Permission,
  type SecurityPrincipal,
} from "../../lib/security/authorization";
import {
  createAuditEvent,
  type AuditAction,
  type AuditEvent,
} from "../../lib/security/audit";

export type ContractRecord = {
  contract: Contract;
  departmentIds: readonly string[];
  version: number;
};

export type ContractCreateInput = Omit<Contract, "id" | "stt"> & {
  departmentIds: readonly string[];
};

export type ContractRepository = {
  findById: (id: string) => Promise<ContractRecord | null>;
  create: (input: ContractCreateInput, actorId: string) => Promise<ContractRecord>;
  updateProgress: (
    id: string,
    expectedVersion: number,
    changes: Pick<Contract, "progressPercent" | "progressNote" | "managementDirection">,
    actorId: string
  ) => Promise<ContractRecord>;
  updateFinance: (
    id: string,
    expectedVersion: number,
    changes: Pick<Contract, "paymentSettlementStatus" | "costNote">,
    actorId: string
  ) => Promise<ContractRecord>;
};

export type AuditWriter = {
  write: (event: AuditEvent) => Promise<void>;
};

export type RequestSecurityContext = {
  principal: SecurityPrincipal;
  correlationId: string;
  sourceIp: string | null;
  userAgent: string | null;
};

export class AccessDeniedError extends Error {
  readonly code = "ACCESS_DENIED";
  readonly denialReason: string;

  constructor(denialReason: string) {
    super("Bạn không có quyền thực hiện thao tác này.");
    this.name = "AccessDeniedError";
    this.denialReason = denialReason;
  }
}

export class ContractNotFoundError extends Error {
  readonly code = "CONTRACT_NOT_FOUND";

  constructor() {
    super("Không tìm thấy hợp đồng.");
    this.name = "ContractNotFoundError";
  }
}

type ServiceOptions = {
  environment: "development" | "test" | "production";
  appVersion: string;
};

export class ContractApplicationService {
  private readonly repository: ContractRepository;
  private readonly auditWriter: AuditWriter;
  private readonly options: ServiceOptions;

  constructor(
    repository: ContractRepository,
    auditWriter: AuditWriter,
    options: ServiceOptions
  ) {
    this.repository = repository;
    this.auditWriter = auditWriter;
    this.options = options;
  }

  private toSecurityResource(record: ContractRecord): ContractSecurityResource {
    return {
      id: record.contract.id,
      departmentIds: record.departmentIds,
      status: record.contract.status,
    };
  }

  private async audit(
    context: RequestSecurityContext,
    input: {
      action: AuditAction;
      resourceId: string | null;
      result: "SUCCESS" | "FAILURE" | "DENIED";
      reason?: string | null;
      before?: unknown;
      after?: unknown;
    }
  ) {
    await this.auditWriter.write(
      createAuditEvent({
        environment: this.options.environment,
        actorId: context.principal.userId,
        action: input.action,
        resourceType: "contract",
        resourceId: input.resourceId,
        result: input.result,
        reason: input.reason ?? null,
        before: input.before,
        after: input.after,
        correlationId: context.correlationId,
        sourceIp: context.sourceIp,
        userAgent: context.userAgent,
        appVersion: this.options.appVersion,
      })
    );
  }

  private async requirePermission(
    context: RequestSecurityContext,
    permission: Permission,
    action: AuditAction,
    resource: ContractSecurityResource,
    approvedSensitiveAction = false
  ) {
    const decision = authorize(context.principal, permission, resource, {
      approvedSensitiveAction,
    });

    if (!decision.allowed) {
      await this.audit(context, {
        action: "AUTHORIZATION_DENIED",
        resourceId: resource.id,
        result: "DENIED",
        reason: `${action}:${decision.reason}`,
      });
      throw new AccessDeniedError(decision.reason);
    }
  }

  async getById(context: RequestSecurityContext, id: string) {
    const record = await this.repository.findById(id);

    if (!record) {
      throw new ContractNotFoundError();
    }

    await this.requirePermission(
      context,
      "contract.read",
      "CONTRACT_READ",
      this.toSecurityResource(record)
    );

    return record;
  }

  async create(context: RequestSecurityContext, input: ContractCreateInput) {
    const proposedResource: ContractSecurityResource = {
      id: "new-contract",
      departmentIds: input.departmentIds,
      status: input.status,
    };

    await this.requirePermission(
      context,
      "contract.create",
      "CONTRACT_CREATED",
      proposedResource
    );

    const created = await this.repository.create(input, context.principal.userId);
    await this.audit(context, {
      action: "CONTRACT_CREATED",
      resourceId: created.contract.id,
      result: "SUCCESS",
      after: created.contract,
    });

    return created;
  }

  async updateProgress(
    context: RequestSecurityContext,
    id: string,
    expectedVersion: number,
    changes: Pick<Contract, "progressPercent" | "progressNote" | "managementDirection">
  ) {
    const current = await this.repository.findById(id);

    if (!current) {
      throw new ContractNotFoundError();
    }

    await this.requirePermission(
      context,
      "contract.progress.update",
      "CONTRACT_UPDATED",
      this.toSecurityResource(current)
    );

    const updated = await this.repository.updateProgress(
      id,
      expectedVersion,
      changes,
      context.principal.userId
    );

    await this.audit(context, {
      action: "CONTRACT_UPDATED",
      resourceId: id,
      result: "SUCCESS",
      before: {
        progressPercent: current.contract.progressPercent,
        progressNote: current.contract.progressNote,
        managementDirection: current.contract.managementDirection,
        version: current.version,
      },
      after: {
        progressPercent: updated.contract.progressPercent,
        progressNote: updated.contract.progressNote,
        managementDirection: updated.contract.managementDirection,
        version: updated.version,
      },
    });

    return updated;
  }

  async updateFinance(
    context: RequestSecurityContext,
    id: string,
    expectedVersion: number,
    changes: Pick<Contract, "paymentSettlementStatus" | "costNote">
  ) {
    const current = await this.repository.findById(id);

    if (!current) {
      throw new ContractNotFoundError();
    }

    await this.requirePermission(
      context,
      "contract.finance.update",
      "CONTRACT_UPDATED",
      this.toSecurityResource(current)
    );

    const updated = await this.repository.updateFinance(
      id,
      expectedVersion,
      changes,
      context.principal.userId
    );

    await this.audit(context, {
      action: "CONTRACT_UPDATED",
      resourceId: id,
      result: "SUCCESS",
      before: {
        paymentSettlementStatus: current.contract.paymentSettlementStatus,
        costNote: current.contract.costNote,
        version: current.version,
      },
      after: {
        paymentSettlementStatus: updated.contract.paymentSettlementStatus,
        costNote: updated.contract.costNote,
        version: updated.version,
      },
    });

    return updated;
  }
}
