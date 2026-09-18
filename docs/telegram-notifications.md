# Thông báo vận hành qua Telegram

Bot Telegram gửi ba loại thông báo:

- kiểm tra lỗi đồng bộ mỗi 5 phút, cảnh báo sau 30 phút và báo phục hồi;
- 06:30: khiếm khuyết phát sinh ngày hôm trước;
- 19:00: khiếm khuyết đã xử lý trong ngày và Mức 1 còn tồn đọng.

Mọi mốc ngày nghiệp vụ dùng `Asia/Ho_Chi_Minh`. Timer production dùng UTC vì
systemd 249 trên VPS chưa hỗ trợ hậu tố múi giờ trong `OnCalendar`.

## Biến môi trường

```env
TELEGRAM_ALERT_ENABLED="true"
TELEGRAM_BOT_TOKEN="token-do-BotFather-cap"
TELEGRAM_CHAT_IDS="123456789"
TELEGRAM_TIMEZONE="Asia/Ho_Chi_Minh"
TELEGRAM_SYNC_ALERT_AFTER_MINUTES="30"
TELEGRAM_SYNC_REMINDER_MINUTES="240"
TELEGRAM_MORNING_REPORT_TIME="06:30"
TELEGRAM_EVENING_REPORT_TIME="19:00"
TELEGRAM_JOB_TOKEN="token-rieng-cua-systemd"
SYNC_MONITOR_REPORT_TOKEN="token-rieng-de-worker-bao-trang-thai"
```

`TELEGRAM_CHAT_IDS` nhận nhiều nơi gửi, phân cách bằng dấu phẩy. Không commit
token thật. File `.env` production phải có quyền `600`.

## API tác vụ

```http
POST /api/internal/telegram-jobs
Authorization: Bearer TELEGRAM_JOB_TOKEN
Content-Type: application/json

{"job":"monitor"}
```

`job` nhận `monitor`, `morning`, `evening`. Thêm `"dryRun":true` để xem nội
dung mà không gửi và không ghi nhật ký `SENT`.

## API báo trạng thái đồng bộ

Các workflow ngoài luồng khiếm khuyết gọi API này ở đầu/cuối/error branch:

```http
POST /api/integrations/sync-monitor
Authorization: Bearer SYNC_MONITOR_REPORT_TOKEN
Content-Type: application/json

{
  "key": "MATERIAL_BACKUP",
  "name": "Dự phòng vật tư → Google Sheet",
  "status": "SUCCESS",
  "expectedIntervalMinutes": 60
}
```

Trạng thái nhận `RUNNING`, `SUCCESS`, `FAILED`. Nhánh `FAILED` gửi thêm `error`.
`key` chỉ gồm chữ hoa, số, `_`, `-`. `expectedIntervalMinutes = 0` nghĩa là
không kiểm tra bỏ lỡ lịch; hệ thống vẫn kiểm tra `FAILED` và lượt `RUNNING` treo.

Hai luồng khiếm khuyết `DEFECT_SHEET_TO_WEB` và `DEFECT_WEB_TO_SHEET` được đọc
trực tiếp từ `DefectSyncRun`/`DefectSyncOutbox`, không cần thêm node báo trạng
thái vào workflow n8n.

## Kiểm tra thủ công sau deploy

Không đưa token lên command line. Dùng script đọc `.env`:

```bash
cd /var/www/dh1-app
node scripts/run-telegram-job.mjs morning --dry-run
node scripts/run-telegram-job.mjs evening --dry-run
node scripts/run-telegram-job.mjs monitor --dry-run
```

Khóa `(type, periodKey, chatId)` trong `TelegramNotificationLog` ngăn chạy lại
cùng bản tin trong ngày. Muốn xem trước nội dung, gọi API với `dryRun`; không xóa
nhật ký production để ép gửi lại.

Sau khi kết quả xem trước đúng, bỏ `--dry-run` ở đúng một tác vụ cần gửi thử.

## Cài systemd timer

Chỉ thực hiện sau khi code và SQL đã deploy thành công:

```bash
cd /var/www/dh1-app
cp scripts/systemd/dh1-telegram@.service \
   scripts/systemd/dh1-telegram-monitor.timer \
   scripts/systemd/dh1-telegram-morning.timer \
   scripts/systemd/dh1-telegram-evening.timer \
   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now \
  dh1-telegram-monitor.timer \
  dh1-telegram-morning.timer \
  dh1-telegram-evening.timer
```

Kiểm tra:

```bash
systemctl list-timers 'dh1-telegram-*'
systemctl start dh1-telegram@monitor.service
journalctl -u 'dh1-telegram@*' -n 100 --no-pager
```

## Deploy

Schema production được áp dụng bằng file SQL đích danh:

```bash
./scripts/deploy-server.sh \
  --sql prisma/manual/add-telegram-notification-monitor.sql
```

Không chạy `npm run build`, `npm install` hoặc `pm2 restart` trực tiếp trong
`/var/www/dh1-app`.
