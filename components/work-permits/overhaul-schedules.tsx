"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarRange, ExternalLink, Loader2, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlainHeader, ROW_HOVER, rowBackground, TD_ROW, TH_NAVY, TR_HEAD } from "@/components/pccc/pccc-table-card";
import { useOverhaulSchedules, useSaveOverhaulSchedule, useSyncOverhaulItems, type OverhaulSyncResult } from "@/hooks/useWorkPermits";
import { cn } from "@/lib/utils";
import { OVERHAUL_SCHEDULE_TITLE_MAX, OVERHAUL_SCHEDULE_URL_MAX, OVERHAUL_SOURCES, overhaulScheduleUrlError, type OverhaulScheduleLink } from "@/lib/work-permit-overhaul";

/** Mục "Tiến độ đại tu" của sổ PCT: 4 link Google Sheets theo dõi, sửa được tiêu đề và link. */
export function OverhaulScheduleLinks() {
  const query = useOverhaulSchedules();
  const [editing, setEditing] = useState<OverhaulScheduleLink | null>(null);
  const rows = query.data?.data ?? [];
  const canWrite = query.data?.meta.canWrite ?? false;
  const configured = rows.filter(row => row.url).length;
  const canSync = query.data?.meta.canSync ?? false;
  const itemCounts = query.data?.meta.items ?? {};
  const totalItems = Object.values(itemCounts).reduce((sum, item) => sum + item.mechanical + item.electrical, 0);
  const syncedAt = query.data?.meta.itemsSyncedAt;
  const sync = useSyncOverhaulItems();
  const [syncResult, setSyncResult] = useState<OverhaulSyncResult | null>(null);
  async function runSync() {
    try { setSyncResult(await sync.mutateAsync()); }
    catch (error) { toast.error("Không đồng bộ được hạng mục", { description: (error as Error).message }); }
  }
  /** Dòng 1–4 là nguồn gợi ý hạng mục khi cấp PCT đại tu (dòng 0 chỉ là link tham khảo). */
  const itemLine = (row: OverhaulScheduleLink) => {
    if (!Object.hasOwn(OVERHAUL_SOURCES, row.id)) return null;
    const count = itemCounts[row.id];
    const total = (count?.mechanical ?? 0) + (count?.electrical ?? 0);
    return <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{total ? `${total} hạng mục gợi ý · ${count!.mechanical} Cơ · ${count!.electrical} Điện` : "Chưa có hạng mục gợi ý"}</span>;
  };

  const openButton = (row: OverhaulScheduleLink, className: string) => row.url
    ? <Button asChild size="sm" className={className}><a href={row.url} target="_blank" rel="noopener noreferrer" title={`Mở ${row.title} (Google Sheets, tab mới)`}><ExternalLink size={14} />Mở</a></Button>
    : <Button type="button" size="sm" className={className} disabled title="Chưa có link sheet"><ExternalLink size={14} />Mở</Button>;
  const editButton = (row: OverhaulScheduleLink, className: string) => canWrite &&
    <Button type="button" size="sm" variant="outline" className={className} aria-label={`Sửa ${row.title}`} title="Sửa tên theo dõi / link sheet" onClick={() => setEditing(row)}><Pencil size={14} /></Button>;

  return <section className="space-y-4">
    <div><h2 className="flex items-center gap-2 text-base font-semibold"><CalendarRange size={18} />Tiến độ đại tu</h2><p className="mt-0.5 text-xs text-muted-foreground">Các file Google Sheets theo dõi tiến độ đại tu. Bấm “Mở” để xem trên tab mới{canWrite ? "; bút chì để đổi tên theo dõi hoặc link sheet" : ""}.</p></div>
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-2 border-b border-border bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground"><strong className="font-semibold text-foreground">{rows.length}</strong> file theo dõi · <strong className="font-semibold text-foreground">{configured}</strong> đã có link · <strong className="font-semibold text-foreground">{totalItems}</strong> hạng mục gợi ý{syncedAt ? ` (đồng bộ ${vnTime(syncedAt)})` : ""}</p>
        {canSync && <Button type="button" size="sm" variant="outline" className="h-10 shrink-0 text-xs sm:h-9" disabled={sync.isPending} title="Đọc lại hạng mục từ các file Lò hơi, Turbine, Máy phát, C&I (tự động mỗi sáng 06:00)" onClick={() => void runSync()}>
          {sync.isPending ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}Đồng bộ hạng mục
        </Button>}
      </div>
      {query.isPending ? <p role="status" className="p-6 text-sm">Đang tải…</p>
        : query.isError ? <p role="alert" className="p-6 text-red-700">{query.error.message}</p>
        : <>
          {/* Điện thoại: mỗi file một thẻ. */}
          <div className="divide-y divide-border md:hidden">{rows.map((row, index) => <article key={row.id} className="flex items-center gap-3 px-4 py-3">
            <span className="w-6 shrink-0 text-center text-sm tabular-nums text-slate-500">{index}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-5 text-ink">{row.title}</span>
              {itemLine(row)}
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
              <TableCell className={cn(TD_ROW, "py-2.5 font-semibold text-ink")}>{row.title}{itemLine(row)}</TableCell>
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
    {syncResult && <SyncResultDialog result={syncResult} onClose={() => setSyncResult(null)} />}
  </section>;
}

function vnTime(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

/** Kết quả từng file sau khi đồng bộ — nêu rõ chỗ cần sửa trên Sheet hoặc danh bạ nhà thầu. */
function SyncResultDialog({ result, onClose }: { result: OverhaulSyncResult; onClose: () => void }) {
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
      <div><DialogTitle>Đã đồng bộ hạng mục đại tu</DialogTitle><DialogDescription className="mt-1">Hạng mục dùng để gợi ý nội dung khi cấp PCT nhà thầu · Đại tu (lọc theo loại PCT, cương vị, nhà thầu).</DialogDescription></div>
      <div className="space-y-3">
        {result.sources.map(source => {
          const warnings = [
            source.unknownContractors.length ? `Nhà thầu chưa có trong danh bạ (mã đơn vị phải trùng cột “Nhà thầu”): ${source.unknownContractors.join(", ")}` : "",
            source.unmatchedPositions.length ? `Cương vị chưa khớp danh mục (chỉ hiện khi chọn “Tất cả cương vị”): ${source.unmatchedPositions.join(", ")}` : "",
            source.skippedTabs.length ? `Bỏ tab không rõ Cơ/Điện: ${source.skippedTabs.join(", ")}` : "",
            source.missingContractor ? `${source.missingContractor} dòng chưa ghi nhà thầu (chưa gợi ý được)` : "",
          ].filter(Boolean);
          return <div key={source.source} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <b className="text-sm text-ink">{source.label}</b>
              <span className="text-xs text-muted-foreground">{!source.configured ? "Chưa có link" : source.error ? "Lỗi" : `${source.rows} hạng mục · ${source.mechanical} Cơ · ${source.electrical} Điện`}</span>
            </div>
            {source.error && <p role="alert" className="mt-1 text-xs text-red-700">{source.error}</p>}
            {source.configured && !source.error && !source.rows && <p className="mt-1 text-xs text-muted-foreground">File chưa có bảng hạng mục (cần hàng tiêu đề có “Mã hạng mục”).</p>}
            {warnings.map(text => <p key={text} className="mt-1 flex gap-1.5 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{text}</p>)}
          </div>;
        })}
      </div>
      <div className="flex justify-end"><Button type="button" className="h-10" onClick={onClose}>Đóng</Button></div>
    </DialogContent>
  </Dialog>;
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
