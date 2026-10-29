"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkTaskDialog } from "@/components/work-tasks/WorkTaskDialog";
import { WorkTaskDetailDialog } from "@/components/work-tasks/WorkTaskDetailDialog";
import { EVN_BAND, NoteAndLinks, ReportDialog, dueBarOf, dueHintOf } from "@/components/work-tasks/WorkTaskParts";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { useDeleteWorkTask, useWorkTasks, type WorkTask } from "@/hooks/useWorkTasks";
import { normalizeText } from "@/lib/nav";
import { cn } from "@/lib/utils";
import {
  WORK_TASK_PERMISSION,
  formatWorkTaskDate,
  workTaskDirectorLabel,
  workTaskHasUpdate,
  workTaskToday,
  workTaskWeekday,
} from "@/lib/work-task";

/** Bấm vào nút/link/menu bên trong dòng thì không mở popup chi tiết. */
const isInteractiveTarget = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest("a, button, input, textarea, [role='menu'], [role='menuitem']");

function currentMonth() {
  return workTaskToday().slice(0, 7);
}

function shiftMonth(month: string, delta: number) {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  const [year, m] = month.split("-");
  return `Tháng ${Number(m)}/${year}`;
}

type ViewMode = "list" | "grid";
const VIEW_KEY = "work-tasks:view";

const SORTS = [
  { value: "date-desc", label: "Ngày giao mới nhất" },
  { value: "due-asc", label: "Hạn hoàn thành gần nhất" },
  { value: "date-asc", label: "Ngày giao cũ nhất" },
] as const;
type SortValue = (typeof SORTS)[number]["value"];

// Bộ lọc tình trạng: trong một nhóm là "hoặc", giữa các nhóm là "và" — như trang đặt phòng.
const STATUS_FILTERS = [
  { value: "overdue", label: "Quá hạn", hint: "Quá hạn mà chưa cập nhật", test: (t: WorkTask) => dueHintOf(t)?.tone === "red" },
  { value: "soon", label: "Sắp đến hạn", hint: "Còn 3 ngày trở xuống", test: (t: WorkTask) => ["yellow", "orange"].includes(dueHintOf(t)?.tone ?? "") },
  { value: "no-report", label: "Chưa có báo cáo", test: (t: WorkTask) => !workTaskHasUpdate(t) },
  { value: "reported", label: "Đã có báo cáo", test: (t: WorkTask) => workTaskHasUpdate(t) },
] as const;

// Ô điểm bên phải thẻ: màu theo thang hạn, số là ngày còn lại / ngày quá hạn.
const SCORE: Record<string, { word: string; box: string }> = {
  muted: { word: "Còn thời gian", box: "bg-[#00426F]" },
  yellow: { word: "Sắp đến hạn", box: "bg-yellow-500" },
  orange: { word: "Gấp", box: "bg-orange-500" },
  red: { word: "Quá hạn", box: "bg-red-600" },
  past: { word: "Đã qua hạn", box: "bg-slate-500" },
};

type FilterOption = { value: string; label: string; hint?: string; count: number };

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
  limit = 6,
}: {
  title: string;
  options: FilterOption[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  limit?: number;
}) {
  const [showAll, setShowAll] = React.useState(false);
  const visible = options.filter((item) => item.count > 0 || selected.has(item.value));
  if (!visible.length) return null;
  const shown = showAll ? visible : visible.slice(0, limit);
  return (
    <div className="border-t border-border px-3 py-3">
      <h4 className="mb-1.5 text-sm font-bold text-ink">{title}</h4>
      <ul>
        {shown.map((item) => (
          <li key={item.value}>
            <label className="flex min-h-10 cursor-pointer items-start gap-2.5 rounded-md px-1 py-1.5 hover:bg-muted/50 sm:min-h-8">
              <Checkbox
                className="mt-0.5"
                checked={selected.has(item.value)}
                onCheckedChange={() => onToggle(item.value)}
              />
              <span className="min-w-0 flex-1 text-sm leading-snug text-ink">
                {item.label}
                {item.hint && <span className="mt-0.5 block text-xs text-muted-foreground">{item.hint}</span>}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">{item.count}</span>
            </label>
          </li>
        ))}
      </ul>
      {visible.length > limit && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 inline-flex min-h-8 items-center gap-1 px-1 text-sm font-medium text-[#00558F]"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", showAll && "rotate-180")} />
          {showAll ? "Thu gọn" : `Hiện tất cả ${visible.length}`}
        </button>
      )}
    </div>
  );
}

