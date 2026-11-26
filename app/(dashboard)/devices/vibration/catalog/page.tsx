import "../vc-analysis-overrides.css";
import { requireUser } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { VIBRATION_MANAGE_LEVELS } from "@/lib/vibration-permissions";
import { CatalogView } from "@/components/vibration/catalog-view";
import { VibrationAccessGate } from "@/components/vibration/vibration-access-gate";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  const canManage = await hasPermissionLevel(user, "vibration-manage", [...VIBRATION_MANAGE_LEVELS]);
  return (
    <VibrationAccessGate label="Danh mục thiết bị độ rung">
      <CatalogView canManage={canManage} isAdmin={user.role === "ADMIN"} />
    </VibrationAccessGate>
  );
}
