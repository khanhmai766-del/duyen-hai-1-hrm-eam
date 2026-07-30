# Ghi chú cho nhóm xét duyệt

## Phạm vi truy cập

Tiện ích này chỉ dành cho người dùng nội bộ được phép của Nhà máy Nhiệt điện Duyên Hải 1. Hai hệ thống nguồn QLVT và LIMS chỉ có thể truy cập khi thiết bị đang kết nối mạng nội bộ của đơn vị, vì vậy nhóm xét duyệt bên ngoài sẽ không thể truy cập trực tiếp hệ thống nguồn.

Tiện ích không cung cấp chức năng đăng nhập và không thu thập thông tin xác thực. Toàn bộ mã thực thi đã được đóng gói trong tiện ích, không sử dụng mã từ xa. Tiện ích chỉ hoạt động khi người dùng đã đăng nhập hệ thống nguồn trong mạng nội bộ và chủ động bấm “Đồng bộ từ QLVT” / “Đồng bộ từ LIMS” tại `duyenhai1.vn`.

## Luồng hoạt động — đồng bộ tồn kho QLVT

1. Người dùng mở trang Vật tư theo ERP tại `duyenhai1.vn`.
2. Người dùng bấm “Đồng bộ từ QLVT”.
3. Ở lần đầu, người dùng đọc thông báo dữ liệu và bấm “Đồng ý và đồng bộ”.
4. Tiện ích tìm tab tồn kho QLVT đã đăng nhập hoặc tự mở đúng trang nguồn.
5. Tiện ích chỉ chuyển mã vật tư, mã kho, đơn vị tính và số lượng tồn kho sang PXVH1.
6. Ứng dụng hiển thị số mã thay đổi, số mã chưa có và số mã ngừng sử dụng.

## Luồng hoạt động — đồng bộ kết quả phân tích dầu LIMS

1. Người dùng mở trang “Tiện ích → Kết quả phân tích dầu” tại `duyenhai1.vn` và bấm “Đồng bộ từ LIMS”.
2. Ở lần đầu, người dùng đọc thông báo dữ liệu và bấm “Tôi đồng ý, đồng bộ”.
3. Tiện ích dùng lại (hoặc mở) tab LIMS đã đăng nhập, mở mục “Kết quả phân tích Dầu”, đặt khoảng thời gian do người dùng chọn (7/14/30 ngày).
4. Tiện ích **chỉ đọc** nội dung bảng danh sách đang hiển thị, lọc lấy các mẫu Không Đạt của PX Vận hành 1 và trả về các trường của bảng đó.
5. Ứng dụng hiển thị số phiếu mới và số phiếu có thay đổi đánh giá / ý kiến.

Tiện ích **không ghi, sửa hoặc xoá dữ liệu trên LIMS**; chức năng nhập ý kiến vẫn thực hiện trực tiếp trên LIMS.

Không có tài khoản kiểm thử công khai vì QLVT và LIMS là hệ thống nội bộ được bảo vệ. Ảnh chụp màn hình, mô tả Store và mã nguồn trong gói thể hiện đầy đủ luồng chức năng.

## Giải thích kỹ thuật

- `bridge-app.js` chỉ nhận thao tác đồng bộ từ duyenhai1.vn (kiểm tra `event.source === window` và cùng origin).
- `background.js` chỉ tìm tab thuộc các host đã được khai báo và chuyển thông điệp theo thao tác đó; manifest không yêu cầu quyền `tabs`.
- `bridge-qlvt.js` gọi API QLVT trong phiên đăng nhập hiện tại, chuẩn hóa dữ liệu và chỉ trả về `code`, `warehouse`, `unit`, `erpStock`.
- `bridge-lims.js` chạy trong môi trường cô lập, nhận yêu cầu từ service worker và chuyển tiếp bằng message cùng origin có `requestId`.
- `bridge-lims-page.js` chạy trong MAIN world để dùng các API PrimeFaces sẵn có trên trang, đặt khoảng ngày/số dòng rồi chỉ đọc DOM bảng kết quả. File này không truy cập API `chrome.*` và không gửi biểu mẫu ghi dữ liệu nào.
- Không có mã tải từ xa, mã làm rối, analytics, quảng cáo. `localStorage` chỉ dùng ở phía web app để ghi nhớ người dùng đã đọc thông báo dữ liệu.
