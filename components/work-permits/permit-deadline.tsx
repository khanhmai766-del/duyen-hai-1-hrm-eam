import { AlarmClock, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { permitDeadline } from "@/lib/work-permits";

/**
 * Nhãn hạn thực hiện PCT nhà thầu theo "Kết thúc công việc dự kiến": còn ≤ 2 ngày → hổ phách; quá hạn → đỏ (server chặn
 * mở / bàn giao lần làm việc). Không hiện khi chưa tới ngưỡng nhắc hoặc phiếu không có mốc.
 */
export function PermitDeadlineBadge({ permit, className }: { permit: { teamType: string; status: string; plannedEndAt?: string | null }; className?: string }) {
  const deadline = permitDeadline(permit);
  if (!deadline || deadline.state === "ok") return null;
  const overdue = deadline.state === "overdue";
  const Icon = overdue ? OctagonAlert : AlarmClock;
  return <span title={permit.plannedEndAt ? `Kết thúc công việc dự kiến: ${new Date(permit.plannedEndAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : undefined}
    className={cn("inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
      overdue ? "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900", className)}>
    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{deadline.label}</span>
  </span>;
}
