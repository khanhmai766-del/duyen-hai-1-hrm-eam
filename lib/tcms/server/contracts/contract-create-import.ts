import type { ContractInput } from "./contract-api";
import type { ParsedContractItemImport } from "../pdf/contract-item-import";

type ImportWriter<TContract, TItem> = {
  createContract(input: ContractInput, actorId: string): Promise<TContract>;
  contractId(contract: TContract): string;
  createItem(contractId: string, entry: ParsedContractItemImport, actorId: string): Promise<TItem>;
  itemId(item: TItem): string;
  createChecklistItems(itemId: string, descriptions: readonly string[], actorId: string): Promise<void>;
};

export async function createContractImportAtomically<TClient, TContract, TItem>(options: {
  runTransaction: (operation: (client: TClient) => Promise<{ contract: TContract; createdItems: TItem[] }>) => Promise<{ contract: TContract; createdItems: TItem[] }>;
  createWriter: (client: TClient) => ImportWriter<TContract, TItem>;
  contractInput: ContractInput;
  entries: readonly ParsedContractItemImport[];
  actorId: string;
}) {
  return options.runTransaction(async (client) => {
    const writer = options.createWriter(client);
    const contract = await writer.createContract(options.contractInput, options.actorId);
    const contractId = writer.contractId(contract);
    const createdItems: TItem[] = [];
    for (const entry of options.entries) {
      const item = await writer.createItem(contractId, entry, options.actorId);
      await writer.createChecklistItems(writer.itemId(item), entry.checklistItems, options.actorId);
      createdItems.push(item);
    }
    return { contract, createdItems };
  });
}
