"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from "react";
import { WOWK_CHART_LEVEL, WOWK_CHART_VI } from "@/lib/vibration/analysis/wowk";
import { fmtN } from "@/lib/vibration/analysis/util";
import type { Level } from "@/lib/vibration/analysis/texts";
import { WowkFigure } from "./analysis-wowk-figure";

const num = (v: number | null | undefined) => fmtN(v, 3);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** Báo cáo phiếu Wowk (external-wowk.js:ewReportHtml). `result` = kết quả ewAnalyze. */
export function WowkReport({ result: r }: { result: any }) {
  const judged = r.points.some((p: any) => p.checks.length) || !!r.zone;
  const zoneLv = (WOWK_CHART_LEVEL[r.zone] || "na") as Level;
  const ratios = (r.points as any[]).filter((p) => p.ratio !== null);
  return (
    <article className="external-report-document ew-report vc-print-area">
      <header>
        <p>PHÂN XƯỞNG VẬN HÀNH 1 · PHIẾU PHÂN TÍCH ĐỘC LẬP</p>
        <h2>BÁO CÁO PHÂN TÍCH RUNG THEO WOWK</h2>
        <p>{r.d.name} · {r.d.date} · Người đo: {r.d.person || "Chưa khai báo"}</p>
      </header>

      <Section title="1. Đối tượng và chất lượng số liệu">
        <p>{r.d.location} · Gối: {r.d.point || "Chưa khai báo"} · {num(r.rpm)} v/p · Chế độ: {r.d.load || "Chưa khai báo"}</p>
        <p>Thiết bị đo: {r.d.meter || "Chưa khai báo"} · Gá: {r.d.mount || "Chưa khai báo"}</p>
        {r.issues.length
          ? <ul>{(r.issues as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul>
          : <p>Đã khai báo thông tin cơ bản; vẫn cần kiểm chứng độ lặp lại phép đo.</p>}
      </Section>

      <Section title="2. Đối chiếu Bảng 1 — mức khảo sát, không phải vùng ISO">
        <p>{r.rowValid ? r.row.ten : "Chưa đủ điều kiện áp dòng Bảng 1."}</p>
        <table>
          <thead><tr><th>Phương</th><th>Thông số</th><th>Đo</th><th>Giới hạn</th><th>Kết quả</th></tr></thead>
          <tbody>
            {(r.points as any[]).map((p) => p.checks.length
              ? (p.checks as [string, number, number, string][]).map(([label, v, l, u]) => (
                <tr key={p.name + label}><td>{p.name}</td><td>{label}</td><td>{num(v)} {u}</td><td>{num(l)} {u}</td><td>{v > l ? "Vượt mức khảo sát" : "Không vượt mức khảo sát"}</td></tr>
              ))
              : <tr key={p.name}><td>{p.name}</td><td colSpan={4}>Chưa đủ dữ liệu đối chiếu. Vận tốc: {num(p.v)} mm/s peak; dịch 1X: {num(p.d)} µm p-p; gia tốc: {num(p.a)} g peak.</td></tr>)}
          </tbody>
        </table>
        <p>Ngưỡng vận tốc đổi từ in/s peak × 25,4; dịch chuyển từ mils p-p × 25,4. Không đổi RMS đa tần thành peak.</p>
      </Section>

      <Section title="3. Hình 5 và thay đổi so với nền">
        <p><strong>Nguồn tần số:</strong> {r.frequencySource}. {r.zone ? `${num(r.f)} Hz · ${num(r.peak)} mm/s peak` : "Chưa xếp vùng: cần cặp tần số–biên độ peak hợp lệ trong phạm vi biểu đồ."} · Bậc quay {num(r.order)}X.</p>
        {r.d.freqMode !== "fft"
          ? <p>Tần số tương đương được tính: RPM / 60 × bậc quay ({num(r.orderSelected)}×); đây không phải xác nhận đỉnh phổ. Không dùng vận tốc tổng thay cho biên độ peak của đỉnh.</p>
          : <p>Tần số và biên độ được khai báo từ phổ FFT: {r.d.spectrum || "chưa ghi tên/mã phổ"}. Kết quả còn phụ thuộc cách gá, phương đo, dải và thiết lập máy.</p>}
        {r.zone && (
          <>
            <div className="wk-zone-chip wk-zone-chip-current" data-level={zoneLv}><i>●</i><b>{WOWK_CHART_VI[r.zone] || r.zone}</b><span>Vận tốc tại {num(r.f)} Hz</span></div>
            <div className="wk-chart"><WowkFigure points={[{ f: r.f, vInPk: r.peak / 25.4, zone: r.zone, label: "Phổ đo" }]} /></div>
          </>
        )}
        <p>{ratios.map((p) => `${p.name}: ${num(p.ratio)}× nền${p.ratio >= 5 ? " — tăng nghiêm trọng" : p.ratio >= 2 ? " — thay đổi đáng kể" : ""}`).join("; ") || "Chưa đủ số nền cùng điều kiện để đánh giá mức tăng."}</p>
        <p>Nhiệt đo: {(r.points as any[]).map((p) => `${p.name} ${num(p.t)} °C`).join("; ")}.</p>
      </Section>

      <Section title="4. Nguyên nhân khả dĩ → kiểm chứng → khắc phục">
        {r.cause
          ? (
            <>
              <p><strong>Giả thuyết: {r.cause[0]}.</strong> Chưa phải kết luận nguyên nhân gốc; đặc điểm phổ do người đo khai báo, chưa được phần mềm xác minh.</p>
              <p>Kiểm chứng: {r.cause[1]}</p>
              <p>Khắc phục có điều kiện: {r.cause[2]}</p>
            </>
          )
          : <p>Chưa đủ bằng chứng để phân biệt mất cân bằng, lệch tâm, lỏng, cộng hưởng và hư ổ. Đo bổ sung FFT hướng kính/dọc trục, pha, bao hình và thử cộng hưởng khi phù hợp; không cân bằng hoặc thay ổ chỉ từ số tổng.</p>}
        <p>Bằng chứng: {r.d.spectrum || "Chưa khai báo"} · Pha/phép thử: {r.d.phase || "Chưa khai báo"}</p>
      </Section>

      <Section title="5. Kết luận và bước tiếp theo">
        <p>{!judged ? "Chưa đủ dữ liệu đánh giá mức độ." : r.exceeded || ["EXCESSIVE", "EXTREMELY ROUGH"].includes(r.zone) ? "Có giá trị vượt mức khảo sát: báo kỹ thuật, đo xác nhận và lập kế hoạch kiểm tra." : "Các giá trị đã đối chiếu chưa vượt mức khảo sát; không đồng nghĩa máy không có lỗi."}</p>
        <p>Đo lại cùng điều kiện sau xử lý; lưu phổ, pha và số nền để nghiệm thu. Quyết định vận hành/dừng máy do người có thẩm quyền theo quy trình và giới hạn nhà chế tạo.</p>
        <p>Diễn biến: {r.d.history || "Chưa khai báo"} · Ghi chú: {r.d.notes || "Không"}</p>
      </Section>

      <footer>Nguồn: Victor Wowk, A Brief Tutorial on Machine Vibration — Bảng 1–3, Hình 1 & 5; dữ liệu ngưỡng hiện có của hệ thống. Phiếu tham khảo kỹ thuật, không chứng nhận phù hợp ISO.</footer>
    </article>
  );
}
