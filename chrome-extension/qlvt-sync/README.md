# Tiện ích Đồng bộ QLVT & LIMS – PXVH1

Một tiện ích, hai nguồn dữ liệu — cả hai đều **chỉ đọc**:

| Nguồn | Đọc gì | Trang trên app |
| --- | --- | --- |
| QLVT (`qlvt.tpcduyenhai.com.vn`) | Mã vật tư, kho, ĐVT, tồn kho | Vật tư theo ERP |
| LIMS (`portal.tpcduyenhai.com.vn/lims.xhtml`) | Mẫu dầu **Không Đạt** của PX Vận hành 1 | Tiện ích → Kết quả phân tích dầu |

## Cài đặt trên Chrome

1. Mở `chrome://extensions`.
2. Bật **Developer mode / Chế độ dành cho nhà phát triển**.
3. Chọn **Load unpacked / Tải tiện ích đã giải nén**.
4. Chọn thư mục `chrome-extension/qlvt-sync`.
5. Tải lại các tab QLVT, LIMS và tab `duyenhai1.vn`.

## Sử dụng — tồn kho QLVT

1. Kết nối máy vào mạng công ty.
2. Mở mục **Vật tư theo ERP** trên `https://duyenhai1.vn`.
3. Nhấn **Đồng bộ từ QLVT**.
4. Tiện ích tự tìm hoặc mở đúng trang tồn kho QLVT. Nếu phiên đã hết hạn,
   đăng nhập QLVT rồi quay lại nhấn **Tiếp tục đồng bộ**.

Tiện ích không đọc hoặc chuyển cookie, mật khẩu hay token sang PXVH1. Nó chỉ gọi API tồn kho ngay trong tab QLVT đã đăng nhập và trả về mã vật tư, kho, đơn vị tính, tồn kho.

## Sử dụng — kết quả phân tích dầu LIMS

1. Kết nối máy vào mạng công ty và đăng nhập LIMS.
2. Mở **Tiện ích → Kết quả phân tích dầu** trên `https://duyenhai1.vn`, chọn 7 / 14 / 30 ngày.
3. Nhấn **Đồng bộ từ LIMS**.
4. Tiện ích tự mở mục *Kết quả phân tích → Kết quả phân tích Dầu*, đặt khoảng
   thời gian, nới số dòng/trang rồi đọc bảng. Gặp trở ngại (hết phiên, Khu vực
   đang không phải **Duyên Hải 1**), app hiện đúng hướng dẫn và nút
   **Tiếp tục đồng bộ**.

Chỉ các trường hiển thị trên bảng danh sách được lấy về; **không** lấy chi tiết chỉ tiêu và **không** ghi gì lên LIMS — ý kiến QLVH vẫn nhập trực tiếp trên LIMS.

### Vì sao LIMS phải đọc DOM

LIMS là ứng dụng JSF/PrimeFaces một URL, mọi thao tác là `POST /lims.xhtml` trả về partial-response XML — **không có REST/JSON API** như QLVT. Cầu nối được tách thành hai lớp:

- `bridge-lims.js` chạy trong `ISOLATED` world, nhận message từ service worker và không truy cập biến JavaScript của trang.
- `bridge-lims-page.js` chạy trong `MAIN` world để dùng `PF`, `PrimeFaces` và `jQuery`; file này không có quyền gọi API `chrome.*`.

Hai lớp chỉ trao đổi message cùng origin, có `requestId`. Hai lưu ý khi bảo trì `bridge-lims-page.js`:

- Chỉ định vị bằng các id do lập trình viên LIMS đặt (`dtXemKqDau`, `tabpttn051`, `thoigianXemKQPT`, `khuvucXemKQPT`) hoặc bằng nhãn tiếng Việt. **Không** dùng id sinh tự động kiểu `j_idt1097` — chúng đổi sau mỗi lần EVN nâng cấp.
- Phân trang của LIMS lỗi khi dùng bộ lọc cột (bấm trang 2 không đổi dữ liệu, paginator hiện `NaN-NaN of N`). Vì vậy bridge **không** dùng bộ lọc cột: nó nới số dòng/trang lên 100 rồi tự lọc "Không Đạt" + đơn vị bằng JS, và báo lỗi nếu tổng số phiếu vẫn lớn hơn số dòng đọc được.

## Tạo gói Chrome Web Store

Từ thư mục gốc dự án, chạy:

```bash
node chrome-extension/scripts/package-store.mjs
```

Gói phát hành được tạo trong `chrome-extension/dist`. Script tự loại quyền localhost khỏi bản Store để chỉ giữ ba tên miền nghiệp vụ cần thiết. Khi thêm file JS mới vào tiện ích, phải bổ sung tên file vào danh sách trong script — nếu không gói Store sẽ thiếu file và tiện ích không nạp được.

Hồ sơ mô tả, khai báo quyền riêng tư, ghi chú xét duyệt và checklist nằm trong `chrome-extension/store-listing`.
