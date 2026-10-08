"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usePermitNumberReview, useReviewPermitNumber, type PermitNumberReviewEntry } from "@/hooks/useWorkPermits";
import { nkvhPctUrl } from "@/lib/nkvh-pct";
import { PERMIT_KINDS, type PermitKind } from "@/lib/work-permits";

export function PermitNumberReview({ kind, onOpenPermit }: { kind: PermitKind; onOpenPermit?: (id: string) => void }) {
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric" }).format(new Date()));
  const query = usePermitNumberReview(kind, year);
  const save = useReviewPermitNumber();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<{ entry: PermitNumberReviewEntry; action: "confirm" | "ignore" } | null>(null);
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  const entries = query.data?.data.entries ?? [];
  if (query.isError) return <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Chưa tải được số NKVH cần đối chiếu. <Button variant="outline" className="h-10" onClick={() => query.refetch()}>Thử lại</Button></p>;
  if (!entries.length && !selection) return null;
  const start = (entry: PermitNumberReviewEntry, action: "confirm" | "ignore") => { setSelection({ entry, action }); setReason(""); setChecked(false); };
  return <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold text-amber-950">Đối chiếu số NKVH · PCT {PERMIT_KINDS[kind]}</h2><p className="mt-1 text-xs text-amber-900">Số chờ đối chiếu vẫn chặn cấp trùng, chưa tự nâng dãy. Số tiếp theo dự kiến: <strong>{query.data?.data.suggested ?? "Chưa cấu hình"}</strong>.</p></div><Button variant="outline" className="h-10 text-xs" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Thu gọn" : `Xem ${query.data?.data.total ?? entries.length} số`}</Button></div>
    {open && <div className="space-y-2">{entries.map(entry => <div key={entry.id} className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><p className="font-semibold">{entry.number}/{year} <span className="ml-1 text-xs font-normal text-muted-foreground">{entry.status === "OBSERVED_CONFIRMED" ? "Đã xác nhận nâng dãy" : "Chờ đối chiếu"}</span></p><p className="mt-1 text-xs text-muted-foreground">{entry.permitId ? "Đã có hồ sơ phiếu, chưa xác nhận nâng dãy" : entry.draftPermitId ? <>Có <b className="text-amber-800">phiếu nháp chờ đồng bộ</b> — mở phiếu NKVH và bấm đồng bộ trên tiện ích để chuyển thành Đã cấp</> : "Chưa có hồ sơ phiếu trên website"}</p>{entry.draftPermitId && onOpenPermit && <button type="button" className="mr-4 mt-1 inline-flex min-h-10 items-center text-xs font-medium text-blue-700 underline" onClick={() => onOpenPermit(entry.draftPermitId!)}>Mở phiếu nháp</button>}{entry.nkvhPctId ? <a className="mt-1 inline-flex min-h-10 items-center text-xs font-medium text-blue-700 underline" href={nkvhPctUrl(kind, entry.nkvhPctId)} target="_blank" rel="noopener noreferrer">Mở phiếu NKVH để đối chiếu</a> : <p className="mt-1 text-xs text-muted-foreground">Chưa có liên kết; tìm số này trong sổ NKVH.</p>}</div>
      <div className="grid grid-cols-2 gap-2 sm:flex">{entry.status === "OBSERVED" && <Button className="min-h-10 h-auto whitespace-normal px-2 py-2 text-xs sm:whitespace-nowrap" onClick={() => start(entry, "confirm")}>Xác nhận nâng dãy</Button>}<Button variant="outline" className="min-h-10 h-auto whitespace-normal px-2 py-2 text-xs sm:whitespace-nowrap" disabled={Boolean(entry.permitId || entry.draftPermitId)} title={entry.permitId || entry.draftPermitId ? "Xử lý số trên NKVH và đồng bộ lại trước" : undefined} onClick={() => start(entry, "ignore")}>Bỏ ghi nhận sai</Button></div>
    </div>)}{(query.data?.data.total ?? 0) > entries.length && <p className="text-xs text-muted-foreground">Đang hiển thị {entries.length} số cao nhất; xử lý xong sẽ tải các số tiếp theo.</p>}</div>}
    {selection && <Dialog open onOpenChange={value => { if (!value && !save.isPending) setSelection(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogTitle>{selection.action === "confirm" ? "Xác nhận nâng dãy theo" : "Bỏ ghi nhận sai số"} {selection.entry.number}/{year}</DialogTitle><DialogDescription>{selection.action === "confirm" ? "Sau xác nhận, số này được tính vào dãy để đề xuất các số tiếp theo. Nội dung và trạng thái phiếu vẫn theo NKVH." : "Chỉ bỏ khi đã xác định tiện ích đọc sai, hoặc số sai đã được xử lý trên NKVH. Không xóa phiếu hay lịch sử, không sửa dữ liệu NKVH."}</DialogDescription>
      <label className="block space-y-1.5 text-sm"><span className="font-medium">Lý do đối chiếu *</span><textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-base sm:text-sm" maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} disabled={save.isPending} /></label>
      <label className="flex min-h-10 items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={checked} disabled={save.isPending} onChange={event => setChecked(event.target.checked)} /><span>{selection.action === "confirm" ? "Tôi đã đối chiếu NKVH và xác nhận dùng số này để nâng dãy." : "Tôi đã đối chiếu NKVH; số này là ghi nhận sai, không còn phiếu sử dụng số này."}</span></label>
      <Button className="h-11" disabled={save.isPending || !reason.trim() || !checked} onClick={async () => { try {
        await save.mutateAsync({ id: selection.entry.id, action: selection.action, expectedStatus: selection.entry.status, expectedUpdatedAt: selection.entry.updatedAt, reason, sourceChecked: checked });
        toast.success(selection.action === "confirm" ? "Đã xác nhận số để nâng dãy" : "Đã bỏ ghi nhận sai; lịch sử vẫn được giữ"); setSelection(null);
      } catch (error) { toast.error(error instanceof Error ? error.message : "Không thể đối chiếu số"); } }}>{save.isPending ? "Đang lưu…" : "Xác nhận"}</Button>
    </DialogContent></Dialog>}
  </section>;
}
