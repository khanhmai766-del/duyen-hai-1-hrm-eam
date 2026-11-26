import "../vc-analysis-overrides.css";
import { VibrationAccessGate } from "@/components/vibration/vibration-access-gate";
import { VibrationMappingView } from "@/components/vibration/vibration-mapping-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <VibrationAccessGate label="Ánh xạ thiết bị độ rung" manage>
      <VibrationMappingView />
    </VibrationAccessGate>
  );
}
