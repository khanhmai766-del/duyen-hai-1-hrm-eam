"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronRight, Map, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDeleteOverhaulMilestone, useOverhaulMilestones, useSaveOverhaulMilestone } from "@/hooks/useOverhaulMilestones";
import { milestoneDateLabel, milestonePhase, OVERHAUL_TITLE, type MilestoneEvent, type MilestoneInput, type OverhaulMilestone } from "@/lib/overhaul-milestones";
import { normalizeText } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { OverhaulCriticalPath } from "./overhaul-critical-path";
import { MilestoneBackdrop } from "./overhaul-milestone-backdrop";

const EMPTY: MilestoneInput = { title: "", startDate: "", endDate: null, note: null };
const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function OverhaulMilestonesCard({ canManage }: { canManage: boolean }) {
  // Chuông có thể nạp cache trước khi boundary trang chủ hydrate. Giữ lần render
  // hydrate giống SSR, sau đó mới hiện dữ liệu đã nạp (kể cả response giả lập tức thì).
  const hydrated = React.useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  const schedule = useOverhaulMilestones();
  const save = useSaveOverhaulMilestone();
  const remove = useDeleteOverhaulMilestone();
  const params = useSearchParams();
  const router = useRouter();
  const selectedId = params.get("overhaulMilestone");
  const [open, setOpen] = React.useState(false);
  const [showDiagram, setShowDiagram] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<string | null | undefined>(undefined);
  const [form, setForm] = React.useState<MilestoneInput>(EMPTY);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [seenSelectedId, setSeenSelectedId] = React.useState<string | null>(null);
  const data = hydrated ? schedule.data : undefined;
  const busy = save.isPending || remove.isPending;
  const items = (data?.items ?? []).filter((item) => normalizeText(item.title + " " + (item.note ?? "")).includes(normalizeText(search)));

  if (selectedId !== seenSelectedId) {
    setSeenSelectedId(selectedId);
    setOpen(Boolean(selectedId));
    setEditing(undefined);
    setSearch("");
  }
  React.useEffect(() => {
    if (!open || !selectedId || !data) return;
    const timer = window.setTimeout(() => document.getElementById(`milestone-${selectedId}`)?.scrollIntoView({ block: "center" }), 150);
    return () => window.clearTimeout(timer);
  }, [open, selectedId, data]);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setEditing(undefined); setDeleteId(null); setSearch("");
      if (selectedId) {
        const nextParams = new URLSearchParams(params.toString());
        nextParams.delete("overhaulMilestone");
        router.replace(nextParams.size ? `/?${nextParams.toString()}` : "/", { scroll: false });
      }
    }
  }
  function edit(item?: OverhaulMilestone) {
    setDeleteId(null);
    setEditing(item?.id ?? null);
    setForm(item ? { title: item.title, startDate: item.startDate, endDate: item.endDate, note: item.note } : { ...EMPTY });
  }
  function showMilestone(id: string) {
    const nextParams = new URLSearchParams(params.toString());
    nextParams.set("overhaulMilestone", id);
    router.replace(`/?${nextParams.toString()}`, { scroll: false });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await save.mutateAsync({ ...form, ...(editing ? { id: editing } : {}) });
      setEditing(undefined);
      toast.success("Đã lưu mốc SCL");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể lưu mốc"); }
  }
  async function confirmDelete() {
    if (!deleteId) return;
    try {
      await remove.mutateAsync(deleteId);
      setDeleteId(null);
      toast.success("Đã xoá mốc SCL");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể xoá mốc"); }
  }

  return (
    <section aria-label={OVERHAUL_TITLE} className="relative isolate overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <MilestoneBackdrop events={data?.todayEvents ?? []} />
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white/70 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700"><CalendarDays className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-navy sm:text-lg">{OVERHAUL_TITLE}</h2>
            <p className="mt-0.5 text-xs text-slate-500">06/10–04/12/2026 · Lịch kế hoạch</p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button variant="outline" className="h-10 gap-1.5 text-sky-700" disabled={!data} aria-haspopup="dialog" onClick={() => setShowDiagram(true)}>
            <Map className="h-4 w-4" />Xem sơ đồ
          </Button>
          <Button variant="outline" className="h-10 gap-1 text-sky-700" onClick={() => changeOpen(true)}>
            Xem toàn bộ lịch <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {!hydrated || schedule.isPending ? <p className="relative p-5 text-sm text-slate-500">Đang tải mốc tiến độ…</p> : schedule.isError ? (
        <div className="relative flex flex-wrap items-center gap-3 p-5 text-sm text-red-700"><p>Không tải được lịch SCL. {schedule.error.message}</p><Button variant="outline" onClick={() => schedule.refetch()}>Thử lại</Button></div>
      ) : data && (
        <div className="relative grid gap-5 p-4 sm:p-5 md:grid-cols-2 md:gap-8">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-navy">Hôm nay · {milestoneDateLabel(data.today)}</h3>
              {data.todayEvents.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{data.todayEvents.length} mốc</span>}
            </div>
            {data.todayEvents.length ? data.todayEvents.map((event) => <EventRow key={event.id} event={event} today onClick={() => showMilestone(event.milestoneId)} />) :
              <p className="py-3 text-sm leading-relaxed text-slate-500">Hôm nay không có mốc đến ngày kế hoạch.</p>}
          </div>
          <div className="border-t border-slate-100 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
            <h3 className="mb-2 text-sm font-semibold text-navy">Các mốc sắp tới</h3>
            {data.upcoming.length ? data.upcoming.map((event) => <EventRow key={event.id} event={event} onClick={() => showMilestone(event.milestoneId)} />) :
              <p className="py-3 text-sm text-slate-500">Không còn mốc sắp tới. Xem toàn bộ lịch để tra cứu.</p>}
          </div>
        </div>
      )}

      {data && <OverhaulCriticalPath open={showDiagram} onOpenChange={setShowDiagram} items={data.items} today={data.today} onSelect={showMilestone} />}
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-3xl gap-0 overflow-hidden rounded-xl p-0" aria-describedby="milestone-description">
          <DialogHeader className="border-b border-slate-100 px-4 pb-4 pt-5 pr-12 sm:px-6 sm:pr-12">
            <DialogTitle>{editing !== undefined ? editing ? "Sửa mốc SCL S2" : "Thêm mốc SCL S2" : OVERHAUL_TITLE}</DialogTitle>
            <DialogDescription id="milestone-description">Nhắc đúng ngày bắt đầu và kết thúc kế hoạch. Ngày đã qua không đồng nghĩa công việc đã hoàn thành.</DialogDescription>
          </DialogHeader>
          {editing !== undefined && canManage ? (
            <form onSubmit={submit} className="space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
              <label className="block text-sm font-medium text-navy">Tên mốc
                <textarea required maxLength={500} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-2 min-h-24 w-full rounded-lg border border-input bg-white p-3 text-base font-normal sm:text-sm" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block min-w-0 text-sm font-medium text-navy">Ngày bắt đầu / ngày mốc
                  <Input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="mt-2 h-11 min-w-0 max-w-full text-base sm:text-sm" />
                  {form.startDate && <span className="mt-1 block text-xs font-normal text-slate-500">Ngày kế hoạch: {milestoneDateLabel(form.startDate)}</span>}
                </label>
                <label className="block min-w-0 text-sm font-medium text-navy">Ngày kết thúc (nếu có)
                  <Input type="date" min={form.startDate || undefined} value={form.endDate ?? ""} onChange={(e) => setForm({ ...form, endDate: e.target.value || null })} className="mt-2 h-11 min-w-0 max-w-full text-base sm:text-sm" />
                  {form.endDate && <span className="mt-1 block text-xs font-normal text-slate-500">Ngày kế hoạch: {milestoneDateLabel(form.endDate)}</span>}
                </label>
              </div>
              <label className="block text-sm font-medium text-navy">Ghi chú
                <textarea maxLength={2000} value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value || null })} className="mt-2 min-h-20 w-full rounded-lg border border-input bg-white p-3 text-base font-normal sm:text-sm" />
              </label>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} className="h-11" onClick={() => setEditing(undefined)}>Huỷ</Button><Button disabled={busy} className="h-11">{save.isPending ? "Đang lưu…" : "Lưu mốc"}</Button></div>
            </form>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 px-4 py-3 sm:px-6">
                <Input aria-label="Tìm mốc SCL" placeholder="Tìm theo nội dung mốc…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 min-w-0 flex-1 text-base sm:text-sm" />
                {canManage && <Button className="h-11 gap-1.5" onClick={() => edit()}><Plus className="h-4 w-4" />Thêm mốc</Button>}
              </div>
              {deleteId && canManage && <div className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 p-3 sm:mx-6">
                <p className="text-sm text-red-800">Xoá mốc “{data?.items.find((item) => item.id === deleteId)?.title}” khỏi lịch và chuông thông báo?</p>
                <div className="mt-3 flex gap-2"><Button variant="outline" className="h-10" disabled={busy} onClick={() => setDeleteId(null)}>Huỷ</Button><Button variant="destructive" className="h-10" disabled={busy} onClick={confirmDelete}>{remove.isPending ? "Đang xoá…" : "Xác nhận xoá"}</Button></div>
              </div>}
              <div className="max-h-[55dvh] overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
                {schedule.isError ? <p className="py-4 text-sm text-red-700">Không tải được danh sách mốc. Vui lòng thử lại.</p> : items.length === 0 ? <p className="py-5 text-sm text-slate-500">{schedule.isPending ? "Đang tải…" : "Không có mốc phù hợp."}</p> : items.map((item) => (
                  <article key={item.id} id={`milestone-${item.id}`} className={cn("border-b border-slate-100 py-4 last:border-0", selectedId === item.id && "rounded-lg bg-sky-50 px-3 ring-1 ring-inset ring-sky-200")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-sky-700">{milestoneDateLabel(item.startDate)}{item.endDate && item.endDate !== item.startDate ? ` – ${milestoneDateLabel(item.endDate)}` : ""}</p>
                        <h3 className="mt-1.5 break-words text-sm font-semibold leading-relaxed text-navy">{item.title}</h3>
                      </div>
                      {canManage && <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                        <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`Sửa mốc ${item.title}`} onClick={() => edit(item)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-10 w-10 text-red-600" aria-label={`Xoá mốc ${item.title}`} onClick={() => setDeleteId(item.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>}
                    </div>
                    {data && <p className="mt-1 text-xs text-slate-500">{milestonePhase(item, data.today)}</p>}
                    {item.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">{item.note}</p>}
                  </article>
                ))}
              </div>
              <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-6">{items.length}/{data?.items.length ?? 0} nội dung · Giờ Việt Nam</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function EventRow({ event, today, onClick }: { event: MilestoneEvent; today?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="group flex min-h-14 w-full items-start gap-3 rounded-lg py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600">
    <span className={cn("w-12 shrink-0 border-l-2 pl-2 text-xs font-bold tabular-nums", today ? "border-amber-500 text-amber-700" : "border-sky-300 text-sky-700")}>
      {event.date.slice(8)}/{event.date.slice(5, 7)}
      {!today && <span className="mt-1 block text-[11px] font-normal text-slate-500">{event.daysLeft} ngày</span>}
    </span>
    <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium leading-relaxed text-navy">{event.title}</span><span className="mt-0.5 block text-xs text-slate-500">{event.label}</span></span>
    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 group-hover:text-sky-600" />
  </button>;
}
