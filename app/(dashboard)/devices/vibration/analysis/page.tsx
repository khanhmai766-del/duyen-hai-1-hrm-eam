import "../vc-analysis-overrides.css";
import { VibrationAccessGate } from "@/components/vibration/vibration-access-gate";
import { AnalysisPage } from "@/components/vibration/analysis-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <VibrationAccessGate label="Phân tích độ rung">
      <AnalysisPage />
    </VibrationAccessGate>
  );
}
