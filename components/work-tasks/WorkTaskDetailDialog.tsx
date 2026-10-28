"use client";

import * as React from "react";
import { CalendarClock, PenLine, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { WorkTask } from "@/hooks/useWorkTasks";
import { cn } from "@/lib/utils";
import { formatWorkTaskDate, workTaskToday, workTaskWeekday } from "@/lib/work-task";
import { Assignees, Director, DueHint, EVN_BAND, NoteAndLinks, dueHintOf } from "@/components/work-tasks/WorkTaskParts";

const DAY_MS = 86_400_000;
const dayOf = (value: string) => Date.parse(`${value.slice(0, 10)}T00:00:00Z`);

// Màu thanh thời gian theo cùng thang với nhãn hạn; "past" = qua hạn nhưng đã cập nhật.
const BAR_TONE: Record<string, string> = {
  muted: "bg-[#00558F]",
  yellow: "bg-yellow-400",
  orange: "bg-orange-500",
  red: "bg-red-500",
  past: "bg-emerald-500",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h4>;
}

/** Ngày giao → hạn hoàn thành: phần đã trôi qua tô màu theo mức cảnh báo. */
function TimeProgress({ task }: { task: WorkTask }) {
  if (!task.dueDate) {
    return (
      <p className="text-sm text-muted-foreground">
        Giao ngày <span className="font-medium tabular-nums text-ink">{formatWorkTaskDate(task.taskDate)}</span> · chưa đặt hạn hoàn thành
      </p>
    );
  }
  const start = dayOf(task.taskDate);
  const end = dayOf(task.dueDate);
  const total = Math.max(1, (end - start) / DAY_MS);
  const elapsed = (dayOf(workTaskToday()) - start) / DAY_MS;
  const percent = Math.round(Math.min(1, Math.max(0, elapsed / total)) * 100);
  const tone = dueHintOf(task)?.tone ?? "muted";

  return (
    <div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Thời gian đã trôi qua"
      >
        <div className={cn("h-full rounded-full transition-[width]", BAR_TONE[tone])} style={{ width: `${Math.max(percent, 3)}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Giao <span className="font-medium tabular-nums text-ink">{formatWorkTaskDate(task.taskDate)}</span>
        </span>
        <span>
          Hạn <span className="font-medium tabular-nums text-ink">{formatWorkTaskDate(task.dueDate)}</span>
        </span>
      </div>
    </div>
  );
}

/** "27/10/2026 lúc 07:00" theo giờ Việt Nam. */
const formatDateTime = (value: string) => {
  const vn = new Date(Date.parse(value) + 7 * 3_600_000).toISOString();
  return `${formatWorkTaskDate(vn)} lúc ${vn.slice(11, 16)}`;
};

/** Popup tóm tắt một công việc khi bấm vào dòng/thẻ. Chỉ xem — sửa đi qua các hộp thoại sẵn có. */
export function WorkTaskDetailDialog({
  task,
  onOpenChange,
  canEdit,
  canReport,
  onEdit,
  onReport,
}: {
  task: WorkTask | null;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  canReport: boolean;
  onEdit: () => void;
  onReport: () => void;
}) {
  const report = task?.report?.trim() ?? "";

  return (
    <Dialog open={!!task} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0",
          "[&>button]:right-3 [&>button]:top-3 [&>button]:z-10 [&>button]:h-9 [&>button]:w-9 [&>button]:rounded-lg [&>button]:border [&>button]:border-white/20 [&>button]:bg-white/10 [&>button]:text-white [&>button]:opacity-90 [&>button]:hover:bg-white/20 [&>button]:hover:opacity-100"
        )}
      >
        {task && (
          <>
            <div className={cn("flex-none px-5 py-4 pr-16 text-white", EVN_BAND)}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-[#BFDCEE]">
                <CalendarClock className="h-3.5 w-3.5" />
                <span className="tabular-nums">
                  {workTaskWeekday(task.taskDate)}, {formatWorkTaskDate(task.taskDate)}
                </span>
                <DueHint task={task} />
              </div>
              <DialogTitle className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-lg font-bold leading-snug text-white">
                {task.content}
              </DialogTitle>
              <DialogDescription className="sr-only">Chi tiết công việc</DialogDescription>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <section>
                <SectionTitle>Thời gian thực hiện</SectionTitle>
                <TimeProgress task={task} />
              </section>

              <div className="grid gap-4 sm:grid-cols-2">
                <section>
                  <SectionTitle>Người chỉ đạo</SectionTitle>
                  <div className="text-sm"><Director value={task.director} /></div>
                </section>
                <section>
                  <SectionTitle>Chủ trì</SectionTitle>
                  <div className="text-sm"><Assignees task={task} /></div>
                </section>
              </div>

              <section>
                <SectionTitle>Báo cáo thực hiện</SectionTitle>
                {report ? (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                    <p className="whitespace-pre-wrap break-words text-sm text-ink">{report}</p>
                    {task.reportUpdatedAt && (
                      <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
                        Cập nhật {formatDateTime(task.reportUpdatedAt)}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">Chưa có báo cáo</p>
                )}
              </section>

              {(task.note || task.links.length > 0) && (
                <section>
                  <SectionTitle>Ghi chú/đính kèm</SectionTitle>
                  <NoteAndLinks note={task.note} links={task.links} />
                </section>
              )}
            </div>

            <div className="flex flex-none flex-col-reverse gap-2 border-t border-border bg-muted/30 px-5 py-3 sm:flex-row sm:items-center">
              <p className="text-xs text-muted-foreground sm:mr-auto">
                Giao bởi <span className="font-medium text-ink">{task.createdBy.name}</span>
              </p>
              <div className="flex gap-2">
                {canReport && (
                  <Button variant="outline" className="flex-1 sm:flex-none" onClick={onReport}>
                    <PenLine /> {report ? "Sửa báo cáo" : "Ghi báo cáo"}
                  </Button>
                )}
                {canEdit && (
                  <Button className="flex-1 sm:flex-none" onClick={onEdit}>
                    <Pencil /> Sửa công việc
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