/** Khối ngày ở vị trí "ảnh" của thẻ: nền xanh EVN, ngày to, tháng và thứ. */
function DatePoster({ task, showYear, grid, children }: { task: WorkTask; showYear: boolean; grid?: boolean; children?: React.ReactNode }) {
  const [y, m, d] = task.taskDate.slice(0, 10).split("-");
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg text-white",
        EVN_BAND,
        grid ? "flex h-24 items-center gap-3 px-4" : "flex w-20 flex-col items-center justify-center self-start py-3 sm:w-36 sm:self-stretch"
      )}
    >
      {/* vòng sáng trang trí cho khỏi phẳng */}
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10" />
      <span aria-hidden className="pointer-events-none absolute -bottom-12 -left-6 h-24 w-24 rounded-full bg-white/5" />
      {grid ? (
        <>
          <span className="relative text-4xl font-bold leading-none tabular-nums">{d}</span>
          <span className="relative leading-tight">
            <span className="block text-sm font-semibold">Tháng {Number(m)}/{y}</span>
            <span className="block text-xs text-white/75">{workTaskWeekday(task.taskDate)}</span>
          </span>
        </>
      ) : (
        <>
          <span className="relative text-[11px] font-semibold uppercase tracking-wide text-white/80">
            {showYear ? `${Number(m)}/${y}` : `Tháng ${Number(m)}`}
          </span>
          <span className="relative my-1 text-3xl font-bold leading-none tabular-nums sm:text-5xl">{d}</span>
          <span className="relative text-[11px] text-white/75 sm:text-xs">{workTaskWeekday(task.taskDate)}</span>
        </>
      )}
      {/* Khối ngày trên điện thoại chỉ rộng 80px — nút "…" chuyển ra góc thẻ (xem nơi gọi). */}
      {children && <div className={cn("absolute right-1 top-1", !grid && "hidden sm:block")}>{children}</div>}
    </div>
  );
}

/** Cột "điểm" bên phải: chữ tình trạng + hạn, ô số ngày kiểu Booking. */
function DueScore({ task }: { task: WorkTask }) {
  const hint = dueHintOf(task);
  if (!task.dueDate || !hint) {
    return <div className="text-sm text-muted-foreground">Không đặt hạn</div>;
  }
  const score = SCORE[hint.tone] ?? SCORE.muted;
  return (
    <div className="flex items-start gap-2">
      <div className="text-right leading-tight">
        <div className="font-semibold text-ink">{score.word}</div>
        <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">Hạn {formatWorkTaskDate(task.dueDate)}</div>
      </div>
      <div
        className={cn(
          "flex h-10 min-w-10 shrink-0 flex-col items-center justify-center rounded-[8px_8px_8px_0] px-1 text-white",
          score.box
        )}
        title={hint.label}
      >
        <span className="text-base font-bold leading-none tabular-nums">{Math.abs(hint.days)}</span>
        <span className="text-[9px] leading-tight">ngày</span>
      </div>
    </div>
  );
}

