import Link from "next/link";
import { DatabaseBackup, History, Puzzle } from "lucide-react";
const base="/tien-ich/chi-tieu-ktkt";
export function ModuleTools({admin}:{admin:boolean}) {
  const items=[{href:"/tien-ich-dong-bo",label:"Tải tiện ích đồng bộ",icon:Puzzle},...(admin?[{href:"/admin/data-backup",label:"Sao lưu & nạp dữ liệu",icon:DatabaseBackup},{href:"/admin/data-history",label:"Nhật ký số liệu",icon:History}]:[])];
  return <nav aria-label="Tiện ích và quản trị dữ liệu KTKT" className="flex shrink-0 items-center gap-1">
    {items.map(item=><Link key={item.href} href={base+item.href} title={item.label} aria-label={item.label} className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-700 shadow-sm hover:border-blue-300 hover:bg-blue-50"><item.icon className="size-[18px]" aria-hidden="true"/></Link>)}
  </nav>;
}
