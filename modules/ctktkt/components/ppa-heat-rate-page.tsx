"use client";

import { useState } from "react";
import { PpaHeatRateBulkImport } from "@/modules/ctktkt/components/ppa-heat-rate-bulk-import";
import { PpaHeatRateComparison } from "@/modules/ctktkt/components/ppa-heat-rate-comparison";
import { PpaHeatRateDashboard } from "@/modules/ctktkt/components/ppa-heat-rate-dashboard";
import { PpaStandardLineReference } from "@/modules/ctktkt/components/ppa-standard-line-reference";

type Tab = "dashboard" | "input" | "bulk" | "reference";

const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "So sánh trực quan" },
  { key: "input", label: "Nhập & đồng bộ dữ liệu ngày" },
  { key: "bulk", label: "Nhập nhiều ngày từ Excel" },
  { key: "reference", label: "Tham khảo Standard Line" },
];

export function PpaHeatRatePageClient() {
  const [tab, setTab] = useState<Tab>("dashboard");
  return <div className="module-report ppa-workspace space-y-3">
    <div className="module-page-tabs flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
      {TABS.map(item => <button key={item.key} type="button" onClick={() => setTab(item.key)} aria-pressed={tab === item.key} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === item.key ? "bg-gradient-to-r from-[#4057b5] to-[#438ec1] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>{item.label}</button>)}
    </div>
    {tab === "dashboard" ? <PpaHeatRateDashboard/> : tab === "input" ? <PpaHeatRateComparison/> : tab === "bulk" ? <PpaHeatRateBulkImport/> : <PpaStandardLineReference/>}
  </div>;
}
