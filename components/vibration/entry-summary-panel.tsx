"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useVibrationAccess } from "@/hooks/useVibrationAccess";
import { apiGet } from "@/lib/fetcher";
import { MEASURE_GROUPS } from "@/lib/vibration/constants";
import { groupDueDate, MNK_SHIFT_GROUP, type EntrySummary, type SummaryRow } from "@/lib/vibration/entry-summary";
import { vnToday } from "@/lib/vibration/parse";
import { EntryDateBar } from "./entry-date-bar";
import "./entry-summary.css";

const OPEN_KEY = "vc-entry-summary-open";
const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export interface SummaryJump { area: string; group: string; date: string }

/** Ô tổng hợp tiến độ nhập cho TKLM, TKĐ, Trưởng ca, KTV… (và quản trị): cương vị nhập đủ, thiết bị đã / chưa nhập theo kỳ đo. */
export function EntrySummaryPanel({ onJump }: { onJump: (j: SummaryJump) => void }) {
  const { access } = useVibrationAccess();
  // Chỉ dựng sau khi quyền đã tải (client) nên đọc localStorage ngay ở khởi tạo là an toàn với hydration.
  const [open, setOpen] = React.useState(() => {
    try { return localStorage.getItem(OPEN_KEY) !== "0"; } catch { return true; }
  });
  const [date, setDate] = React.useState(() => vnToday());
  const [group, setGroup] = React.useState("all");
  const [area, setArea] = React.useState("all");
  const toggle = () => {
    try { localStorage.setItem(OPEN_KEY, open ? "0" : "1"); } catch {}
    setOpen(!open);
  };

  const allowed = !!access?.viewAll;
  const q = useQuery({
    queryKey: ["vibration-summary", date, group, area],
    queryFn: () => apiGet<EntrySummary>(`/api/vibration/summary?${new URLSearchParams({ date, group, area })}`).then((r) => r.data),
    enabled: allowed && open,
    staleTime: 15_000,
  });
  // Danh sách cương vị của ô chọn: giữ theo lần tải "Tất cả" gần nhất để không mất lựa chọn khi đã lọc.
  const [areaList, setAreaList] = React.useState<string[]>([]);
  const fresh = q.data && area === "all" ? q.data.areas : null;
  if (fresh && fresh !== areaList && fresh.join("|") !== areaList.join("|")) setAreaList(fresh);
  const areaOptions = area === "all" || areaList.includes(area) ? areaList : [area, ...areaList];

  if (!allowed) return null;
  const s = q.data;
  const t = s?.totals;
  const jump = (r: SummaryRow) => onJump({ area: r.area, group: r.group, date: r.due });

  return (
    <section className="panel es-panel" aria-label="Tổng hợp tiến độ nhập thông số">
      <button type="button" className="es-head" aria-expanded={open} aria-controls="esBody" onClick={toggle}>
        <span>Tổng hợp tiến độ nhập{t && !open ? <small> · {t.areasComplete}/{t.areas} cương vị đủ · {t.entered}/{t.devices} thiết bị</small> : null}</span>
        <span className="es-caret" aria-hidden="true">▸</span>
      </button>
      {open && (
        <div className="es-body" id="esBody">
          <div className="es-controls">
            <EntryDateBar label="Ngày" inputId="esDate" date={date} onChange={setDate} resetLabel="Hôm nay" onReset={() => setDate(vnToday())} />
            <label>
              Kỳ đo
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="all">Tất cả kỳ</option>
                {MEASURE_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label} · hạn {fmt(groupDueDate(g.id, date) ?? date)}</option>)}
                <option value={MNK_SHIFT_GROUP}>MNK theo ca · hạn {fmt(groupDueDate(MNK_SHIFT_GROUP, date) ?? date)}</option>
              </select>
            </label>
            <label>
              Cương vị
              <select value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="all">Tất cả cương vị</option>
                {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          </div>
          {q.isLoading ? (
            <p className="rs-msg" role="status">Đang tổng hợp...</p>
          ) : q.isError || !s || !t ? (
            <p className="rs-msg" data-kind="err" role="alert">Không tải được tổng hợp tiến độ nhập.</p>
          ) : (
            <>
              <div className="es-kpis">
                <div className="es-kpi" data-tone={t.areas > 0 && t.areasComplete === t.areas ? "ok" : undefined}>
                  <span>Cương vị nhập đủ</span><b>{t.areasComplete}/{t.areas}</b>
                </div>
                <div className="es-kpi" data-tone="ok"><span>Thiết bị đã nhập</span><b>{t.entered}</b></div>
                <div className="es-kpi" data-tone={t.missing ? "miss" : "ok"}><span>Chưa nhập</span><b>{t.missing}</b></div>
              </div>
              <div className="es-progress">
                <div className="es-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={t.percent} aria-label="Tiến độ nhập">
                  <i style={{ width: `${t.percent}%` }} data-full={t.devices > 0 && t.missing === 0} />
                </div>
                <span>{t.percent}% thiết bị đã nhập ({t.entered}/{t.devices}) · tính từ hạn của từng kỳ đến {fmt(s.date)}</span>
              </div>
              {s.rows.length === 0 ? (
                <p className="rs-msg" role="status">Không có thiết bị thuộc kỳ / cương vị đã chọn.</p>
              ) : (
                <div className="es-wrap">
                  <table className="es-table">
                    <thead>
                      <tr><th>Cương vị</th><th>Kỳ</th><th>Hạn</th><th className="es-num">Đã nhập/Tổng</th><th>Chưa nhập</th><th>Trạng thái</th></tr>
                    </thead>
                    <tbody>
                      {s.rows.map((r) => (
                        <tr key={`${r.area}|${r.group}`}>
                          <td>
                            {r.group === MNK_SHIFT_GROUP ? (
                              <Link className="es-link" href="/devices/vibration/mnk">{r.area}</Link>
                            ) : (
                              <button type="button" className="es-link" title="Mở bảng nhập đúng cương vị, kỳ, ngày hạn" onClick={() => jump(r)}>{r.area}</button>
                            )}
                          </td>
                          <td data-label="Kỳ">{r.groupLabel}</td>
                          <td data-label="Hạn">{fmt(r.due)}</td>
                          <td className="es-num" data-label="Đã nhập/Tổng">{r.entered}/{r.total}</td>
                          <td data-label="Chưa nhập">
                            {r.missing.length ? (
                              <details className="es-miss">
                                <summary>{r.missing.length} thiết bị</summary>
                                <ul>{r.missing.map((m) => <li key={m.id}>{m.name}</li>)}</ul>
                              </details>
                            ) : "—"}
                          </td>
                          <td data-label="Trạng thái"><span className="es-chip" data-state={r.complete ? "ok" : "miss"}>{r.complete ? "Đủ" : "Thiếu"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="es-note">Thiết bị có ghi chú (Máy dự phòng, Ngừng sửa chữa…) được tính là đã nhập. 14 động cơ MNK tính riêng ở kỳ &quot;MNK theo ca&quot;.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
