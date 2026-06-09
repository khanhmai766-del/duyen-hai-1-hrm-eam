import { cn } from "@/lib/utils";
import { REPL_DUE, replacementDueStatus, daysUntilDue, type ReplDueKey } from "@/lib/constants";

/** Diễn giải số ngày còn lại đến hạn thay thế. */
export function replDueText(nextDueAt: Date | string): string {
  const d = daysUntilDue(nextDueAt);
  if (d < 0) return `Quá hạn ${Math.abs(d)} ngày`;
  if (d === 0) return "Đến hạn hôm nay";
  if (d === 1) return "Còn 1 ngày";
  return `Còn ${d} ngày`;
}

export function ReplacementBadge({
  nextDueAt,
  withText = false,
  className,
}: {
  nextDueAt: Date | string;
  withText?: boolean;
  className?: string;
}) {
  const key = replacementDueStatus(nextDueAt) as ReplDueKey;
  const meta = REPL_DUE[key];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        meta.badge,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
      {withText ? replDueText(nextDueAt) : meta.label}
    </span>
  );
}
