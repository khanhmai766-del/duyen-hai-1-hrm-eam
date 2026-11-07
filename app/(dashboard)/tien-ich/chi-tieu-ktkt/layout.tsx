import { redirect } from "next/navigation";
import { getSessionUser } from "@/modules/ctktkt/lib/auth/server";
import { ModuleTools } from "@/modules/ctktkt/components/module-tools";
import { HeaderCopyTools } from "@/modules/ctktkt/components/header-copy-tools";import "@/modules/ctktkt/styles.css";
export const dynamic = "force-dynamic";
export const metadata = {title:"Chỉ tiêu KTKT · Duyên Hải 1"};
export default async function Layout({children}:{children:React.ReactNode}) {
  const user=await getSessionUser();
  if(!user) redirect("/");
  // data-app-copy-scope bao cả hàng tiêu đề (chứa nút sao chép) lẫn vùng bảng bên dưới.
  return <section data-app-copy-scope className="ctktkt-module min-w-0 space-y-4" aria-label="Chỉ tiêu kinh tế kỹ thuật">
    {/* Điện thoại: tiêu đề một hàng riêng, nút xuống hàng dưới (không bóp tiêu đề thành cột chữ hẹp). */}
    <div className="ktkt-page-header relative flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
        <h1 className="text-xl font-bold uppercase tracking-tight text-slate-900 sm:text-2xl">Dữ liệu vận hành · Duyên Hải 1</h1>
        <p className="mt-1 text-sm text-slate-500">Quản lý số liệu hằng ngày, theo dõi chỉ tiêu và đối chiếu kết quả trong tháng.</p>
      </div>
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 sm:shrink-0"><div id="ktkt-header-alerts" className="empty:hidden" /><HeaderCopyTools/><ModuleTools user={user}/></div>
    </div>
    {children}
  </section>;
}
