"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate } from "@/lib/fetcher";
import type { Contract } from "@/lib/tcms/types/contract";
import type { PendingContractPdfImport } from "@/lib/tcms/types/contract-create-import";

export type ContractInput = Omit<Contract, "id" | "stt" | "version">;
type ContractStoreValue = {
  contracts: Contract[];
  canCreate: boolean;
  canEdit: boolean;
  canAdminister: boolean;
  ready: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addContract: (input: ContractInput) => Promise<Contract>;
  addContractWithItems: (input: ContractInput, pdfImport: PendingContractPdfImport) => Promise<Contract>;
  updateContract: (id: string, input: ContractInput) => Promise<Contract | undefined>;
  getContract: (id: string) => Contract | undefined;
};
const ContractStoreContext = createContext<ContractStoreValue | null>(null);
const EMPTY: Contract[] = [];
const key = ["tcms", "/api/tcms/contracts"];
export function ContractStoreProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: key, queryFn: async () => (await apiGet<{ contracts: Contract[]; capabilities: { canCreate: boolean; canEdit: boolean; canAdminister: boolean } }>("/api/tcms/contracts")).data, retry: false });
  const contracts = query.data?.contracts ?? EMPTY;
  const refresh = useCallback(async () => { await client.invalidateQueries({ queryKey: ["tcms"] }); }, [client]);
  const mutation = useMutation({
    mutationFn: ({ url, method, body }: { url: string; method: "POST" | "PUT"; body: unknown }) => apiMutate<{ contract: Contract }>(url, method, body),
    onSuccess: refresh,
  });
  const mutate = mutation.mutateAsync;
  const addContract = useCallback(async (input: ContractInput) => (await mutate({ url: "/api/tcms/contracts", method: "POST", body: input })).contract, [mutate]);
  const addContractWithItems = useCallback(async (input: ContractInput, pdfImport: PendingContractPdfImport) => (await mutate({ url: "/api/tcms/contracts", method: "POST", body: {
    contract: input, items: pdfImport.items, weightAllocationMethod: pdfImport.weightAllocationMethod, redactionConfirmed: pdfImport.redactionConfirmed,
  } })).contract, [mutate]);
  const updateContract = useCallback(async (id: string, input: ContractInput) => {
    const current = contracts.find((contract) => contract.id === id);
    if (!current) throw new Error("Không tìm thấy hợp đồng. Vui lòng tải lại trang.");
    return (await mutate({ url: `/api/tcms/contracts/${encodeURIComponent(id)}`, method: "PUT", body: { contract: input, expectedVersion: current.version } })).contract;
  }, [contracts, mutate]);
  const getContract = useCallback((id: string) => contracts.find((contract) => contract.id === id), [contracts]);
  const value = useMemo(() => ({ contracts, canCreate: query.data?.capabilities.canCreate ?? false, canEdit: query.data?.capabilities.canEdit ?? false, canAdminister: query.data?.capabilities.canAdminister ?? false, ready: !query.isPending, error: query.error?.message ?? null, refresh, addContract, addContractWithItems, updateContract, getContract }), [contracts, query.data, query.isPending, query.error, refresh, addContract, addContractWithItems, updateContract, getContract]);
  return <ContractStoreContext.Provider value={value}>{children}</ContractStoreContext.Provider>;
}
export function useContracts() {
  const context = useContext(ContractStoreContext);
  if (!context) throw new Error("Không thể tải ngữ cảnh quản lý hợp đồng.");
  return context;
}
