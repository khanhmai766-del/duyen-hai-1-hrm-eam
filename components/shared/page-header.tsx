import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  children,
  stacked = false,
  mobileTitle,
  hideDescriptionOnMobile = false,
  mobileInline = false,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  /** Luôn đặt thanh công cụ ở hàng riêng khi trang có nhiều thao tác. */
  stacked?: boolean;
  /** Tiêu đề rút gọn chỉ dùng trên mobile; desktop vẫn hiện title đầy đủ. */
  mobileTitle?: string;
  /** Ẩn riêng mô tả trên mobile, vẫn hiển thị từ breakpoint sm. */
  hideDescriptionOnMobile?: boolean;
  /** Đặt tiêu đề rút gọn và nhóm thao tác trên cùng một hàng ở mobile. */
  mobileInline?: boolean;
}) {
  return (
    <div className={cn(
      stacked
        ? "flex flex-col gap-4"
        : mobileInline
          ? "flex items-center justify-between gap-2 sm:items-start"
          : "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
    )}>
      <div className={cn("min-w-0", mobileInline && "flex-1 sm:shrink")}>
        <h1 className={mobileTitle ? "hidden text-2xl font-bold tracking-tight text-ink sm:block" : "text-2xl font-bold tracking-tight text-ink"}>{title}</h1>
        {mobileTitle && <h1 className={cn("font-bold tracking-tight text-ink sm:hidden", mobileInline ? "truncate whitespace-nowrap text-xl min-[380px]:text-2xl" : "text-2xl")}>{mobileTitle}</h1>}
        {description && (
          <p className={hideDescriptionOnMobile ? "mt-1 hidden text-sm text-muted-foreground sm:block" : "mt-1 text-sm text-muted-foreground"}>
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className={cn(
          stacked
            ? "flex w-full flex-wrap items-center gap-2.5"
            : mobileInline
              ? "flex shrink-0 items-center justify-end gap-1.5 sm:flex-none sm:flex-wrap sm:gap-2.5"
              : "flex shrink-0 flex-wrap items-center justify-end gap-2.5"
        )}>
          {children}
        </div>
      )}
    </div>
  );
}
