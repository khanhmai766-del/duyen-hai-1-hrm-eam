# Bản tích hợp Duyên Hải 1 — v0.2.1

Dùng cho phân hệ **Quản lý chỉ tiêu KTKT** tại `https://duyenhai1.vn/tien-ich/chi-tieu-ktkt` và tên miền phụ `https://ctktkt.duyenhai1.vn` khi được cấu hình.

Tải và giải nén ZIP vào thư mục cố định. Mở trang quản lý tiện ích Chrome/Edge, bật chế độ dành cho nhà phát triển và chọn thư mục có `manifest.json`. Sau khi cài hoặc cập nhật, tải lại trang KTKT. Khi đồng bộ, cần đăng nhập hệ thống nguồn trên cùng trình duyệt.

## Ghi chú kỹ thuật của mã nguồn bàn giao

# Tiện ích NKVH → PPA 0.2.0

## Cài và chạy

1. Mở Chrome → `chrome://extensions` → bật **Chế độ dành cho nhà phát triển**.
2. Bấm **Tải tiện ích đã giải nén** → chọn `C:\Users\HP\Downloads\CTKTKT\nkvh-ppa-test` (đây là tiện ích mới, khác tiện ích đọc cấu trúc trước).
3. Mở trang **danh sách nhật ký NKVH** đã đăng nhập. Giữ tab này mở.
4. Bấm biểu tượng mảnh ghép → **NKVH → PPA (bản thử)**. Một trang chọn dữ liệu sẽ mở.
5. Chọn ngày **04/10/2026** → **Đồng bộ S1 + S2** một lần. Tiện ích mở tab NKVH riêng, lần lượt đọc 16 nhật ký và hiển thị cả S1/S2 trên cùng trang. Giữ trang chọn mở, không thao tác tab đọc trong lúc chạy.
6. Kiểm tra số nhật ký đọc được (đủ là 16/16). Nếu thiếu, mở **Tiến độ và ca chưa đọc được** để xem lỗi. Ca chưa lập không đồng nghĩa không có sự kiện.
7. Mỗi dòng có ba cột **Thời gian | Nội dung | Tích**, chia theo tổ máy và ca. Tick các dòng cần lấy; sửa nội dung tổng hợp nếu cần, bấm **Sao chép S1/S2** nếu mở trực tiếp qua biểu tượng.
8. Khi cập nhật: tại `chrome://extensions`, bấm **Tải lại** trên tiện ích này, chấp nhận quyền truy cập web CTKTKT nếu Chrome yêu cầu; đóng trang thử cũ, tải lại trang PPA bằng Ctrl+F5.

## Đồng bộ từ web

1. Mở web CTKTKT → Suất hao nhiệt PPA → Nhập & đồng bộ dữ liệu ngày, chọn ngày D.
2. Bấm **Đồng bộ NKVH S1 + S2**. Trang chọn sự kiện mở và bắt đầu đọc ngày D.
3. Chọn các dòng S1/S2, sửa kết quả còn tối đa 1000 ký tự/tổ máy nếu cần.
4. Bấm **Đưa nội dung đã chọn vào web S1/S2**. Web điền các ô có nội dung; ô của tổ không chọn dữ liệu được giữ nguyên. Ngày đổi trên web thì kết quả cũ bị từ chối.
5. Kiểm tra rồi bấm **Lưu thông tin S1/S2** và đồng bộ Google Sheet theo luồng hiện có. Tiện ích không tự lưu.

Tải mới từ liên kết **Tải tiện ích NKVH** trên web: giải nén gói ZIP, chọn thư mục giải nén bằng Load unpacked. Chỉ bật một bản tiện ích NKVH để tránh mở hai trang cùng lúc.

## Đối chiếu

- Bấm thời gian để mở nhật ký gốc; rê chuột trên thời gian/nội dung để xem nguồn Lò/Máy và trạng thái.
- Thứ tự nhóm: Khuya D−1, Sáng D, Chiều D, Khuya D.
- Chỉ dòng có thời gian thuộc/giao với ngày D được hiển thị. Thiếu giờ kết thúc lấy theo giờ bắt đầu. Dòng thiếu/sai giờ bắt đầu hoặc thời gian đảo ngược bị ẩn. Khoảng kết thúc đúng 00hD không được tính vào ngày D; sự kiện đúng 00hD+1 không được tính vào D.
- Giữ nguyên nội dung; không tự loại trùng Lò/Máy, không tự chọn. Thời gian hiển thị vẫn là thời gian gốc, kể cả khoảng kéo dài qua nửa đêm.
- Trang thử giữ dữ liệu trong bộ nhớ, mất khi đóng/tải lại. Đổi lựa chọn sau khi sửa ô tổng hợp sẽ tạo lại nội dung từ các dòng đã chọn.
- Ô sự kiện trên web hiện giới hạn 1000 ký tự; tiện ích cảnh báo nhưng không cắt nội dung.

## Giới hạn đã biết

Đã xác nhận các bộ lọc và bảng bằng JSON của người dùng; chưa chạy trên phiên Chrome NKVH thật của người dùng. Trang dùng các thao tác bộ lọc/mở nhật ký có sẵn; không bấm lưu, xóa, thêm hay nút trạng thái, không thay đổi nội dung nhật ký. Không thu thập cookie, mật khẩu, nhân sự hoặc gửi dữ liệu đến dịch vụ khác. Việc đọc có thể cần điều chỉnh nếu NKVH thay đổi ID/bố cục hoặc cơ chế chuyển ca. Khi lỗi, gửi ảnh trang thử và phần tiến độ (không gửi thông tin đăng nhập).
