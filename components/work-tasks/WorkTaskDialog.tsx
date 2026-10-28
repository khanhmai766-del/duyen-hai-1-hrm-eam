"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "next-auth/react";
import { useUsers } from "@/hooks/useUsers";
import { LinkListEditor, linkErrorsOf } from "@/components/work-tasks/WorkTaskParts";
import { useCreateWorkTask, useUpdateWorkTask, type WorkTask, type WorkTaskInput } from "@/hooks/useWorkTasks";
import { normalizeText } from "@/lib/nav";
import { positionLabelOf } from "@/lib/position-catalog";
import { cn } from "@/lib/utils";
import {
  WORK_TASK_DIRECTORS,
  isWorkTaskLeadUser,
  workTaskDateInputValue,
  workTaskLeadPositionOf,
} from "@/lib/work-task";

type LeadOption = { id: string; name: string; position: string };

function todayInputValue() {
  // Giờ Việt Nam (UTC+7) để ngày mặc định không lùi về hôm qua lúc sáng sớm.
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Thứ tự nhóm trong danh sách chủ trì: cương vị chỉ huy ca lên đầu, còn lại theo ABC.
const GROUP_ORDER = ["truong ca", "tk lo may", "truong kip dien", "lo truong", "may truong", "ky thuat vien"];
const NO_POSITION = "Chưa có cương vị";
function groupRank(label: string) {
  if (label === NO_POSITION) return GROUP_ORDER.length + 1;
  const key = normalizeText(label);
  const index = GROUP_ORDER.findIndex((item) => key.startsWith(item));
  return index < 0 ? GROUP_ORDER.length : index;
}

function LeadMultiSelect({
  options,
  value,
  onChange,
  extraSelected,
}: {
  options: LeadOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Chủ trì cũ không còn trong danh sách đủ điều kiện (đổi cương vị/nghỉ) — vẫn hiện để bỏ chọn. */
  extraSelected: LeadOption[];
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const byId = React.useMemo(() => {
    const map = new Map<string, LeadOption>();
    for (const item of [...extraSelected, ...options]) map.set(item.id, item);
    return map;
  }, [options, extraSelected]);

  const groups = React.useMemo(() => {
    const q = normalizeText(query);
    const filtered = q
      ? options.filter((item) => normalizeText(`${item.name} ${item.position}`).includes(q))
      : options;
    const map = new Map<string, LeadOption[]>();
    for (const item of filtered) {
      const label = positionLabelOf(item.position) || NO_POSITION;
      map.set(label, [...(map.get(label) ?? []), item]);
    }
    return [...map.entries()].sort(([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b, "vi"));
  }, [options, query]);

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm"
      >
        <span className={cn("truncate", !value.length && "text-muted-foreground")}>
          {value.length ? `Đã chọn ${value.length} người` : "Chọn người chủ trì"}
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>

      {open && (
        <div className="rounded-md border border-border bg-background">
          <div className="relative border-b border-border p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm tên hoặc cương vị"
              className="h-9 pl-8"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {groups.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Không có người phù hợp.</p>}
            {groups.map(([label, items]) => (
              <div key={label} className="py-1">
                <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
                {items.map((item) => (
                  <label
                    key={item.id}
                    className="flex min-h-10 cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox checked={value.includes(item.id)} onCheckedChange={() => toggle(item.id)} />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{item.position}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const item = byId.get(id);
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-2.5 pr-1 text-xs">
                {item?.name ?? "Không rõ"}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  aria-label={`Bỏ chọn ${item?.name ?? ""}`}
                  className="grid h-6 w-6 place-items-center rounded-full hover:bg-background"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

type FormState = {
  taskDate: string;
  content: string;
  director: string;
  dueDate: string;
  assigneeIds: string[];
  note: string;
  links: string[];
  report: string;
};

function initialState(task: WorkTask | null): FormState {
  if (!task) {
    return { taskDate: todayInputValue(), content: "", director: "", dueDate: "", assigneeIds: [], note: "", links: [""], report: "" };
  }
  return {
    taskDate: workTaskDateInputValue(task.taskDate),
    content: task.content,
    director: task.director,
    dueDate: workTaskDateInputValue(task.dueDate),
    assigneeIds: task.assignees.map((item) => item.id),
    note: task.note ?? "",
    links: task.links.length ? task.links.map((link) => link.url) : [""],
    report: task.report ?? "",
  };
}

export function WorkTaskDialog({
  open,
  onOpenChange,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = thêm mới */
  task: WorkTask | null;
}) {
  // Nơi gọi đổi `key` mỗi lần mở để form khởi tạo lại từ `task`.
  const [form, setForm] = React.useState<FormState>(() => initialState(task));
  const create = useCreateWorkTask();
  const update = useUpdateWorkTask();
  const saving = create.isPending || update.isPending;
  const { data: usersData } = useUsers({ enabled: open });
  const { data: session } = useSession();
  // Quản trị sửa luôn báo cáo thực hiện tại đây; người khác ghi báo cáo qua hộp "Cập nhật thực hiện".
  const canEditReport = !!task && session?.user?.role === "ADMIN";

  const leadOptions = React.useMemo<LeadOption[]>(
    () =>
      (usersData?.data ?? [])
        .filter((user) => user.isActive && isWorkTaskLeadUser(user))
        .map((user) => ({ id: user.id, name: user.name, position: workTaskLeadPositionOf(user) }))
        .sort((a, b) => a.name.localeCompare(b.name, "vi")),
    [usersData?.data]
  );
  const extraSelected = React.useMemo(
    () => (task?.assignees ?? []).filter((item) => !leadOptions.some((option) => option.id === item.id)),
    [task, leadOptions]
  );

  const linkErrors = linkErrorsOf(form.links);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.taskDate) return toast.error("Chọn ngày giao việc");
    if (!form.content.trim()) return toast.error("Nhập nội dung công việc");
    if (!form.director) return toast.error("Chọn người chỉ đạo");
    if (!form.assigneeIds.length) return toast.error("Chọn ít nhất một người chủ trì");
    if (form.dueDate && form.dueDate < form.taskDate) return toast.error("Thời gian hoàn thành không được trước ngày giao việc");
    if (linkErrors.some(Boolean)) return toast.error("Sửa các link chưa hợp lệ trước khi lưu");

    const body: WorkTaskInput = {
      taskDate: form.taskDate,
      content: form.content.trim(),
      director: form.director,
      dueDate: form.dueDate || null,
      assigneeIds: form.assigneeIds,
      note: form.note.trim() || null,
      links: form.links.map((link) => link.trim()).filter(Boolean),
    };
    try {
      if (task) await update.mutateAsync({ id: task.id, ...body, ...(canEditReport ? { report: form.report } : {}) });
      else await create.mutateAsync(body);
      toast.success(task ? "Đã cập nhật công việc" : "Đã thêm công việc");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không lưu được công việc");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{task ? "Sửa công việc" : "Thêm công việc"}</DialogTitle>
          <DialogDescription>Các ô có dấu * là bắt buộc.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wt-date">Ngày *</Label>
              <Input id="wt-date" type="date" value={form.taskDate} onChange={(e) => set("taskDate", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wt-due">Thời gian hoàn thành</Label>
              <Input
                id="wt-due"
                type="date"
                value={form.dueDate}
                min={form.taskDate || undefined}
                onChange={(e) => set("dueDate", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wt-content">Nội dung công việc *</Label>
            <Textarea
              id="wt-content"
              rows={3}
              value={form.content}
              onChange={(e) => set("content", e.target.value)}
              placeholder="Mô tả công việc cần làm"
              maxLength={5000}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Người chỉ đạo *</Label>
            <Select value={form.director} onValueChange={(value) => set("director", value)}>
              <SelectTrigger><SelectValue placeholder="Chọn người chỉ đạo" /></SelectTrigger>
              <SelectContent>
                {WORK_TASK_DIRECTORS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Chủ trì *</Label>
            <LeadMultiSelect
              options={leadOptions}
              value={form.assigneeIds}
              onChange={(value) => set("assigneeIds", value)}
              extraSelected={extraSelected}
            />
          </div>

          {canEditReport && (
            <div className="space-y-1.5">
              <Label htmlFor="wt-edit-report">Báo cáo thực hiện</Label>
              <Textarea
                id="wt-edit-report"
                rows={4}
                value={form.report}
                onChange={(e) => set("report", e.target.value)}
                placeholder="Ghi kết quả, tiến độ, vướng mắc..."
                maxLength={20000}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="wt-note">Ghi chú</Label>
            <Textarea id="wt-note" rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={5000} />
          </div>

          <div className="space-y-2">
            <Label>Đính kèm link Google Drive / Sheets / Docs</Label>
            <LinkListEditor links={form.links} onChange={(links) => set("links", links)} />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {task ? "Lưu thay đổi" : "Thêm công việc"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
