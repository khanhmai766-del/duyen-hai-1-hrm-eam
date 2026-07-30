# Khai báo Privacy Practices

## Single purpose

Đồng bộ dữ liệu nghiệp vụ từ các trang nội bộ Duyên Hải đã đăng nhập sang hệ thống PXVH1 khi người dùng chủ động yêu cầu: (1) tồn kho vật tư từ QLVT; (2) kết quả phân tích dầu Không Đạt từ LIMS. Hai chức năng cùng phục vụ một mục đích duy nhất là đồng bộ dữ liệu nghiệp vụ cần theo dõi tại PXVH1.

## Lý do yêu cầu Quyền từ phía máy chủ

Tiện ích chỉ yêu cầu quyền trên ba tên miền phục vụ chức năng duy nhất nói trên.

- `qlvt.tpcduyenhai.com.vn` — tiện ích chạy content script trong trang tồn kho đã đăng nhập, gọi API QLVT và chỉ đọc mã vật tư, mã kho, đơn vị tính, số lượng tồn.
- `portal.tpcduyenhai.com.vn` — tiện ích chạy content script trong trang LIMS (`lims.xhtml`) đã đăng nhập, mở mục “Kết quả phân tích Dầu”, đặt khoảng thời gian rồi **chỉ đọc** các trường hiển thị trên bảng danh sách của những mẫu Không Đạt: số phiếu, đơn vị, tên mẫu dầu, ngày lấy mẫu, đánh giá, ý kiến PKT, ý kiến QLVH, ngày trả kết quả. LIMS không có API nên dữ liệu được đọc từ nội dung trang. Tiện ích **không gửi, sửa hoặc xoá bất kỳ dữ liệu nào trên LIMS**.
- `duyenhai1.vn` — tiện ích nhận thao tác “Đồng bộ từ QLVT” / “Đồng bộ từ LIMS” do người dùng chủ động thực hiện và chuyển kết quả cho hệ thống quản lý vật tư PXVH1.

Tiện ích không truy cập tên miền khác, không đọc mật khẩu, cookie, token hoặc lịch sử duyệt web.

Tiện ích không yêu cầu quyền `tabs`. Host permission của từng trang nguồn đã đủ để tìm đúng tab tương ứng; tiện ích không có quyền đọc URL hoặc thông tin nhạy cảm của các tab thuộc tên miền khác.

## Dữ liệu cần khai báo

- Website content: Có — mã vật tư, mã kho, đơn vị tính và số lượng tồn kho từ phản hồi QLVT; và các trường phiếu kết quả phân tích dầu Không Đạt hiển thị trên bảng danh sách LIMS.
- Authentication information: Không thu thập hoặc truyền. Cookie/phiên đăng nhập chỉ được trình duyệt sử dụng nội bộ trong yêu cầu cùng nguồn đến QLVT / LIMS.
- Web history: Không.
- Personally identifiable information: Không. Các trường được đọc là dữ liệu nghiệp vụ về mẫu dầu và thiết bị, không phải thông tin cá nhân.
- Financial, health, communications, location: Không.

## Cách sử dụng dữ liệu

Dữ liệu chỉ được dùng để cung cấp chức năng đồng bộ đã mô tả. Không bán, không dùng quảng cáo, không chia sẻ cho bên thứ ba và không cho con người đọc ngoài hoạt động quản trị nghiệp vụ được phân quyền tại PXVH1.

## Xác nhận Limited Use

Việc sử dụng dữ liệu tuân thủ Chrome Web Store User Data Policy, bao gồm các yêu cầu Limited Use. Dữ liệu chỉ được dùng để cung cấp chức năng duy nhất mà người dùng chủ động yêu cầu.
