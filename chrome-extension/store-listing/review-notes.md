# Ghi chú cho nhóm xét duyệt

## Luồng kiểm thử

1. Mở và đăng nhập `https://qlvt.tpcduyenhai.com.vn/webapp/erp/page/EVN_INV_TONKHO/` bằng tài khoản nội bộ hợp lệ.
2. Mở `https://duyenhai1.vn/vat-tu/loai-dau?loai=loi-loc-dau` và đăng nhập bằng tài khoản PXVH1 có quyền quản lý vật tư.
3. Bấm “Đồng bộ từ QLVT”.
4. Ở lần đầu, đọc thông báo dữ liệu và bấm “Đồng ý và đồng bộ”.
5. Ứng dụng hiển thị kết quả số dòng QLVT, số mã thay đổi, số mã chưa có và số mã ngừng sử dụng.

Hai hệ thống đều là hệ thống nội bộ có đăng nhập. Nếu nhóm xét duyệt cần tài khoản kiểm thử, nhà phát hành sẽ cung cấp riêng qua kênh bảo mật của Chrome Web Store; không ghi tài khoản hoặc mật khẩu trong gói tiện ích.

## Giải thích kỹ thuật

- `bridge-app.js` chỉ nhận thao tác đồng bộ từ duyenhai1.vn.
- `background.js` chỉ tìm tab QLVT đang mở và chuyển thông điệp theo thao tác đó.
- `bridge-qlvt.js` gọi API QLVT trong phiên đăng nhập hiện tại, chuẩn hóa dữ liệu và chỉ trả về `code`, `warehouse`, `erpStock`.
- Không có mã tải từ xa, mã làm rối, analytics, quảng cáo hoặc lưu trữ cục bộ.
