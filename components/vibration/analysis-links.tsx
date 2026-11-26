import Link from "next/link";
import * as React from "react";
import { MILL_NAME_FILTER } from "@/lib/vibration/analysis";

/** Đường dẫn sâu tới Phân tích độ rung (web cũ: data-ov-device / data-analysis-device / data-ma-open). */
export const analysisHref = (deviceId: string, date?: string, archived?: boolean) =>
  `/devices/vibration/analysis?tab=device&device=${encodeURIComponent(deviceId)}${date ? `&date=${encodeURIComponent(date)}` : ""}${archived ? "&archived=1" : ""}`;
export const millAnalysisHref = (deviceId: string, date?: string) =>
  `/devices/vibration/mill-analysis?device=${encodeURIComponent(deviceId)}${date ? `&date=${encodeURIComponent(date)}` : ""}`;

/** Tên thiết bị bấm được (lớp mnk-an-link / mill-an-link + mũi tên ↗ như web cũ). */
export function DeviceAnalysisLink({ href, className = "mnk-an-link", title = "Mở Phân tích độ rung của thiết bị này", arrow = true, children }: {
  href: string; className?: string; title?: string; arrow?: boolean; children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} title={title}>
      {children}
      {arrow && <span className="mnk-an-ic" aria-hidden="true">↗</span>}
    </Link>
  );
}

/** Máy nghiền 1A–2F mở Phân tích MILL; thiết bị khác mở Phân tích độ rung (tab thiết bị trong danh mục). */
export const deviceAnalysisHref = (d: { id: string; name: string; active?: boolean }, date?: string) =>
  MILL_NAME_FILTER.test(d.name) ? millAnalysisHref(d.id, date) : analysisHref(d.id, date, d.active === false);
