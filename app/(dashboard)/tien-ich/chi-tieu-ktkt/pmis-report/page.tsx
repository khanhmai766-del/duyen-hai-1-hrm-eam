import { AppShell } from "@/modules/ctktkt/components/app-shell";
import { PmisReport } from "@/modules/ctktkt/components/pmis-report";

export default function PmisReportPage() {
  return <AppShell active="pmis" hideSearch><PmisReport /></AppShell>;
}
