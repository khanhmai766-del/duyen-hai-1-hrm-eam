import { DailyProductionTable } from "@/modules/ctktkt/components/daily-production-table";
import { AppShell } from "@/modules/ctktkt/components/app-shell";

export default function Home() {
  return <AppShell active="data"><DailyProductionTable /></AppShell>;
}
