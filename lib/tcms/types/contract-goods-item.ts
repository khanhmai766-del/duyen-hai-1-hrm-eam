export interface ContractGoodsItem {
  id: string;
  contractId: string;
  workScopeId?: string;
  sequence: number;
  itemCode?: string;
  description: string;
  technicalSpecification?: string;
  manufacturer?: string;
  model?: string;
  origin?: string;
  quantity?: number;
  unit?: string;
  documentRequirementText?: string;
  rawClause?: string;
  sourcePage?: number;
  evidence?: string;
  confidence?: number;
  version: number;
}

export type CreateContractGoodsItemInput = Omit<ContractGoodsItem, "id" | "contractId" | "sequence" | "version">;
export type UpdateContractGoodsItemInput = CreateContractGoodsItemInput;
