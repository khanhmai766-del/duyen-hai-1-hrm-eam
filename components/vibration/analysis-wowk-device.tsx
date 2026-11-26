"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from "react";
import {
  VC, STD_SHORT, WOWK_CHART_LEVEL, WOWK_CHART_VI, fmtN, inPkToMmRms, machineTypes, wowkCatalogueModel,
} from "@/lib/vibration/analysis";
import { WowkFigure } from "./analysis-wowk-figure";
import { CataloguePanel, Foot, LevelBadge, MethodSwitcher, Sec, TableWrap, Warn, resolveSelection, type AnalysisTabProps, type CatalogueSel } from "./analysis-shared";

const Small = ({ children }: { children: React.ReactNode }) => <small>{children}</small>;
const Ul = ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>;

export function AnalysisWowkDeviceTab({ devices, settings, sel, setSel, methodSwitch }: AnalysisTabProps & { sel: CatalogueSel; setSel: (s: CatalogueSel) => void; methodSwitch?: React.ReactNode }) {
  const { device: d, recs, record: r } = React.useMemo(() => resolveSelection(devices, sel), [devices, sel]);
  const panel = <CataloguePanel devices={devices} sel={sel} onChange={setSel} showDevice showDate>{methodSwitch}</CataloguePanel>;
  const model = React.useMemo(() => (d && r ? wowkCatalogueModel(d, recs, r, settings) : null), [d, recs, r, settings]);
  if (!d) return <>{panel}<p>Không có thiết bị có số liệu phù hợp bộ lọc.</p></>;
  if (!r || !model) return <>{panel}<p>Thiết bị chưa có lần đo có số liệu.</p></>;

  const m: any = d.machine || {};
  const xAxis = m.xAxis;
  const dirName = (dir: string) => (xAxis === "ngang" ? (dir === "X" ? "Ngang" : "Đứng") : xAxis === "dung" ? (dir === "X" ? "Đứng" : "Ngang") : "Phương " + dir);
  const { plan, isoOk } = model;
  const head = (
    <>
      <div className="an-head"><div><h2>{d.name}</h2><p>{d.area} / {d.system} · {d.id} · Lần đo {r.date} · Người đo: {r.person || "không ghi"}</p></div></div>
      {isoOk
        ? <p className="an-foot">Thiết bị đã đủ thông tin cho {STD_SHORT[plan.main] || plan.main} — kết luận chính xem ở phương pháp <b>ISO 20816-3</b>; trang này là <b>đánh giá bổ sung</b> theo tài liệu Wowk. Tài liệu Wowk dựa trên phổ tần số; bảng theo dõi hằng tuần chỉ có số tổng nên mọi chẩn đoán dưới đây tối đa mức <b>Yếu</b> [WOWK tr.4].</p>
        : <p className="an-warn"><b>ISO không đủ thông tin</b> ({plan.missing.length ? "thiếu " + plan.missing.join(", ") : plan.notes[0] || "máy ngoài phạm vi ISO 20816-3"}) → đánh giá <b>chính</b> theo tài liệu Wowk. Tài liệu Wowk dựa trên phổ tần số; bảng theo dõi hằng tuần chỉ có số tổng nên mọi chẩn đoán dưới đây tối đa mức <b>Yếu</b> [WOWK tr.4].</p>}
    </>
  );
  if (model.stopped) return <>{panel}{head}<Warn>Máy dừng / dự phòng ở lần đo này → không đánh giá. Chọn lần đo khác.</Warn></>;

  const { rows, pts, lim, t1, worst, serious, res1, nRes, ord, f1, causes, ratios, hot, steps, motorMax, machMax, curNow, lvW, whyW } = model as any;
  const q = model.res.q;
  const wk = model.sel;
  const limMm = lim ? inPkToMmRms(lim.van_toc_in_s_pk) : null;
  const typeName = (machineTypes.find((t) => t[0] === m.type) || [0, m.type])[1];
  const chips = rows.filter((x: any) => x.zone);

  return (
    <div id="wkReport-wrap">
      {panel}
      <div id="wkReport">
      {head}

      <Sec title="1. Bảng khảo sát rung (theo Bảng 2)">
        <TableWrap>
          <thead><tr><th>Gối · phương</th><th>Dịch chuyển mils pk-pk<Small>(µm pk-pk)</Small></th><th>Vận tốc tổng in/s pk<Small>(mm/s RMS)</Small></th><th>Gia tốc tổng g pk</th><th>Tần số tra Hình 5</th><th>Nhiệt °C</th></tr></thead>
          <tbody>
            {rows.map((x: any) => (
              <tr key={x.b.key + x.dir}>
                <th>{x.b.label} · {dirName(x.dir)}</th>
                <td>{x.dpp != null ? <>{fmtN(x.dpp / 25.4, 2)}<Small>{fmtN(x.dpp, 0)} µm</Small></> : "—"}</td>
                <td>{fmtN(x.vin, 3)}<Small>{fmtN(x.v)} mm/s</Small></td>
                <td><Small>chưa đo trong bảng tuần</Small></td>
                <td>{x.f ? <>{fmtN(x.f, 1)} Hz<Small>{x.f === plan.f1x ? "= 1X" : "tần số tương đương"}</Small></> : <Small>chưa có tốc độ / biên độ</Small>}</td>
                <td>{fmtN(x.t, 0)}</td>
              </tr>
            ))}
            <tr><th>Dọc trục</th><td colSpan={5}><Small>Chưa đo — tài liệu khuyến nghị đo cả 3 phương ngang/đứng/dọc trục ở mỗi gối</Small></td></tr>
          </tbody>
        </TableWrap>
        <Foot>Khảo sát toàn bộ hệ máy (máy dẫn động, máy công tác, hộp số trung gian) trước khi đi vào chi tiết; chú trọng chất lượng số liệu: giữ cảm biến vuông góc, lực ép đều, đế từ không bập bênh [WOWK tr.4–5]. Cột 1 phản ánh tình trạng cân bằng, cột 2 mức rung ở dải tần thấp, cột 3 xung va đập từ ổ [WOWK tr.5]. Không kết luận xấu từ một lần đo — lặp lại khảo sát, tốt hơn là người khác đo bằng hệ đo khác [WOWK tr.5–6].</Foot>
      </Sec>

      <Sec title="2. Mức độ nghiêm trọng (Bảng 1 và Hình 5)">
        {lim ? (
          <>
            <p><b>Bảng 1 — «{lim.ten}»</b>{wk?.note ? <small> ({wk.note})</small> : null}: dịch chuyển 1X ≤ {fmtN(lim.dich_chuyen_mils_pp, 1)} mils pk-pk ({fmtN(lim.dich_chuyen_mils_pp * 25.4, 1)} µm) · vận tốc tổng ≤ {fmtN(lim.van_toc_in_s_pk, 2)} in/s pk (<b>{fmtN(limMm, 2)} mm/s RMS</b>) · gia tốc ≤ {fmtN(lim.gia_toc_g_pk, 1)} g pk [WOWK tr.3].</p>
            <Ul>
              {t1.map((x: any) => (
                <li key={x.b.key + x.dir}>{x.b.label} {dirName(x.dir)}: {fmtN(x.v)} mm/s RMS — {x.over ? <><b>vượt</b> giới hạn → rung <b>nghiêm trọng</b>, cần khắc phục</> : "trong giới hạn"}
                  {x.dpp != null && x.dpp > lim.dich_chuyen_mils_pp * 25.4 ? ` · dịch chuyển ${fmtN(x.dpp, 1)} µm > ${fmtN(lim.dich_chuyen_mils_pp * 25.4, 1)} µm (giới hạn áp cho thành phần 1X; số tổng chỉ tham khảo)` : ""}</li>
              ))}
            </Ul>
          </>
        ) : <Warn>Chưa chọn được dòng Bảng 1: {m.type ? "loại máy «" + typeName + "» không có trong Bảng 1" : "chưa khai báo loại máy"} — chỉ đánh giá theo Hình 5.</Warn>}
        <Foot>Giới hạn Bảng 1 là mức kinh tế đạt được, dưới mức này máy sống hết tuổi thọ bình thường; máy trên lò xo, bệ nâng hoặc gần nguồn rung lớn có thể cho phép cao hơn [WOWK tr.3].</Foot>
        <div className="wk-chart"><WowkFigure points={pts.map((x: any) => ({ f: x.f, vInPk: x.vin, zone: x.zone, label: x.short }))} /></div>
        <p className="wk-marker-note">Điểm từ số tổng và tần số tương đương/1X là ước tính; xác nhận bằng phổ FFT trước khi kết luận.</p>
        <div className="wk-zone-list">
          {chips.length ? chips.map((x: any, i: number) => (
            <span key={x.b.key + x.dir} className="wk-zone-chip" data-level={WOWK_CHART_LEVEL[x.zone] || "na"}>
              <i>{i + 1}</i>
              <b>{x.b.label + " " + x.dir}</b>
              <span>{fmtN(x.f, 1)} Hz · {fmtN(x.vin, 3)} in/s pk</span>
              <strong>{WOWK_CHART_VI[x.zone]}</strong>
            </span>
          )) : <p className="an-warn">Chưa có cặp tần số–biên độ để đánh dấu.</p>}
        </div>
      </Sec>

      <Sec title="3. Lưu đồ phân tích (Hình 1)">
        <ol className="wk-flow">
          <li><b>Lành tính hay nghiêm trọng?</b> → <b>{serious ? "Nghiêm trọng" : "Chưa thấy dấu hiệu nghiêm trọng"}</b>. {serious ? "Vượt Bảng 1 hoặc vùng Quá mức/Cực kỳ xấu ở Hình 5." : "Rung lành tính (ồn động cơ 2 × tần số lưới, tần số cánh, rối dòng chất lưu, ăn khớp bánh răng ở mức bình thường) không cần xử lý; chỉ theo dõi để chắc chắn không tăng dần [WOWK tr.1–2]."}</li>
          {serious && (
            <li><b>Cưỡng bức hay tự nhiên (cộng hưởng)?</b> Dấu hiệu cộng hưởng [WOWK tr.2]:
              <ul>
                {res1.map(([t, ok, why]: [string, boolean | null, string]) => <li key={t}>{ok === true ? "✔" : ok === false ? "✘" : "?"} {t} — <small>{why}</small></li>)}
              </ul>
              → {nRes >= 2
                ? <><b>Nghi cộng hưởng</b> — xác minh bằng: gõ búa tìm tần số riêng; kích rung thay đổi tốc độ; ghi khởi động/dừng; hình dạng dao động vận hành (ODS). Cách chữa: đổi tốc độ, đổi tần số riêng (thêm khối lượng/tăng cứng), thêm giảm chấn, giảm nguồn kích thích, bộ hấp thụ động lực [WOWK tr.2–3].</>
                : <><b>Nghiêng về rung cưỡng bức</b> — cách chữa: cân bằng, căn tâm, thay chi tiết hỏng [WOWK tr.2]. Cần dừng máy kiểm tra trực quan, vệ sinh, đo độ đảo bằng đồng hồ so trước khi quyết định.</>}
            </li>
          )}
        </ol>
        <Foot>Phân biệt sớm cưỡng bức hay cộng hưởng vì cách chữa hai loại khác hẳn nhau [WOWK tr.2–3].</Foot>
      </Sec>

      <Sec title="4. Nguyên nhân có thể (Bảng 3 — theo tần số)">
        {ord == null ? <Warn>Chưa xác định được tần số trội{f1 ? "" : " (chưa có tốc độ quay)"} — cần tốc độ quay và cặp vận tốc – biên độ, tốt nhất là phổ FFT.</Warn> : (
          <>
            <p>Gối rung lớn nhất <b>{worst.b.label}</b>: tần số {fmtN(worst.f, 1)} Hz ≈ <b>{fmtN(ord, 2)} × 1X</b> ({fmtN(f1, 2)} Hz).</p>
            <TableWrap>
              <thead><tr><th>Khả năng</th><th>Đặc điểm theo Bảng 3</th><th>Mức khớp</th></tr></thead>
              <tbody>{causes.map(([c, t]: [string, string]) => <tr key={c}><th>{c}</th><td>{t}</td><td>Yếu</td></tr>)}</tbody>
            </TableWrap>
          </>
        )}
        <Foot>Mỗi tần số có nhiều nguyên nhân: liệt kê theo khả năng rồi <b>loại trừ dần</b> bằng kiểm tra bổ sung — căn tâm bằng đồ gá đo trục, đo độ đảo bằng đồng hồ so, thử một phát đối trọng [WOWK tr.6]. Máy đo số tổng không dùng để chẩn đoán [WOWK tr.4]; chẩn đoán bằng rung tốt nhất chỉ đúng khoảng 80 % — thông tin hỗ trợ làm tăng độ tin cậy [WOWK tr.7].</Foot>
        <h4>Thông tin hỗ trợ cần thu thập [WOWK tr.6–7]</h4>
        <ul className="wk-check">
          <li>Tiếng ồn ổ, bánh răng (ống nghe)</li>
          <li>Nhiệt độ gối đỡ{worst?.t != null ? ` — hiện ${fmtN(worst.t, 0)} °C` : ""}</li>
          <li>Dầu có mạt kim loại hoặc lẫn chất lỏng khác</li>
          <li>Khe hở ổ quá lớn (thử nâng trục)</li>
          <li>Độ đảo trục (đồng hồ so)</li>
          <li>Kiểm tra trực quan: lỏng, bẩn, nứt</li>
          <li>Lịch sử bảo dưỡng</li>
        </ul>
      </Sec>

      <Sec title="5. Sáu tiêu chí phán đoán [WOWK tr.8–9]">
        <ol className="wk-crit">
          <li><b>Lực bên trong suy từ chuyển động đo được</b> — đo gia tốc thì F = m·a, đo dịch chuyển thì F = k·x; bệ mềm cho phép chuyển động lớn hơn nhưng tải lên ổ lại nhỏ hơn. {plan.foundations.includes("mem") && <small>Thiết bị có thể đặt bệ mềm — chuyển động đo được cao chưa chắc là tải lên ổ cao.</small>}</li>
          <li><b>Thay đổi tương đối so với mức nền:</b> tăng 2× (6 dB) là có thay đổi vật lý đáng kể; 5× là nghiêm trọng. {ratios.length ? (
            <ul>{ratios.map((x: any) => <li key={x.b.key + x.dir}>{x.b.label} {dirName(x.dir)}: {fmtN(x.v)} / nền {fmtN(x.base, 2)} = <b>{fmtN(x.r, 2)}×</b> {x.r >= 5 ? <>— <b>nghiêm trọng</b></> : x.r >= 2 ? <>— <b>đáng kể</b></> : ""}</li>)}</ul>
          ) : <small>Chưa đủ lần đo hợp lệ để lập mức nền.</small>}</li>
          <li><b>Tốc độ thay đổi:</b> tăng chậm qua nhiều tuần, nhiệt ổn định, đủ bôi trơn → mòn, chưa đáng báo động (có thể tra mỡ hằng ngày để cầm cự tới lần dừng); cao nhưng ổn định là đáng lo nhưng chưa khẩn cấp. <b>Nhiệt gối tăng → hành động ngay</b>. <b>Tăng đột bậc</b> → ổ không ổn định, kiểm tra ổ và gối sớm. <b>Tần số giảm</b> → kết cấu yếu đi (nứt, lỏng mối ghép).
            {hot.length > 0 && <><br />⚠ Nhiệt tăng: {hot.map((b: any) => `${b.b.label} ${fmtN(b.t, 0)} °C (nền ${fmtN(b.tBase, 0)} °C)`).join("; ")} → <b>hành động ngay</b>.</>}
            {steps.length > 0 && <><br />⚠ Tăng đột bậc: {steps.map((b: any) => `${b.b.label} ${b.stepDir} ${fmtN(b.prevV)} → ${fmtN(b.stepV)} mm/s`).join("; ")}.</>}</li>
          <li><b>Điều kiện vận hành:</b> tải ảnh hưởng mạnh tới rung; loại trừ lỗi vận hành (mất pha động cơ, lưu lượng quạt/bơm không tốt) khi không thấy nguyên nhân khác. {curNow != null ? <small>Dòng điện lúc đo {fmtN(curNow, 0)} A{q.flags.some((f: any) => f.q === "Q9") ? " — lệch pha > 10 %: kiểm tra mất pha / nhập liệu" : ""}.</small> : <small>Không có dòng điện lúc đo.</small>}</li>
          <li><b>Dòng năng lượng rung:</b> xác định nguồn theo tần số, rồi hình dung đường truyền tới chỗ đo và nơi năng lượng tiêu tán. {(motorMax || machMax) ? <small>Rung lớn nhất ở phía <b>{motorMax >= machMax ? "động cơ" : "máy công tác (quạt/bơm)"}</b> ({fmtN(Math.max(motorMax, machMax))} mm/s).</small> : null}</li>
          <li><b>Máy cần chạy thêm bao lâu:</b> rung gây mỏi tích luỹ; nếu máy chỉ cần chạy thêm ít tuần trước khi thay thế thì chấp nhận rung cao hơn trong thời gian ngắn. <small>Hỏi kế hoạch dừng / thay thế thiết bị.</small></li>
        </ol>
        <p className="an-decision">Người phân tích rung <b>không</b> quyết định dừng/chạy. Quản lý sản xuất quyết định, cân nhắc: có sẵn vật tư không, có người sửa không, ảnh hưởng sản xuất, rủi ro và hậu quả nếu hỏng đột ngột [WOWK tr.9].</p>
      </Sec>

      <Sec title="6. Nguyên nhân gốc [WOWK tr.9–10]">
        <p><b>Câu hỏi đầu tiên: máy vừa có hoạt động bảo dưỡng gì gần đây?</b>{d.analysis?.baselineFrom ? <small> Sửa chữa / đại tu gần nhất khai báo: {d.analysis.baselineFrom}.</small> : null}</p>
        <TableWrap>
          <thead><tr><th>Nhóm</th><th>Biểu hiện / cách phát hiện</th></tr></thead>
          <tbody>
            <tr><th>Thiết kế</th><td>Cộng hưởng có sẵn do kết cấu yếu về động lực học; bệ móng của chủ đầu tư ảnh hưởng tần số riêng — phát hiện khi thử khởi động, sửa bằng gia cường tại chỗ</td></tr>
            <tr><th>Chế tạo</th><td>Khuyết tật ẩn (ứng suất dư làm cong trục dần); cách phòng tốt nhất: thử rung khi khởi động theo Bảng 1</td></tr>
            <tr><th>Ứng suất vận hành</th><td>Bám bẩn hoặc mòn làm đổi cân bằng; giãn nở nhiệt làm lệch tâm — phát hiện được bằng đo định kỳ, sửa được tại chỗ</td></tr>
            <tr><th>Bảo dưỡng</th><td><b>Nguyên nhân hỏng phổ biến nhất</b>: nung nóng cục bộ (hàn trên trục), căng đai quá mức, lệch tâm trục/ổ, phụ tùng kém, khớp nối bó kẹt, thiếu bôi trơn, bu-lông lỏng, thay chi tiết khác khối lượng hoặc lắp khác hướng (đổi cân bằng), đóng búa vào ổ, bề mặt lắp ghép bẩn/có bavia</td></tr>
            <tr><th>Lão hoá</th><td>Ứng suất dư giải phóng làm cong trục (1X tăng, thay ổ và cân bằng không hết); mối ghép mềm dần làm tần số riêng tụt vào dải vận hành — chỉ thấy khi theo dõi dài hạn</td></tr>
          </tbody>
        </TableWrap>
      </Sec>

      <Sec title="7. Cách khắc phục [WOWK tr.10]">
        <Ul>
          <li>Tháo, kiểm tra trực quan, vệ sinh, lắp lại — đôi khi hết lỗi khó tìm</li>
          <li>Thay ổ</li>
          <li>Xác định và thay các chi tiết hỏng khác</li>
          <li>Cân bằng khối lượng</li>
          <li>Căn tâm</li>
          <li>Bôi trơn: tra mỡ có thể làm ổ êm lại; sửa chu kỳ bôi trơn giúp ổ bền hơn</li>
          <li>Gia cường kết cấu để nâng tần số riêng</li>
          <li><b>Chỉ khi không còn cách khác:</b> thêm khối lượng / tăng cứng để giảm chuyển động — có thể làm tăng ứng suất tại ổ, ổ mòn nhanh hơn</li>
        </Ul>
        <Foot>Một số máy vẫn rung cao mà chưa tìm ra nguyên nhân: chừng nào biên độ còn ổn định thì vẫn có thể vận hành tiếp, nhờ theo dõi rung định kỳ [WOWK tr.10].</Foot>
      </Sec>

      <Sec title="8. Kết luận theo tài liệu Wowk">
        <p><LevelBadge level={lvW} /> {serious ? <span>Rung <b>nghiêm trọng</b> theo Bảng 1 / Hình 5 — cần có biện pháp khắc phục.</span> : <span>Chưa vượt giới hạn Bảng 1 / Hình 5.</span>}</p>
        {whyW.length > 0 && <Ul>{whyW.map((x: string) => <li key={x}>{x}</li>)}</Ul>}
        <Ul>
          {serious && nRes >= 2 && <li>Làm phép thử cộng hưởng trước khi sửa (gõ búa / khởi động–dừng).</li>}
          {serious && nRes < 2 && <li>Đi theo nhánh rung cưỡng bức: kiểm tra, vệ sinh, đo độ đảo, căn tâm, cân bằng.</li>}
          <li>Lặp lại khảo sát (tốt nhất người khác, hệ đo khác) trước khi kết luận [WOWK tr.5].</li>
          <li>Đo phổ FFT, pha 1X và rung dọc trục để xác định nguyên nhân [WOWK tr.4–5].</li>
        </Ul>
        <Foot>Tài liệu: Victor Wowk — <i>A Brief Tutorial on Machine Vibration</i>, Machine Dynamics Inc. (bản 10 trang). Ngưỡng từ bảng dữ liệu v{VC.VC_META.schema}.</Foot>
      </Sec>
      </div>
    </div>
  );
}
