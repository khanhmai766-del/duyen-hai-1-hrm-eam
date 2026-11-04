import { redirect } from "next/navigation";
import { AppShell } from "@/modules/ctktkt/components/app-shell";
import { PositionPermissionsPanel } from "@/modules/ctktkt/components/position-permissions-panel";
import { requirePermission } from "@/modules/ctktkt/lib/auth/server";

export const dynamic = "force-dynamic";
export default async function PositionPermissionsPage() {
  const guard = await requirePermission("manage_permissions");
  if (!guard.ok) redirect("/tien-ich/chi-tieu-ktkt");
  return <AppShell active="permissions"><PositionPermissionsPanel/></AppShell>;
}
