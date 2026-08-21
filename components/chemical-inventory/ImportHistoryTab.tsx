"use client";

import { AlertTriangle, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useChemicalImportHistory } from "@/hooks/useChemicalInventory";

/** Tab "Lịch sử đồng bộ": các lần nhập workbook đã chạy. */
export function ImportHistoryTab() {
  const { data, isLoading, isError, refetch } = useChemicalImportHistory();

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

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 text-left font-semibold">Thời điểm</th>
            <th className="px-3 py-2 text-left font-semibold">Tệp</th>
            <th className="px-3 py-2 text-left font-semibold">Trạng thái</th>
            <th className="px-3 py-2 text-right font-semibold">Ghi mới</th>
            <th className="px-3 py-2 text-right font-semibold">Cập nhật</th>
            <th className="px-3 py-2 text-right font-semibold">Bỏ qua</th>
            <th className="px-3 py-2 text-right font-semibold">Lỗi</th>
          </tr>
        </thead>
        <tbody>
          {data.map((batch) => (
            <tr key={batch.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                {new Date(batch.createdAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
              </td>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
