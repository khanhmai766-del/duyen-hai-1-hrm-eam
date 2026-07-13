import { RepairStatusBadge, PriorityBadge } from "@/components/devices/status-badge";
import { REPAIR_STATUS, type RepairStatusKey } from "@/lib/constants";
import { formatDate, formatDuration } from "@/lib/utils";

interface TimelineEntry {
  id: string;
  title: string;
  status: string;
  priority: string;
  startedAt: string | Date;
  downtime?: number | null;
  createdBy?: { name: string } | null;
  action?: string;
  machine?: string | null;
}

export function RepairTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Chưa có lịch sử sửa chữa</p>;
  }
  return (
    <ol className="relative space-y-5 border-l-2 border-border pl-6">
      {entries.map((e) => {
        const dot = REPAIR_STATUS[e.status as RepairStatusKey]?.dot ?? "#999";
        return (
          <li key={e.id} className="relative">
            <span
              className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white"
              style={{ background: dot }}
            />
            <div className="rounded-lg border border-border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h4 className="font-medium leading-tight text-ink">{e.title}</h4>
                <div className="flex shrink-0 gap-1.5">
                  {e.machine && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-navy">{e.machine}</span>}
                  <PriorityBadge priority={e.priority} />
                  <RepairStatusBadge status={e.status} />
                </div>
              </div>
              {e.action && <p className="mt-1 text-sm text-muted-foreground">{e.action}</p>}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>📅 {formatDate(e.startedAt)}</span>
                {e.createdBy && <span>👤 {e.createdBy.name}</span>}
                {e.downtime != null && <span>⏱ {formatDuration(e.downtime)}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
