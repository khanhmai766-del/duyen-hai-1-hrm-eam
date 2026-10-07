# Tài khoản tra cứu

Trong **Quản lý người dùng**, chọn chế độ truy cập **Tài khoản tra cứu**. Sau đó mở **Phân quyền (RBAC) → Phân quyền tra cứu**, chọn tài khoản, đánh dấu các hạng mục được đọc và bấm **Lưu quyền tra cứu**. Đánh dấu **Áp dụng lựa chọn này cho tất cả tài khoản tra cứu** để lưu cùng một danh sách cho cả nhóm.

- Tài khoản cũ chưa được cấu hình giữ quyền đọc khiếm khuyết. Chọn thêm **Sổ cấp PCT** để xem sổ cơ và điện.
- Bỏ chọn hạng mục để thu hồi quyền; lưu danh sách rỗng sẽ chỉ còn trang tài khoản cá nhân.
- Chỉ cấp quyền đọc nghiệp vụ. Không cho thêm, sửa, xoá, cấp số PCT hoặc quản trị. Các thao tác cá nhân như đổi mật khẩu vẫn dùng được.
- Dữ liệu tra cứu theo hạng mục được cấp; hợp đồng giữ phạm vi phòng ban/hợp đồng hiện có. Trợ lý AI giữ các công cụ tra khiếm khuyết hiện có và chỉ dùng được khi có quyền khiếm khuyết.
- Tài khoản có chế độ truy cập bình thường tiếp tục sử dụng RBAC hiện có. Vai trò ADMIN hoặc hồ sơ quyền riêng không nâng quyền ghi của tài khoản tra cứu.

Cấu hình dùng bảng `RbacConfig` hiện có, khoá `lookup-permissions`, lưu danh sách hạng mục theo ID tài khoản. Mã chế độ `DEFECT_READ_ONLY` được giữ để tương thích dữ liệu cũ; không cần đổi schema hoặc chuyển đổi tài khoản. API ghi nhận nhật ký khi cập nhật quyền. Máy chủ đọc quyền hiện tại ở mỗi yêu cầu; giao diện cập nhật khi tải lại, quay lại tab hoặc chu kỳ lấy quyền tối đa 30 giây.

Danh mục hạng mục, đường dẫn và quyền đọc nằm trong `lib/lookup-access.ts`. Muốn cấp thêm một hạng mục đã có trong danh mục chỉ cần đánh dấu trên website. Khi bổ sung phân hệ mới vào ứng dụng, lập trình viên đăng ký phân hệ ở danh mục này và kiểm tra quyền đọc ở API tương ứng trước khi đưa vào sử dụng.

Hồ sơ tạo bằng **Thêm phân quyền** có nút **Xoá phân quyền** riêng. Xác nhận xoá sẽ lưu ma trận hiện tại, bỏ cột của hồ sơ và những liên kết gán hồ sơ đó; vai trò hệ thống và quyền riêng khác của tài khoản được giữ nguyên.
