"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/ctktkt/components/ui/dialog";
import type { MissingDataItem } from "@/modules/ctktkt/components/missing-data-alert";

type ExportMissingDialogProps = {
  open: boolean;
  items: MissingDataItem[];
  title: string;
  onClose: () => void;
  onItemClick?: (item: MissingDataItem) => void;
  onFillMissing: () => void;
  onExportAnyway: () => void;
};

export function ExportMissingDialog({
  open,
  items,
  title,
  onClose,
  onItemClick,
  onFillMissing,
  onExportAnyway,
}: ExportMissingDialogProps) {
  const visibleItems = items.slice(0, 60);

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-amber-950">Còn dữ liệu chưa nhập đầy đủ</DialogTitle>
          <DialogDescription>
            {title} còn {items.length} ô/trường cần kiểm tra. Ô mặc định, liên kết và tự tính không nằm trong danh sách này.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[48dvh] overflow-auto rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <ul className="space-y-1 text-sm text-slate-800">
            {visibleItems.map(item => (
              <li key={item.key} className="leading-5">
                {item.group ? <span className="font-semibold">{item.group}: </span> : null}
                {onItemClick ? (
                  <button
                    type="button"
                    onClick={() => onItemClick(item)}
                    className="text-left text-slate-800 underline decoration-amber-400 underline-offset-2 hover:text-amber-900 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700"
                  >
                    {item.label}
                  </button>
                ) : item.label}
              </li>
            ))}
          </ul>
          {items.length > visibleItems.length && (
            <p className="mt-2 text-xs font-medium text-slate-500">
              Còn {items.length - visibleItems.length} ô/trường khác chưa hiển thị trong danh sách này.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:flex-row sm:justify-between">
          <button type="button" onClick={onFillMissing} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Nhập ô còn thiếu
          </button>
          <button type="button" onClick={onExportAnyway} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white hover:bg-amber-800">
            Vẫn xuất file
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
