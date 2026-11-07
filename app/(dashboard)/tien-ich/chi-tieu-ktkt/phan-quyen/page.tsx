import { redirect } from "next/navigation";
import { AppShell } from "@/modules/ctktkt/components/app-shell";
import { PositionPermissionsPanel } from "@/modules/ctktkt/components/position-permissions-panel";
import { requireSession } from "@/modules/ctktkt/lib/auth/server";

import { canManageKtktInputs } from "@/modules/ctktkt/lib/auth/delegation-policy";
export const dynamic = "force-dynamic";
export default async function PositionPermissionsPage() {
  const guard = await requireSession();
  if (!guard.ok || !canManageKtktInputs(guard.user)) redirect("/tien-ich/chi-tieu-ktkt");
  return <AppShell active="permissions"><PositionPermissionsPanel/></AppShell>;
}
