import { getSessionUser } from "../lib/auth/server";
import { hasPermission, isAdminUser } from "../lib/auth/session";
import Link from "next/link";
import { UserCog } from "lucide-react";
import { ModuleNavigation } from "./module-navigation";
import { SessionProvider } from "./session-context";
import { SpreadsheetInputBehavior } from "./spreadsheet-input-behavior";
import { SpreadsheetCopyTools } from "./spreadsheet-copy-tools";
import { GoogleMirrorLinks } from "./google-mirror-links";
export async function AppShell({children,active}:{children:React.ReactNode;active:string;hideSearch?:boolean}) {
  const user=await getSessionUser(); if(!user) return null;
  return <SessionProvider user={user}>
    <SpreadsheetInputBehavior />
    <div data-app-copy-scope className="min-w-0 space-y-4">
      <ModuleNavigation active={active} admin={isAdminUser(user)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="hidden text-xs text-slate-500 sm:block">Số liệu và báo cáo vận hành · Phân xưởng Vận hành 1</p>
        <div className="ml-auto flex flex-wrap items-center gap-3"><span className="hidden text-xs text-slate-500 sm:inline">{user.displayName}</span>{active!=="permissions"&&hasPermission(user,"manage_permissions")&&<Link href="/tien-ich/chi-tieu-ktkt/phan-quyen" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700"><UserCog className="size-4" aria-hidden/>Phân quyền KTKT</Link>}{active!=="extensions"&&active!=="permissions"&&<SpreadsheetCopyTools key={active}/>}</div>
      </div>
      <div className="ctktkt-content app-content engineering-workspace min-w-0" data-module={active}><GoogleMirrorLinks module={active}/>{children}</div>
    </div>
  </SessionProvider>;
}
