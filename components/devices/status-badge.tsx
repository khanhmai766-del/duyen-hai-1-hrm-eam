import { cn } from "@/lib/utils";
import {
  DEVICE_STATUS,
  REPAIR_STATUS,
  PRIORITY,
  ROLES,
  type DeviceStatusKey,
  type RepairStatusKey,
  type PriorityKey,
  type RoleKey,
} from "@/lib/constants";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = DEVICE_STATUS[status as DeviceStatusKey];
  if (!meta) return <span className="text-xs text-muted-foreground">{status}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", meta.badge, className)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
}

export function RepairStatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = REPAIR_STATUS[status as RepairStatusKey];
  if (!meta) return <span className="text-xs">{status}</span>;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", meta.badge, className)}>
      {meta.label}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const meta = PRIORITY[priority as PriorityKey];
  if (!meta) return <span className="text-xs">{priority}</span>;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", meta.badge, className)}>
      {meta.label}
    </span>
  );
}

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  const meta = ROLES[role as RoleKey];
  if (!meta) return <span className="text-xs">{role}</span>;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", meta.badge, className)}>
      {meta.label}
    </span>
  );
}
