import { getSessionUser } from "../lib/auth/server";
import { isAdminUser } from "../lib/auth/session";
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
        <div className="ml-auto flex flex-wrap items-center gap-3"><span className="hidden text-xs text-slate-500 sm:inline">{user.displayName}</span>{active!=="extensions"&&<SpreadsheetCopyTools key={active}/>}</div>
      </div>
      <div className="ctktkt-content app-content engineering-workspace min-w-0" data-module={active}><GoogleMirrorLinks module={active}/>{children}</div>
    </div>
  </SessionProvider>;
}
