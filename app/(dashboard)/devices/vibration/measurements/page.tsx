import "../vc-analysis-overrides.css";
import { requireUser } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { VIBRATION_MANAGE_LEVELS } from "@/lib/vibration-permissions";
import { ConfigView } from "@/components/vibration/config-view";
import { VibrationAccessGate } from "@/components/vibration/vibration-access-gate";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  const canManage = await hasPermissionLevel(user, "vibration-manage", [...VIBRATION_MANAGE_LEVELS]);
  return (
    <VibrationAccessGate label="Cấu hình vùng đo độ rung">
      <ConfigView canManage={canManage} isAdmin={user.role === "ADMIN"} />
    </VibrationAccessGate>
  );
}
