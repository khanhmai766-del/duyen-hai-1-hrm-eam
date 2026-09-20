# Thông báo vận hành qua Telegram

Bot Telegram gửi các loại thông báo:

- kiểm tra lỗi đồng bộ mỗi 5 phút, cảnh báo sau 30 phút và báo phục hồi;
- gửi ngay khi phát sinh/nâng lên Mức 1 hoặc khi Mức 1 đổi trạng thái quan trọng;
- gửi ngay khi phiếu vật tư (theo dõi vật tư) qua một bước bất kỳ trong quy trình
  (tạo phiếu, đề xuất, xác nhận, lãnh, sử dụng, nghiệm thu, … tới quyết toán);
- 06:00, 14:00 và 22:00: khiếm khuyết phát sinh/đã xử lý trong ca vừa kết thúc,
  kèm phiếu vật tư mới tạo trong ca;
- 07:00: khiếm khuyết Mức 1 còn tồn đọng (đánh dấu tồn trên 24 giờ và 7 ngày) và
  phiếu vật tư cần chú ý (cảnh báo trễ hạn, chưa đem/chưa nhận lại biên bản thu hồi);
- 07:15 thứ Hai: tổng hợp tuần trước.

Ba ca được tính theo giờ Việt Nam: ca sáng 06:00–14:00, ca chiều
14:00–22:00 và ca đêm 22:00–06:00 ngày kế tiếp. Truy vấn dùng khoảng
`[đầu ca, cuối ca)` để phiếu tại thời điểm giao ca chỉ thuộc đúng một ca.
Phiếu khiếm khuyết/vật tư "phát sinh trong ca" tính theo `createdAt` (giờ hệ
thống thực sự ghi nhận), không dùng ngày phát hiện theo Sheet (không có giờ).

Mọi mốc ngày nghiệp vụ dùng `Asia/Ho_Chi_Minh`. Timer production dùng UTC vì
systemd 249 trên VPS chưa hỗ trợ hậu tố múi giờ trong `OnCalendar`.

## Cảnh báo theo từng bước của phiếu vật tư

`notifyMaterialTicketStep()` (`lib/material-ticket-telegram-alert.ts`) gửi 1
tin ngay sau khi một action của `PUT /api/material-tickets/[id]` (hoặc tạo
phiếu mới) chạy thành công — action nào không đổi trạng thái thực sự (`editInfo`,
`editStep`) thì không gửi. Không cần cấu hình thêm; dùng chung
`TELEGRAM_ALERT_ENABLED`/`TELEGRAM_CHAT_IDS` với khiếm khuyết.

`buildMaterialTicketAttentionDigest()` (`lib/material-ticket-telegram-digest.ts`)
chạy trong cùng job `level-one` (07:00), gửi thành tin riêng, tái dùng nguyên
logic cảnh báo đã có trên bảng theo dõi vật tư: `materialTicketAlert()` (trễ hạn
2 ngày làm việc), `materialTicketNeedsRecoveryHandover()` và
`materialTicketAwaitsRecoveryDocSignature()` (hai chặng trả phiếu vật tư thu hồi).

## Biến môi trường

```env
TELEGRAM_ALERT_ENABLED="true"
TELEGRAM_BOT_TOKEN="token-do-BotFather-cap"
TELEGRAM_CHAT_IDS="123456789"
TELEGRAM_TIMEZONE="Asia/Ho_Chi_Minh"
TELEGRAM_SYNC_ALERT_AFTER_MINUTES="30"
TELEGRAM_SYNC_REMINDER_MINUTES="240"
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

{"job":"weekly"}
```

`job` nhận `monitor`, `shift`, `level-one`, `weekly`. Thêm `"dryRun":true` để xem nội
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
node scripts/run-telegram-job.mjs shift --dry-run
node scripts/run-telegram-job.mjs level-one --dry-run
node scripts/run-telegram-job.mjs weekly --dry-run
node scripts/run-telegram-job.mjs monitor --dry-run
```

Khóa `(type, periodKey, chatId)` trong `TelegramNotificationLog` ngăn chạy lại
cùng bản tin trong một ca hoặc cùng báo cáo Mức 1 trong ngày. Muốn xem trước nội
dung, gọi API với `dryRun`; không xóa nhật ký production để ép gửi lại.

Sau khi kết quả xem trước đúng, bỏ `--dry-run` ở đúng một tác vụ cần gửi thử.

## Cài systemd timer

Chỉ thực hiện sau khi code và SQL đã deploy thành công:

```bash
cd /var/www/dh1-app
cp scripts/systemd/dh1-telegram@.service \
   scripts/systemd/dh1-telegram-monitor.timer \
   scripts/systemd/dh1-telegram-shift.timer \
   scripts/systemd/dh1-telegram-level-one.timer \
   scripts/systemd/dh1-telegram-weekly.timer \
   /etc/systemd/system/
systemctl disable --now \
  dh1-telegram-morning.timer \
  dh1-telegram-evening.timer
systemctl daemon-reload
systemctl enable --now \
  dh1-telegram-monitor.timer \
  dh1-telegram-shift.timer \
  dh1-telegram-level-one.timer \
  dh1-telegram-weekly.timer
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
