"use client";

import * as React from "react";

const ZONES: [string, string, string][] = [
  ["A", "Tốt", "Mức của máy mới đưa vào vận hành."],
  ["B", "Chấp nhận", "Vận hành dài hạn không hạn chế."],
  ["C", "Hạn chế", "Không nên vận hành liên tục lâu dài — theo dõi dày hơn, lập kế hoạch kiểm tra / sửa chữa."],
  ["D", "Nguy hiểm", "Rung đủ lớn để gây hư hỏng máy — xử lý ngay, cân nhắc dừng máy."],
];
export const ZONE_BADGE: Record<string, string> = { A: "", B: "", C: "", D: "" };
const Details = ({ summary, children }: { summary: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <details className="panel">
    <summary>{summary}</summary>
    {children}
  </details>
);
export { Details as MillDetails };

/** Chú giải vùng A–D + khối thu gọn ngưỡng & tài liệu (mill-analysis.js: millZoneGuide). Không có liên kết tải PDF ở bản này. */
export function MillZoneGuide() {
  return (
    <>
      <div className="ma-zone-legend" aria-label="Ý nghĩa vùng rung ISO 20816-3">
        {ZONES.map(([z, n, d]) => <span key={z} data-zone={z} title={d}><b>{z}</b>{n}</span>)}
      </div>
      <details className="panel ma-ref">
        <summary>Ngưỡng vùng A · B · C · D và tài liệu tham khảo</summary>
        <div className="ma-ref-body"><div>
        <h4>Ý nghĩa các vùng (ISO 20816-3:2022, §6.2)</h4>
        <ul className="ma-ref-zones">{ZONES.map(([z, n, d]) => <li key={z} data-zone={z}><b>{z} · {n}</b> {d}</li>)}</ul>
        <h4>Ranh giới vùng — vận tốc RMS trên vỏ gối (mm/s)</h4>
          <table className="ma-ref-table">
            <thead><tr><th>Nhóm máy</th><th>Bệ</th><th>A/B</th><th>B/C</th><th>C/D</th></tr></thead>
            <tbody>
              <tr><td rowSpan={2}>Nhóm 1 · &gt; 300 kW (hoặc tâm trục ≥ 315 mm)</td><td>Cứng</td><td>2,3</td><td>4,5</td><td>7,1</td></tr>
              <tr><td>Mềm</td><td>3,5</td><td>7,1</td><td>11,0</td></tr>
              <tr><td rowSpan={2}>Nhóm 2 · 15–300 kW (tâm trục 160–315 mm)</td><td>Cứng</td><td>1,4</td><td>2,8</td><td>4,5</td></tr>
              <tr><td>Mềm</td><td>2,3</td><td>4,5</td><td>7,1</td></tr>
            </tbody>
          </table>
        <p className="ma-ref-note">Máy nghiền: nhóm theo công suất ở <b>Danh mục › Thông số máy</b>; thiếu công suất → tạm dùng Nhóm 1 theo báo cáo SCCN. Bảng đo ca ghi Max X/Y/Z nên chỉ là <b>sàng lọc</b>; kết luận cuối cần đo đúng hai hướng kính và xác nhận giá trị RMS. Ô đỏ khi nhập (&gt; 5 mm/s, &gt; 50 µm) là ngưỡng cảnh báo nhập liệu nội bộ, không phải ranh giới vùng ISO.</p>
        </div><div>
        <h4>Tài liệu tham khảo</h4>
        <ol className="ma-ref-docs">
          <li><a href="https://www.iso.org/standard/78311.html" target="_blank" rel="noopener noreferrer">ISO 20816-3:2022 ↗</a> — Đo và đánh giá rung máy công nghiệp &gt; 15 kW, 120–30 000 v/p (trang chính thức; bản đầy đủ có bản quyền, lưu nội bộ).</li>
          <li>PX SCCN — Báo cáo phân tích rung động định kỳ các máy nghiền than DH1 — dữ liệu tháng 4/2025, báo cáo 07–09/05/2025: phân loại tình trạng thiết bị, kiểm tra theo cụm máy.</li>
          <li>PX SCCN — Số 11, Báo cáo lựa chọn đơn vị rung động giám sát máy nghiền DH1 (2024) — bảng tốc độ gối (Hình 6: 993 / 139 v/p), tần số ăn khớp, tiêu chí nhóm 1.</li>
          <li>ISO 10816-3:1998 — bản tiêu chuẩn cũ (ISO 20816-3 thay thế), dùng tra cứu ngưỡng cũ trong báo cáo SCCN.</li>
          <li>V. Wowk — A Brief Tutorial on Machine Vibration — Bảng 1, Hình 5 dùng ở phương pháp «Tài liệu Wowk».</li>
        </ol>
        <p className="ma-ref-note">Tệp PDF chỉ tải được khi đã đăng nhập; tài liệu nội bộ / có bản quyền — dùng trong phân xưởng, không chia sẻ ra ngoài.</p>
        </div></div>
      </details>
    </>
  );
}

/** «Phương pháp & hướng kiểm tra SCCN / Wowk» + «Cơ sở tài liệu & giới hạn». */
export function MillMethodDetails({ rms }: { rms: boolean }) {
  return (
    <>
      <Details summary="Phương pháp & hướng kiểm tra SCCN / Wowk">
        <p>{rms ? "ISO 20816-3: ngưỡng theo nhóm công suất và kiểu bệ từ bảng chuẩn dùng chung. Thiếu công suất: Nhóm 1 theo SCCN chỉ là tham chiếu có điều kiện. Vùng C: lập kế hoạch kiểm tra/khắc phục; vùng D: báo người phụ trách để đánh giá xử lý sớm. Không tự ra lệnh dừng máy chỉ từ bảng này." : "Chưa xác nhận RMS: chỉ mô tả trend, chưa áp dụng vùng ISO."}</p>
        <p>Tăng ≥25% là tín hiệu theo dõi, không phải bằng chứng xác định lỗi. Động cơ/gối 1–2: kiểm tra liên kết, căn tâm và ảnh hưởng truyền từ hộp giảm tốc. Gối 3–4: kiểm tra bôi trơn, ổ lăn và ăn khớp hộp giảm tốc. Gối 5–6: kiểm tra ăn khớp bánh răng nhỏ/vành răng, tải và bôi trơn. Cần phổ FFT, pha, điều kiện tải và kiểm tra thực tế để phân biệt nguyên nhân.</p>
        <p>Wowk: đối chiếu 1X/2X và các thành phần phổ theo tốc độ của đúng trục. Hình 5 cần tần số và biên độ peak của thành phần phổ; không dùng số tổng RMS đổi bằng √2. Biên độ µm chưa rõ peak/peak-to-peak nên chỉ vẽ trend, không tự phân vùng. Không có gia tốc/enveloping: chưa kết luận hư ổ lăn.</p>
      </Details>
      <Details summary="Cơ sở tài liệu & giới hạn">
        <p>SCCN — báo cáo lựa chọn đơn vị giám sát máy nghiền DH1 (2024), bảng tốc độ Hình 6 và tiêu chí ISO 10816-3 nhóm 1; báo cáo phân tích tháng 4/2025: phương pháp kiểm tra theo cụm máy. Victor Wowk — A Brief Tutorial on Machine Vibration, Bảng 1 và Hình 5. Đây là tiêu chí SCCN trong tài liệu cung cấp, không tự thay thế ngưỡng nhập liệu &gt;5 mm/s / &gt;50 µm.</p>
        <p>Tốc độ tham chiếu: gối 1–3 = 993 RPM; gối 4–6 = 139 RPM; vành răng = 15.2 RPM. Nếu máy vận hành khác tốc độ này, cần xác minh trước khi đối chiếu phổ. Thiếu một hướng: giá trị lớn nhất chỉ tính các hướng đã đo, không coi hướng trống là 0. Không dùng nhận định hỏng máy của báo cáo năm 2025 làm kết luận cho dữ liệu hiện tại.</p>
      </Details>
    </>
  );
}
