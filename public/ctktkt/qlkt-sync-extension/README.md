# Bản tích hợp Duyên Hải 1 — v0.4.41

Dùng cho phân hệ **Quản lý chỉ tiêu KTKT** tại `https://duyenhai1.vn/tien-ich/chi-tieu-ktkt` và tên miền phụ `https://ctktkt.duyenhai1.vn` khi được cấu hình.

Tải và giải nén ZIP vào thư mục cố định. Mở trang quản lý tiện ích Chrome/Edge, bật chế độ dành cho nhà phát triển và chọn thư mục có `manifest.json`. Sau khi cài hoặc cập nhật, tải lại trang KTKT. Khi đồng bộ, cần đăng nhập hệ thống nguồn trên cùng trình duyệt.

## Ghi chú kỹ thuật của mã nguồn bàn giao

# Tiện ích đồng bộ QLKT

Tiện ích đọc dữ liệu trên màn hình QLKT đang mở và chuyển sang web Chỉ tiêu KTKT bằng dữ liệu tạm trong phần `#` của địa chỉ. Web xóa phần dữ liệu tạm này ngay sau khi đọc và luôn yêu cầu người dùng kiểm tra trước khi lưu.

## Phạm vi phiên bản 0.4.30

- Riêng trang **Dữ liệu các tháng** chỉ đọc trực tiếp từ QLKT các trường còn nguồn riêng: giờ phát S1/S2, than tồn kho 06h00, nước bổ sung S1/S2 và các khoảng thời gian vận hành.
- Sản lượng, điểm bán, dầu FO, than tiêu thụ, nhiệt trị và than nhập trên **Dữ liệu các tháng** tự liên kết từ **Báo cáo chỉ tiêu KTKT**, không đồng bộ QLKT lần hai.
- Từ màn hình **Thời gian/tình hình vận hành**: giờ phát S1/S2, tổng giờ dự phòng, sự cố, bảo dưỡng/sửa chữa và thời gian khởi động còn lại trong 48 giờ tổ máy/ngày.
- Bốn điểm đo PPA (`DHA_S1`, `DH1_285M`, `DHA_S2`, `DH1_283M`) cùng đủ 48 chu kỳ nửa giờ.
- Tám thông số cân bằng nhiệt PMIS, nhật ký sự kiện S1/S2 và hàng báo cáo 02-PĐ Duyên Hải 1.

Tiện ích không đọc trường mật khẩu, không lưu thông tin đăng nhập và không ghi dữ liệu ngược lên QLKT.

## Cài trên Chrome hoặc Edge

1. Giải nén tệp tiện ích.
2. Mở trang quản lý tiện ích của trình duyệt.
3. Bật chế độ dành cho nhà phát triển.
4. Chọn **Tải tiện ích đã giải nén** và chọn thư mục này.
5. Mở QLKT và đăng nhập.
6. Chỉ trong lần thiết lập đầu tiên, mở lần lượt các màn hình **Nhiên liệu**, **Tình hình vận hành**, **Cân bằng nhiệt**, **Số liệu đo đếm công tơ** và **Báo cáo 02-PĐ**. Tiện ích tự ghi nhớ địa chỉ, không ghi nhớ tài khoản hoặc mật khẩu.
7. Từ những lần sau, mở trang **Dữ liệu các tháng**, chọn ngày và bấm **Đồng bộ toàn bộ QLKT**.

### Đồng bộ PPA bằng một nút trên web

1. Chỉ lần đầu, mở **Vận hành → Số liệu đo đếm công tơ**, chờ bảng hiện đủ dữ liệu rồi mở tiện ích để dòng **Công tơ PPA** báo **Đã ghi nhớ**.
2. Mở `https://ctktkt-dashboard.vercel.app/` và nhấn F5. Trang phải báo **Tiện ích v0.4.30 đã kết nối**.
3. Hằng ngày vào **Dữ liệu các tháng**, chọn ngày và bấm **Đồng bộ toàn bộ QLKT**. Tiện ích lần lượt lấy dữ liệu ngày, công tơ PPA, PMIS, nhật ký BCSX và báo cáo 02-PĐ rồi web tự lưu các nhóm hợp lệ.

Khi phiên QLKT hết hạn, đăng nhập QLKT lại rồi bấm đồng bộ. Tiện ích chỉ trả kết quả khi tất cả nguồn bắt buộc đúng ngày và đủ cấu trúc; web tự lưu từng nhóm và báo rõ nhóm nào thành công hoặc lỗi.
# Hỗ trợ tổ ngừng — phiên bản 0.4.40

Trong Suất hao nhiệt PPA, chọn đúng ngày rồi tích S1/S2 tại **Xác nhận tổ ngừng cả ngày** trước khi lấy công tơ. Chỉ dùng khi tổ không phát điện suốt ngày; đổi ngày sẽ xóa xác nhận. Tiện ích tạo giá trị 0 cho các kênh giao bị thiếu của tổ đã xác nhận, ghi rõ nguồn là xác nhận ngừng. Không thay đổi số liệu tổ đang chạy, không bỏ qua dòng sai ngày, giá trị sai, tổng không khớp hay mâu thuẫn có điện phát. Kênh điện nhận bị thiếu của tổ ngừng được báo riêng, không tạo số 0 và không chặn tính PPA. Đồng bộ toàn bộ chỉ tiêu/điện tự dùng vẫn yêu cầu đủ điện nhận thực; không dùng kết quả thiếu để cập nhật điện tự dùng.

Cập nhật thư mục tiện ích bằng gói ZIP mới, Reload tại chrome://extensions rồi Ctrl+F5 trang PPA. Công thức chỉ tiêu không thay đổi.
