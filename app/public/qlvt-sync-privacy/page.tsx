import type { Metadata } from "next";
import Link from "next/link";
import { Database, FlaskConical, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Chính sách quyền riêng tư – Đồng bộ QLVT / LIMS",
  description: "Chính sách quyền riêng tư của tiện ích Đồng bộ QLVT & LIMS – PXVH1.",
};

const UPDATED_AT = "30/07/2026";

const QLVT_FIELDS = [
  ["Mã vật tư", "Mã nhận diện vật tư trong QLVT."],
  ["Kho", "Mã kho gắn với vật tư."],
  ["Đơn vị tính", "ĐVT được khai báo trong QLVT."],
  ["Tồn kho", "Số lượng tồn hiện tại theo QLVT."],
] as const;

const LIMS_FIELDS = [
  ["Số phiếu & đơn vị", "Số phiếu kết quả và đơn vị được thí nghiệm."],
  ["Tên mẫu dầu", "Tên mẫu dầu / thiết bị được lấy mẫu."],
  ["Ngày lấy mẫu & trả kết quả", "Hai mốc thời gian hiển thị trên phiếu."],
  ["Đánh giá & ý kiến", "Đánh giá kết quả, ý kiến PKT và ý kiến QLVH."],
] as const;

export default function QlvtSyncPrivacyPage() {
  return (
    <main className="min-h-screen bg-[#071b35] px-4 py-10 text-slate-100 sm:px-6 lg:py-16">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[#0d2948] shadow-2xl shadow-black/30">
        <header className="relative overflow-hidden border-b border-white/10 px-6 py-10 sm:px-10">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex items-start gap-5">
            <div className="rounded-2xl bg-cyan-300/10 p-3 text-cyan-300 ring-1 ring-cyan-300/25"><ShieldCheck className="h-8 w-8" /></div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">PXVH1 · QLVT / LIMS Sync</p>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Chính sách quyền riêng tư</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Áp dụng cho tiện ích Chrome “Đồng bộ QLVT & LIMS – PXVH1”. Cập nhật lần cuối: {UPDATED_AT}.</p>
            </div>
          </div>
        </header>

        <div className="space-y-9 px-6 py-9 sm:px-10">
          <section>
            <h2 className="text-xl font-bold text-white">1. Mục đích duy nhất</h2>
            <p className="mt-3 leading-7 text-slate-300">Tiện ích hỗ trợ người dùng đã đăng nhập các hệ thống nội bộ Duyên Hải chủ động đồng bộ dữ liệu nghiệp vụ sang hệ thống quản lý vật tư PXVH1 tại duyenhai1.vn: dữ liệu tồn kho vật tư từ QLVT, và kết quả phân tích dầu Không Đạt của PX Vận hành 1 từ LIMS. Tiện ích không quảng cáo, không theo dõi hành vi duyệt web và không hoạt động cho mục đích khác.</p>
          </section>

          <section className="space-y-5">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Từ QLVT — tồn kho vật tư</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {QLVT_FIELDS.map(([title, detail]) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                    <Database className="mb-3 h-5 w-5 text-cyan-300" />
                    <h3 className="font-bold text-white">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{detail}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Từ LIMS — mẫu dầu Không Đạt</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {LIMS_FIELDS.map(([title, detail]) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                    <FlaskConical className="mb-3 h-5 w-5 text-cyan-300" />
                    <h3 className="font-bold text-white">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">2. Dữ liệu được xử lý</h2>
            <p className="mt-3 leading-7 text-slate-300">Chỉ các trường nêu trên được chuyển sang duyenhai1.vn khi người dùng bấm “Đồng bộ từ QLVT” hoặc “Đồng bộ từ LIMS”. Với LIMS, tiện ích chỉ đọc những trường hiển thị trên bảng danh sách kết quả và chỉ với các mẫu Không Đạt — không lấy chi tiết chỉ tiêu thí nghiệm. Tiện ích không thu thập hoặc chuyển mật khẩu, cookie đăng nhập, token xác thực, lịch sử duyệt web, dữ liệu cá nhân hay nội dung từ các trang khác.</p>
          </section>

          <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-6">
            <div className="flex gap-4">
              <LockKeyhole className="mt-1 h-6 w-6 shrink-0 text-emerald-300" />
              <div>
                <h2 className="text-xl font-bold text-white">3. Cách xử lý và bảo mật</h2>
                <p className="mt-3 leading-7 text-slate-300">Yêu cầu lấy dữ liệu được thực hiện ngay trong tab QLVT / LIMS đã đăng nhập. Thông tin xác thực luôn thuộc phạm vi trang nguồn và không được gửi sang PXVH1. Dữ liệu nghiệp vụ được truyền qua HTTPS, chỉ đến duyenhai1.vn, và được lưu trong cơ sở dữ liệu nghiệp vụ theo quyền truy cập của hệ thống. Tiện ích chỉ ĐỌC: nó không gửi, sửa hay xoá bất kỳ dữ liệu nào trên QLVT và LIMS.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">4. Lưu trữ, chia sẻ và quyền kiểm soát</h2>
            <p className="mt-3 leading-7 text-slate-300">Tiện ích không tự lưu dữ liệu trên trình duyệt và không bán hoặc chia sẻ dữ liệu cho bên thứ ba. Bản ghi tồn kho tại PXVH1 được thay thế khi đồng bộ lần tiếp theo; phiếu kết quả phân tích dầu được cập nhật theo số phiếu tương ứng. Tất cả được quản lý theo quy định nội bộ. Người dùng có thể ngừng xử lý dữ liệu bất cứ lúc nào bằng cách không bấm đồng bộ hoặc gỡ tiện ích.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">5. Quyền truy cập trang web</h2>
            <p className="mt-3 leading-7 text-slate-300">Tiện ích chỉ yêu cầu quyền trên qlvt.tpcduyenhai.com.vn để đọc dữ liệu tồn kho, trên portal.tpcduyenhai.com.vn để đọc kết quả phân tích dầu trong trang LIMS, và trên duyenhai1.vn để nhận yêu cầu đồng bộ rồi chuyển kết quả vào hệ thống — tất cả đều theo yêu cầu chủ động của người dùng. Không có tên miền nào khác được truy cập.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">6. Liên hệ</h2>
            <p className="mt-3 leading-7 text-slate-300">Mọi yêu cầu liên quan đến dữ liệu hoặc tiện ích được tiếp nhận qua quản trị viên hệ thống PXVH1 tại Duyên Hải 1. Người dùng nội bộ có thể liên hệ theo kênh hỗ trợ đang công bố trong hệ thống.</p>
          </section>

          <footer className="flex flex-col gap-4 border-t border-white/10 pt-7 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Chỉ xử lý khi người dùng chủ động yêu cầu</span>
            <Link href="/login" className="font-semibold text-cyan-300 hover:text-cyan-200">Về hệ thống PXVH1 →</Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
