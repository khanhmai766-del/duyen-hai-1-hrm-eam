"use client";

import { useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { usePeopleSyncRuns, useStartPeopleSync, type PermitPeopleSyncResult, type PermitPeopleSyncSource } from "@/hooks/useWorkPermits";

/** Hai bảng nguồn: người MỚI của bảng nào nhận nhóm của bảng đó. */
const SOURCES: Array<{ value: PermitPeopleSyncSource; label: string; hint: string }> = [
  { value: "OVERHAUL", label: "Nhà thầu Đại tu", hint: "Bảng thẻ ra vào cổng & ATVSLĐ" },
  { value: "SCTX", label: "Nhà thầu SCTX", hint: "Bảng nhân sự SCTX" },
];

/**
 * Đồng bộ danh bạ nhân sự nhà thầu từ Google Sheets thẻ ra vào cổng: một lượt lấy danh sách (chữ), rồi
 * tải ảnh theo từng nhóm nhỏ có thanh tiến độ — vài trăm người vẫn không vượt thời gian chờ của máy chủ.
 */
/** Bảng theo đơn vị: số người MỚI (bấm để xem tên) trên tổng số người của đơn vị trên sheet. */
function UnitBreakdown({ units }: { units: PermitPeopleSyncResult["units"] }) {
  const withNew = units.filter(unit => unit.created > 0);
  return <div className="overflow-hidden rounded-lg border border-border">
    <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold">
      {withNew.length ? `Nhân sự mới theo đơn vị · ${withNew.length}/${units.length} đơn vị có người mới` : `Không có nhân sự mới · ${units.length} đơn vị đã cập nhật`}
    </p>
    <ul className="max-h-64 divide-y divide-border overflow-y-auto">
      {units.map(unit => <li key={unit.company} className="px-3 py-2">
        {unit.created > 0 ? <details>
          <summary className="flex cursor-pointer list-none items-center gap-2">
            <b className="w-20 shrink-0 truncate text-blue-800" title={unit.company}>{unit.code}</b>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{unit.company}</span>
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">+{unit.created} mới</span>
            <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">/{unit.total}</span>
          </summary>
          <p className="mt-1.5 pl-2 text-xs leading-5 text-muted-foreground">{unit.createdNames.join(" · ")}{unit.created > unit.createdNames.length ? ` · và ${unit.created - unit.createdNames.length} người khác` : ""}</p>
        </details> : <div className="flex items-center gap-2">
          <b className="w-20 shrink-0 truncate text-slate-600" title={unit.company}>{unit.code}</b>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{unit.company}</span>
          <span className="shrink-0 text-xs text-muted-foreground">không có người mới</span>
          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">/{unit.total}</span>
        </div>}
      </li>)}
    </ul>
  </div>;
}

export function PeopleSyncDialog({ onClose, initialSource = "OVERHAUL" }: { onClose: () => void; initialSource?: PermitPeopleSyncSource }) {
  // Chạy NỀN (16/10/2026): bấm nút chỉ mở lượt trên máy chủ; hộp này đọc tiến độ của lượt gần nhất (kể cả lượt hẹn giờ),
  // đóng hộp / tải lại trang lượt vẫn chạy tiếp.
  const runs = usePeopleSyncRuns();
  const start = useStartPeopleSync();
  const qc = useQueryClient();
  const [source, setSource] = useState<PermitPeopleSyncSource>(initialSource);
  const [error, setError] = useState("");
  const run = runs.data?.[source] ?? null;
  const running = run?.state === "RUNNING" || start.isPending;
  const result = run?.summary ?? null;
  const total = run?.photosTotal ?? 0, done = run?.photosDone ?? 0;
  const failed = run?.photoErrors ?? [];
  // Lượt vừa xong → làm mới danh bạ / bảng đơn vị một lần.
  const finishedKey = run && run.state !== "RUNNING" ? run.id : null;
  const [seenFinish, setSeenFinish] = useState<string | null>(null);
  if (finishedKey && finishedKey !== seenFinish) {
    setSeenFinish(finishedKey);
    void qc.invalidateQueries({ queryKey: ["work-permit-people"] });
    void qc.invalidateQueries({ queryKey: ["work-permit-companies"] });
  }
  async function run_() {
    setError("");
    try { await start.mutateAsync(source); } catch (e) { setError(e instanceof Error ? e.message : "Không đồng bộ được"); }
  }
  const when = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

  return <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
    <DialogContent className="max-w-lg">
      <DialogTitle>Đồng bộ nhân sự từ Google Sheets</DialogTitle>
      <DialogDescription className="sr-only">Mỗi tab trong sheet ứng với đơn vị có Mã đơn vị trùng tên tab. Lấy họ tên, số thẻ, hạn thẻ, huấn luyện và ảnh; vai trò CHTT và trạng thái hoạt động trên sổ giữ nguyên.</DialogDescription>
      <div role="radiogroup" aria-label="Bảng nguồn" className="grid grid-cols-2 gap-2">
        {SOURCES.map(item => <button key={item.value} type="button" role="radio" aria-checked={source === item.value}
          onClick={() => { setSource(item.value); setError(""); }}
          className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-60 ${source === item.value ? "border-blue-600 bg-blue-50 text-blue-900 ring-1 ring-blue-600" : "border-border hover:bg-muted/40"}`}>
          <span className="block font-semibold">{item.label}</span><span className="block text-xs text-muted-foreground">{item.hint}</span>
        </button>)}
      </div>
      {run ? <p className="text-xs text-muted-foreground">Lượt gần nhất: {when(run.startedAt)} · {run.trigger === "TIMER" ? "tự động theo giờ" : run.startedByName || "người dùng"}{run.finishedAt ? ` · xong ${when(run.finishedAt)}` : ""}</p>
        : runs.isSuccess && <p className="text-xs text-muted-foreground">Chưa có lượt đồng bộ nào được ghi nhận cho bảng này.</p>}
      {running && <p role="status" className="flex items-center gap-2 text-sm"><RefreshCw size={14} className="animate-spin" />{result ? "Đang tải ảnh…" : "Đang lấy danh sách từ Google Sheets…"} Có thể đóng hộp này — đồng bộ vẫn chạy trên máy chủ.</p>}
      {result && <div className="min-w-0 space-y-2 text-sm">
        <p className="flex items-center gap-2 font-medium"><CheckCircle2 size={16} className="text-emerald-600" />{result.sourceLabel}: {result.total} người · {result.created} mới · {result.updated} cập nhật{result.skipped ? ` · ${result.skipped} dòng bỏ qua` : ""}</p>
        {result.via === "apps-script" && <p className="text-xs text-amber-800">Đọc qua Apps Script (chậm) vì tài khoản dịch vụ chưa đọc được bảng này — chia sẻ bảng quyền Xem để đồng bộ nhanh hơn.</p>}
        {result.photosEnabled === false && <p className="text-xs text-muted-foreground">Bảng này chưa nối web app Apps Script nên chưa tải ảnh; họ tên và thông tin thẻ vẫn cập nhật đủ.</p>}
        {result.conflictCount > 0 && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
          <p className="font-medium">{result.conflictCount} số thẻ trùng người của nhóm khác — không ghi đè:</p>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs">{result.conflicts.map(line => <li key={line}>{line}</li>)}</ul>
          <p className="mt-1 text-xs">Đánh số thẻ riêng cho những người này trên bảng {result.sourceLabel} rồi đồng bộ lại.</p>
        </div>}
        {result.units?.length > 0 && <UnitBreakdown units={result.units} />}
        {total > 0 && <div>
          <p>Ảnh: {done}/{total}{failed.length ? ` · ${failed.length} lỗi` : ""}</p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${Math.round((done / total) * 100)}%` }} /></div>
        </div>}
        {result.skippedTabs.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <p className="font-medium">Tab bỏ qua — tên tab không trùng Mã đơn vị nào trên web:</p>
          <p>{result.skippedTabs.map(t => `${t.tab} (${t.rows} dòng)`).join(" · ")}</p>
          <p className="mt-1 text-xs">Tab của nhà thầu thì đặt <b>Mã đơn vị</b> cho đơn vị đó trên web (nút bút chì) đúng bằng tên tab, rồi đồng bộ lại. Tab Dashboard / TOTAL / MẪU bỏ qua là đúng.</p>
        </div>}
        {result.movedCount > 0 && <details className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950"><summary className="cursor-pointer font-medium">{result.movedCount} người được chuyển đơn vị theo sheet</summary>{result.moved.map(line => <p key={line} className="text-xs">{line}</p>)}</details>}
        {result.skippedSamples.length > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Dòng bị bỏ qua (thiếu tên / số thẻ không hợp lệ)</summary>{result.skippedSamples.map(line => <p key={line}>{line}</p>)}</details>}
        {failed.length > 0 && <details className="text-xs text-red-700"><summary className="cursor-pointer">Ảnh tải lỗi</summary>{failed.map(f => <p key={f.code}>{f.code}: {f.error}</p>)}</details>}
      </div>}
      {run?.state === "FAILED" && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Lượt này lỗi: {run.error}</p>}
      {(error || runs.error) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error || runs.error?.message}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>{running ? "Đóng (vẫn chạy)" : result ? "Đóng" : "Để sau"}</Button>
        <Button type="button" disabled={running} onClick={() => void run_()}><RefreshCw className={running ? "animate-spin" : ""} />{running ? "Đang đồng bộ…" : run ? "Đồng bộ lại" : "Bắt đầu đồng bộ"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
