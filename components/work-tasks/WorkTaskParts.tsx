"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, FileSpreadsheet, FileText, Folder, Link2, Loader2, PenLine, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useReportWorkTask, type WorkTask } from "@/hooks/useWorkTasks";
import { cn, initials } from "@/lib/utils";
import {
  WORK_TASK_LINK_LABELS,
  WORK_TASK_MAX_LINKS,
  formatWorkTaskDate,
  parseGoogleLink,
  workTaskDirectorLabel,
  workTaskDueHint,
  workTaskHasUpdate,
  workTaskWeekday,
  type WorkTaskLink,
} from "@/lib/work-task";

/** Xanh nhận diện EVN — cùng dải màu tiêu đề hộp thoại tiến trình tách thiết bị. */
export const EVN_BAND = "bg-gradient-to-b from-[#00558F] to-[#00426F]";

/** Ô ngày kiểu tờ lịch: dải tháng xanh EVN, ngày to ở giữa. */
export function DateTile({ value, showYear = false }: { value: string; showYear?: boolean }) {
  const [y, m, d] = value.slice(0, 10).split("-");
  return (
    <div
      title={`${workTaskWeekday(value)}, ${formatWorkTaskDate(value)}`}
      className="flex w-11 shrink-0 flex-col items-center overflow-hidden rounded-lg border border-[#00558F]/20 bg-card text-center shadow-[0_4px_10px_-6px_rgba(0,66,111,0.45)]"
    >
      <span className={cn("w-full py-0.5 text-[10px] font-semibold uppercase leading-tight text-white", EVN_BAND)}>
        {showYear ? `${Number(m)}/${y.slice(2)}` : `Th${Number(m)}`}
      </span>
      <span className="py-1 text-lg font-bold leading-none tabular-nums text-[#00426F]">{d}</span>
    </div>
  );
}

/** Chữ viết tắt + tên + chức danh. Bỏ "Ông/Bà" khi lấy chữ viết tắt. */
export function Person({ name, sub }: { name: string; sub?: string | null }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span
        aria-hidden
        className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#00558F]/10 text-[11px] font-semibold text-[#00426F] ring-1 ring-inset ring-[#00558F]/15"
      >
        {initials(name.replace(/^(ông|bà)\s+/i, ""))}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="font-medium text-ink">{name}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

/** "Ông Huân (Quản đốc)" → tên + chức danh tách dòng. */
export function Director({ value }: { value: string }) {
  const label = workTaskDirectorLabel(value);
  const match = /^(.*?)\s*\((.*)\)$/.exec(label);
  return match ? <Person name={match[1]} sub={match[2]} /> : <Person name={label} />;
}

export function Assignees({ task }: { task: WorkTask }) {
  if (!task.assignees.length) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="space-y-2">
      {task.assignees.map((item) => (
        <li key={item.id}>
          <Person name={item.name} sub={item.position} />
        </li>
      ))}
    </ul>
  );
}

export const dueHintOf = (task: WorkTask) => workTaskDueHint(task.dueDate, workTaskHasUpdate(task));

// Vàng: còn 2–3 ngày · Cam: còn 1 ngày / hôm nay · Đỏ: quá hạn chưa cập nhật.
const DUE_PILL: Record<string, string> = {
  yellow: "bg-yellow-100 text-yellow-800 ring-yellow-300/70",
  orange: "bg-orange-100 text-orange-700 ring-orange-300/70",
  red: "bg-red-100 text-red-700 ring-red-300/70",
};

export function DueHint({ task }: { task: WorkTask }) {
  const hint = dueHintOf(task);
  if (!hint) return null;
  const pill = DUE_PILL[hint.tone];
  if (!pill) return <span className="text-xs text-muted-foreground">{hint.label}</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        pill
      )}
    >
      {hint.label}
    </span>
  );
}

// Vạch màu mép trái dòng/thẻ, cùng thang màu với nhãn hạn — liếc là thấy việc cần chú ý.
const DUE_BAR: Record<string, string> = {
  yellow: "before:bg-yellow-400",
  orange: "before:bg-orange-500",
  red: "before:bg-red-500",
};
export const dueBarOf = (task: WorkTask) => {
  const bar = DUE_BAR[dueHintOf(task)?.tone ?? ""];
  return bar ? cn("before:absolute before:inset-y-0 before:left-0 before:w-[3px]", bar) : "";
};

