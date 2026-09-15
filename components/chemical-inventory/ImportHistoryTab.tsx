"use client";

import { useState } from "react";
import { AlertTriangle, FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useChemicalImportHistory, useDeleteChemicalImportBatch, type ImportBatch } from "@/hooks/useChemicalInventory";

const formatTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });

/**
 * Tab "Lịch sử đồng bộ": các lần nhập workbook đã chạy.
 *
 * Cho xóa từng dòng để giảm dung lượng — mỗi dòng mang theo bảng đối soát chi tiết. Xóa chỉ bỏ
 * NHẬT KÝ; phiếu nhập, số đọc tồn đã ghi vào hệ thống giữ nguyên (xem API history/[id]). Tab này
 * vốn chỉ hiện cho mức quản lý trở lên, trùng mức quyền xóa nên không cần ẩn nút theo quyền nữa.
 */
export function ImportHistoryTab() {
  const { data, isLoading, isError, refetch } = useChemicalImportHistory();
  const deleteBatch = useDeleteChemicalImportBatch();
  const [confirmBatch, setConfirmBatch] = useState<ImportBatch | null>(null);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Không tải được lịch sử"
        action={{ label: "Thử lại", onClick: () => void refetch() }}
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="Chưa có lần nhập nào"
        description="Dùng nút “Nhập từ Excel” ở đầu trang để đưa dữ liệu từ sổ vào hệ thống."
      />
    );
  }

  async function handleDelete() {
    if (!confirmBatch) return;
    try {
      await deleteBatch.mutateAsync(confirmBatch.id);
      toast.success("Đã xóa lịch sử đồng bộ");
      setConfirmBatch(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xóa được lịch sử đồng bộ");
    }
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left font-semibold">Thời điểm</th>
              <th className="px-3 py-2 text-left font-semibold">Tệp</th>
              <th className="px-3 py-2 text-left font-semibold">Trạng thái</th>
              <th className="px-3 py-2 text-right font-semibold">Ghi mới</th>
              <th className="px-3 py-2 text-right font-semibold">Cập nhật</th>
              <th className="px-3 py-2 text-right font-semibold">Bỏ qua</th>
              <th className="px-3 py-2 text-right font-semibold">Lỗi</th>
              <th className="w-20 px-3 py-2 text-center font-semibold">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {data.map((batch) => (
              <tr key={batch.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatTime(batch.createdAt)}</td>
                <td className="px-3 py-2">
                  <span className="block max-w-[280px] truncate" title={batch.fileName}>
                    {batch.fileName}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{batch.fileHash}</span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                      batch.status === "COMMITTED"
                        ? "bg-emerald-100 text-emerald-800"
                        : batch.status === "FAILED"
                          ? "bg-red-100 text-red-800"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {batch.status === "COMMITTED" ? "Đã ghi" : batch.status === "FAILED" ? "Thất bại" : "Xem trước"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{batch.importedRows}</td>
                <td className="px-3 py-2 text-right tabular-nums">{batch.updatedRows}</td>
                <td className="px-3 py-2 text-right tabular-nums">{batch.skippedRows}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", batch.errorRows > 0 && "font-semibold text-red-700")}>
                  {batch.errorRows}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => setConfirmBatch(batch)}
                    disabled={deleteBatch.isPending}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    aria-label={`Xóa lịch sử đồng bộ tệp ${batch.fileName} lúc ${formatTime(batch.createdAt)}`}
                    title="Xóa lịch sử đồng bộ"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(confirmBatch)}
        // Đang xóa thì không cho đóng giữa chừng — đóng rồi mà lỗi thì người dùng không thấy thông báo.
        onOpenChange={(open) => !open && !deleteBatch.isPending && setConfirmBatch(null)}
        title="Xóa lịch sử đồng bộ?"
        description={
          confirmBatch
            ? `Xóa lần đồng bộ tệp “${confirmBatch.fileName}” lúc ${formatTime(confirmBatch.createdAt)}. ` +
              "Chỉ xóa bản ghi lịch sử và bảng đối soát chi tiết để giảm dung lượng — số liệu tồn kho, " +
              "phiếu nhập đã ghi vào hệ thống vẫn giữ nguyên. Thao tác này không hoàn tác được."
            : undefined
        }
        confirmLabel="Xóa lịch sử"
        loading={deleteBatch.isPending}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
