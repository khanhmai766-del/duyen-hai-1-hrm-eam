export type Contractor = {
  id: string;
  code: string;
  name: string;
  taxCode?: string;
  address?: string;
  phone?: string;
  representative?: string;
  active: boolean;
  version: number;
  contractCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ContractorInput = Pick<
  Contractor,
  "code" | "name" | "taxCode" | "address" | "phone" | "representative" | "active"
>;
