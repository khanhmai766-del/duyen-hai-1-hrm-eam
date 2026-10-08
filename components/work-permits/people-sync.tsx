"use client";

import { useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useSyncPermitPeople, type PermitPeopleSyncResult } from "@/hooks/useWorkPermits";

const PHOTO_BATCH = 5;

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
            <b className="w-20 shrink-0 truncate text-blue-800 dark:text-blue-300" title={unit.company}>{unit.code}</b>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{unit.company}</span>
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">+{unit.created} mới</span>
            <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">/{unit.total}</span>
          </summary>
          <p className="mt-1.5 pl-2 text-xs leading-5 text-muted-foreground">{unit.createdNames.join(" · ")}{unit.created > unit.createdNames.length ? ` · và ${unit.created - unit.createdNames.length} người khác` : ""}</p>
        </details> : <div className="flex items-center gap-2">
          <b className="w-20 shrink-0 truncate text-slate-600 dark:text-slate-300" title={unit.company}>{unit.code}</b>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{unit.company}</span>
          <span className="shrink-0 text-xs text-muted-foreground">không có người mới</span>
          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">/{unit.total}</span>
        </div>}
      </li>)}
    </ul>
  </div>;
}

export function PeopleSyncDialog({ onClose }: { onClose: () => void }) {
  const { list, photos, refresh } = useSyncPermitPeople();
  const [result, setResult] = useState<PermitPeopleSyncResult | null>(null);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<Array<{ code: string; error?: string }>>([]);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true); setError(""); setResult(null); setDone(0); setFailed([]);
    try {
      const summary = await list.mutateAsync();
      setResult(summary);
      for (let i = 0; i < summary.photos.length; i += PHOTO_BATCH) {
        const { results } = await photos.mutateAsync(summary.photos.slice(i, i + PHOTO_BATCH));
        setDone(value => value + results.length);
        const bad = results.filter(r => !r.ok);
        if (bad.length) setFailed(value => [...value, ...bad]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đồng bộ được");
    } finally {
      refresh();
      setRunning(false);
    }
  }

  const total = result?.photos.length ?? 0;
  return <Dialog open onOpenChange={v => { if (!v && !running) onClose(); }}>
    <DialogContent className="max-w-lg">
      <DialogTitle>Đồng bộ nhân sự từ Google Sheets</DialogTitle>
      <DialogDescription>Mỗi tab trong sheet ứng với đơn vị có Mã đơn vị trùng tên tab. Lấy họ tên, số thẻ, hạn thẻ, huấn luyện và ảnh; vai trò CHTT và trạng thái hoạt động trên sổ giữ nguyên.</DialogDescription>
      {!result && !running && !error && <p className="rounded-lg bg-muted/40 p-3 text-sm">Người mới trong sheet được thêm vào danh bạ; người đã có (cùng số thẻ) được cập nhật theo sheet. Ảnh chỉ tải lại khi ảnh trong sheet thay đổi.</p>}
      {running && !result && <p role="status" className="text-sm">Đang lấy danh sách từ Google Sheets…</p>}
      {result && <div className="min-w-0 space-y-2 text-sm">
        <p className="flex items-center gap-2 font-medium"><CheckCircle2 size={16} className="text-emerald-600" />{result.total} người · {result.created} mới · {result.updated} cập nhật{result.skipped ? ` · ${result.skipped} dòng bỏ qua` : ""}</p>
        {result.units?.length > 0 && <UnitBreakdown units={result.units} />}
        {total > 0 && <div>
          <p>Ảnh: {done}/{total}{failed.length ? ` · ${failed.length} lỗi` : ""}</p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${Math.round((done / total) * 100)}%` }} /></div>
        </div>}
        {result.skippedTabs.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <p className="font-medium">Tab bỏ qua — tên tab không trùng Mã đơn vị nào trên web:</p>
          <p>{result.skippedTabs.map(t => `${t.tab} (${t.rows} dòng)`).join(" · ")}</p>
          <p className="mt-1 text-xs">Tab của nhà thầu thì đặt <b>Mã đơn vị</b> cho đơn vị đó trên web (nút bút chì) đúng bằng tên tab, rồi đồng bộ lại. Tab Dashboard / MẪU bỏ qua là đúng.</p>
        </div>}
        {result.movedCount > 0 && <details className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950"><summary className="cursor-pointer font-medium">{result.movedCount} người được chuyển đơn vị theo sheet</summary>{result.moved.map(line => <p key={line} className="text-xs">{line}</p>)}</details>}
        {result.skippedSamples.length > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Dòng bị bỏ qua (thiếu tên / số thẻ không hợp lệ)</summary>{result.skippedSamples.map(line => <p key={line}>{line}</p>)}</details>}
        {failed.length > 0 && <details className="text-xs text-red-700"><summary className="cursor-pointer">Ảnh tải lỗi</summary>{failed.map(f => <p key={f.code}>{f.code}: {f.error}</p>)}</details>}
      </div>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={running} onClick={onClose}>{result ? "Đóng" : "Để sau"}</Button>
        <Button type="button" disabled={running} onClick={() => void run()}><RefreshCw className={running ? "animate-spin" : ""} />{running ? "Đang đồng bộ…" : result ? "Đồng bộ lại" : "Bắt đầu đồng bộ"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
