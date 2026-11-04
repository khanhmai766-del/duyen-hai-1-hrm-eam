import { AppShell } from "@/modules/ctktkt/components/app-shell";
import { BcsxReport } from "@/modules/ctktkt/components/bcsx-report";

export default function BcsxReportPage() {
  return <AppShell active="bcsx" hideSearch><BcsxReport /></AppShell>;
}
