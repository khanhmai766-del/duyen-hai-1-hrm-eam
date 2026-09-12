import { ContractForm } from "@/lib/tcms/components/contracts/contract-form";

export default async function EditContractPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;
  return <ContractForm mode="edit" contractId={id} />;
}
