import AdminDayBoard from "@/components/hr/AdminDayBoard";

export const metadata = { title: "Đăng ký đi hành chính" };

// Bảng đăng ký đi hành chính theo tuần (module AdminDayBoard).
// Trang đăng ký và kho lưu trữ được tích hợp trong AdminDayBoard.
export default function AdminRegistrationPage() {
  return <AdminDayBoard />;
}
