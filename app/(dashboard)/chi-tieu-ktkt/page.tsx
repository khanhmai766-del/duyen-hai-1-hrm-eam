import { DailyProductionTable } from "@/modules/ctktkt/components/daily-production-table";
import { DailyPeriodStatistics } from "@/modules/ctktkt/components/daily-period-statistics";
import { AppShell } from "@/modules/ctktkt/components/app-shell";

export default function Home() {
  return (
    <AppShell active="data">
      <div className="min-w-0 space-y-5">
        <DailyPeriodStatistics />
        <DailyProductionTable />
      </div>
    </AppShell>
  );
}
