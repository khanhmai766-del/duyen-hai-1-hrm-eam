import assert from "node:assert/strict";
import test from "node:test";

import { createContractImportAtomically } from "../../lib/tcms/server/contracts/contract-create-import";
import type { ContractInput } from "../../lib/tcms/server/contracts/contract-api";
import type { ParsedContractItemImport } from "../../lib/tcms/server/pdf/contract-item-import";

const contractInput = {
  contractNumber: "203/HĐ", packageName: "Gói bảo dưỡng", leadDepartment: "PXVH1",
  contractorId:"11111111-1111-4111-8111-111111111111", contractorName: "Nhà thầu A", supervisors: [], isExtended: false,
  progressPercent: 0, status: "DRAFT",
} as ContractInput;

function entry(name: string, checklistItems: string[]): ParsedContractItemImport {
  return {
    input: { serviceDescription: name, weightPercent: 50, progressPercent: 0, status: "NOT_STARTED" },
    checklistItems,
  };
}

function harness(failOnItem: string | null = null) {
  let state = { contracts: [] as string[], items: [] as string[], checklist: [] as string[] };
  return {
    get state() { return state; },
    runTransaction: async <T>(operation: (client: object) => Promise<T>) => {
      const snapshot = structuredClone(state);
      try {
        return await operation({});
      } catch (error) {
        state = snapshot;
        throw error;
      }
    },
    createWriter: () => ({
      async createContract() { state.contracts.push("contract-1"); return { id: "contract-1" }; },
      contractId(contract: { id: string }) { return contract.id; },
      async createItem(_contractId: string, prepared: ParsedContractItemImport) {
        if (prepared.input.serviceDescription === failOnItem) throw new Error("ITEM_CREATE_FAILED");
        const item = { id: `item-${state.items.length + 1}` };
        state.items.push(item.id);
        return item;
      },
      itemId(item: { id: string }) { return item.id; },
      async createChecklistItems(itemId: string, descriptions: readonly string[]) {
        state.checklist.push(...descriptions.map((description) => `${itemId}:${description}`));
      },
    }),
  };
}

test("atomic create writes Contract, Items and Checklist in one transaction", async () => {
  const db = harness();
  const result = await createContractImportAtomically({
    runTransaction: db.runTransaction,
    createWriter: db.createWriter,
    contractInput,
    entries: [entry("A", ["A1"]), entry("B", ["B1", "B2"])],
    actorId: "user-1",
  });
  assert.equal(result.createdItems.length, 2);
  assert.deepEqual(db.state, {
    contracts: ["contract-1"],
    items: ["item-1", "item-2"],
    checklist: ["item-1:A1", "item-2:B1", "item-2:B2"],
  });
});

test("atomic create rolls back Contract and earlier Items when a later Item fails", async () => {
  const db = harness("B");
  await assert.rejects(() => createContractImportAtomically({
    runTransaction: db.runTransaction,
    createWriter: db.createWriter,
    contractInput,
    entries: [entry("A", ["A1"]), entry("B", ["B1"])],
    actorId: "user-1",
  }), /ITEM_CREATE_FAILED/);
  assert.deepEqual(db.state, { contracts: [], items: [], checklist: [] });
});
