import { getSessionUser } from "../lib/auth/server";
import { SessionProvider } from "./session-context";
import { SpreadsheetInputBehavior } from "./spreadsheet-input-behavior";
import { GoogleMirrorLinks } from "./google-mirror-links";
// Không còn thanh tab báo cáo (thanh bên đã có đủ mục), dòng mô tả và tên người dùng.
// Nút "Chọn ô để sao chép Excel" nằm ở hàng tiêu đề (layout); Phân quyền KTKT vào từ Quản trị → Phân quyền hoặc menu "Phân công nhập liệu".
/** Trang tự đặt nút "Xem Google Sheets" trên hàng điều khiển của mình (không dùng khung xanh riêng). */
const INLINE_MIRROR_MODULES=new Set(["ctktkt","chemical-usage","data","ppa","pmis"]);
export async function AppShell({children,active}:{children:React.ReactNode;active:string;hideSearch?:boolean}) {
  const user=await getSessionUser(); if(!user) return null;
  return <SessionProvider user={user}>
    <SpreadsheetInputBehavior />
    <div className="min-w-0 space-y-4">
      <div className="ctktkt-content app-content engineering-workspace min-w-0" data-module={active}>{!INLINE_MIRROR_MODULES.has(active)&&<GoogleMirrorLinks module={active}/>}{children}</div>
    </div>
  </SessionProvider>;
}
