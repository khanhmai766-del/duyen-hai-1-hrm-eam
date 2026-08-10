"use client";

import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type PositionScopeMeta = { all: boolean; labels: string[] };

/**
 * Nhãn "Đang xem theo cương vị: …" cho các màn hình bị rào theo cương vị
 * (Khiếm khuyết, Lịch sử sửa chữa, Danh mục vật tư, Lịch thay thế).
 *
 * Có nó thì người kiêm nhiệm mở trang lên, thấy danh sách ngắn hơn hôm qua, biết ngay
 * là do đang trực cương vị nào chứ không tưởng mất dữ liệu. Người xem toàn bộ không
 * thấy gì thêm — `scope.all` thì không render, tránh thêm chữ thừa lên màn hình.
 *
 * PCCC KHÔNG dùng component này: trang đó phải hiện cả phạm vi sửa/ký nên có nhãn riêng
 * hai dòng (components/pccc/PcccPage.tsx).
 */
export function PositionScopeChip({
  scope,
  className,
}: {
  scope?: PositionScopeMeta;
  className?: string;
}) {
  if (!scope || scope.all) return null;
  const label = scope.labels.length ? scope.labels.join(" · ") : "Chưa gán cương vị";
  return (
    <span
      title="Danh sách chỉ hiển thị dữ liệu thuộc cương vị bạn đang trực (và cương vị cấp dưới). Đổi cương vị đang làm việc ở trang Tài khoản."
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700",
        className
      )}
    >
      <ShieldCheck className="size-3.5 shrink-0" />
      <span>Đang xem theo cương vị: {label}</span>
    </span>
  );
}
