# Đồng bộ khiếm khuyết Google Sheet → n8n → DH1

Thiết kế này giữ lại các phần hạ tầng hợp lý của phương án tham khảo nhưng không
dùng bảng mirror và không `DELETE + INSERT`. Dữ liệu tiếp tục được upsert vào
`Defect` theo khóa nguồn ổn định `sourceKey`.

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

Token này chỉ dùng cho kết nối hai chiều giữa website và n8n.

Áp dụng schema:

```bash
npx prisma db execute \
  --file prisma/manual/add-n8n-defect-sync.sql \
  --schema prisma/schema.prisma
npx prisma db execute \
  --file prisma/manual/optimize-n8n-defect-source-sync.sql \
  --schema prisma/schema.prisma
npx prisma db execute \
  --file prisma/manual/optimize-defect-page-queries.sql \
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
9. Nút `Đồng bộ bằng n8n` trên website gọi Production Webhook
   `/webhook/defects-manual-sync-dh1` qua backend, dùng Header Auth và yêu cầu
   đồng bộ cả hai nguồn. Token không được gửi xuống trình duyệt.

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

## Vận hành lâu dài

### Backup

Mỗi ngày cần backup cả database n8n và volume chứa khóa/cấu hình. Ví dụ chạy từ
`/opt/n8n` (thay `/var/backups/dh1-n8n` bằng thư mục backup riêng trên server):

```bash
sudo install -d -m 700 /var/backups/dh1-n8n
sudo docker compose exec -T n8n-db \
  pg_dump -U n8n -d n8n -Fc \
  > /var/backups/dh1-n8n/n8n-$(date +%F-%H%M).dump
sudo docker compose stop n8n
sudo tar -C /var/lib/docker/volumes -czf \
  /var/backups/dh1-n8n/n8n-data-$(date +%F-%H%M).tgz \
  n8n_n8n_data
sudo docker compose start n8n
```

Không coi backup là hợp lệ nếu chưa thử phục hồi trên thư mục/container tách
biệt. Giữ ít nhất 7 bản ngày và một bản tháng; sao chép thêm ra nơi khác máy chủ.

### Theo dõi

- Website hiển thị lượt gần nhất, trạng thái, nguồn và số dòng ngay trên trang
  Khiếm khuyết cho người có quyền quản lý.
- API danh sách ghi log `[slow defect list]` nếu truy vấn mất từ 750 ms.
- n8n chỉ lưu execution thất bại; execution thành công không lưu để tránh tăng
  database khoảng nhiều MB mỗi lượt.
- Kiểm tra định kỳ `docker compose ps`, dung lượng ổ đĩa, log container và lần
  backup gần nhất.

### Xoay token

1. Sinh token mới bằng `openssl rand -hex 32`.
2. Đổi Header Auth credential trong n8n.
3. Đổi `N8N_DEFECT_SYNC_TOKEN` trong `.env` website.
4. Build/reload website, rồi chạy thử thủ công một lượt.
5. Không ghi token vào workflow JSON, Git, ảnh chụp hoặc log.

Nên xoay token khi người quản trị thay đổi, nghi ngờ lộ bí mật hoặc định kỳ
6–12 tháng.
