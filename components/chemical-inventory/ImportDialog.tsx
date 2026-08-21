"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useChemicalImportPreview,
  useCommitChemicalImport,
  type ImportPreview,
  type PermissionLevel,
} from "@/hooks/useChemicalInventory";
import { fmt } from "./shared";

/**
 * Hộp nhập dữ liệu từ tệp Excel: chọn tệp → xem trước → ghi.
 *
 * Không đóng được khi đang chạy — đóng giữa chừng là mất kết quả xem trước và người
 * dùng không biết máy chủ đã ghi tới đâu.
 */

type Severity = "error" | "warning" | "info";

export function ImportDialog({
  open,
  onOpenChange,
  level,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level: PermissionLevel;
}) {
  const preview = useChemicalImportPreview();
  const commit = useCommitChemicalImport();

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportPreview | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);
  const [filter, setFilter] = useState<Severity | "all">("all");

  const busy = preview.isPending || commit.isPending;
  const canCommit = level === "full";

  function reset() {
    setFile(null);
    setResult(null);
    setCommitted(null);
    setFilter("all");
  }

  async function runPreview(selected: File) {
    setFile(selected);
    setResult(null);
    setCommitted(null);
    try {
      setResult(await preview.mutateAsync(selected));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Đọc tệp thất bại");
    }
  }

  async function runCommit() {
    if (!file || !result) return;
    try {
      const res = await commit.mutateAsync({ file, expectedHash: result.fileHash });
      setCommitted(
        `${res.receiptsCreated} phiếu mới · ${res.receiptsLinked} phiếu gắn vào bản ghi có sẵn · ` +
          `${res.receiptsUpdated} phiếu cập nhật · ${res.readingsUpserted} ô tồn · ${res.contractsUpserted} hợp đồng`
      );
      toast.success("Đã ghi dữ liệu từ tệp Excel");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ghi dữ liệu thất bại");
    }
  }

  const issues = result?.issues.filter((i) => filter === "all" || i.severity === filter) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Đang chạy thì không cho đóng: mất kết quả và không biết đã ghi tới đâu.
        if (busy) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nhập tồn kho hóa chất từ Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-8 text-center transition-colors hover:border-accent hover:bg-muted/50",
              busy && "pointer-events-none opacity-60"
            )}
          >
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
            <span className="mt-2 text-sm font-medium text-ink">{file ? file.name : "Chọn tệp .xlsx"}</span>
            <span className="mt-1 text-xs text-muted-foreground">
              Chỉ nhận .xlsx, tối đa 10 MB. Chọn tệp sẽ chạy thử khô trước, chưa ghi gì.
            </span>
            <input
              type="file"
              accept=".xlsx"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) void runPreview(selected);
              }}
            />
          </label>

          {preview.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang đọc và đối soát tệp…
            </p>
          )}

          {result && (
            <>
              <div className="grid gap-2 sm:grid-cols-4">
                <Stat label="Kỳ" value={result.summary.periods} />
                <Stat label="Ô tồn" value={result.summary.readings} />
                <Stat label="Phiếu nhập" value={result.summary.receipts} />
                <Stat label="Hợp đồng" value={result.summary.contracts} />
              </div>

              <div
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                  result.canCommit
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-red-300 bg-red-50 text-red-900"
                )}
              >
                {result.canCommit ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>
                  {result.canCommit
                    ? `Không có lỗi chặn. ${result.summary.warningCount} cảnh báo — cảnh báo không chặn việc ghi.`
                    : `Còn ${result.summary.errorCount} lỗi phải xử lý trước khi ghi.`}
                </span>
              </div>

              {/* Bảng thống kê theo tab */}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-1.5 text-left font-semibold">Tab</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Vai trò</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Đọc</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Hợp lệ</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Bỏ qua</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Lỗi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.bySheet.map((s) => (
                      <tr key={s.sheet} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-1.5">{s.sheet}</td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{s.role}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{s.rowsRead || "—"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{s.rowsValid || "—"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{s.rowsSkipped || "—"}</td>
                        <td className={cn("px-3 py-1.5 text-right tabular-nums", s.rowsError > 0 && "font-semibold text-red-700")}>
                          {s.rowsError || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bảng đối soát */}
              {result.reconcile.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-ink">Đối soát với số của sổ ({result.reconcile.length} ô lệch)</h4>
                  <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-border">
                    {result.reconcile.map((r, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-1.5 text-xs last:border-0",
                          r.kind === "MISMATCH" ? "bg-red-50/60" : "bg-amber-50/40"
                        )}
                      >
                        <span className="font-medium">{r.itemCode}</span>
                        <span className="text-muted-foreground">
                          {r.periodKey} · {r.field}
                        </span>
                        <span className="ml-auto tabular-nums">
                          tính {fmt(r.computed)} · sổ {fmt(r.sheetValue)} · lệch {fmt(r.delta)}
                        </span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                            r.kind === "MISMATCH" ? "bg-red-200 text-red-900" : "bg-amber-200 text-amber-900"
                          )}
                        >
                          {r.kind === "MISMATCH" ? "LỆCH THẬT" : "SỔ CỘNG TAY"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Danh sách vấn đề */}
              {result.issues.length > 0 && (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold text-ink">Chi tiết ({result.issues.length})</h4>
                    <div className="ml-auto flex gap-1">
                      {(["all", "error", "warning", "info"] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFilter(f)}
                          className={cn(
                            "rounded px-2 py-0.5 text-xs",
                            filter === f ? "bg-navy text-white" : "border border-border text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {f === "all" ? "Tất cả" : f === "error" ? "Lỗi" : f === "warning" ? "Cảnh báo" : "Ghi chú"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-border">
                    {issues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 border-b border-border/60 px-3 py-1.5 text-xs last:border-0">
                        {issue.severity === "error" ? (
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                        ) : issue.severity === "warning" ? (
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                        ) : (
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="shrink-0 font-medium">
                          {issue.sheet}
                          {issue.row ? ` · dòng ${issue.row}` : ""}
                        </span>
                        <span className="text-muted-foreground">{issue.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {committed && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Đã ghi xong: {committed}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {committed ? "Đóng" : "Hủy"}
          </Button>
          {!committed && (
            <Button onClick={() => void runCommit()} disabled={!result?.canCommit || !canCommit || busy}>
              {commit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {canCommit ? "Ghi vào cơ sở dữ liệu" : "Cần quyền cao hơn để ghi"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="block text-lg font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}
