import { AppShell } from "@/modules/ctktkt/components/app-shell";
import { WaterReportClient } from "@/modules/ctktkt/components/water-report-client";

export default function WaterReportPage() {
  return (
    <AppShell active="water" hideSearch>
      <WaterReportClient />
    </AppShell>
  );
}
