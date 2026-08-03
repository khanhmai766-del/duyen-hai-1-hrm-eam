import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { REPL_DUE, SAMPLING_DUE, replacementDueStatus, daysUntilDue, type ReplDueKey } from "@/lib/constants";

/** Diễn giải số ngày còn lại đến hạn thay thế. */
function replDueText(nextDueAt: Date | string): string {
  const d = daysUntilDue(nextDueAt);
  if (d < 0) return `Quá hạn ${Math.abs(d)} ngày`;
  if (d === 0) return "Đến hạn hôm nay";
  if (d === 1) return "Còn 1 ngày";
  return `Còn ${d} ngày`;
}

/** Diễn giải số ngày cho điểm CHỈ LẤY MẪU — không dùng chữ "quá hạn thay thế". */
export function samplingDueText(nextDueAt: Date | string): string {
  const d = daysUntilDue(nextDueAt);
  if (d < 0) return `Trễ kỳ lấy mẫu ${Math.abs(d)} ngày`;
  if (d === 0) return "Tới kỳ lấy mẫu hôm nay";
  if (d === 1) return "Còn 1 ngày tới kỳ";
  return `Còn ${d} ngày tới kỳ`;
}

export function ReplacementBadge({
  nextDueAt,
  withText = false,
  samplingOnly = false,
  className,
}: {
  nextDueAt: Date | string;
  withText?: boolean;
  /** Điểm chỉ lấy mẫu/theo dõi theo O&M — dùng bảng màu và chữ riêng. */
  samplingOnly?: boolean;
  className?: string;
}) {
  const key = replacementDueStatus(nextDueAt) as ReplDueKey;
  const meta = samplingOnly ? SAMPLING_DUE[key] : REPL_DUE[key];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        meta.badge,
        className
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.dot }} />
      {withText
        ? samplingOnly
          ? samplingDueText(nextDueAt)
          : replDueText(nextDueAt)
        : meta.label}
    </span>
  );
}

/** Chip nhận diện nhóm vật tư chỉ lấy mẫu định kỳ. */
export function SamplingOnlyChip({ className }: { className?: string }) {
  return (
    <span
      title="Theo O&M chỉ lấy mẫu, theo dõi hoặc châm bổ sung — không thay thế định kỳ"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-800",
        className
      )}
    >
      <FlaskConical className="h-3 w-3" />
      Lấy mẫu định kỳ
    </span>
  );
}
