import { AppShell } from "@/modules/ctktkt/components/app-shell";
import { PpaHeatRatePageClient } from "@/modules/ctktkt/components/ppa-heat-rate-page";

export default function PpaHeatRatePage() {
  return <AppShell active="ppa"><PpaHeatRatePageClient /></AppShell>;
}
