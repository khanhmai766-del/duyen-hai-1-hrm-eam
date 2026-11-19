import { AppShell } from "@/modules/ctktkt/components/app-shell";
import { ChemicalUsageClient } from "@/modules/ctktkt/components/chemical-usage-client";

export default function ChemicalUsagePage() {
  return (
    <AppShell active="chemical-usage">
      <ChemicalUsageClient />
    </AppShell>
  );
}
