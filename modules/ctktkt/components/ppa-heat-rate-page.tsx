"use client";

import { PpaHeaderTools } from "./ppa-header-tools";
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
  const tabs = <div className="ppa-tabs" role="group" aria-label="Chức năng suất hao nhiệt">
    {TABS.map(item => <button key={item.key} type="button" onClick={() => setTab(item.key)} aria-pressed={tab === item.key}>{item.label}</button>)}
  </div>;
  return <div className="module-report ppa-workspace space-y-3">
    <PpaHeaderTools />
    {/* Tab "So sánh trực quan" gộp hàng tab với thanh điều khiển của nó; các tab khác chỉ có hàng tab trong cùng khối nền tối. */}
    {tab === "dashboard" ? <PpaHeatRateDashboard tabs={tabs}/> : <>
      <div className="ppa-command-bar">{tabs}</div>
      {tab === "input" ? <PpaHeatRateComparison/> : tab === "bulk" ? <PpaHeatRateBulkImport/> : <PpaStandardLineReference/>}
    </>}
  </div>;
}
