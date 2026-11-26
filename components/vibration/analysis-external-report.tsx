"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from "react";
import { externalBearingLayout } from "@/lib/vibration/analysis/external";
import { foundationKinds, machineTypes, xAxisKinds } from "@/lib/vibration/analysis/machine";
import { LEVELS, STD_SHORT, type Level } from "@/lib/vibration/analysis/texts";
import { fmtN } from "@/lib/vibration/analysis/util";

const MOUNTING: Record<string, string> = { stud: "Bắt vít / đế cố định", magnet: "Nam châm", hand: "Cầm tay" };
const CONDITION: Record<string, string> = { stable: "Chạy ổn định", transient: "Chạy quá độ", stopped: "Dừng / dự phòng" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="external-report-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
const Note = ({ children }: { children: React.ReactNode }) => <p className="external-method-note">{children}</p>;

/** Báo cáo phiếu ISO ngoài danh mục (analysis-external.js:externalReportHtml). `result` = kết quả externalAnalyze. */
export function ExternalIsoReport({ result: a }: { result: any }) {
  const { data: d, nums: n, plan, res, issues, points, diagnoses } = a;
  const bearings = a.bearings || externalBearingLayout(d);
  const max = (points as any[])
    .map((p) => ({ p, v: p.radial.length ? Math.max(...p.radial) : null }))
    .filter((x) => x.v != null)
    .sort((x, y) => (y.v ?? 0) - (x.v ?? 0))[0];
  const label = plan.main ? STD_SHORT[plan.main] || plan.main : "Chưa xác định";
  const hasExtra = (points as any[]).some((p) => p.extra);
  const lv = (res?.level || "na") as Level;
  const state = res ? (hasExtra ? "Gối chuẩn: " : "") + LEVELS[lv].label : "Không đánh giá theo ISO";
  const meterUnit = d.meterValue === "rms" ? "mm/s RMS" : d.meterValue === "peak" ? "mm/s PEAK" : "mm/s (chưa rõ RMS/PEAK)";
  const foundationLabel = (v: string) => foundationKinds.find((x) => x[0] === v)?.[1] || "Chưa xác định";

  const facts: [string, string][] = [
    ["Loại máy", machineTypes.find((x) => x[0] === d.type)?.[1] || "Chưa khai báo"],
    ["Công suất định mức", `${n.powerKw ?? "—"} kW`],
    ["Tốc độ", `${n.speedRpm ?? "—"} v/p`],
    ["1X tính từ tốc độ", n.speedRpm ? fmtN(n.speedRpm / 60, 2) + " Hz" : "—"],
    ["Bệ X / Y", `${foundationLabel(d.foundation)} / ${foundationLabel(d.foundationY || d.foundation)}`],
    ["Máy đo", d.meter || "—"],
    ["Hiệu chuẩn gần nhất", d.calibrationDate || "—"],
    ["Đại lượng đo", meterUnit],
    ["Dải tần", `${n.freqLowHz ?? "—"}–${n.freqHighHz ?? "—"} Hz`],
    ["Gá cảm biến", MOUNTING[d.mounting] || "Chưa khai báo"],
    ["Phương X", xAxisKinds.find((x) => x[0] === d.xAxis)?.[1] || "Chưa rõ"],
    ["Người đo", d.person || "—"],
    ["Trạng thái", CONDITION[d.condition] || "Chưa khai báo"],
    ["Tải", `${n.loadPercent ?? "—"} % · ${n.unitPowerMw ?? "—"} MW`],
    ["Dòng A/B/C", [d.motorA, d.motorB, d.motorC].map((x) => x || "—").join(" / ") + " A"],
  ];

  return (
    <div className="external-report-document vc-print-area">
      <div className="external-report-top">
        <div>
          <span>PHÂN XƯỞNG VẬN HÀNH 1 · PHIẾU PHÂN TÍCH ĐỘC LẬP</span>
          <h2>BÁO CÁO PHÂN TÍCH ĐỘ RUNG</h2>
          <p>{d.name} · {d.location || "Chưa ghi vị trí"} · {d.date} {d.time || ""}</p>
        </div>
        <div className="external-report-state" data-level={res?.level || "na"}>{state}</div>
      </div>

      <div className="external-report-summary">
        {[
          ["Điểm rung lớn nhất", max ? `${fmtN(max.v, 2)} ${meterUnit}` : "—", max ? max.p.bearing.name : "Chưa có số đo"],
          ["Tiêu chuẩn đề xuất", label, plan.main ? "Chưa xác nhận chính thức" : "Không lấy ngưỡng nội bộ của thiết bị khác"],
          ["Độ tin cậy", a.confidence, `${issues.length} điểm cần xác minh`],
        ].map(([t, v, s]) => (
          <div key={t}><span>{t}</span><strong>{v}</strong><small>{s}</small></div>
        ))}
      </div>

      <Section title="1. Phạm vi và điều kiện đo">
        <div className="external-facts">
          {facts.map(([k, v]) => <span key={k}>{k} <b>{v}</b></span>)}
        </div>
        <Note>{plan.main ? "Tiêu chuẩn được phần mềm gợi ý từ loại máy, công suất, tốc độ và bệ; cần đối chiếu phạm vi tiêu chuẩn và tài liệu nhà chế tạo trước khi phê duyệt." : "Thiếu điều kiện hoặc nằm ngoài phạm vi bộ tiêu chuẩn đang hỗ trợ; chỉ trình bày số đo, không gán vùng rung."}</Note>
      </Section>

      <Section title="2. Số đo và mức độ rung">
        <div className="external-table-wrap"><table className="external-measure-table">
          <thead>
            <tr><th>Điểm đo</th><th>X<br />{meterUnit}</th><th>Y<br />{meterUnit}</th><th>Max<br />{meterUnit}</th><th>Dịch X / Y<br />µm p-p</th><th>Nhiệt<br />°C</th><th>Đánh giá</th></tr>
          </thead>
          <tbody>
            {(points as any[]).map((p) => {
              const row = res?.bearings.find((x: any) => x.b.key === p.bearing.key);
              const ev = row?.evals.find((x: any) => x.ev.role === "chính" && !x.error);
              return (
                <tr key={p.bearing.key}>
                  <th>{p.bearing.name}{p.extra && <> <small>(điểm phụ)</small></>}</th>
                  <td>{fmtN(p.x, 2)}</td>
                  <td>{fmtN(p.y, 2)}</td>
                  <td><b>{p.radial.length ? fmtN(Math.max(...p.radial), 2) : "—"}</b></td>
                  <td>{fmtN(p.dx, 1)} / {fmtN(p.dy, 1)}</td>
                  <td>{fmtN(p.temp, 1)}</td>
                  <td>{p.extra ? "Chưa ánh xạ ISO" : ev ? ev.text + (ev.near?.length ? " · sát ranh giới" : "") : "Chưa đánh giá"}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <Note>{res ? "So từng phương tại từng gối theo bảng tiêu chuẩn chính, dùng kết quả khắt khe hơn. Đây là đánh giá trị số tổng và tại một thời điểm; chưa đánh giá thay đổi so mức nền (Criterion II)." : "Chưa đánh giá vùng ISO vì điều kiện đo hoặc phạm vi áp dụng chưa được xác nhận."}</Note>
      </Section>

      <Section title="3. Kiểm soát chất lượng số liệu">
        {issues.length
          ? <ul className="external-issues">{(issues as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul>
          : <p>Không thấy thiếu sót trong các trường kiểm tra tự động. Vẫn cần xác nhận gá cảm biến, hiệu chuẩn và phép đo lặp tại hiện trường.</p>}
      </Section>

      <Section title="4. Bằng chứng, giả thuyết và phép thử phân biệt">
        <p><b>Phổ tại:</b> {bearings.find((x: any) => x.key === d.spectrumPoint)?.name || "Chưa khai báo"} · <b>1X/2X/dọc trục:</b> {[n.oneX, n.twoX, n.axial].map((x: number | null) => (x == null ? "—" : fmtN(x, 2))).join(" / ")} mm/s RMS · <b>Pha:</b> {n.phaseDeg == null ? "—" : fmtN(n.phaseDeg, 0) + "°"}</p>
        <p><b>Nhiều hài / bao hình / chạy lên-dừng:</b> {[d.harmonics || "—", d.envelope || "—", d.resonance || "—"].join(" / ")}</p>
        {d.observations && <p><b>Hiện tượng và lịch sử:</b> {d.observations}</p>}
        {diagnoses.length
          ? (diagnoses as any[]).map((x, i) => (
            <article key={i} className="external-hypothesis">
              <strong>{i + 1}. {x.name}</strong><span>Mức chứng cứ: {x.confidence}</span>
              <p><b>Dấu hiệu:</b> {x.evidence}</p>
              <p><b>Đo/kiểm tra để xác nhận hoặc bác bỏ:</b> {x.check}</p>
            </article>
          ))
          : <p>Chưa có dữ liệu phổ/pha hoặc dấu hiệu đặc trưng đủ để nêu nguyên nhân. Rung tổng cao có thể do nhiều cơ chế khác nhau; không suy nguyên nhân từ một chỉ số.</p>}
        <Note>Các tỉ lệ 1X/2X dùng ở đây là quy tắc sàng lọc của phiếu, không phải ranh giới ISO. Kết luận lỗi cần phổ, pha, dạng sóng, tải/tốc độ và kiểm tra cơ khí đối chứng.</Note>
      </Section>

      <Section title="5. Khuyến nghị thực hiện">
        <ol>
          <li>Đo lặp tại cùng vị trí, phương, tốc độ và tải; xác minh các điểm chất lượng nêu ở mục 3.</li>
          <li>Thu phổ vận tốc, dạng sóng thời gian, pha 1X; bổ sung bao hình khi nghi ổ lăn; so ít nhất các lần đo ổn định trước đó.</li>
          <li>Kiểm tra hiện trường theo các giả thuyết ở mục 4, ghi lại kết quả dương tính và âm tính trước khi ra quyết định sửa chữa.</li>
          <li>{res && LEVELS[lv].rank >= 3 ? "Báo người có thẩm quyền, tăng tần suất theo dõi và đánh giá lại sớm; cân nhắc kế hoạch can thiệp theo mức độ, xu hướng và rủi ro vận hành." : "Tiếp tục giám sát theo kế hoạch và hoàn thiện mức nền để đánh giá thay đổi."}</li>
        </ol>
        <p className="external-decision">Phiếu hỗ trợ phân tích, không tự ra lệnh dừng/chạy. Quyết định vận hành và xác nhận nguyên nhân thuộc kỹ sư, trưởng ca hoặc người có thẩm quyền sau khi xem đầy đủ bối cảnh.</p>
      </Section>

      <Section title="Cấu hình gối được khảo sát">
        <p>{(bearings as any[]).map((b) => b.name).join(" · ")}.</p>
        <p>Chỉ các gối trong cấu hình tham gia phân tích. Gối không tồn tại không được ghi bằng 0 hoặc đưa vào kết luận thiếu số liệu. Số gối không quyết định phạm vi áp dụng ISO.</p>
      </Section>

      <footer className="external-report-footer">
        <div><b>Căn cứ phương pháp:</b> ISO 20816-3:2022 (phạm vi máy và đánh giá rung); ISO 13373-2:2016 (phân tích tín hiệu); ISO 18436-2:2014 (khung năng lực nhân sự phân tích rung). Bảng số dùng bản chuẩn đã cấu hình trong hệ thống, không thay thế bản tiêu chuẩn gốc.</div>
        <div><b>Thời điểm lập:</b> {new Date(a.generatedAt).toLocaleString("vi-VN")} · <b>Người rà soát/ký:</b> ....................................</div>
      </footer>
    </div>
  );
}
