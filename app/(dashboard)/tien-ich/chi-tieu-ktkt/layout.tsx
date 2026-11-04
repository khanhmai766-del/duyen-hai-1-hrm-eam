import { redirect } from "next/navigation";
import { getSessionUser } from "@/modules/ctktkt/lib/auth/server";
import { ModuleTools } from "@/modules/ctktkt/components/module-tools";
import "@/modules/ctktkt/styles.css";
export const dynamic = "force-dynamic";
export const metadata = {title:"Chỉ tiêu KTKT · Duyên Hải 1"};
export default async function Layout({children}:{children:React.ReactNode}) {
  const user=await getSessionUser();
  if(!user) redirect("/");
  return <section className="ctktkt-module min-w-0 space-y-4" aria-label="Chỉ tiêu kinh tế kỹ thuật">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Quản lý chỉ tiêu KTKT · Vận hành 1</p>
      <div className="mt-1 flex items-start justify-between gap-3"><h1 className="min-w-0 flex-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Chỉ tiêu kinh tế kỹ thuật</h1><ModuleTools user={user}/></div>
    </div>
    {children}
  </section>;
}
