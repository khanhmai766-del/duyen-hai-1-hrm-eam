import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Hash, LockKeyhole, MousePointerClick, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Chính sách quyền riêng tư – Cấp số PCT NKVH",
  description: "Chính sách quyền riêng tư của tiện ích Cấp số PCT NKVH – PXVH1.",
};

const UPDATED_AT = "24/09/2026";

const READ_FIELDS = [
  ["Mã phiếu NKVH", "Mã phiếu (id_pct) trên địa chỉ trang, dùng để nối phiếu NKVH với sổ PCT."],
  ["Thông tin phiếu", "Số phiếu ĐKCT, đơn vị công tác, phân loại, chuyên môn."],
  ["Nội dung công tác", "Địa điểm, nội dung, phạm vi và thời gian bắt đầu / kết thúc theo kế hoạch."],
  ["Nhân sự trên phiếu", "Tên người cấp phiếu, người chỉ huy trực tiếp, người lãnh đạo công việc và số lượng nhân viên."],
] as const;

export default function NkvhPctPrivacyPage() {
  return (
    <main className="min-h-dvh bg-[#071b35] px-4 py-10 text-slate-100 sm:px-6 lg:py-16">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[#0d2948] shadow-2xl shadow-black/30">
        <header className="relative overflow-hidden border-b border-white/10 px-6 py-10 sm:px-10">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex items-start gap-5">
            <div className="rounded-2xl bg-cyan-300/10 p-3 text-cyan-300 ring-1 ring-cyan-300/25"><ShieldCheck className="h-8 w-8" /></div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">PXVH1 · NKVH PCT Number</p>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Chính sách quyền riêng tư</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Áp dụng cho tiện ích trình duyệt “Cấp số PCT NKVH – PXVH1”. Cập nhật lần cuối: {UPDATED_AT}.</p>
            </div>
          </div>
        </header>

        <div className="space-y-9 px-6 py-9 sm:px-10">
          <section>
            <h2 className="text-xl font-bold text-white">1. Mục đích duy nhất</h2>
            <p className="mt-3 leading-7 text-slate-300">Tiện ích giúp vận hành viên đã đăng nhập hệ thống Nhật ký vận hành điện tử (NKVH) lấy số phiếu công tác (PCT) nội bộ từ sổ cấp phiếu công tác của PXVH1 tại duyenhai1.vn ngay trên trang phiếu NKVH, và ghi phiếu đó vào sổ. Nhờ vậy số PCT điện tử và PCT giấy dùng chung một dãy số, không bị cấp trùng. Tiện ích không quảng cáo, không theo dõi hành vi duyệt web và không hoạt động cho mục đích khác.</p>
          </section>

          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Đọc từ trang phiếu NKVH đang mở</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {READ_FIELDS.map(([title, detail]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                  <FileText className="mb-3 h-5 w-5 text-cyan-300" />
                  <h3 className="font-bold text-white">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">2. Dữ liệu được xử lý</h2>
            <p className="mt-3 leading-7 text-slate-300">Các trường nêu trên chỉ được đọc từ nội dung trang phiếu NKVH đang hiển thị, và chỉ được chuyển sang duyenhai1.vn khi người dùng bấm “Lấy số PCT” hoặc “Đồng bộ về sổ”. Khi lấy số, người dùng chọn thêm tổ máy và cương vị. Tiện ích không thu thập hoặc chuyển mật khẩu, cookie, token xác thực, lịch sử duyệt web hay nội dung từ các trang khác.</p>
          </section>

          <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.05] p-6">
            <div className="flex gap-4">
              <Hash className="mt-1 h-6 w-6 shrink-0 text-cyan-300" />
              <div>
                <h2 className="text-xl font-bold text-white">3. Tiện ích ghi gì lên NKVH</h2>
                <p className="mt-3 leading-7 text-slate-300">Sau khi sổ PXVH1 cấp số, tiện ích điền số đó vào đúng một ô “Số phiếu” trên trang đang mở, giống như người dùng tự gõ. Tiện ích <strong className="text-white">không bấm Lưu, không ký, không chuyển bước</strong> và không sửa ô nào khác. Chỉ khi người dùng tự bấm Lưu thì NKVH mới ghi nhận số phiếu. Ô Số phiếu đã có nội dung thì tiện ích không ghi đè.</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-6">
            <div className="flex gap-4">
              <LockKeyhole className="mt-1 h-6 w-6 shrink-0 text-emerald-300" />
              <div>
                <h2 className="text-xl font-bold text-white">4. Cách xử lý và bảo mật</h2>
                <p className="mt-3 leading-7 text-slate-300">Thông tin đăng nhập NKVH luôn ở trong trình duyệt của người dùng và không được gửi đi đâu. Yêu cầu sang duyenhai1.vn đi qua HTTPS và dùng phiên đăng nhập duyenhai1.vn sẵn có của người dùng. Máy chủ chỉ chấp nhận tài khoản có quyền cấp phiếu công tác, và ghi nhật ký kiểm toán cho mỗi lần lấy số hoặc đồng bộ. Dữ liệu được lưu trong sổ cấp phiếu công tác của PXVH1 theo quyền truy cập của hệ thống.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">5. Lưu trữ, chia sẻ và quyền kiểm soát</h2>
            <p className="mt-3 leading-7 text-slate-300">Trên trình duyệt, tiện ích chỉ ghi nhớ hai lựa chọn để tiện dùng lần sau: máy chủ sổ PCT đã chọn và cương vị chọn gần nhất. Tiện ích không bán hoặc chia sẻ dữ liệu cho bên thứ ba. Phiếu đã ghi vào sổ được quản lý theo quy định nội bộ của PXVH1. Người dùng có thể ngừng xử lý dữ liệu bất cứ lúc nào bằng cách không bấm các nút của tiện ích hoặc gỡ tiện ích.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">6. Quyền truy cập trang web</h2>
            <p className="mt-3 leading-7 text-slate-300">Tiện ích chỉ chạy trên hai trang chi tiết phiếu công tác của nkvh.tpcduyenhai.com.vn (PCT T-C-N-H và PCT điện) để đọc nội dung phiếu và điền số phiếu. Tiện ích chỉ gọi duyenhai1.vn để lấy số và ghi phiếu vào sổ. Không có tên miền nào khác được truy cập.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white">7. Liên hệ</h2>
            <p className="mt-3 leading-7 text-slate-300">Mọi yêu cầu liên quan đến dữ liệu hoặc tiện ích được tiếp nhận qua quản trị viên hệ thống PXVH1 tại Duyên Hải 1. Người dùng nội bộ có thể liên hệ theo kênh hỗ trợ đang công bố trong hệ thống.</p>
          </section>

          <footer className="flex flex-col gap-4 border-t border-white/10 pt-7 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-center gap-2"><MousePointerClick className="h-4 w-4" /> Chỉ xử lý khi người dùng chủ động bấm</span>
            <Link href="/login" className="font-semibold text-cyan-300 hover:text-cyan-200">Về hệ thống PXVH1 →</Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
