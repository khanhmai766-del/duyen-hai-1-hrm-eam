import * as React from "react";
import { REPAIR_STATUS, REPAIR_STATUS_ORDER } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function ProgressTracker({ status }: { status: string }) {
  const current = REPAIR_STATUS[status as keyof typeof REPAIR_STATUS]?.step ?? 0;
  return (
    <div className="flex items-center">
      {REPAIR_STATUS_ORDER.map((s, i) => (
        <React.Fragment key={s}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                i <= current ? "bg-accent text-white" : "bg-muted text-muted-foreground"
              )}
            >
              {i + 1}
            </div>
            <span className={cn("text-[10px]", i <= current ? "text-ink" : "text-muted-foreground")}>
              {REPAIR_STATUS[s].label}
            </span>
          </div>
          {i < REPAIR_STATUS_ORDER.length - 1 && (
            <div className={cn("mx-1 h-0.5 flex-1", i < current ? "bg-accent" : "bg-muted")} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
