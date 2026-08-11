export function PageHeader({
  title,
  description,
  children,
  stacked = false,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  /** Luôn đặt thanh công cụ ở hàng riêng khi trang có nhiều thao tác. */
  stacked?: boolean;
}) {
  return (
    <div className={stacked ? "flex flex-col gap-4" : "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && (
        <div className={stacked ? "flex w-full flex-wrap items-center gap-2.5" : "flex shrink-0 flex-wrap items-center justify-end gap-2.5"}>
          {children}
        </div>
      )}
    </div>
  );
}
