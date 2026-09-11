import type { Metadata } from "next";

import { ContractForm } from "@/lib/tcms/components/contracts/contract-form";

export const metadata: Metadata = {
  title: "Thêm hợp đồng | Quản lý hợp đồng",
};

export default function NewContractPage() {
  return <ContractForm mode="create" />;
}
