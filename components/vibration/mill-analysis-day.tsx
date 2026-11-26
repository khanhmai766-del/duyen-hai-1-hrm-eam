"use client";

import * as React from "react";
import { MILL_FIELD_KEYS, millDayPair, millIso, millNum, millPoints, millRecords, millStopped, type AnalysisDevice, type AnalysisRecord } from "@/lib/vibration/analysis";
import { MaTable, dmyDate } from "./analysis-shared";
import { fmt2, type MillCtx } from "./mill-analysis-shared";

export const ZoneTag = ({ zone }: { zone: string }) => <span data-zone={zone}>{zone}</span>;

/** «Phân tích ngày»: bảng 6 gối + đoạn giải thích (mill-analysis.js: .ma-assessment). */
export function MillDayPanel({ device, rs, ctx }: { device: AnalysisDevice; rs: AnalysisRecord[]; ctx: MillCtx }) {
  const { day, rms } = ctx;
  const summaries = React.useMemo(() => [1, 2, 3, 4, 5, 6].map((b) => {
    const { last, prev } = millDayPair(device, day, b);
    const ratio = last && prev && prev.value > 0 ? last.value / prev.value : null;
    const pts = millPoints(rs, b, "v", "max");
    return { b, last, ratio, zone: rms ? millIso(last?.value ?? null, device, b, rms).zone : "—", max: pts.length ? Math.max(...pts.map((p) => p.value)) : null };
  }), [device, day, rs, rms]);
  const latest = millRecords(device, day.slice(0, 7)).filter((r) => r.date === day && !millStopped(r)).at(-1);
  const missing = latest ? MILL_FIELD_KEYS.filter((k) => millNum((latest.millData as Record<string, unknown>)[k]) === null).length : null;
  return (
    <>
      <h2>Phân tích ngày · {device.name} · {dmyDate(day)}</h2>
      <p>
        {latest ? `Bản ghi ngày chọn: ${dmyDate(latest.date)} · thiếu ${missing}/${MILL_FIELD_KEYS.length} ô thông số.` : "Ngày chọn không có số đo vận hành — không lấy số ngày khác thay thế."}{" "}
        {summaries.filter((s) => s.last).length}/6 gối có số vận tốc. Phân vùng dưới đây là sàng lọc ISO 20816-3 (có điều kiện), không phải chẩn đoán nguyên nhân.
      </p>
      <MaTable>
        <thead><tr><th>Gối</th><th>Rung ngày chọn (mm/s)</th><th>Max khoảng chọn (mm/s)</th><th>Vùng</th><th>Diễn biến &amp; hành động</th></tr></thead>
        <tbody>
          {summaries.map((s) => (
            <tr key={s.b}>
              <td>#{s.b}</td><td>{fmt2(s.last?.value)}</td><td>{fmt2(s.max)}</td><td>{s.zone}</td>
              <td>
                {!s.last ? "Chưa đo" : !rms ? "Xác nhận đơn vị RMS trước khi phân vùng" : s.zone === "D" ? "Vùng D: báo người phụ trách, đo kiểm lại và kiểm tra sớm" : s.zone === "C" ? "Vùng C: theo dõi sát, lập kế hoạch kiểm tra" : "Trong vùng " + s.zone + " theo ISO (có điều kiện)"}
                {s.ratio === null ? "" : s.ratio >= 5 ? " · tăng ≥5×: thay đổi nghiêm trọng so với lần trước; cần đo xác minh" : s.ratio >= 2 ? " · tăng ≥2×: thay đổi đáng kể theo Wowk" : s.ratio >= 1.25 ? " · tăng ≥25%: tín hiệu theo dõi nội bộ" : " · chưa tăng ≥25% so với lần trước"}
              </td>
            </tr>
          ))}
        </tbody>
      </MaTable>
      <p>Gối 4–6 có 1X ≈ 2.32 Hz: xác nhận dải đo máy rung có bao phủ tần số thấp; số tổng chỉ đo từ 10 Hz có thể bỏ mất 1X. Không so các gối khác trục như cùng một tốc độ. Đo lại cùng hướng, vị trí, tải và chế độ máy trước khi so sánh.</p>
    </>
  );
}
