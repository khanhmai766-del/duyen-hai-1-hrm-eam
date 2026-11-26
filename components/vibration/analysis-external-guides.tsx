"use client";

import * as React from "react";
import { Foot, Sec, TableWrap } from "./analysis-shared";

type Row = [string, React.ReactNode];

function GuideList({ rows }: { rows: Row[] }) {
  return (
    <dl className="hub-guide-list">
      {rows.map(([f, t]) => (
        <React.Fragment key={f}>
          <dt>{f}</dt>
          <dd>{t}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
const H4 = ({ children }: { children: React.ReactNode }) => <h4>{children}</h4>;
function Guide({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="hub-guide">
      <summary>{title}</summary>
      {children}
    </details>
  );
}

/** analysis-hub.js:isoGuideHtml */
export function IsoGuide() {
  return (
    <Guide title="Hướng dẫn các ô nhập — phương pháp ISO 20816-3">
      <p><b>Khi nào dùng:</b> máy quay công nghiệp 15 kW – 50 MW, tốc độ 120 – 30 000 v/p (bơm, quạt, động cơ, máy nén…), đo <b>vận tốc RMS băng rộng</b> trên vỏ gối đỡ khi máy chạy ổn định. ISO đánh giá theo vùng A/B/C/D và mức hành động; chỉ áp khi đủ thông tin phạm vi.</p>
      <H4>01 · Nhận dạng & điều kiện vận hành</H4>
      <GuideList rows={[
        ["Tên thiết bị / Hệ thống", "Tên để in trên báo cáo và tìm lại trong “Phiếu đã lưu”. Bắt buộc."],
        ["Ngày đo / Giờ đo / Người đo", "Truy xuất phép đo; thiếu người đo bị ghi vào mục “cần xác minh”."],
        ["Loại máy", "Quyết định tiêu chuẩn: quạt ≤ 300 kW → ISO 14694; bơm cánh động → ISO 10816-7; còn lại → ISO 20816-3. “Khác” = không áp ngưỡng."],
        ["Công suất định mức (kW)", "Chọn Nhóm 1 (> 300 kW) hay Nhóm 2 (15 – 300 kW) của ISO 20816-3. Lấy trên nhãn máy."],
        ["Tốc độ tại lúc đo (v/p)", "Tính tần số quay 1X = v/p ÷ 60; < 600 v/p ISO yêu cầu xét cả dịch chuyển (Phụ lục A)."],
        ["Công suất tổ máy lúc đo (MW) / Tải (%)", "Ghi điều kiện tải để so lần sau cùng điều kiện; rung phụ thuộc mạnh vào tải."],
        ["Kiểu bệ phương X / Y", "Cứng hay mềm theo từng phương (ISO §5.3: cứng khi tần số riêng hệ máy-bệ ≥ 1,25 × tần số kích thích). Chưa rõ → phần mềm xét cả hai, lấy kết quả khắt khe."],
        ["Tình trạng máy", "Chỉ “Chạy ổn định” mới được xếp vùng ISO; quá độ / dừng → chỉ ghi nhận."],
        ["Loại bơm", "Chọn bảng ISO 10816-7 (cánh động) hoặc ngoài phạm vi (bơm thể tích…)."],
        ["Chiều cao tâm trục H (mm)", "Dùng cho động cơ điện theo IEC 60034-14 (tham chiếu phụ)."],
        ["Cụm cần phân tích / Số gối", "Chỉ những gối có thật mới hiện ô nhập. Gối không tồn tại để trống — không nhập 0."],
      ]} />
      <H4>02 · Phép đo & truy xuất</H4>
      <GuideList rows={[
        ["Giá trị máy đo", <>Phải là <b>RMS</b>. PEAK không tự quy đổi (√2 chỉ đúng với sóng sin một tần số) → không xếp vùng.</>],
        ["Gá cảm biến", "Bắt vít > nam châm > cầm tay (độ lặp lại giảm dần). Cầm tay bị cảnh báo."],
        ["Máy đo / ngày hiệu chuẩn", "Truy xuất thiết bị đo; thiếu → cảnh báo chất lượng."],
        ["Dải tần thấp / cao (Hz)", "ISO 20816-3 yêu cầu dải 10 – 1000 Hz (2 – 1000 Hz cho máy ≤ 600 v/p). Nhập để kiểm tra phù hợp."],
        ["Quy ước phương X", "X là ngang hay đứng — để đọc đúng phương khi so bệ và in báo cáo."],
        ["Dòng điện pha A/B/C", "Xác nhận máy đang chạy và mức tải; lệch pha lớn gợi ý lỗi điện/nhập liệu."],
      ]} />
      <H4>03 · Số đo tại từng gối</H4>
      <GuideList rows={[
        ["Rung X / Rung Y (mm/s)", "Vận tốc RMS hướng kính hai phương vuông góc tại vỏ gối. Đánh giá từng phương, lấy phương xấu nhất."],
        ["Dịch X / Y (µm p-p)", "Dịch chuyển đỉnh-đỉnh; dùng khi máy chậm hoặc có thành phần tần số thấp."],
        ["Nhiệt (°C)", "Nhiệt vỏ gối — ghi nhận để theo dõi, ISO 20816 không có ngưỡng nhiệt."],
        ["Điểm đo bổ sung", "Gối hộp số, ổ trung gian… Được in trên báo cáo nhưng không tự xếp vùng ISO."],
      ]} />
      <H4>04 · Bằng chứng chẩn đoán (không bắt buộc)</H4>
      <GuideList rows={[
        ["Điểm đo phổ", "Gối có phổ — phải là gối đã nhập rung X/Y thì mới lập giả thuyết."],
        ["1X / 2X / Dọc trục (mm/s RMS)", "Biên độ thành phần phổ. 1X ≥ 60 % rung tổng → nghi mất cân bằng; 2X và dọc trục ≥ 50 % 1X → nghi lệch tâm."],
        ["Chênh pha qua khớp (độ)", "≈ 180° qua khớp nối gợi ý lệch tâm góc."],
        ["Nhiều hài / Bao hình / Run-up", "Dấu hiệu lỏng cơ khí, hư ổ lăn, cộng hưởng — chỉ tạo giả thuyết, luôn cần kiểm chứng."],
      ]} />
      <Foot><b>Kết quả:</b> vùng A (máy mới) · B (vận hành dài hạn) · C (hạn chế thời gian) · D (đủ gây hư hỏng) → mức hành động Bình thường / Theo dõi / Lên kế hoạch sửa / Sửa sớm nhất. Phiếu một lần đo không đánh giá được Tiêu chí II (thay đổi so mức nền).</Foot>
    </Guide>
  );
}

/** analysis-hub.js:wowkGuideHtml */
export function WowkGuide() {
  return (
    <Guide title="Hướng dẫn các ô nhập — phương pháp tài liệu Wowk">
      <p><b>Khi nào dùng:</b> khi ISO không đủ thông tin hoặc máy ngoài phạm vi ISO; khảo sát nhanh theo <i>A Brief Tutorial on Machine Vibration</i> (V. Wowk). Tài liệu dùng giá trị <b>đỉnh (peak)</b> kiểu Mỹ: in/s pk, mils p-p, g pk — phần mềm đổi đơn vị bằng × 25,4, <b>không</b> đổi RMS ↔ peak.</p>
      <H4>01 · Thiết bị & điều kiện đo</H4>
      <GuideList rows={[
        ["Tên / Vị trí / Ngày / Người đo", "Nhận dạng và truy xuất; tên và ngày bắt buộc."],
        ["Tốc độ thực tế (v/p)", "Kiểm tra dòng Bảng 1 có áp được không (mỗi dòng có dải tốc độ) và tính bậc tần số = f ÷ (v/p ÷ 60)."],
        ["Tải / chế độ vận hành", "Ghi để so sánh cùng điều kiện (tiêu chí “điều kiện vận hành”)."],
        ["Phân loại theo Bảng 1", "Chọn đúng loại máy trong 16 dòng của Bảng 1. “Ngoài Bảng 1” → không áp giới hạn loại máy, chỉ dùng Hình 5."],
        ["Thiết bị đo / Cách gá", "Chất lượng số liệu: cảm biến vuông góc, lực ép đều, đế từ không bập bênh."],
        ["Số gối", "1 hoặc 2 gối; mỗi gối có 3 phương X ngang, Y đứng, Z dọc trục."],
      ]} />
      <H4>02 · Khảo sát tại gối đỡ (theo Bảng 2)</H4>
      <GuideList rows={[
        ["Vận tốc tổng (mm/s peak)", "So với giới hạn vận tốc Bảng 1 (in/s pk × 25,4). Phản ánh mức rung dải giữa."],
        ["Dịch chuyển 1X (µm p-p)", "Chỉ thành phần 1X (lọc theo tốc độ quay). Phản ánh cân bằng / tần số thấp."],
        ["Gia tốc tổng (g peak)", "Phản ánh xung va đập từ ổ lăn, bánh răng (tần số cao)."],
        ["Nhiệt (°C)", "Nhiệt gối tăng là tín hiệu phải hành động ngay (tiêu chí “tốc độ thay đổi”)."],
        ["Vận tốc nền (mm/s peak)", "Số đo trước đó cùng điểm, phương, tốc độ, tải. Tăng ≥ 2× = thay đổi đáng kể; ≥ 5× = nghiêm trọng. Chỉ so khi đánh dấu “cùng điều kiện”."],
      ]} />
      <H4>03 · Phổ đo & bằng chứng</H4>
      <GuideList rows={[
        ["Tần số thành phần phổ (Hz) + Vận tốc peak tại tần số đó", "Cặp tọa độ để tra Hình 5 (biểu đồ Machine Dynamics 1–1000 Hz): Tốt / Chấp nhận / Tạm chấp nhận / Quá mức / Cực kỳ xấu. Không ghép tốc độ 1X với vận tốc tổng."],
        ["Đặc điểm đã quan sát", "Chọn một mẫu phổ (1X hướng kính, 1X/2X dọc trục, nhiều hài, bao hình ổ, cộng hưởng) → phần mềm nêu giả thuyết, cách kiểm chứng và khắc phục theo Bảng 3."],
        ["Pha / phép thử / Diễn biến / Ghi chú", "Bằng chứng hỗ trợ — chẩn đoán bằng rung chỉ đúng khoảng 80 %, thông tin hỗ trợ tăng độ tin cậy."],
      ]} />
      <Foot><b>Kết quả:</b> vượt / không vượt mức khảo sát Bảng 1, vùng Hình 5, mức tăng so với nền, giả thuyết nguyên nhân → kiểm chứng → khắc phục. Người phân tích không quyết định dừng máy.</Foot>
    </Guide>
  );
}

/** analysis-hub.js:methodsCompareHtml */
export function MethodsCompare() {
  return (
    <Sec title="So sánh 2 phương pháp">
      <TableWrap>
        <thead><tr><th></th><th>ISO 20816-3:2022</th><th>Tài liệu Wowk</th></tr></thead>
        <tbody>
          <tr><th>Bản chất</th><td>Tiêu chuẩn quốc tế, vùng A/B/C/D theo nhóm máy và kiểu bệ</td><td>Tài liệu hướng dẫn kỹ thuật, giới hạn kinh nghiệm theo loại máy (Bảng 1) và biểu đồ tần số (Hình 5)</td></tr>
          <tr><th>Đại lượng</th><td>Vận tốc <b>RMS</b> băng rộng 10–1000 Hz (mm/s)</td><td>Giá trị <b>đỉnh</b>: vận tốc in/s pk, dịch chuyển 1X mils p-p, gia tốc g pk</td></tr>
          <tr><th>Điều kiện áp dụng</th><td>Đủ loại máy, công suất, tốc độ, kiểu bệ; máy chạy ổn định</td><td>Khi ISO thiếu thông tin hoặc máy ngoài phạm vi ISO</td></tr>
          <tr><th>Chẩn đoán nguyên nhân</th><td>Giả thuyết từ 1X/2X/dọc trục/pha (ISO 13373-2)</td><td>Bảng 3 theo tần số + lưu đồ cưỡng bức / cộng hưởng</td></tr>
          <tr><th>Đầu ra</th><td>Vùng ISO → mức hành động</td><td>Vượt / không vượt mức khảo sát, vùng Hình 5, tăng so nền</td></tr>
        </tbody>
      </TableWrap>
      <Foot>Không trộn số liệu: số RMS của phiếu ISO không nhập sang phiếu Wowk (peak) và ngược lại, trừ khi có phép đo peak riêng.</Foot>
    </Sec>
  );
}
