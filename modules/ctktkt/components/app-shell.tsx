import { getSessionUser } from "../lib/auth/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SessionProvider } from "./session-context";
import { SpreadsheetInputBehavior } from "./spreadsheet-input-behavior";
import { GoogleMirrorLinks } from "./google-mirror-links";
// Không còn thanh tab báo cáo (thanh bên đã có đủ mục), dòng mô tả và tên người dùng.
// Nút "Chọn ô để sao chép Excel" nằm ở hàng tiêu đề (layout); Phân quyền KTKT vào từ Quản trị → Phân quyền.
/** Trang tự đặt nút "Xem Google Sheets" trên hàng điều khiển của mình (không dùng khung xanh riêng). */
const INLINE_MIRROR_MODULES=new Set(["ctktkt","chemical-usage","data","ppa","pmis"]);
export async function AppShell({children,active}:{children:React.ReactNode;active:string;hideSearch?:boolean}) {
  const user=await getSessionUser(); if(!user) return null;
  return <SessionProvider user={user}>
    <SpreadsheetInputBehavior />
    <div className="min-w-0 space-y-4">
      {active==="permissions"&&<Link href="/admin/roles" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"><ArrowLeft className="size-4" aria-hidden/>Quản trị · Phân quyền</Link>}
      <div className="ctktkt-content app-content engineering-workspace min-w-0" data-module={active}>{!INLINE_MIRROR_MODULES.has(active)&&<GoogleMirrorLinks module={active}/>}{children}</div>
    </div>
  </SessionProvider>;
}
