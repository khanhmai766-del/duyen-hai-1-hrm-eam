import "../vc-entry-overrides.css";
import { VibrationAccessGate } from "@/components/vibration/vibration-access-gate";
import { MillShiftView } from "@/components/vibration/mill-shift-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <VibrationAccessGate label="Độ rung/nhiệt độ MILL theo ca">
      <MillShiftView />
    </VibrationAccessGate>
  );
}
