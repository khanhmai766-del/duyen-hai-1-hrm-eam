"use client";

import { Wrench, PackageX, AlertTriangle, type LucideIcon } from "lucide-react";
import { useRepairLogs } from "@/hooks/useRepair";
import { useMaterials } from "@/hooks/useMaterials";
import { useDevices } from "@/hooks/useDevices";

export interface Notice {
  id: string;
  icon: LucideIcon;
  tone: "red" | "amber" | "blue";
  title: string;
  desc: string;
  href: string;
  date?: string;
}

/**
 * Builds the operational alert feed (open repairs, low/empty materials, faulty
 * devices) shared by the notifications page and the topbar bell popup.
 */
export function useNotifications() {
  const repairs = useRepairLogs({});
  const materials = useMaterials();
  const devices = useDevices({ status: "FAULT" });

  const loading = repairs.isLoading || materials.isLoading || devices.isLoading;

  const notices: Notice[] = [];

  (repairs.data?.data ?? [])
    .filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS")
    .forEach((r) =>
      notices.push({
        id: "rep-" + r.id,
        icon: Wrench,
        tone: r.priority === "CRITICAL" || r.priority === "HIGH" ? "red" : "blue",
        title: `Phiếu sửa chữa đang mở: ${r.title}`,
        desc: `${r.device.code} · ${r.device.name}`,
        href: "/repair-history",
        date: r.startedAt as unknown as string,
      })
    );

  (materials.data?.data ?? [])
    .filter((m) => m.quantity <= m.minStock)
    .forEach((m) =>
      notices.push({
        id: "mat-" + m.id,
        icon: PackageX,
        tone: m.quantity === 0 ? "red" : "amber",
        title: `Vật tư ${m.quantity === 0 ? "đã hết" : "sắp hết"}: ${m.name}`,
        desc: `Tồn ${m.quantity} / tối thiểu ${m.minStock} ${m.unit}`,
        href: "/materials",
      })
    );

  (devices.data?.data ?? []).forEach((d) =>
    notices.push({
      id: "dev-" + d.id,
      icon: AlertTriangle,
      tone: "red",
      title: `Thiết bị sự cố: ${d.name}`,
      desc: `${d.code} · ${d.location}`,
      href: `/devices/${d.id}`,
    })
  );

  return { notices, loading };
}

export const NOTICE_TONE = {
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-accent",
} as const;
