import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, ArrowRight, type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tint?: "navy" | "green" | "amber" | "red" | "blue";
  trend?: { value: number; positive?: boolean };
  hint?: string;
  /** Optional decorative 3D image rendered as a faded watermark in the corner. */
  bgImage?: string;
  /** Optional small 3D badge overlaid on top of bgImage (e.g. a check mark). */
  bgBadge?: string;
  /** Optional full-bleed cover photo behind the card (with dark overlay + white text). */
  bgCover?: string;
  /** Optional call-to-action shown inline with the label (e.g. "Mở →"). */
  cta?: string;
}

const TINTS = {
  navy: { bg: "bg-navy/5", icon: "bg-gradient-to-br from-[#2c5282] to-navy text-white shadow-navy/30" },
  green: { bg: "bg-green-50", icon: "bg-gradient-to-br from-emerald-400 to-green-600 text-white shadow-green-500/30" },
  amber: { bg: "bg-amber-50", icon: "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-amber-500/30" },
  red: { bg: "bg-red-50", icon: "bg-gradient-to-br from-rose-400 to-red-600 text-white shadow-red-500/30" },
  blue: { bg: "bg-blue-50", icon: "bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-blue-500/30" },
};

export function StatCard({ label, value, icon: Icon, tint = "navy", trend, hint, bgImage, bgBadge, bgCover, cta }: StatCardProps) {
  const t = TINTS[tint];
  const cover = !!bgCover;
  return (
    <div
      className={cn(
        "group relative flex h-full flex-col justify-between overflow-hidden rounded-xl border p-5 transition-shadow hover:shadow-sm",
        cover ? "min-h-[150px] border-0 text-white" : cn("border-border", t.bg)
      )}
    >
      {cover && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bgCover}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full select-none object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/25" />
        </>
      )}
      {bgImage && !cover && (
        <div className="pointer-events-none absolute -bottom-4 -right-3 h-32 w-32 select-none transition-transform duration-500 group-hover:scale-105">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bgImage} alt="" aria-hidden className="h-full w-full object-contain opacity-90 drop-shadow-md" />
          {bgBadge && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bgBadge}
              alt=""
              aria-hidden
              className="absolute -right-1 -top-1 h-12 w-12 object-contain drop-shadow-lg"
            />
          )}
        </div>
      )}
      <div className="relative flex items-start justify-between">
        <div
          className={cn(
            "relative flex h-11 w-11 items-center justify-center rounded-xl shadow-lg ring-1 ring-white/40 before:absolute before:inset-x-1 before:top-0.5 before:h-1/3 before:rounded-t-lg before:bg-white/25",
            t.icon
          )}
        >
          <Icon className="relative h-5 w-5" />
        </div>
        {trend && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium",
              trend.positive ? "text-success" : "text-destructive"
            )}
          >
            {trend.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>
      <div className={cn("relative mt-4", cover && "[text-shadow:0_1px_6px_rgba(0,0,0,0.6)]")}>
        <div className={cn("text-[40px] font-bold leading-none", cover ? "text-white" : "text-ink")}>{value}</div>
        <div className={cn("mt-2 flex items-center justify-between gap-2 text-sm font-medium", cover ? "text-white/90" : "text-muted-foreground")}>
          <span>{label}</span>
          {cta && (
            <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold", cover ? "text-white" : "text-accent")}>
              {cta} <ArrowRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
        {hint && <div className={cn("mt-0.5 text-xs", cover ? "text-white/75" : "text-muted-foreground/70")}>{hint}</div>}
      </div>
    </div>
  );
}
