import "../vc-entry-overrides.css";
import { VibrationAccessGate } from "@/components/vibration/vibration-access-gate";
import { TbntShiftView } from "@/components/vibration/tbnt-shift-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <VibrationAccessGate label="TBNT theo ca">
      <TbntShiftView />
    </VibrationAccessGate>
  );
}
