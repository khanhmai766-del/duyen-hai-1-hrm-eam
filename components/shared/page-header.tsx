export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 rounded-2xl border border-border/80 bg-card/90 p-1.5 shadow-[0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur">
          {children}
        </div>
      )}
    </div>
  );
}
