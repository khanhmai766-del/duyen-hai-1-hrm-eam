import {redirect} from "next/navigation";
import {requireAnyPermission} from "@/modules/ctktkt/lib/auth/server";
import {AppShell} from "@/modules/ctktkt/components/app-shell";
import {hasPermission} from "@/modules/ctktkt/lib/auth/session";
import {DataBackupPanel} from "@/modules/ctktkt/components/data-backup-panel";

export const dynamic="force-dynamic";
export default async function DataBackupPage(){
  const guard=await requireAnyPermission("backup_data", "restore_data");
  if(!guard.ok)redirect("/tien-ich/chi-tieu-ktkt");
  return <AppShell active="data-backup"><DataBackupPanel canBackup={hasPermission(guard.user,"backup_data")} canRestore={hasPermission(guard.user,"restore_data")}/></AppShell>;
}
