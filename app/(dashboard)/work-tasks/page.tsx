"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, ListTodo, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WorkTaskDialog } from "@/components/work-tasks/WorkTaskDialog";
import { WorkTaskDetailDialog } from "@/components/work-tasks/WorkTaskDetailDialog";
import {
  Assignees,
  DateTile,
  Director,
  DueHint,
  NoteAndLinks,
  ReportDialog,
  ReportText,
  dueBarOf,
  dueHintOf,
} from "@/components/work-tasks/WorkTaskParts";
import { useRbacAccess } from "@/hooks/useRbacAccess";
import { useDeleteWorkTask, useWorkTasks, type WorkTask } from "@/hooks/useWorkTasks";
import { normalizeText } from "@/lib/nav";
import { cn } from "@/lib/utils";
import {
  WORK_TASK_PERMISSION,
  formatWorkTaskDate,
  workTaskDirectorLabel,
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

export default function WorkTasksPage() {
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const rbac = useRbacAccess();
  const canManage = rbac.can(WORK_TASK_PERMISSION, ["manage", "full"]);

  const [month, setMonth] = React.useState(currentMonth);
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<WorkTask | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [formKey, setFormKey] = React.useState(0);
  const [reporting, setReporting] = React.useState<WorkTask | null>(null);
  const [deleting, setDeleting] = React.useState<WorkTask | null>(null);
  // Lưu id thay vì bản sao để popup luôn hiện dữ liệu mới nhất sau khi ghi báo cáo/sửa.
  const [viewingId, setViewingId] = React.useState<string | null>(null);

  const { data, isLoading, error } = useWorkTasks(month);
  const remove = useDeleteWorkTask();

  const tasks = React.useMemo(() => {
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

  // Cả dòng/thẻ bấm được để xem tóm tắt; nút, link, menu bên trong vẫn làm việc riêng của chúng.
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
          <Button variant="ghost" size="icon" aria-label="Thao tác" className="text-muted-foreground hover:text-ink">
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

  const report = (task: WorkTask) => (
    <ReportText
      report={task.report}
      updatedAt={task.reportUpdatedAt}
      canWrite={canReport(task)}
      onWrite={() => setReporting(task)}
    />
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

      {/* Thanh lọc: chuyển tháng + tìm kiếm */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <div className="flex h-10 flex-1 items-center rounded-xl border border-border bg-card sm:flex-none">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-l-xl rounded-r-none"
              aria-label="Tháng trước"
              disabled={!month}
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-[7.5rem] flex-1 text-center text-sm font-semibold tabular-nums text-ink">
              {month ? monthLabel(month) : "Tất cả thời gian"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-l-none rounded-r-xl"
              aria-label="Tháng sau"
              disabled={!month}
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
          {month !== currentMonth() && (
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => setMonth(currentMonth())}>
              Tháng này
            </Button>
          )}
          {month && (
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => setMonth("")}>
              Tất cả
            </Button>
          )}
        </div>

        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm nội dung, người chủ trì..."
            className="h-10 rounded-xl bg-card pl-9"
          />
        </div>

        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground sm:ml-auto">
          <span>
            <span className="font-semibold tabular-nums text-ink">{tasks.length}</span> công việc
          </span>
          {soonCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-orange-600">
              <span aria-hidden className="h-2 w-2 rounded-full bg-orange-500" />
              <span className="font-semibold tabular-nums">{soonCount}</span> sắp đến hạn
            </span>
          )}
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-red-600">
              <span aria-hidden className="h-2 w-2 rounded-full bg-red-500" />
              <span className="font-semibold tabular-nums">{overdueCount}</span> quá hạn
            </span>
          )}
        </p>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} />
      ) : error ? (
        <EmptyState title="Không tải được danh sách công việc" description={(error as Error).message} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={search ? "Không tìm thấy công việc phù hợp" : "Chưa có công việc"}
          description={
            search
              ? "Thử từ khoá khác."
              : !viewAll
                ? `${month ? monthLabel(month) : "Hiện"} chưa có công việc nào giao cho bạn chủ trì.`
                : month
                  ? `${monthLabel(month)} chưa có công việc nào.`
                  : undefined
          }
          action={canManage && !search ? { label: "Thêm công việc", onClick: openCreate } : undefined}
        />
      ) : (
        <>
          {/* Màn hình rộng (≥1440px): bảng đúng thứ tự cột như sổ Excel */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm min-[1440px]:block">
            <Table className="table-fixed">
              <TableHeader className="bg-[#00426F]/[0.045]">
                <TableRow className="hover:bg-transparent [&>th]:h-10 [&>th]:whitespace-nowrap [&>th]:text-[11px] [&>th]:text-[#00426F]/75">
                  <TableHead className="w-[9%] px-3">Ngày</TableHead>
                  <TableHead className="w-[17%] px-3">Nội dung công việc</TableHead>
                  <TableHead className="w-[11%] px-3">Người chỉ đạo</TableHead>
                  <TableHead className="w-[16%] px-3">Thời gian hoàn thành</TableHead>
                  <TableHead className="w-[15%] px-3">Chủ trì</TableHead>
                  <TableHead className="w-[15%] px-3">Báo cáo thực hiện</TableHead>
                  <TableHead className="w-[13%] px-3">Ghi chú/đính kèm</TableHead>
                  {canManage && <TableHead className="w-12 px-1"><span className="sr-only">Thao tác</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow
                    key={task.id}
                    {...detailProps(task)}
                    className="group cursor-pointer align-top hover:bg-[#00558F]/[0.035] focus-visible:bg-[#00558F]/[0.05] focus-visible:outline-none"
                  >
                    <TableCell className={cn("relative px-3 py-4 align-top", dueBarOf(task))}>
                      <DateTile value={task.taskDate} showYear={!month} />
                      <div className="mt-1.5 text-[11px] text-muted-foreground">{workTaskWeekday(task.taskDate)}</div>
                    </TableCell>
                    <TableCell className="whitespace-pre-wrap break-words px-3 py-4 align-top text-[15px] font-semibold leading-snug text-ink transition-colors group-hover:text-[#00558F]">
                      {task.content}
                    </TableCell>
                    <TableCell className="px-3 py-4 align-top"><Director value={task.director} /></TableCell>
                    <TableCell className="px-3 py-4 align-top">
                      {task.dueDate ? (
                        <>
                          <div className="font-medium tabular-nums text-ink">{formatWorkTaskDate(task.dueDate)}</div>
                          <div className="mt-1.5"><DueHint task={task} /></div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-4 align-top"><Assignees task={task} /></TableCell>
                    <TableCell className="px-3 py-4 align-top">{report(task)}</TableCell>
                    <TableCell className="px-3 py-4 align-top"><NoteAndLinks note={task.note} links={task.links} canWrite={canReport(task)} onWrite={() => setReporting(task)} /></TableCell>
                    {canManage && <TableCell className="px-1 py-3 align-top">{rowMenu(task)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Điện thoại / máy tính bảng / laptop nhỏ: mỗi công việc một thẻ */}
          <div className="grid gap-3 md:grid-cols-2 min-[1440px]:hidden">
            {tasks.map((task) => (
              <article
                key={task.id}
                {...detailProps(task)}
                className={cn(
                  "relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:border-[#00558F]/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00558F]/40",
                  dueBarOf(task)
                )}
              >
                <div className="flex items-start gap-3 p-4 pb-3">
                  <DateTile value={task.taskDate} showYear={!month} />
                  <div className="min-w-0 flex-1">
                    <h3 className="whitespace-pre-wrap break-words text-[15px] font-semibold leading-snug text-ink">
                      {task.content}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{workTaskWeekday(task.taskDate)}</span>
                      {task.dueDate && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="tabular-nums">Hạn {formatWorkTaskDate(task.dueDate)}</span>
                          <DueHint task={task} />
                        </>
                      )}
                    </div>
                  </div>
                  <div className="-mr-2 -mt-2 shrink-0">{rowMenu(task)}</div>
                </div>

                <dl className="grid grid-cols-2 gap-3 px-4 pb-4 text-sm">
                  <div>
                    <dt className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Người chỉ đạo</dt>
                    <dd><Director value={task.director} /></dd>
                  </div>
                  <div>
                    <dt className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Chủ trì</dt>
                    <dd><Assignees task={task} /></dd>
                  </div>
                </dl>

                <div className="mt-auto space-y-3 border-t border-border bg-muted/20 px-4 py-3">
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Báo cáo thực hiện</div>
                    {report(task)}
                  </div>
                  {(task.note || task.links.length > 0 || canReport(task)) && (
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ghi chú/đính kèm</div>
                      <NoteAndLinks note={task.note} links={task.links} canWrite={canReport(task)} onWrite={() => setReporting(task)} />
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

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
