"use client";

import * as React from "react";
import { useDeleteReport, useSavedReports, type SavedReportDto } from "@/hooks/useVibrationAnalysis";
import { externalAnalyze, ewAnalyze } from "@/lib/vibration/analysis/external";
import { PrintStyle, printReport } from "./analysis-external-fields";
import { MethodsCompare } from "./analysis-external-guides";
import { ExternalIsoReport } from "./analysis-external-report";
import { WowkReport } from "./analysis-wowk-report";
import { LevelBadge } from "./analysis-shared";

const methodLabel = (m: string) => (m === "wowk" ? "Tài liệu Wowk" : "ISO 20816-3");

/** Phiếu được lập lại từ SỐ LIỆU NHẬP đã lưu bằng chính mã phân tích (analysis-hub.js:savedReportHtml). */
function SavedReport({ x }: { x: SavedReportDto }) {
  let result: unknown = null;
  let error = "";
  try {
    result = x.method === "wowk" ? ewAnalyze(structuredClone(x.data)) : externalAnalyze(structuredClone(x.data));
  } catch (e) {
    error = (e as Error).message;
  }
  if (error) return <p className="an-warn">Không lập lại được báo cáo từ số liệu đã lưu: {error}</p>;
  return x.method === "wowk" ? <WowkReport result={result} /> : <ExternalIsoReport result={result} />;
}

/** Tab "Phiếu đã lưu": phiếu ngoài danh mục (ISO & Wowk). Chỉ lưu số liệu nhập + kết luận lúc lưu. */
export function AnalysisSavedTab({ onEdit, onCount }: { onEdit: (method: "iso" | "wowk", data: Record<string, unknown>) => void; onCount?: (n: number) => void }) {
  const { data, isLoading, error } = useSavedReports();
  const del = useDeleteReport();
  const [filter, setFilter] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const q = search.toLocaleLowerCase("vi");
  const all = React.useMemo(() => data ?? [], [data]);
  React.useEffect(() => { if (data) onCount?.(data.length); }, [data, onCount]);
  const list = all.filter((x) => (!filter || x.method === filter) && (!q || `${x.name} ${x.location} ${x.person} ${x.savedBy}`.toLocaleLowerCase("vi").includes(q)));
  const opened = all.find((x) => x.id === open);

  const remove = async (x: SavedReportDto) => {
    if (!window.confirm(`Xoá phiếu "${x.name}" (${methodLabel(x.method)}, ${x.date})? Không khôi phục được.`)) return;
    try { await del.mutateAsync(x.id); if (open === x.id) setOpen(""); setMsg("Đã xoá phiếu."); } catch (e) { setMsg((e as Error).message); }
  };
  const edit = (x: SavedReportDto) => {
    if (window.confirm("Mở phiếu này để sửa? Bản nháp hiện tại của phương pháp " + methodLabel(x.method) + " sẽ bị thay thế.")) onEdit(x.method, structuredClone(x.data));
  };

  return (
    <>
      <PrintStyle />
      <section className="an-sec hub-saved">
        <h3>Phiếu phân tích thiết bị ngoài danh mục đã lưu</h3>
        <p className="an-foot">Mỗi phiếu lưu <b>số liệu nhập</b> và <b>kết luận tại thời điểm lưu</b>. Khi bấm Xem, báo cáo được lập lại từ số liệu đó bằng phương pháp hiện hành — nếu bảng ngưỡng đã cập nhật, kết luận mới có thể khác cột “Kết luận lúc lưu”. Phiếu không thêm thiết bị vào danh mục và không đưa vào lịch sử đo.</p>
        <div className="table-toolbar">
          <select id="savedFilter" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Cả 2 phương pháp</option><option value="iso">ISO 20816-3</option><option value="wowk">Tài liệu Wowk</option>
          </select>
          <input id="savedSearch" placeholder="Tìm theo thiết bị, vị trí, người đo, người lưu" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {msg && <p role="status" className="an-foot">{msg}</p>}
        {isLoading ? <p className="an-foot">Đang tải…</p> : error ? <p className="an-warn">{(error as Error).message}</p> : list.length ? (
          <div className="an-table-wrap">
            <table className="an-table hub-table">
              <thead><tr><th>Ngày đo</th><th>Thiết bị · vị trí</th><th>Phương pháp</th><th>Kết luận lúc lưu</th><th>Người đo</th><th>Người lưu</th><th></th></tr></thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.id} aria-current={x.id === open ? "true" : undefined}>
                    <td>{x.date}</td>
                    <th>{x.name}<small>{x.location}</small></th>
                    <td><span className="hub-method" data-method={x.method}>{methodLabel(x.method)}</span><small>{x.standard}</small></td>
                    <td><LevelBadge level={x.level} /><small>{x.conclusion}</small></td>
                    <td>{x.person || "—"}</td>
                    <td>{x.savedBy}<small>{new Date(x.savedAt).toLocaleString("vi-VN")}</small></td>
                    <td className="hub-actions">
                      <button type="button" className="secondary-button" onClick={() => setOpen(open === x.id ? "" : x.id)}>{x.id === open ? "Đang xem" : "Xem"}</button>
                      <button type="button" className="secondary-button" onClick={() => edit(x)}>Mở lại để sửa</button>
                      <button type="button" className="secondary-button" onClick={() => remove(x)} disabled={del.isPending}>Xoá</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="external-empty">Chưa có phiếu nào{filter || search ? " khớp bộ lọc" : ""}. Lập phiếu ở tab “Thiết bị ngoài danh mục” (chọn phương pháp ISO hoặc Wowk) rồi bấm “Lưu phiếu vào dữ liệu”.</p>}
      </section>
      {opened && (
        <section className="an-sec">
          <div className="hub-open-head"><h3>{opened.name} · {methodLabel(opened.method)} · {opened.date}</h3><button type="button" className="secondary-button" id="savedPrint" onClick={printReport}>In / lưu PDF</button></div>
          <p className="an-foot">Kết luận lúc lưu: <b>{opened.conclusion}</b> · {opened.standard} · {opened.confidence || ""} · {opened.issues || 0} điểm cần xác minh.</p>
          <div id="savedReport"><SavedReport x={opened} /></div>
        </section>
      )}
      <MethodsCompare />
    </>
  );
}
