import "../vc-entry-overrides.css";
import { VibrationAccessGate } from "@/components/vibration/vibration-access-gate";
import { MnkEntryView } from "@/components/vibration/mnk-entry-view";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <VibrationAccessGate label="Nhập thông số MNK theo ca">
      <MnkEntryView />
    </VibrationAccessGate>
  );
}
