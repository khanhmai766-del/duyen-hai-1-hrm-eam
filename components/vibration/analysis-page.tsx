"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useAnalysisDataset } from "@/hooks/useVibrationAnalysis";
import { AnalysisDeviceTab } from "./analysis-device";
import { AnalysisExternalIsoTab } from "./analysis-external-iso";
import { AnalysisExternalWowkTab } from "./analysis-external-wowk";
import { AnalysisMethodTab } from "./analysis-method";
import { AnalysisQualityTab } from "./analysis-quality";
import { AnalysisSavedTab } from "./analysis-saved";
import { EMPTY_SEL, MethodSwitcher, type CatalogueSel } from "./analysis-shared";
import { AnalysisSummaryTab } from "./analysis-summary";
import { AnalysisWowkDeviceTab } from "./analysis-wowk-device";

type TabKey = "summary" | "device" | "external" | "saved" | "quality" | "method";
type Method = "iso" | "wowk";
const TABS: [TabKey, string][] = [["summary", "Tổng hợp ưu tiên"], ["device", "Thiết bị trong danh mục"], ["external", "Thiết bị ngoài danh mục"], ["saved", "Phiếu đã lưu"], ["quality", "Chất lượng số liệu"], ["method", "Phương pháp & tiêu chuẩn"]];
// analysis-hub.js / external-*.js: khoá bản nháp trong trình duyệt
const DRAFT_KEYS: Record<Method, string> = { iso: "vibra-external-analysis-draft-v1", wowk: "vibra-external-wowk-v1" };
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

function loadDraft(m: Method): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(DRAFT_KEYS[m]);
    if (raw) return JSON.parse(raw);
  } catch { /* trình duyệt chặn lưu trữ */ }
  return m === "iso" ? { date: today(), meterValue: "rms", condition: "stable" } : { date: today() };
}

/** Trang "Phân tích độ rung" (menu Theo dõi & phân tích). Port từ vibration-analysis.js (analysisPage) + analysis-hub.js. */
export function AnalysisPage() {
  const params = useSearchParams();
  const [archived, setArchived] = React.useState(() => params.get("archived") === "1");
  const { data, isLoading, error } = useAnalysisDataset("rotating", archived);
  const [tab, setTab] = React.useState<TabKey>(() => (params.get("tab") === "device" && params.get("device") ? "device" : "summary"));
  const [method, setMethodState] = React.useState<Method>("iso");
  const [savedCount, setSavedCount] = React.useState(0);
  const [sel, setSel] = React.useState<CatalogueSel>(() => ({ ...EMPTY_SEL, deviceId: params.get("device") ?? "", date: params.get("date") ?? "" }));
  const [drafts, setDrafts] = React.useState<Record<Method, Record<string, unknown>>>({ iso: { date: today(), meterValue: "rms", condition: "stable" }, wowk: { date: today() } });

  React.useEffect(() => {
    try {
      const m = localStorage.getItem("vc-analysis-method");
      if (m === "wowk") setMethodState("wowk");
    } catch { /* bỏ qua */ }
    setDrafts({ iso: loadDraft("iso"), wowk: loadDraft("wowk") });
  }, []);
  // Liên kết sâu ?tab=device&device=<id>[&date=][&archived=1]: theo cả khi bấm Link ngay trên trang này.
  const key = params.toString();
  const appliedKey = React.useRef(key);
  React.useEffect(() => {
    if (appliedKey.current === key) return;
    appliedKey.current = key;
    const id = params.get("device");
    if (!id) return;
    if (params.get("archived") === "1") setArchived(true);
    setSel({ ...EMPTY_SEL, deviceId: id, date: params.get("date") ?? "" });
    setTab("device");
    window.scrollTo(0, 0);
  }, [key, params]);
  // Điền sẵn cương vị / hệ thống của thiết bị được chọn (như web cũ: analysisArea = d.area).
  const devices = data?.devices;
  React.useEffect(() => {
    if (!devices || !sel.deviceId || sel.area) return;
    const want = sel.deviceId;
    const d = devices.find((x) => x.id === want) ?? devices.find((x) => x.legacyId === want);
    if (d) setSel((s) => (s.deviceId === want && !s.area ? { ...s, deviceId: d.id, area: d.area, system: d.system } : s));
  }, [devices, sel.deviceId, sel.area]);
  const setMethod = (m: Method) => {
    setMethodState(m);
    try { localStorage.setItem("vc-analysis-method", m); } catch { /* bỏ qua */ }
  };
  const setDraft = React.useCallback((m: Method, v: Record<string, unknown>) => {
    setDrafts((d) => ({ ...d, [m]: v }));
    try { localStorage.setItem(DRAFT_KEYS[m], JSON.stringify(v)); } catch { /* bỏ qua */ }
  }, []);

  const editSaved = (m: Method, form: Record<string, unknown>) => { setDraft(m, form); setMethod(m); setTab("external"); window.scrollTo(0, 0); };

  if (isLoading) return <><div className="page-title-row"><h1 id="title">Phân tích độ rung</h1></div><p className="an-foot">Đang tải số liệu phân tích…</p></>;
  if (error || !data) return <><div className="page-title-row"><h1 id="title">Phân tích độ rung</h1></div><p className="an-warn">Không tải được số liệu phân tích: {(error as Error)?.message ?? "lỗi không xác định"}</p></>;
  const props = { devices: data.devices, settings: data.settings, archived, setArchived };
  const methodSwitch = <MethodSwitcher method={method} onChange={setMethod} />;

  return (
    <>
      <div className="page-title-row"><h1 id="title">Phân tích độ rung</h1></div>
      <div id="content">
        <div className="view-switch an-tabs" role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} type="button" role="tab" data-an-tab={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{k === "saved" ? `${l} · ${savedCount}` : l}</button>
          ))}
        </div>
        <div className="analysis-body">
          {tab === "summary" && <AnalysisSummaryTab {...props} />}
          {tab === "device" && (method === "wowk"
            ? <AnalysisWowkDeviceTab {...props} sel={sel} setSel={setSel} methodSwitch={methodSwitch} />
            : <AnalysisDeviceTab {...props} sel={sel} setSel={setSel} methodSwitch={methodSwitch} />)}
          {tab === "external" && (
            <>
              {methodSwitch}
              {method === "wowk"
                ? <AnalysisExternalWowkTab draft={drafts.wowk} setDraft={(v) => setDraft("wowk", v)} />
                : <AnalysisExternalIsoTab draft={drafts.iso} setDraft={(v) => setDraft("iso", v)} />}
            </>
          )}
          {tab === "saved" && <AnalysisSavedTab onEdit={editSaved} onCount={setSavedCount} />}
          {tab === "quality" && <AnalysisQualityTab {...props} />}
          {tab === "method" && <AnalysisMethodTab {...props} />}
        </div>
      </div>
    </>
  );
}
