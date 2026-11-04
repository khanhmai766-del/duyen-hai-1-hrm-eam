import {redirect} from "next/navigation";
import {requireAdmin} from "@/modules/ctktkt/lib/auth/server";
import {AppShell} from "@/modules/ctktkt/components/app-shell";
import {DataBackupPanel} from "@/modules/ctktkt/components/data-backup-panel";

export const dynamic="force-dynamic";
export default async function DataBackupPage(){
  const guard=await requireAdmin();
  if(!guard.ok)redirect("/tien-ich/chi-tieu-ktkt");
  return <AppShell active="data-backup"><DataBackupPanel/></AppShell>;
}