/** Báo cáo ngắn thì hiện hết; dài/nhiều dòng thì tóm tắt 2 dòng, bấm để xem hết. */
export function ReportText({
  report,
  updatedAt,
  onWrite,
  canWrite,
}: {
  report: string | null;
  /** Lần lưu báo cáo gần nhất — hiện "Cập nhật DD/MM" dưới nội dung. */
  updatedAt?: string | null;
  onWrite: () => void;
  canWrite: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const text = report?.trim() ?? "";
  const long = text.length > 90 || text.split("\n").length > 2;
  const id = React.useId();

  return (
    <div className="space-y-1">
      {text ? (
        <>
          <p id={id} className={cn("whitespace-pre-wrap break-words text-sm text-ink", !expanded && long && "line-clamp-2")}>
            {text}
          </p>
          {updatedAt && (
            <p className="text-[11px] tabular-nums text-muted-foreground">
              Cập nhật {new Date(updatedAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm italic text-muted-foreground">Chưa có báo cáo</p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {long && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-accent"
          >
            {expanded ? <><ChevronUp className="h-3.5 w-3.5" /> Thu gọn</> : <><ChevronDown className="h-3.5 w-3.5" /> Xem chi tiết</>}
          </button>
        )}
        {canWrite && (
          <button
            type="button"
            onClick={onWrite}
            className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-accent"
          >
            <PenLine className="h-3.5 w-3.5" /> {text ? "Sửa báo cáo" : "Ghi báo cáo"}
          </button>
        )}
      </div>
    </div>
  );
}

function LinkIcon({ kind }: { kind: WorkTaskLink["kind"] }) {
  if (kind === "SHEET") return <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />;
  if (kind === "DOC") return <FileText className="h-3.5 w-3.5 text-blue-600" />;
  if (kind === "FOLDER") return <Folder className="h-3.5 w-3.5 text-amber-600" />;
  return <Link2 className="h-3.5 w-3.5 text-slate-500" />;
}

export function NoteAndLinks({
  note,
  links,
  canWrite = false,
  onWrite,
}: {
  note: string | null;
  links: WorkTaskLink[];
  /** Người chủ trì / người quản lý: hiện nút thêm, sửa ghi chú. */
  canWrite?: boolean;
  onWrite?: () => void;
}) {
  const empty = !note && !links.length;
  return (
    <div className="space-y-1.5">
      {empty && !canWrite && <span className="text-sm text-muted-foreground">—</span>}
      {note && <p className="whitespace-pre-wrap break-words text-sm">{note}</p>}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              title={link.url}
              className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full border border-border px-2.5 text-xs hover:bg-muted"
            >
              <LinkIcon kind={link.kind} />
              {WORK_TASK_LINK_LABELS[link.kind] ?? "Link"}
            </a>
          ))}
        </div>
      )}
      {canWrite && onWrite && (
        <button
          type="button"
          onClick={onWrite}
          className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-accent"
        >
          {empty ? <><Plus className="h-3.5 w-3.5" /> Thêm ghi chú</> : <><PenLine className="h-3.5 w-3.5" /> Sửa ghi chú</>}
        </button>
      )}
    </div>
  );
}

/** Lỗi theo từng ô link (null = hợp lệ hoặc để trống). */
export function linkErrorsOf(links: string[]) {
  return links.map((link) => {
    if (!link.trim()) return null;
    const parsed = parseGoogleLink(link);
    return "error" in parsed ? parsed.error : null;
  });
}

/** Danh sách ô nhập link Google, kiểm ngay khi gõ. Luôn giữ ít nhất một ô. */
export function LinkListEditor({ links, onChange }: { links: string[]; onChange: (links: string[]) => void }) {
  const errors = linkErrorsOf(links);
  return (
    <div className="space-y-2">
      {links.map((link, index) => (
        <div key={index} className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={link}
                inputMode="url"
                placeholder="https://docs.google.com/..."
                className={cn("pl-9", errors[index] && "border-destructive")}
                onChange={(e) => onChange(links.map((item, i) => (i === index ? e.target.value : item)))}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Xoá link"
              onClick={() => {
                const next = links.filter((_, i) => i !== index);
                onChange(next.length ? next : [""]);
              }}
            >
              <X />
            </Button>
          </div>
          {errors[index] && <p className="text-xs text-destructive">{errors[index]}</p>}
        </div>
      ))}
      {links.length < WORK_TASK_MAX_LINKS && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...links, ""])}>
          <Plus /> Thêm link
        </Button>
      )}
    </div>
  );
}

/**
 * Cập nhật thực hiện: báo cáo + ghi chú + link. Dành cho người chủ trì của dòng
 * (và người quản lý công việc). Không đụng tới nội dung, ngày, người chỉ đạo, chủ trì.
 */
export function ReportDialog({
  task,
  onOpenChange,
}: {
  task: WorkTask | null;
  onOpenChange: (open: boolean) => void;
}) {
  // Nơi gọi đặt `key` theo id công việc nên ô nhập khởi tạo lại mỗi lần mở.
  const [report, setReport] = React.useState(() => task?.report ?? "");
  const [note, setNote] = React.useState(() => task?.note ?? "");
  const [links, setLinks] = React.useState<string[]>(() =>
    task?.links.length ? task.links.map((link) => link.url) : [""]
  );
  const save = useReportWorkTask();

  async function submit() {
    if (!task) return;
    if (linkErrorsOf(links).some(Boolean)) {
      toast.error("Sửa các link chưa hợp lệ trước khi lưu");
      return;
    }
    try {
      await save.mutateAsync({
        id: task.id,
        report,
        note: note.trim() || null,
        links: links.map((link) => link.trim()).filter(Boolean),
      });
      toast.success("Đã lưu cập nhật thực hiện");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không lưu được cập nhật");
    }
  }

  return (
    <Dialog open={!!task} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Cập nhật thực hiện</DialogTitle>
          <DialogDescription className="line-clamp-3 whitespace-pre-wrap">{task?.content}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wt-report">Báo cáo thực hiện</Label>
            <Textarea
              id="wt-report"
              rows={6}
              value={report}
              onChange={(e) => setReport(e.target.value)}
              placeholder="Ghi kết quả, tiến độ, vướng mắc..."
              maxLength={20000}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wt-report-note">Ghi chú</Label>
            <Textarea
              id="wt-report-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={5000}
            />
          </div>
          <div className="space-y-2">
            <Label>Đính kèm link Google Drive / Sheets / Docs</Label>
            <LinkListEditor links={links} onChange={setLinks} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button type="button" disabled={save.isPending} onClick={submit}>
            {save.isPending && <Loader2 className="animate-spin" />}
            Lưu cập nhật
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
