import { Clock3, ShieldCheck } from "lucide-react";
import type { CheckInPeakWindow } from "@/lib/peak-mode";

export function PeakModeNotice({ activeWindow }: { activeWindow?: CheckInPeakWindow | null }) {
  return (
    <div className="flex min-h-[calc(100dvh-5rem)] items-center justify-center px-4 py-10">
      <section className="w-full max-w-xl rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <Clock3 className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-extrabold text-ink">Tạm ẩn trong giờ cao điểm chấm công</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Hệ thống đang ưu tiên tải nhanh các chức năng chấm công và quản lý người dùng.
        </p>
        {activeWindow && (
          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            {activeWindow.label}: {activeWindow.start} - {activeWindow.end}
          </div>
        )}
        <p className="mt-4 inline-flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Tài khoản xử lý sự cố vẫn được phép mở khi cần.
        </p>
      </section>
    </div>
  );
}
