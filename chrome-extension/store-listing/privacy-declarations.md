# Khai báo Privacy Practices

## Single purpose

Đồng bộ mã vật tư, mã kho và số lượng tồn kho từ trang QLVT đã đăng nhập sang hệ thống quản lý vật tư PXVH1 khi người dùng chủ động yêu cầu.

## Lý do sử dụng quyền `tabs`

Tiện ích cần tìm tab QLVT mà người dùng đã mở để gửi yêu cầu lấy dữ liệu tồn kho. Tiện ích không đọc lịch sử duyệt web và không theo dõi các tab khác.

## Lý do truy cập `qlvt.tpcduyenhai.com.vn`

Đây là nguồn dữ liệu tồn kho. Content script chạy trong đúng tên miền này, gọi API tồn kho bằng phiên đăng nhập sẵn có và chỉ trả về mã vật tư, mã kho, số lượng tồn.

## Lý do truy cập `duyenhai1.vn`

Đây là hệ thống đích. Content script nhận thao tác “Đồng bộ từ QLVT” của người dùng và chuyển kết quả đồng bộ cho ứng dụng.

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
