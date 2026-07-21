# Khai báo Privacy Practices

## Single purpose

Đồng bộ mã vật tư, mã kho và số lượng tồn kho từ trang QLVT đã đăng nhập sang hệ thống quản lý vật tư PXVH1 khi người dùng chủ động yêu cầu.

## Lý do yêu cầu Quyền từ phía máy chủ

Tiện ích chỉ yêu cầu quyền trên hai tên miền phục vụ chức năng duy nhất. Trên `qlvt.tpcduyenhai.com.vn`, tiện ích chạy content script trong trang tồn kho đã đăng nhập, gọi API QLVT và chỉ đọc mã vật tư, mã kho, số lượng tồn. Trên `duyenhai1.vn`, tiện ích nhận thao tác “Đồng bộ từ QLVT” do người dùng chủ động thực hiện và chuyển kết quả cho hệ thống quản lý vật tư PXVH1. Tiện ích không truy cập tên miền khác, không đọc mật khẩu, cookie, token hoặc lịch sử duyệt web.

Tiện ích không yêu cầu quyền `tabs`. Host permission QLVT đã đủ để tìm đúng tab QLVT phù hợp; tiện ích không có quyền đọc URL hoặc thông tin nhạy cảm của các tab thuộc tên miền khác.

## Dữ liệu cần khai báo

- Website content: Có — mã vật tư, mã kho và số lượng tồn kho từ phản hồi QLVT.
- Authentication information: Không thu thập hoặc truyền. Cookie/phiên đăng nhập chỉ được trình duyệt sử dụng nội bộ trong yêu cầu cùng nguồn đến QLVT.
- Web history: Không.
- Personally identifiable information: Không.
- Financial, health, communications, location: Không.

## Cách sử dụng dữ liệu

Dữ liệu chỉ được dùng để cung cấp chức năng đồng bộ tồn kho đã mô tả. Không bán, không dùng quảng cáo, không chia sẻ cho bên thứ ba và không cho con người đọc ngoài hoạt động quản trị nghiệp vụ được phân quyền tại PXVH1.

## Xác nhận Limited Use

Việc sử dụng dữ liệu tuân thủ Chrome Web Store User Data Policy, bao gồm các yêu cầu Limited Use. Dữ liệu chỉ được dùng để cung cấp chức năng duy nhất mà người dùng chủ động yêu cầu.
