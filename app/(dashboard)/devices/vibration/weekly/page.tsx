import "../vc-entry-overrides.css";
import { VibrationAccessGate } from "@/components/vibration/vibration-access-gate";
import { WeeklyEntryView } from "@/components/vibration/weekly-entry-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <VibrationAccessGate label="Nhập thông số độ rung theo kỳ">
      <WeeklyEntryView />
    </VibrationAccessGate>
  );
}
