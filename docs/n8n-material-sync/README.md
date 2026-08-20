# Đồng bộ một chiều phiếu vật tư sang Google Sheets

## Đích production

- Spreadsheet ID: `1jGwOsAc18N_aCLarHbGppuhcNM1RDkLDfgh4dmVBnoA`
- Sheet: `VT_DONGBO`
- Vùng tiêu đề/dữ liệu: `A2:AJ`
- Dòng dữ liệu đầu tiên: `3`
- Khóa upsert: cột `AG` (`SYNC_KEY`)

## Hai đích đồng bộ V2

- Sheet vật tư: `VH1_VTDONGBO`
- Vùng tiêu đề/dữ liệu vật tư: `A2:AL`
- Dòng dữ liệu đầu tiên: `3`
- Khóa upsert vật tư: cột `AI` (`SYNC_KEY`)
- Workflow vật tư: `workflow-vh1-v2.json`
- Sheet hóa chất: `VH1_HOACHAT_DONGBO`
- Vùng tiêu đề/dữ liệu hóa chất: `A2:U`
- Khóa upsert hóa chất: cột `R` (`SYNC_KEY`)
- Workflow hóa chất: `workflow-chemical-v2.json`
- API dùng `layout=vh1_v2` và `syncScope=materials|chemicals`.

Mapper mặc định vẫn dùng bố cục cũ để workflow `VT_DONGBO` tiếp tục hoạt động.
Hai workflow V2 có watermark độc lập: `materialV2UpdatedAfter` và
`chemicalV2UpdatedAfter`.

Các cột bổ sung của V2:

- B: Luồng thực hiện; C: Tổ máy.
- Sheet vật tư không có ba cột hóa chất; `AI:AL` là dữ liệu kỹ thuật hệ thống.
- Sheet hóa chất giữ A:Q, trong đó O:Q là xác nhận/giao hóa chất; `R:U` là dữ
  liệu kỹ thuật hệ thống.
- Lần đồng bộ V2 từ đầu trả các phiếu theo tháng cấp STT rồi STT website tăng
  dần; các lượt tăng dần sau đó upsert đúng dòng theo `SYNC_KEY` và không làm
  đảo các dòng cũ.

### Đồng bộ thao tác xóa

- Khi xóa phiếu, website ghi một tombstone cho từng `SYNC_KEY` trước khi cascade
  xóa các item.
- API V2 trả `meta.deletedSyncKeys`; mapper legacy không thay đổi. Mỗi workflow
  tìm các khóa này trong sheet của mình (AI hoặc R), chỉ xóa khóa thực sự tồn
  tại rồi upsert trong cùng một Google Sheets `batchUpdate`.
- STT lấy trực tiếp từ phiếu trên website; khi xóa dòng, workflow không tự đánh
  lại STT theo vị trí trên Sheet.
- Watermark chỉ được lưu khi toàn bộ thao tác Google Sheets thành công; chạy lại
  vẫn an toàn nếu khóa đã không còn trên Sheet.

## API website

```http
GET /api/integrations/n8n/material-tickets?layout=vh1_v2&syncScope=<materials|chemicals>&updatedAfter=<ISO-8601>&limit=200
Authorization: Bearer <N8N_MATERIAL_SYNC_TOKEN>
```

Lần đầu có thể bỏ `updatedAfter` để lấy từ đầu. Nếu `meta.hasMore=true`, gọi
tiếp endpoint với `cursor=meta.nextCursor`; không gửi lại `updatedAfter` ở các
trang sau. Chỉ lưu `meta.watermark` sau khi tất cả các trang và thao tác ghi
Google Sheets đã thành công.

Mỗi phần tử `data[]` là một dòng sheet. Với vật tư, API trả `row.A:AK` và n8n
ghi `AL` (`SYNCED_AT`). Với hóa chất, API trả `row.A:T` và n8n ghi `U`.

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
- STT cột A lấy từ `sequenceNumber` của phiếu trên website.

## Lịch production

- Vật tư: giây 40 tại phút `8,23,38,53` mỗi giờ.
- Hóa chất: giây 10 tại phút `5,20,35,50` mỗi giờ.
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
