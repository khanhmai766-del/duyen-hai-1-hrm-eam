import { requireUser } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { VIBRATION_MANAGE_LEVELS, VIBRATION_VIEW_LEVELS } from "@/lib/vibration-permissions";

/** Chặn trang "Nhập thông số độ rung" theo quyền khi gõ thẳng URL (menu đã ẩn mục). `manage` = cần vibration-manage. */
export async function VibrationAccessGate({ label, manage = false, children }: { label: string; manage?: boolean; children: React.ReactNode }) {
  const user = await requireUser();
  const allowed =
    (await hasPermissionLevel(user, "vibration-view", [...VIBRATION_VIEW_LEVELS])) &&
    (!manage || (await hasPermissionLevel(user, "vibration-manage", [...VIBRATION_MANAGE_LEVELS])));
  if (!allowed) {
    return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">Bạn không có quyền truy cập {label}.</p>;
  }
  return <>{children}</>;
}

/** Trang tạm cho tới khi màn nhập được xây (đợt 2). */
export function VibrationPlaceholder({ title }: { title: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">Đang xây dựng.</p>
    </div>
  );
}
