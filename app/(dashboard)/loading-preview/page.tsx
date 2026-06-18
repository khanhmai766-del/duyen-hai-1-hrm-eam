import { PowerLoadingOverlay } from "@/components/shared/power-loading-overlay";

export default function LoadingPreviewPage() {
  return (
    <div className="min-h-[70vh] rounded-[8px] border border-dashed border-slate-300 bg-white p-8 dark:border-slate-700 dark:bg-card">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Xem thử loading website animation</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Animation này là lớp chờ chung của hệ thống và sẽ tự hiển thị khi tải trang hoặc tải dữ liệu vượt quá 5 giây.
      </p>
      <PowerLoadingOverlay active delayMs={0} message="Đang tải dữ liệu vận hành" />
    </div>
  );
}
