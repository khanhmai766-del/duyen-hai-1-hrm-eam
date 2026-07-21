# Ghi chú cho nhóm xét duyệt

## Phạm vi truy cập

Tiện ích này chỉ dành cho người dùng nội bộ được phép của Nhà máy Nhiệt điện Duyên Hải 1. Hệ thống nguồn QLVT chỉ có thể truy cập khi thiết bị đang kết nối mạng nội bộ của đơn vị, vì vậy nhóm xét duyệt bên ngoài sẽ không thể truy cập trực tiếp hệ thống nguồn.

Tiện ích không cung cấp chức năng đăng nhập và không thu thập thông tin xác thực. Toàn bộ mã thực thi đã được đóng gói trong tiện ích, không sử dụng mã từ xa. Tiện ích chỉ hoạt động khi người dùng đã đăng nhập QLVT trong mạng nội bộ và chủ động bấm “Đồng bộ từ QLVT” tại `duyenhai1.vn`.

## Luồng hoạt động

1. Người dùng mở tab tồn kho QLVT đã đăng nhập trong mạng nội bộ.
2. Người dùng mở trang Vật tư theo ERP tại `duyenhai1.vn`.
3. Người dùng bấm “Đồng bộ từ QLVT”.
4. Ở lần đầu, người dùng đọc thông báo dữ liệu và bấm “Đồng ý và đồng bộ”.
5. Tiện ích chỉ chuyển mã vật tư, mã kho, đơn vị tính và số lượng tồn kho sang PXVH1.
6. Ứng dụng hiển thị số mã thay đổi, số mã chưa có và số mã ngừng sử dụng.

Không có tài khoản kiểm thử công khai vì QLVT là hệ thống nội bộ được bảo vệ. Ảnh chụp màn hình, mô tả Store và mã nguồn trong gói thể hiện đầy đủ luồng chức năng.

## Giải thích kỹ thuật

- `bridge-app.js` chỉ nhận thao tác đồng bộ từ duyenhai1.vn.
- `background.js` chỉ tìm tab thuộc host QLVT đã được khai báo và chuyển thông điệp theo thao tác đó; manifest không yêu cầu quyền `tabs`.
- `bridge-qlvt.js` gọi API QLVT trong phiên đăng nhập hiện tại, chuẩn hóa dữ liệu và chỉ trả về `code`, `warehouse`, `unit`, `erpStock`.
- Không có mã tải từ xa, mã làm rối, analytics, quảng cáo hoặc lưu trữ cục bộ.
