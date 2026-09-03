"use client";
// Hộp thoại XÁC NHẬN KÝ sổ TBYCNN.
//
// Số liệu lấy từ SERVER (bản xem trước), không đoán ở client: người bấm phải thấy đúng
// bao nhiêu dòng sắp bị ghi tên mình vào, bao nhiêu dòng đang ký đè lên chữ ký cũ, và
// phạm vi cương vị nào. Cùng khuôn với hộp thoại ký của PCCC.
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, PenLine } from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { TbycnnSignPreview } from "@/hooks/useTbycnn";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right", strong ? "text-[15px] font-bold text-ink" : "font-medium text-ink")}>{value}</span>
    </div>
  );
}

export function TbycnnSignDialog({
  open,
  onOpenChange,
  preview,
  loading,
  signing,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: TbycnnSignPreview | null;
  loading: boolean;
  signing: boolean;
  onConfirm: (targetIds: string[]) => void;
}) {
  /** Dòng đang tick; mặc định tick sẵn phần CHƯA ký — người ký ngày thứ hai chỉ việc ký nốt. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    if (!preview) return;
    setPicked(new Set(preview.rows.filter((r) => !r.signed).map((r) => r.id)));
    setShowList(false);
  }, [preview]);

  const total = preview?.total ?? 0;
  // Danh sách bị cắt bớt (kỳ quá lớn) thì không tick chọn được — ký toàn bộ phạm vi.
  const canPick = Boolean(preview && !preview.rowsTruncated);
  const willSign = canPick ? picked.size : total;
  const resign = preview ? preview.rows.filter((r) => r.signed && picked.has(r.id)).length : 0;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="size-5 text-emerald-600" />
            Ký xác nhận sổ TBYCNN
          </DialogTitle>
          <DialogDescription>
            Chữ ký số của bạn sẽ được đóng vào từng dòng đã chọn, kèm họ tên và ngày ký.
          </DialogDescription>
        </DialogHeader>

        {loading || !preview ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Đang tính phạm vi ký…
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-slate-50 p-3 text-sm">
              <Row label="Kỳ" value={preview.periodLabel} />
              <Row label="Phạm vi cương vị" value={preview.scopeLabel} />
              <Row label="Người ký" value={preview.signerName || "—"} />
              <Row label="Số dòng trong phạm vi" value={String(total)} />
              <Row label="Sẽ ký lượt này" value={String(willSign)} strong />
              {resign > 0 && <Row label="Trong đó ký đè chữ ký cũ" value={String(resign)} />}
            </div>

            {!preview.hasSignature && (
              <div className="flex gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <span>
                  Tài khoản của bạn chưa có chữ ký số nên chưa ký được. Vào{" "}
                  <Link href={preview.signatureSetupUrl} className="font-semibold underline">
                    trang Tài khoản
                  </Link>{" "}
                  → mục &quot;Chữ ký số&quot; để thêm rồi quay lại ký.
                </span>
              </div>
            )}

            {preview.rowsTruncated && (
              <p className="text-[12px] text-muted-foreground">
                Phạm vi quá lớn nên không bày danh sách để chọn riêng — lượt ký này áp cho toàn bộ {total} dòng.
                Hãy dùng Bộ lọc để thu hẹp nếu chỉ muốn ký một phần.
              </p>
            )}

            {canPick && total > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowList((v) => !v)}
                  className="text-[12px] font-semibold text-accent underline-offset-2 hover:underline"
                >
                  {showList ? "Ẩn danh sách" : `Xem và chọn riêng ${total} dòng`}
                </button>
                {showList && (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border">
                    {preview.rows.map((r) => (
                      <label
                        key={r.id}
                        className="flex cursor-pointer items-start gap-2.5 border-b border-slate-100 px-3 py-2 text-[12px] last:border-b-0 hover:bg-sky-50"
                      >
                        <Checkbox
                          checked={picked.has(r.id)}
                          onCheckedChange={() => toggle(r.id)}
                          className="mt-0.5"
                          aria-label={r.label}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{r.label}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {[r.code, r.cuongVi, r.machine === "COMMON" ? null : r.machine].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {r.signed && (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            đã ký
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={signing}>
            Huỷ
          </Button>
          <Button
            onClick={() => onConfirm(canPick ? [...picked] : [])}
            disabled={signing || loading || !preview?.hasSignature || willSign === 0}
          >
            {signing && <Loader2 className="mr-2 size-4 animate-spin" />}
            Ký {willSign} dòng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
