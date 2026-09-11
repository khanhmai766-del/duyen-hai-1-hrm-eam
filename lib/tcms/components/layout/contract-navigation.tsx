"use client";
import { useContracts } from "@/lib/tcms/components/contracts/contract-store";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileSignature } from "lucide-react";
const base = "/documents/contracts";
const links = [
  ["", "Tổng quan"], ["/list", "Hợp đồng"], ["/supervision-decisions", "Quyết định giám sát"],
  ["/milestones", "Tiến độ"], ["/inspections", "Kiểm tra"], ["/issues", "Tồn tại kỹ thuật"],
  ["/acceptance", "Nghiệm thu"], ["/documents", "Hồ sơ"], ["/contractors", "Nhà thầu"],
  ["/departments", "Đơn vị"], ["/personnel", "Nhân sự và phân quyền"],
] as const;
export function ContractNavigation() {
  const pathname = usePathname();
  const { canAdminister } = useContracts();
  return <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
    <div className="flex items-center gap-3 border-b px-4 py-4"><span className="rounded-lg bg-primary/10 p-2 text-primary"><FileSignature className="h-5 w-5"/></span><div><p className="text-xs text-muted-foreground">Quản lý tài liệu số</p><h1 className="text-lg font-bold text-primary">Quản lý hợp đồng</h1></div></div>
    <nav aria-label="Điều hướng quản lý hợp đồng" className="flex gap-1 overflow-x-auto p-2">{links.filter(([path]) => canAdminister || !["/personnel"].includes(path)).map(([path, label]) => {
      const href = base + path;
      const active = path ? pathname.startsWith(href) : pathname === base;
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</Link>;
    })}</nav>
  </section>;
}
