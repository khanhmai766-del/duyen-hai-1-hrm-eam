# Thiết lập đồng bộ khiếm khuyết từ Google Sheet — V2

## 1. Kiến trúc

Hai Google Sheet công ty là nguồn chính. Apps Script chỉ đọc dữ liệu và trả JSON.
Backend lưu bản phản chiếu để tìm kiếm/lọc, còn các trường nguồn bị khóa trên web.

## 2. Tạo Apps Script

1. Mở một Google Sheet cá nhân dùng để chứa dự án Apps Script.
2. Chọn **Tiện ích mở rộng → Apps Script**.
3. Tạo file `DefectSync.gs`.
4. Sao chép toàn bộ nội dung V2 từ `docs/google-apps-script/defect-sync.gs`.
5. Bấm **Lưu**.

Tài khoản triển khai phải có quyền xem hai file nguồn:

- Cơ: `1zKRH9zhEAkCwGRl4KiaNwUlkLg9_l4WXNSBeg3FK_MA`
- Điện: `1nPKFBr3wXfOFE4y_WACDs7cvb1ZZA-mg0mZbsIuB_lQ`

## 3. Tạo token

Trong Apps Script:

1. Chọn **Cài đặt dự án**.
2. Mở **Thuộc tính tập lệnh**.
3. Thêm `SYNC_TOKEN`.
4. Giá trị là chuỗi ngẫu nhiên dài tối thiểu 32 ký tự.

Không ghi token trực tiếp trong mã và không đưa token lên Git.

## 4. Kiểm tra nguồn trước khi triển khai

1. Chọn hàm `kiemTraNguonV2`.
2. Bấm **Chạy** và cấp quyền Google yêu cầu.
3. Mở **Nhật ký thực thi**.
4. Kết quả phải có `"success":true`, `"schemaVersion":2` và đủ hai nguồn `CO`, `DIEN`.

Nếu kết quả báo `MISSING_COLUMNS`, chưa được triển khai; kiểm tra lại đúng tên tab `DH1`
và các cột bắt buộc STT, Tổ máy, Nội dung khiếm khuyết, Ngày phát hiện.

## 5. Triển khai Web App

1. Chọn **Triển khai → Lần triển khai mới**.
2. Loại: **Ứng dụng web**.
3. Thực thi với tư cách: **Tôi**.
4. Quyền truy cập: **Bất kỳ ai**.
5. Cấp quyền đọc Google Sheet.
6. Sao chép URL có dạng `https://script.google.com/macros/s/.../exec`.

Mở URL `/exec` không kèm token. Kết quả đúng:

```json
{
  "success": true,
  "service": "DH1_DEFECT_SYNC",
  "schemaVersion": 2
}
```

V2 không nhận token trên URL. Token chỉ được backend gửi bằng POST body.

Nếu cập nhật một deployment V1 đã có, chọn **Triển khai → Quản lý bản triển khai → Chỉnh sửa**,
chọn **Phiên bản mới** rồi triển khai. Không dùng lại phiên bản mã cũ.

## 6. Cấu hình backend

Thêm vào `.env` trên máy chủ:

```env
DEFECT_SYNC_URL="https://script.google.com/macros/s/.../exec"
DEFECT_SYNC_TOKEN="token giống trong Apps Script"
CRON_SECRET="một token bí mật khác"
```

Khởi động lại ứng dụng sau khi sửa `.env`.

Sau khi sửa `.env`, khởi động lại ứng dụng. Nút đồng bộ sẽ:

- gọi riêng nguồn Cơ và Điện;
- đọc từng trang 750 dòng;
- thử lại tối đa hai lần khi Google timeout, HTTP 429 hoặc HTTP 5xx;
- từ chối ghi nếu thiếu cột, sai schema V2 hoặc cùng khóa nội bộ nhưng nội dung khác.

Số yêu cầu hiển thị vẫn là `STT/năm`. Khóa nội bộ chống trùng gồm nguồn, loại,
STT, ngày phát hiện đầy đủ, tổ máy, cương vị và thiết bị nguồn. Hai dòng trùng
hoàn toàn được gộp thành một bản phản chiếu.

## 7. Kiểm tra lần đầu

1. Đăng nhập bằng tài khoản có toàn quyền quản lý khiếm khuyết.
2. Mở trang **Khiếm khuyết thiết bị**.
3. Bấm **Đồng bộ Google Sheet**.
4. Kiểm tra số dòng thêm mới/cập nhật.
5. Mở một dòng có nhãn **Google Sheet**.
6. Kiểm tra STT/năm, nội dung, trạng thái, nhắc lại và cột `Kết quả thực hiện (21)`.
7. Bấm biểu tượng sửa để ánh xạ thiết bị chính và thiết bị liên quan.

Sau khi bổ sung trường `Kết quả thực hiện (21)`, phải sao chép lại file
`docs/google-apps-script/defect-sync.gs` vào Apps Script, chọn
**Triển khai → Quản lý bản triển khai → Chỉnh sửa → Phiên bản mới** rồi triển khai.
Chạy lại `kiemTraNguonV2`; trong `columns` của cả hai nguồn phải có
`"repairResult":"Kết quả thực hiện..."`.

Không chạy lịch tự động trước khi lần kiểm tra thủ công thành công.

## 8. Chạy tự động ba lần mỗi ngày

Endpoint:

```text
GET https://TEN_MIEN_WEB/api/cron/defect-sync
Authorization: Bearer CRON_SECRET
```

Ví dụ cron theo giờ Việt Nam vào 07:00, 15:00 và 23:00:

```cron
0 0,8,16 * * * curl -fsS -H "Authorization: Bearer CRON_SECRET" https://TEN_MIEN_WEB/api/cron/defect-sync
```

Cron sử dụng UTC nên `00:00, 08:00, 16:00 UTC` tương ứng `07:00, 15:00, 23:00` tại Việt Nam.
Backend cũng từ chối chạy tự động quá gần lần thành công trước.

## 9. Quy tắc nghiệp vụ

- Sheet là nguồn của nội dung, trạng thái và nhắc lại.
- `Ghi chú KQ sửa chữa (VH1)` là tình trạng hiện tại; `Kết quả thực hiện (21)`
  là kết quả của bộ phận sửa chữa. Khi hai trạng thái nhận diện được khác nhau,
  web cảnh báo đỏ và ưu tiên bản ghi lên đầu.
- Web chỉ cho sửa ánh xạ thiết bị đối với bản ghi đồng bộ.
- Khi Sheet ghi đã xử lý, VHV có thể xác nhận đưa vào lịch sử.
- Sau xác nhận, lịch sử là bản chụp cố định và không bị đồng bộ ghi đè.
- Nếu nguồn thay đổi sau xác nhận, hệ thống chỉ đánh dấu thay đổi.
- Dòng biến mất khỏi nguồn được đánh dấu `MISSING`, không bị xóa.
- Khiếm khuyết nhập thủ công vẫn được sửa và nhắc lại trực tiếp trên web.
