# Ghi chú phát hành 1.1.0

- Gộp đồng bộ tồn kho QLVT và kết quả phân tích dầu LIMS trong một tiện ích.
- Bổ sung trang nguồn LIMS và chức năng chỉ đọc các mẫu dầu Không Đạt của PX Vận hành 1.
- Tự tìm hoặc mở tab nguồn khi người dùng chủ động bấm đồng bộ.
- Giữ hai luồng QLVT và LIMS độc lập để không ảnh hưởng lẫn nhau.
- Cải thiện xử lý tab nguồn tải lâu, bridge chưa sẵn sàng và context bị vô hiệu hóa sau khi cập nhật tiện ích.
- Không đọc mật khẩu, cookie hoặc token; không ghi, sửa hay xoá dữ liệu trên QLVT/LIMS.

## Thông báo nội bộ đề xuất

Phiên bản 1.1.0 bổ sung quyền truy cập `portal.tpcduyenhai.com.vn` để đọc kết quả phân tích dầu từ LIMS. Sau khi Chrome cập nhật tiện ích, người dùng có thể cần chấp nhận quyền mới và tải lại các tab PXVH1 đang mở.
