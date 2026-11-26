import "../vc-analysis-overrides.css";
import { VibrationAccessGate } from "@/components/vibration/vibration-access-gate";
import { MillAnalysisView } from "@/components/vibration/mill-analysis-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <VibrationAccessGate label="Phân tích độ rung MILL">
      <MillAnalysisView />
    </VibrationAccessGate>
  );
}
