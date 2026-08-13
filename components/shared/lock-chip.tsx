import { cn } from "@/lib/utils";

/**
 * Trạng thái chốt lịch sử. CHỈ HIỂN THỊ — bản mẫu vẽ dạng công tắc bấm được,
 * nhưng việc chốt do hệ thống tự làm khi tới hạn finalizeAt, người dùng không
 * bật/tắt được, nên không dựng thành nút để khỏi hứa hẹn thao tác không có.
 *
 * Dùng chung cho Lịch sử sửa chữa và Lịch sử thay thế vật tư — cùng một khái
 * niệm "chờ chốt / đã chốt" thì phải trông giống hệt nhau ở cả hai nơi.
 */
export function LockChip({ pending }: { pending: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center overflow-hidden rounded-md border",
        pending ? "border-border" : "border-emerald-600"
      )}
      title={pending ? "Đang chờ tới hạn chốt lịch sử" : "Bản ghi đã chốt"}
    >
      {pending && <span className="h-full w-3 self-stretch bg-amber-500" aria-hidden="true" />}
      <span
        className={cn(
          // whitespace-nowrap: cột hẹp thì "Chờ chốt" bị bẻ làm đôi, nhìn như hai thẻ chồng nhau.
          "whitespace-nowrap px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wider",
          pending ? "bg-white text-muted-foreground" : "bg-emerald-600 text-white"
        )}
      >
        {pending ? "Chờ chốt" : "Đã chốt"}
      </span>
      {!pending && <span className="h-full w-3 self-stretch bg-white" aria-hidden="true" />}
    </span>
  );
}