export default function WorkTasksPage() {
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const rbac = useRbacAccess();
  const canManage = rbac.can(WORK_TASK_PERMISSION, ["manage", "full"]);

  const [month, setMonth] = React.useState(currentMonth);
  const [search, setSearch] = React.useState("");
  const [view, setView] = React.useState<ViewMode>("list");
  const [sort, setSort] = React.useState<SortValue>("date-desc");
  const [statusSel, setStatusSel] = React.useState<Set<string>>(() => new Set());
  const [directorSel, setDirectorSel] = React.useState<Set<string>>(() => new Set());
  const [assigneeSel, setAssigneeSel] = React.useState<Set<string>>(() => new Set());
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WorkTask | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [formKey, setFormKey] = React.useState(0);
  const [reporting, setReporting] = React.useState<WorkTask | null>(null);
  const [deleting, setDeleting] = React.useState<WorkTask | null>(null);
  // Lưu id thay vì bản sao để popup luôn hiện dữ liệu mới nhất sau khi ghi báo cáo/sửa.
  const [viewingId, setViewingId] = React.useState<string | null>(null);

  // Nhớ kiểu xem theo từng máy; đọc sau khi mount để khỏi lệch hydrate.
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      // localStorage là hệ thống ngoài, server không đọc được → chỉ đọc sau mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "list" || saved === "grid") setView(saved);
    } catch {}
  }, []);
  const changeView = (next: ViewMode) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  };

  const { data, isLoading, error } = useWorkTasks(month);
  const remove = useDeleteWorkTask();

  // Bước 1: tìm kiếm. Số đếm cạnh bộ lọc tính trên tập này.
  const searched = React.useMemo(() => {
    const rows = data?.data ?? [];
    const q = normalizeText(search);
    if (!q) return rows;
    return rows.filter((task) =>
      normalizeText(
        [
          task.content,
          workTaskDirectorLabel(task.director),
          task.assignees.map((item) => `${item.name} ${item.position}`).join(" "),
          task.report ?? "",
          task.note ?? "",
        ].join(" ")
      ).includes(q)
    );
  }, [data?.data, search]);

  const statusOptions = React.useMemo<FilterOption[]>(
    () =>
      STATUS_FILTERS.map((item) => ({
        value: item.value,
        label: item.label,
        hint: "hint" in item ? item.hint : undefined,
        count: searched.filter(item.test).length,
      })),
    [searched]
  );
  const directorOptions = React.useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>();
    for (const task of searched) counts.set(task.director, (counts.get(task.director) ?? 0) + 1);
    return [...counts].map(([value, count]) => ({ value, label: workTaskDirectorLabel(value), count }));
  }, [searched]);
  const assigneeOptions = React.useMemo<FilterOption[]>(() => {
    const map = new Map<string, FilterOption>();
    for (const task of searched) {
      for (const item of task.assignees) {
        const entry = map.get(item.id) ?? { value: item.id, label: item.name, hint: item.position ?? undefined, count: 0 };
        entry.count += 1;
        map.set(item.id, entry);
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "vi"));
  }, [searched]);

  // Bước 2: bộ lọc + sắp xếp.
  const tasks = React.useMemo(() => {
    const statusTests = STATUS_FILTERS.filter((item) => statusSel.has(item.value));
    const rows = searched.filter(
      (task) =>
        (!statusTests.length || statusTests.some((item) => item.test(task))) &&
        (!directorSel.size || directorSel.has(task.director)) &&
        (!assigneeSel.size || task.assignees.some((item) => assigneeSel.has(item.id)))
    );
    const byDate = (a: WorkTask, b: WorkTask) => a.taskDate.localeCompare(b.taskDate) || a.createdAt.localeCompare(b.createdAt);
    if (sort === "date-asc") return [...rows].sort(byDate);
    if (sort === "date-desc") return [...rows].sort((a, b) => byDate(b, a));
    // Việc không đặt hạn xuống cuối.
    return [...rows].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || byDate(b, a));
  }, [searched, statusSel, directorSel, assigneeSel, sort]);

  const filterCount = statusSel.size + directorSel.size + assigneeSel.size;
  const clearFilters = () => {
    setStatusSel(new Set());
    setDirectorSel(new Set());
    setAssigneeSel(new Set());
  };
  const toggleIn = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (value: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const viewAll = Boolean(data?.meta?.viewAll);
  const viewing = React.useMemo(() => data?.data?.find((task) => task.id === viewingId) ?? null, [data?.data, viewingId]);
  const { overdueCount, soonCount } = React.useMemo(() => {
    let overdue = 0;
    let soon = 0;
    for (const task of tasks) {
      const tone = dueHintOf(task)?.tone;
      if (tone === "red") overdue += 1;
      else if (tone === "yellow" || tone === "orange") soon += 1;
    }
    return { overdueCount: overdue, soonCount: soon };
  }, [tasks]);

  // Khớp quy tắc máy chủ (lib/server/work-task.ts): phạm vi "tất cả" sửa mọi dòng,
  // người có quyền quản lý chỉ sửa dòng mình tạo; người chủ trì chỉ cập nhật báo cáo/ghi chú.
  const canEdit = (task: WorkTask) => canManage && (viewAll || task.createdById === myId);
  const canReport = (task: WorkTask) => canEdit(task) || task.assignees.some((item) => item.id === myId);

  const openCreate = () => {
    setEditing(null);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };
  const openEdit = (task: WorkTask) => {
    setEditing(task);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  // Cả thẻ bấm được để xem tóm tắt; nút, link, menu bên trong vẫn làm việc riêng của chúng.
  const detailProps = (task: WorkTask) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `Xem chi tiết: ${task.content.slice(0, 80)}`,
    onClick: (event: React.MouseEvent) => {
      if (!isInteractiveTarget(event.target)) setViewingId(task.id);
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      setViewingId(task.id);
    },
  });

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Đã xoá công việc");
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xoá được công việc");
    }
  }

  const rowMenu = (task: WorkTask) =>
    canEdit(task) ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Thao tác"
            className="h-9 w-9 rounded-full bg-white/95 text-ink shadow-sm hover:bg-white"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => openEdit(task)}>
            <Pencil className="h-4 w-4" /> Sửa
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDeleting(task)} className="text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4" /> Xoá
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  /** Phần chữ giữa thẻ: tiêu đề xanh, người chỉ đạo / chủ trì, trích báo cáo, link đính kèm. */
  const taskBody = (task: WorkTask) => {
    const report = task.report?.trim();
    return (
      <>
        <h3 className="line-clamp-3 whitespace-pre-wrap break-words text-base font-bold leading-snug text-[#00558F] transition-colors group-hover:text-[#00426F] sm:text-lg">
          {task.content}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          <span>
            Chỉ đạo: <span className="font-medium text-ink">{workTaskDirectorLabel(task.director)}</span>
          </span>
          <span aria-hidden>·</span>
          <span className="min-w-0">
            Chủ trì:{" "}
            <span className="font-medium text-ink">
              {task.assignees.length ? task.assignees.map((item) => item.name).join(", ") : "—"}
            </span>
          </span>
        </div>
        {report ? (
          <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-sm text-ink/85">
            <span className="font-semibold text-ink">Báo cáo: </span>
            {report}
          </p>
        ) : (
          <p className="mt-2 text-sm italic text-muted-foreground">Chưa có báo cáo thực hiện</p>
        )}
        {(task.note || task.links.length > 0) && (
          <div className="mt-2 text-xs [&_p]:line-clamp-2 [&_p]:text-xs [&_p]:text-muted-foreground">
            <NoteAndLinks note={task.note} links={task.links} />
          </div>
        )}
      </>
    );
  };

  const reportStatus = (task: WorkTask) =>
    workTaskHasUpdate(task) ? (
      <div className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
        <Check className="h-4 w-4" />
        Đã báo cáo
        {task.reportUpdatedAt && (
          <span className="font-normal tabular-nums text-muted-foreground">
            ·{" "}
            {new Date(task.reportUpdatedAt).toLocaleDateString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              timeZone: "Asia/Ho_Chi_Minh",
            })}
          </span>
        )}
      </div>
    ) : null;

  const actionButton = (task: WorkTask) => (
    <Button
      className="h-10 rounded-lg bg-[#00558F] px-4 font-semibold text-white hover:bg-[#00426F] sm:h-9"
      onClick={() => (canReport(task) ? setReporting(task) : setViewingId(task.id))}
    >
      {canReport(task) ? (task.report?.trim() ? "Sửa báo cáo" : "Ghi báo cáo") : "Xem chi tiết"}
    </Button>
  );

  const cardClass = (task: WorkTask) =>
    cn(
      "group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm transition-shadow hover:border-[#00558F]/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00558F]/40",
      dueBarOf(task)
    );

  const monthNav = (
    <div className={cn("relative overflow-hidden rounded-xl p-3 text-white shadow-sm", EVN_BAND)}>
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/10" />
      <div className="relative text-[11px] font-semibold uppercase tracking-wide text-white/75">Thời gian giao việc</div>
      <div className="relative mt-1.5 flex items-center rounded-lg bg-white/10">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-white hover:bg-white/15 hover:text-white"
          aria-label="Tháng trước"
          disabled={!month}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <ChevronLeft />
        </Button>
        <span className="flex-1 text-center text-sm font-semibold tabular-nums">
          {month ? monthLabel(month) : "Tất cả thời gian"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-white hover:bg-white/15 hover:text-white"
          aria-label="Tháng sau"
          disabled={!month}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="relative mt-2 flex gap-2">
        {month !== currentMonth() && (
          <button
            type="button"
            onClick={() => setMonth(currentMonth())}
            className="min-h-9 flex-1 rounded-lg bg-white px-3 text-sm font-semibold text-[#00426F] hover:bg-white/90"
          >
            Tháng này
          </button>
        )}
        {month && (
          <button
            type="button"
            onClick={() => setMonth("")}
            className="min-h-9 flex-1 rounded-lg border border-white/40 px-3 text-sm font-semibold text-white hover:bg-white/10"
          >
            Tất cả
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="QUẢN LÝ CÔNG VIỆC"
        description={
          viewAll || isLoading
            ? "Công việc được giao, người chủ trì và báo cáo thực hiện."
            : "Chỉ hiện công việc bạn chủ trì hoặc do bạn giao."
        }
        hideDescriptionOnMobile
      >
        {canManage && (
          <Button size="toolbar" onClick={openCreate}>
            <Plus /> Thêm công việc
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        {/* Cột trái: tháng + tìm kiếm + bộ lọc */}
        <aside className="space-y-3 xl:sticky xl:top-4 xl:w-64 xl:shrink-0">
          {monthNav}

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
              <h3 className="text-base font-bold text-ink">Chọn lọc theo:</h3>
              {filterCount > 0 && (
                <button type="button" onClick={clearFilters} className="min-h-8 text-sm font-medium text-[#00558F]">
                  Xoá lọc ({filterCount})
                </button>
              )}
            </div>
            <div className="px-3 pb-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm nội dung, người chủ trì..."
                  className="h-10 rounded-lg pl-9 text-base sm:text-sm"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className="flex min-h-11 w-full items-center gap-2 border-t border-border px-3 text-sm font-semibold text-[#00558F] xl:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {filtersOpen ? "Ẩn bộ lọc" : "Hiện bộ lọc"}
              {filterCount > 0 && (
                <span className="rounded-full bg-[#00558F] px-1.5 text-xs text-white">{filterCount}</span>
              )}
              <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", filtersOpen && "rotate-180")} />
            </button>
            <div className={cn(!filtersOpen && "hidden", "xl:block")}>
              <FilterGroup title="Tình trạng" options={statusOptions} selected={statusSel} onToggle={toggleIn(setStatusSel)} />
              <FilterGroup title="Người chỉ đạo" options={directorOptions} selected={directorSel} onToggle={toggleIn(setDirectorSel)} />
              <FilterGroup title="Chủ trì" options={assigneeOptions} selected={assigneeSel} onToggle={toggleIn(setAssigneeSel)} />
            </div>
          </div>
        </aside>

        {/* Cột phải: kết quả */}
        <section className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-ink sm:text-xl">
                {month ? monthLabel(month) : "Tất cả thời gian"}: tìm thấy{" "}
                <span className="tabular-nums">{tasks.length}</span> công việc
              </h2>
              {(overdueCount > 0 || soonCount > 0) && (
                <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm">
                  {overdueCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-red-600">
                      <span aria-hidden className="h-2 w-2 rounded-full bg-red-500" />
                      <span className="font-semibold tabular-nums">{overdueCount}</span> quá hạn
                    </span>
                  )}
                  {soonCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-orange-600">
                      <span aria-hidden className="h-2 w-2 rounded-full bg-orange-500" />
                      <span className="font-semibold tabular-nums">{soonCount}</span> sắp đến hạn
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="flex rounded-full border border-border bg-muted/40 p-0.5" role="group" aria-label="Kiểu xem">
              {(
                [
                  ["list", "Xem ngang"],
                  ["grid", "Xem dọc"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => changeView(value)}
                  className={cn(
                    "min-h-9 rounded-full px-3.5 text-sm font-medium transition-colors",
                    view === value ? "border border-ink/70 bg-card text-ink shadow-sm" : "text-muted-foreground hover:text-ink"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm text-ink shadow-sm hover:bg-muted/40 sm:min-h-9"
              >
                <ArrowUpDown className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  Sắp xếp theo: <span className="font-semibold">{SORTS.find((item) => item.value === sort)?.label}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              {SORTS.map((item) => (
                <DropdownMenuItem key={item.value} onSelect={() => setSort(item.value)}>
                  <Check className={cn("h-4 w-4", sort !== item.value && "opacity-0")} />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : error ? (
            <EmptyState title="Không tải được danh sách công việc" description={(error as Error).message} />
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title={search || filterCount ? "Không tìm thấy công việc phù hợp" : "Chưa có công việc"}
              description={
                search || filterCount
                  ? "Thử từ khoá khác hoặc bỏ bớt bộ lọc."
                  : !viewAll
                    ? `${month ? monthLabel(month) : "Hiện"} chưa có công việc nào giao cho bạn chủ trì.`
                    : month
                      ? `${monthLabel(month)} chưa có công việc nào.`
                      : undefined
              }
              action={canManage && !search && !filterCount ? { label: "Thêm công việc", onClick: openCreate } : undefined}
            />
          ) : view === "list" ? (
            <div className="space-y-3">
              {tasks.map((task) => (
                <article key={task.id} {...detailProps(task)} className={cn(cardClass(task), "flex gap-3 sm:gap-4")}>
                  <DatePoster task={task} showYear={!month}>
                    {rowMenu(task)}
                  </DatePoster>
                  {canEdit(task) && <div className="absolute right-2 top-2 sm:hidden">{rowMenu(task)}</div>}
                  <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:gap-4">
                    <div className={cn("min-w-0 flex-1 py-0.5", canEdit(task) && "pr-9 sm:pr-0")}>{taskBody(task)}</div>
                    <div className="flex flex-wrap items-end justify-between gap-2 border-t border-border pt-3 md:w-48 md:shrink-0 md:flex-col md:flex-nowrap md:items-end md:border-t-0 md:pt-0.5">
                      <div className="flex flex-col items-start gap-1 md:items-end">
                        <DueScore task={task} />
                        {reportStatus(task)}
                      </div>
                      <div className="md:mt-auto">{actionButton(task)}</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {tasks.map((task) => (
                <article key={task.id} {...detailProps(task)} className={cn(cardClass(task), "flex flex-col gap-3")}>
                  <DatePoster task={task} showYear={!month} grid>
                    {rowMenu(task)}
                  </DatePoster>
                  <div className="min-w-0 flex-1 px-1">{taskBody(task)}</div>
                  <div className="flex items-end justify-between gap-2 border-t border-border px-1 pt-3">
                    <div className="flex flex-col items-start gap-1">
                      <DueScore task={task} />
                      {reportStatus(task)}
                    </div>
                    {actionButton(task)}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <WorkTaskDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} task={editing} />
      <WorkTaskDetailDialog
        task={viewing}
        onOpenChange={(open) => !open && setViewingId(null)}
        canEdit={!!viewing && canEdit(viewing)}
        canReport={!!viewing && canReport(viewing)}
        onEdit={() => {
          if (!viewing) return;
          setViewingId(null);
          openEdit(viewing);
        }}
        onReport={() => {
          if (!viewing) return;
          setViewingId(null);
          setReporting(viewing);
        }}
      />
      <ReportDialog key={reporting?.id ?? "none"} task={reporting} onOpenChange={(open) => !open && setReporting(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Xoá công việc?"
        description={deleting ? `"${deleting.content.slice(0, 120)}" sẽ bị xoá cùng báo cáo thực hiện.` : undefined}
        confirmLabel="Xoá"
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
