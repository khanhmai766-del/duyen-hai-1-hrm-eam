"use client";
// Hộp thoại XÁC NHẬN KÝ dùng chung cho cả ba bảng.
//
// Ký để lại dấu vết trong hồ sơ (chữ ký + người kiểm tra + ngày kiểm tra) nên không bao
// giờ được ký ngay khi bấm: phải nói trước ký cái gì, ký thay mặt cương vị nào, và ghi
// tên ai vào. Tab Bình/Tủ chữa cháy ký theo cương vị (hàng loạt), tab Foam·CO2·Diesel ký
// từng bồn/bảng — khác nhau ở nội dung, giống nhau ở khuôn.
import { AlertTriangle, ExternalLink, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Đường dẫn sang trang thêm chữ ký số. Giữ khớp với PCCC_SIGNATURE_SETUP_URL phía server. */
export const SIGNATURE_SETUP_URL = "/account";

export function SignInfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right", strong ? "text-[15px] font-bold text-ink" : "font-medium text-ink")}>{value}</span>
    </div>
  );
}

/**
 * Lời nhắc khi tài khoản chưa có chữ ký số. Chữ ký trong hồ sơ PCCC là ẢNH chữ ký thật,
 * nên thiếu nó thì không ký được — chỉ thẳng đường sang chỗ thêm thay vì bắt người dùng
 * tự mò trong menu tài khoản.
 */
export function SignatureMissingNotice({ setupUrl = SIGNATURE_SETUP_URL }: { setupUrl?: string }) {
  return (
    <div className="space-y-3 py-1 text-[13px]">
      <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="font-semibold text-amber-900">Tài khoản của bạn chưa có chữ ký số</p>
          <p className="mt-0.5 text-[12px] text-amber-800">
            Chữ ký trong hồ sơ PCCC là ảnh chữ ký số của bạn, không phải chỉ ghi tên. Hãy thêm chữ ký một lần, sau đó
            quay lại đây ký bình thường.
          </p>
        </div>
      </div>
      <a
        href={setupUrl}
        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5 hover:border-accent/40 hover:bg-slate-50"
      >
        <span className="min-w-0">
          <span className="block font-semibold text-ink">Thêm chữ ký số</span>
          <span className="block text-[11px] text-muted-foreground">Tài khoản → mục “Chữ ký số”</span>
        </span>
        <ExternalLink className="size-4 shrink-0 text-slate-400" />
      </a>
    </div>
  );
}

/** Hộp thoại xác nhận ký MỘT mục tiêu (một bồn, một bảng FM200). */
export function PcccSignConfirmDialog({
  open,
  onClose,
  title,
  rows,
  hasSignature,
  signatureUrl,
  pending,
  onConfirm,
  note,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  rows: { label: string; value: string; strong?: boolean }[];
  hasSignature: boolean;
  signatureUrl?: string | null;
  pending?: boolean;
  onConfirm: () => void;
  note?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="size-5 text-emerald-600" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {!hasSignature ? (
          <SignatureMissingNotice />
        ) : (
          <div className="space-y-3 py-1 text-[13px]">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              {rows.map((r) => (
                <SignInfoRow key={r.label} label={r.label} value={r.value} strong={r.strong} />
              ))}
            </div>
            {signatureUrl && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- ảnh chữ ký phục vụ qua proxy S3 */}
                <img src={signatureUrl} alt="Chữ ký của bạn" className="h-10 w-auto max-w-[140px] object-contain" />
                <span className="text-[12px] text-emerald-800">Chữ ký số sẽ được đóng vào mục này.</span>
              </div>
            )}
            {note && <p className="text-[12px] text-muted-foreground">{note}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Huỷ
          </Button>
          {hasSignature && (
            <Button size="sm" onClick={onConfirm} disabled={pending}>
              <PenLine className={cn("mr-1.5 size-4", pending && "animate-pulse")} />
              {pending ? "Đang ký…" : "Xác nhận ký"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
