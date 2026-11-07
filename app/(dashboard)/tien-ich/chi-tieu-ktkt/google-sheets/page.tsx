import Link from "next/link";
import {AppShell} from "@/modules/ctktkt/components/app-shell";
import {requireAdmin} from "@/modules/ctktkt/lib/auth/server";
export default async function GoogleSheetsSetup() {
 const guard=await requireAdmin();
 if(!guard.ok)return <p className="p-4 text-sm">Chỉ quản trị KTKT được cấu hình kết nối Google Sheets.</p>;
 return <AppShell active="google-sheets"><section className="space-y-4 rounded-xl border bg-white p-4 text-sm text-slate-700">
  <h2 className="text-lg font-bold text-slate-900">Kết nối Google Sheets với web PX</h2>
  <p>Dùng lại chín file và dự án Apps Script đang đồng bộ từ web cũ. Mỗi giờ, Google lấy số liệu từ web PX và cập nhật các file đó. Nhập và sửa số liệu trên web; quyền xem và tải file giữ theo chủ sở hữu.</p>
  <ol className="list-decimal space-y-3 pl-5">
   <li>Triển khai bản sửa lên web PX. Trước khi chuyển, đối chiếu dữ liệu tháng hiện tại ở web PX với web cũ cho đủ; dữ liệu nguồn thiếu có thể làm trống các ô tương ứng trên Sheet.</li>
   <li>Trên <strong>https://duyenhai1.vn</strong>, mở trang này và <a className="font-semibold text-blue-700 underline" href="/api/ctktkt/google-mirror/setup" download>tải tệp kết nối Google Sheets</a>. Tệp chứa mã kết nối riêng, giữ trên máy của mình và không gửi vào chat. Tệp tải từ localhost chỉ dùng thử, không dùng cho lịch thật.</li>
   <li>Mở đúng dự án Google Apps Script đã chạy cho web cũ. Lưu một bản mã cũ trên máy để có thể quay lại, sau đó thay mã bằng nội dung tệp vừa tải. Giữ nguyên tệp manifest, quyền đã cấp và lịch chạy hiện có; không tạo dự án hay lịch đồng bộ thứ hai.</li>
   <li>Chọn hàm <strong>connectPxSource</strong>, nhấn <strong>Chạy</strong>. Hàm kiểm tra kết nối và danh sách chín Sheet trước khi đổi mã kết nối; chưa ghi số liệu lên Sheet, không đổi quyền hay lịch chạy.</li>
   <li>Sau khi xác nhận dữ liệu web PX đầy đủ, chọn <strong>syncNow</strong> và nhấn <strong>Chạy</strong> một lần. Kiểm tra dữ liệu và thời gian cập nhật trên Sheet và web PX. Lịch hiện có tiếp tục chạy mỗi giờ.</li>
  </ol>
  <p className="rounded-lg bg-amber-50 p-3 text-amber-900">Không chạy install khi chuyển từ web cũ: dùng connectPxSource để giữ lịch hiện tại. Nếu báo không có hoặc có nhiều lịch syncNow, dừng và kiểm tra dự án đang mở trước khi tiếp tục.</p>
  <Link className="inline-flex min-h-10 items-center text-blue-700 underline" href="/tien-ich/chi-tieu-ktkt">Quay lại dữ liệu các tháng</Link>
 </section></AppShell>;
}
