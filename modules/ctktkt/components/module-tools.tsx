import Link from "next/link";
import { DatabaseBackup, FileSpreadsheet, History, Puzzle } from "lucide-react";
import { hasPermission, type SessionUser } from "../lib/auth/session";
const base="/tien-ich/chi-tieu-ktkt";
export function ModuleTools({user}:{user:SessionUser}) {
  const backup=hasPermission(user,"backup_data")||hasPermission(user,"restore_data");
  const items=[{href:"/tien-ich-dong-bo",label:"Tải tiện ích đồng bộ",icon:Puzzle},
    ...(backup?[{href:"/admin/data-backup",label:"Sao lưu & nạp dữ liệu",icon:DatabaseBackup}]:[]),
    ...(hasPermission(user,"view_data_history")?[{href:"/admin/data-history",label:"Nhật ký số liệu",icon:History}]:[]),
    // Cài đặt kết nối Google Sheets (tải tệp Apps Script) — cùng điều kiện quyền với trang /google-sheets (requireAdmin).
    ...(hasPermission(user,"manage_users")?[{href:"/google-sheets",label:"Kết nối Google Sheets",icon:FileSpreadsheet}]:[])];
  return <nav aria-label="Tiện ích và quản trị dữ liệu KTKT" className="flex shrink-0 items-center gap-1">
    {items.map(item=><Link key={item.href} href={base+item.href} title={item.label} aria-label={item.label} className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-700 shadow-sm hover:border-blue-300 hover:bg-blue-50"><item.icon className="size-[18px]" aria-hidden="true"/></Link>)}
  </nav>;
}
