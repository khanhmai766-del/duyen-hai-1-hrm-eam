import AdminDayBoard from "@/components/hr/AdminDayBoard";

export const metadata = { title: "Đăng ký đi hành chính" };

// Bảng đăng ký đi hành chính theo tuần (module AdminDayBoard).
// Bản quản lý đầy đủ + kho lưu trữ cũ nằm tại ./kho-luu-tru.
export default function AdminRegistrationPage() {
  return <AdminDayBoard />;
}
