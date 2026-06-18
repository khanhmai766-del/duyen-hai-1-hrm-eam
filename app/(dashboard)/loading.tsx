import { PowerLoadingOverlay } from "@/components/shared/power-loading-overlay";

export default function DashboardLoading() {
  return <PowerLoadingOverlay active delayMs={5000} message="Đang tải trang vận hành..." />;
}
