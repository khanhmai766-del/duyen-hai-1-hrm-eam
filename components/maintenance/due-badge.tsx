import { cn } from "@/lib/utils";
import { PM_DUE, pmDueStatus, daysUntilDue, type PmDueKey } from "@/lib/constants";

/** Diễn giải số ngày còn lại đến hạn thành chữ. */
export function dueText(nextDueAt: Date | string): string {
  const d = daysUntilDue(nextDueAt);
  if (d < 0) return `Quá hạn ${Math.abs(d)} ngày`;
  if (d === 0) return "Đến hạn hôm nay";
  if (d === 1) return "Còn 1 ngày";
  return `Còn ${d} ngày`;
}

export function DueBadge({
  nextDueAt,
  withText = false,
  className,
}: {
  nextDueAt: Date | string;
  withText?: boolean;
  className?: string;
}) {
  const key = pmDueStatus(nextDueAt) as PmDueKey;
  const meta = PM_DUE[key];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        meta.badge,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
      {withText ? dueText(nextDueAt) : meta.label}
    </span>
  );
}
