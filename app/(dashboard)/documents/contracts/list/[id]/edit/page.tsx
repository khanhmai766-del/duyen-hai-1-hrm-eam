import type { Metadata } from "next";

import { ContractForm } from "@/lib/tcms/components/contracts/contract-form";

export const metadata: Metadata = {
  title: "Chỉnh sửa hợp đồng | Quản lý hợp đồng",
};

export default async function EditContractPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;
  return <ContractForm mode="edit" contractId={id} />;
}
