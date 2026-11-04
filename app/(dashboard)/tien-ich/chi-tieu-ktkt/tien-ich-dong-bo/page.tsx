import { ArrowDownToLine, ArrowRightLeft, BookOpen, CheckCircle2, FolderOpen, Gauge, Puzzle } from "lucide-react";
import { AppShell } from "@/modules/ctktkt/components/app-shell";
import qlkt from "@/public/ctktkt/qlkt-sync-extension/manifest.json";
import nkvh from "@/public/ctktkt/nkvh-ppa-extension/manifest.json";

const extensions = [
  { name: "Đồng bộ QLKT", version: qlkt.version, file: "qlkt-sync-extension", icon: Gauge,
    description: "Lấy số liệu sản xuất, công tơ, PMIS, BCSX và suất hao nhiệt từ hệ thống QLKT.",
    instruction: "Đăng nhập QLKT trên cùng trình duyệt, mở báo cáo KTKT cần lấy số liệu rồi bấm nút đồng bộ tương ứng." },
  { name: "Đồng bộ NKVH → PPA", version: nkvh.version, file: "nkvh-ppa-extension", icon: BookOpen,
    description: "Đọc sự kiện trong nhật ký vận hành theo ngày và chọn nội dung đưa vào phần suất hao nhiệt PPA.",
    instruction: "Đăng nhập NKVH trên cùng trình duyệt. Trong phần PPA, mở chức năng lấy sự kiện NKVH và kiểm tra nội dung trước khi đưa vào báo cáo." },
];

export default function ExtensionDownloadsPage() {
  return <AppShell active="extensions">
    <div className="space-y-6">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <div className="flex items-center gap-2 text-blue-800"><Puzzle className="size-5 shrink-0"/><h2 className="text-xl font-bold">Tiện ích đồng bộ KTKT</h2></div>
        <p className="mt-2 text-sm leading-6 text-slate-600">Cài trên Chrome hoặc Edge để lấy số liệu từ QLKT và NKVH. Xem báo cáo, nhập tay, xuất Excel và sao lưu vẫn sử dụng bình thường khi chưa cài tiện ích.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {extensions.map(extension=><article key={extension.file} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><extension.icon className="size-6"/></span><h3 className="pt-2 text-lg font-bold text-slate-900">{extension.name}</h3></div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">v{extension.version}</span>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">{extension.description}</p>
          <p className="mt-3 flex gap-2 text-sm leading-6 text-slate-600"><ArrowRightLeft className="mt-1 size-4 shrink-0 text-blue-600"/>{extension.instruction}</p>
          <a className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800" href={`/ctktkt/${extension.file}.zip?v=${extension.version}`} download={`${extension.file}-${extension.version}.zip`}><ArrowDownToLine className="size-5"/>Tải tiện ích (.zip)</a>
        </article>)}
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="ctktkt-install-title">
        <h3 id="ctktkt-install-title" className="flex items-center gap-2 text-lg font-bold text-slate-900"><FolderOpen className="size-5 text-blue-700"/>Cài đặt lần đầu</h3>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-600">
          <li>Tải gói ZIP của tiện ích cần dùng và giải nén vào một thư mục cố định trên máy.</li>
          <li>Mở trang quản lý tiện ích: <code className="break-all rounded bg-slate-100 px-1.5 py-0.5">chrome://extensions</code> hoặc <code className="break-all rounded bg-slate-100 px-1.5 py-0.5">edge://extensions</code>, rồi bật chế độ dành cho nhà phát triển.</li>
          <li>Chọn chức năng tải tiện ích đã giải nén và chọn thư mục có tệp <code>manifest.json</code>.</li>
          <li>Tải lại trang KTKT, đăng nhập hệ thống nguồn rồi kiểm tra trạng thái kết nối ở chức năng đồng bộ.</li>
        </ol>
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-900"><CheckCircle2 className="mt-1 size-4 shrink-0"/>Khi cập nhật: tải và giải nén bản mới vào thư mục đã cài, nhấn tải lại tiện ích trong trình duyệt, rồi tải lại trang KTKT.</p>
      </section>
    </div>
  </AppShell>;
}
