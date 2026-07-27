# Đồng bộ khiếm khuyết Google Sheet → n8n → DH1

Thiết kế này giữ lại các phần hạ tầng hợp lý của phương án tham khảo nhưng không
dùng bảng mirror và không `DELETE + INSERT`. Dữ liệu tiếp tục được upsert vào
`Defect` theo đúng `sourceKey` đang dùng bởi Apps Script V2.

## Nguyên tắc

- Google Sheet vẫn là nguồn chính cho các trường nguồn.
- Thiết bị VHV đã ánh xạ, trạng thái xác nhận và lịch sử không bị n8n ghi đè.
- Mỗi lượt snapshot gồm một nguồn `CO`, một nguồn `DIEN`, hoặc cả hai.
- Dữ liệu được gửi theo batch tối đa 500 dòng.
- Retry cùng `runId/source/batchNumber` không ghi trùng.
- Chỉ khi tất cả nguồn khai báo trong lượt hoàn tất, backend mới đánh dấu khóa
  không còn xuất hiện thành `MISSING`, và chỉ trong đúng Sheet đã đồng bộ.
- Nếu workflow dừng giữa chừng, dữ liệu hiện có vẫn được giữ nguyên.
- Run n8n treo quá 30 phút được tự đóng và dọn khóa staging; lịch sử run/batch
  đã kết thúc được giữ 90 ngày.

## Cài n8n cố định phiên bản

Sao chép `compose.yml` và `n8n.env.example` vào một thư mục riêng trên server,
ví dụ `/opt/n8n`. Đổi tên file môi trường thành `.env`, sinh hai bí mật:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Sau đó:

```bash
docker compose config
docker compose pull
docker compose up -d
docker compose logs -f n8n
```

Image được ghim bằng `N8N_VERSION=2.30.5`. Không dùng `latest`, không cài
Watchtower. Khi cần nâng cấp: backup PostgreSQL và volume `n8n_data`, sửa duy
nhất `N8N_VERSION`, rồi chủ động `docker compose pull n8n && docker compose up -d`.

## Cấu hình backend

Sinh một token riêng:

```bash
openssl rand -hex 32
```

Thêm vào `.env` của website:

```env
N8N_DEFECT_SYNC_TOKEN="token-rieng-cua-n8n"
```

Không dùng lại `DEFECT_SYNC_TOKEN` hoặc `CRON_SECRET`.

Áp dụng schema:

```bash
npx prisma db execute \
  --file prisma/manual/add-n8n-defect-sync.sql \
  --schema prisma/schema.prisma
npx prisma db execute \
  --file prisma/manual/optimize-n8n-defect-source-sync.sql \
  --schema prisma/schema.prisma
npx prisma generate
```

## Giao thức API

Tất cả request dùng:

```http
Authorization: Bearer N8N_DEFECT_SYNC_TOKEN
Content-Type: application/json
```

### 1. Bắt đầu snapshot

```http
POST /api/integrations/n8n/defects/runs
```

```json
{
  "externalRunId": "defects-2026-07-27T06:00:00+07:00",
  "expectedSources": ["CO"]
}
```

`expectedSources` nhận `["CO"]`, `["DIEN"]` hoặc `["CO", "DIEN"]`. Chỉ khai
báo những nguồn có `modifiedTime` thay đổi.

Response trả `data.runId`. n8n phải giữ giá trị này cho các node tiếp theo.

### 2. Gửi batch

```http
POST /api/integrations/n8n/defects/runs/{runId}/batches
```

Body mẫu nằm ở `sample-batch.json`. Một batch nhận tối đa 500 dòng. Số batch
được đánh từ 1 và độc lập cho từng nguồn.

### 3. Kết thúc

Chỉ gọi sau khi tất cả batch của các nguồn đã khai báo thành công:

```http
POST /api/integrations/n8n/defects/runs/{runId}/finish
```

```json
{
  "completedSources": ["CO"]
}
```

`completedSources` phải khớp chính xác `expectedSources` của lượt chạy.

Không đặt node `finish` trong nhánh luôn chạy sau lỗi.

### 4. Báo thất bại

Error Workflow gọi endpoint sau nếu run đã được tạo:

```http
POST /api/integrations/n8n/defects/runs/{runId}/fail
```

```json
{
  "message": "Mô tả ngắn lỗi từ workflow"
}
```

Endpoint chỉ đóng lượt chạy và dọn khóa staging. Những batch đã upsert vẫn an
toàn trong `Defect`; do chưa gọi `finish`, không có bản ghi nào bị đánh dấu
`MISSING`. Lượt snapshot kế tiếp của nguồn đó sẽ đối chiếu lại toàn bộ.

## Workflow n8n

1. Schedule Trigger kiểm tra định kỳ.
2. Đọc `modifiedTime` của hai file bằng Google Drive API.
3. Dừng ngay nếu cả hai mốc không đổi.
4. Bắt đầu run với `expectedSources` chỉ gồm những nguồn đã đổi.
5. Chỉ đọc, chuẩn hóa và gửi batch cho các Sheet tương ứng.
6. Finish với `completedSources` khớp chính xác `expectedSources`.
7. Chỉ sau khi finish trả `SUCCESS` mới lưu các mốc `modifiedTime`.
8. Error Workflow dùng `execution.id` để gọi endpoint `by-external-id/fail`,
   đóng run ngay, gửi cảnh báo và tuyệt đối không gọi `finish`.

Trong giai đoạn kiểm thử có thể đặt `EXECUTIONS_DATA_SAVE_ON_SUCCESS=all` để xem
output. Khi chạy ổn định, đổi lại `none` để database n8n không giữ thêm bản sao
dữ liệu vận hành.

## Nginx

n8n chỉ publish `127.0.0.1:5678`. Dùng subdomain HTTPS riêng và reverse proxy:

```nginx
location / {
    proxy_pass http://127.0.0.1:5678;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    proxy_buffering off;
}
```

Nếu n8n và website có IP cố định, nên whitelist IP n8n riêng cho prefix
`/api/integrations/n8n/`.
