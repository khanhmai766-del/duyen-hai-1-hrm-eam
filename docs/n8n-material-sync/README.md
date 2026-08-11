# Đồng bộ một chiều phiếu vật tư sang Google Sheets

## Đích production

- Spreadsheet ID: `1jGwOsAc18N_aCLarHbGppuhcNM1RDkLDfgh4dmVBnoA`
- Sheet: `VT_DONGBO`
- Vùng tiêu đề/dữ liệu: `A2:AJ`
- Dòng dữ liệu đầu tiên: `3`
- Khóa upsert: cột `AG` (`SYNC_KEY`)

## API website

```http
GET /api/integrations/n8n/material-tickets?updatedAfter=<ISO-8601>&limit=100
Authorization: Bearer <N8N_MATERIAL_SYNC_TOKEN>
```

Lần đầu có thể bỏ `updatedAfter` để lấy từ đầu. Nếu `meta.hasMore=true`, gọi
tiếp endpoint với `cursor=meta.nextCursor`; không gửi lại `updatedAfter` ở các
trang sau. Chỉ lưu `meta.watermark` sau khi tất cả các trang và thao tác ghi
Google Sheets đã thành công.

Mỗi phần tử `data[]` là một dòng sheet. `row.A` đến `row.AI` ánh xạ trực tiếp
vào cột tương ứng. Cột `AJ` do n8n đặt bằng thời điểm hiện tại sau khi chuẩn bị
ghi. Một phiếu có nhiều item sẽ có nhiều dòng với `SYNC_KEY` khác nhau.

Cột `AD` lấy trực tiếp từ `MaterialTicket.bbntDoNumber` (Số BBNT D-Office được
nhập tại bước quyết toán).

Quy ước dữ liệu nghiệp vụ:

- Các cột khối lượng ghi kèm đơn vị của nhóm vật tư.
- Cột H chỉ có mã ERP sau khi Thống kê chọn mã; cột I luôn là tên nhóm từ
  Danh mục Vận hành 1.
- Ghi chú lúc tạo đề xuất ghi vào cột K (Mục đích sử dụng); cột L để trống cho
  tới khi website có trường ghi chú riêng.
- Cột T chỉ ghi nội dung nghiệm thu (`completionNote`), không tự lấy tên thiết
  bị khi bước sử dụng chưa nhập nội dung.
- Ngày nghiệp vụ hiển thị `dd/MM/yyyy`; cột kỹ thuật AH/AJ hiển thị
  `dd/MM/yyyy HH:mm:ss` theo múi giờ Việt Nam.
- STT cột A do workflow tính theo vị trí dòng thực tế trên Sheet.

## Lịch production

- Trigger: `8,23,38,53 * * * *` (mỗi 15 phút).
- Sau trigger chờ 40 giây rồi mới gọi website/Google Sheets.
- Timezone workflow: `Asia/Ho_Chi_Minh`.
- Không bật đồng bộ ngược từ Sheet về website.

## Biến môi trường website

```dotenv
N8N_MATERIAL_SYNC_TOKEN=<chuỗi-ngẫu-nhiên-riêng>
```

Sinh token ví dụ bằng `openssl rand -hex 32`. Không dùng chung token vật tư với
token đồng bộ khiếm khuyết.

## Nguyên tắc lỗi

- Google Sheets upsert theo `SYNC_KEY`; chạy lại không tạo dòng trùng.
- Không cập nhật watermark nếu bất kỳ trang hoặc batch ghi nào thất bại.
- Retry lỗi `429`/`5xx` theo exponential backoff.
- Không xóa dòng trên Sheet khi website không trả dòng đó trong một lượt tăng dần.
