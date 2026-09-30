"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarRange, ExternalLink, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlainHeader, ROW_HOVER, rowBackground, TD_ROW, TH_NAVY, TR_HEAD } from "@/components/pccc/pccc-table-card";
import { useOverhaulSchedules, useSaveOverhaulSchedule } from "@/hooks/useWorkPermits";
import { cn } from "@/lib/utils";
import { OVERHAUL_SCHEDULE_TITLE_MAX, OVERHAUL_SCHEDULE_URL_MAX, overhaulScheduleUrlError, type OverhaulScheduleLink } from "@/lib/work-permit-overhaul";

/** Mục "Tiến độ đại tu" của sổ PCT: 4 link Google Sheets theo dõi, sửa được tiêu đề và link. */
export function OverhaulScheduleLinks() {
  const query = useOverhaulSchedules();
  const [editing, setEditing] = useState<OverhaulScheduleLink | null>(null);
  const rows = query.data?.data ?? [];
  const canWrite = query.data?.meta.canWrite ?? false;
  const configured = rows.filter(row => row.url).length;

  const openButton = (row: OverhaulScheduleLink, className: string) => row.url
    ? <Button asChild size="sm" className={className}><a href={row.url} target="_blank" rel="noopener noreferrer" title={`Mở ${row.title} (Google Sheets, tab mới)`}><ExternalLink size={14} />Mở</a></Button>
    : <Button type="button" size="sm" className={className} disabled title="Chưa có link sheet"><ExternalLink size={14} />Mở</Button>;
  const editButton = (row: OverhaulScheduleLink, className: string) => canWrite &&
    <Button type="button" size="sm" variant="outline" className={className} aria-label={`Sửa ${row.title}`} title="Sửa tên theo dõi / link sheet" onClick={() => setEditing(row)}><Pencil size={14} /></Button>;

  return <section className="space-y-4">
    <div><h2 className="flex items-center gap-2 text-base font-semibold"><CalendarRange size={18} />Tiến độ đại tu</h2><p className="mt-0.5 text-xs text-muted-foreground">Các file Google Sheets theo dõi tiến độ đại tu. Bấm “Mở” để xem trên tab mới{canWrite ? "; bút chì để đổi tên theo dõi hoặc link sheet" : ""}.</p></div>
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/25 px-4 py-3">
        <p className="text-sm text-muted-foreground"><strong className="font-semibold text-foreground">{rows.length}</strong> file theo dõi · <strong className="font-semibold text-foreground">{configured}</strong> đã có link</p>
      </div>
      {query.isPending ? <p role="status" className="p-6 text-sm">Đang tải…</p>
        : query.isError ? <p role="alert" className="p-6 text-red-700">{query.error.message}</p>
        : <>
          {/* Điện thoại: mỗi file một thẻ. */}
          <div className="divide-y divide-border md:hidden">{rows.map((row, index) => <article key={row.id} className="flex items-center gap-3 px-4 py-3">
            <span className="w-6 shrink-0 text-center text-sm tabular-nums text-slate-500">{index}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-5 text-ink">{row.title}</span>
              <span className={cn("mt-0.5 block truncate text-xs", row.url ? "text-muted-foreground" : "text-amber-700")}>{row.url ? shortUrl(row.url) : "Chưa có link sheet"}</span>
            </span>
            <span className="flex shrink-0 gap-2">{openButton(row, "h-10 px-3 text-xs")}{editButton(row, "h-10 w-10 px-0")}</span>
          </article>)}</div>
          <Table className="hidden min-w-[720px] md:table">
            <TableHeader><TableRow className={TR_HEAD}>
              <TableHead className={cn(TH_NAVY, "w-16")}><PlainHeader label="STT" /></TableHead>
              <TableHead className={cn(TH_NAVY, "w-72")}><PlainHeader label="Theo dõi" align="left" /></TableHead>
              <TableHead className={TH_NAVY}><PlainHeader label="Link sheet tiến độ" align="left" /></TableHead>
              <TableHead className={cn(TH_NAVY, "w-40")}><PlainHeader label="Thao tác" /></TableHead>
            </TableRow></TableHeader>
            <TableBody>{rows.map((row, index) => <TableRow key={row.id} className={cn(rowBackground({ index }), ROW_HOVER)}>
              {/* STT đánh từ 0: dòng 0 là file lọc dữ liệu hạng mục thô (OVERHAUL_SCHEDULE_DEFAULTS). */}
              <TableCell className={cn(TD_ROW, "py-2.5 text-center tabular-nums text-slate-500")}>{index}</TableCell>
              <TableCell className={cn(TD_ROW, "py-2.5 font-semibold text-ink")}>{row.title}</TableCell>
              <TableCell className={cn(TD_ROW, "max-w-0 py-2.5")}>
                {row.url
                  ? <a href={row.url} target="_blank" rel="noopener noreferrer" className="block truncate text-blue-700 hover:underline dark:text-blue-300" title={row.url}>{shortUrl(row.url)}</a>
                  : <span className="text-amber-700">Chưa có link sheet</span>}
                {row.updatedBy && <span className="mt-0.5 block text-[11px] text-muted-foreground">Sửa bởi {row.updatedBy}{row.updatedAt ? ` · ${new Date(row.updatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })}` : ""}</span>}
              </TableCell>
              <TableCell className={cn(TD_ROW, "py-2.5")}><div className="flex items-center justify-center gap-1.5">{openButton(row, "h-8 px-2.5 text-xs")}{editButton(row, "h-8 px-2")}</div></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </>}
    </div>
    {editing && <ScheduleEditor row={editing} onClose={() => setEditing(null)} />}
  </section>;
}

/** Hiện link gọn: bỏ "https://", cắt phần #gid… cho dễ đọc; bấm vẫn mở link đầy đủ. */
function shortUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/[?#].*$/, "");
}

function ScheduleEditor({ row, onClose }: { row: OverhaulScheduleLink; onClose: () => void }) {
  const save = useSaveOverhaulSchedule();
  const [title, setTitle] = useState(row.title);
  const [url, setUrl] = useState(row.url);
  const urlError = overhaulScheduleUrlError(url.trim());
  const control = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || urlError) return;
    try {
      await save.mutateAsync({ id: row.id, title: title.trim(), url: url.trim() });
      toast.success("Đã lưu tiến độ đại tu");
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent className="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <div><DialogTitle>Sửa tiến độ đại tu</DialogTitle><DialogDescription className="mt-1">Đổi tên hiển thị ở cột Theo dõi và link Google Sheets được chia sẻ.</DialogDescription></div>
        <label className="block space-y-1.5 text-sm"><span className="font-medium">Theo dõi *</span>
          <input className={control} required maxLength={OVERHAUL_SCHEDULE_TITLE_MAX} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ví dụ: Tiến độ Lò hơi" />
        </label>
        <label className="block space-y-1.5 text-sm"><span className="font-medium">Link sheet tiến độ</span>
          <input className={control} type="url" inputMode="url" maxLength={OVERHAUL_SCHEDULE_URL_MAX} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" aria-invalid={Boolean(urlError)} />
          {urlError ? <span role="alert" className="block text-xs text-red-700">{urlError}</span>
            : <span className="block text-xs text-muted-foreground">Dán đường dẫn chia sẻ của file (Chia sẻ → Sao chép đường liên kết). Để trống nếu chưa có.</span>}
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button type="button" variant="outline" className="h-10" disabled={save.isPending} onClick={onClose}>Huỷ</Button>
          <Button type="submit" className="h-10" disabled={save.isPending || !title.trim() || Boolean(urlError)}>{save.isPending && <Loader2 className="animate-spin" />}Lưu</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
