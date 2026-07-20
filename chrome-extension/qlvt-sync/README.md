# Tiện ích Đồng bộ tồn kho QLVT – PXVH1

## Cài đặt trên Chrome

1. Mở `chrome://extensions`.
2. Bật **Developer mode / Chế độ dành cho nhà phát triển**.
3. Chọn **Load unpacked / Tải tiện ích đã giải nén**.
4. Chọn thư mục `chrome-extension/qlvt-sync`.
5. Tải lại cả tab QLVT và tab `duyenhai1.vn`.

## Sử dụng

1. Mở và đăng nhập trang `https://qlvt.tpcduyenhai.com.vn/webapp/erp/page/EVN_INV_TONKHO/`.
2. Giữ tab QLVT đang mở.
3. Mở mục **Vật tư theo ERP** trên `https://duyenhai1.vn`.
4. Nhấn **Đồng bộ từ QLVT**.

Tiện ích không đọc hoặc chuyển cookie, mật khẩu hay token sang PXVH1. Nó chỉ gọi API tồn kho ngay trong tab QLVT đã đăng nhập và trả về mã vật tư, kho, tồn kho.
