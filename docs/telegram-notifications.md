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
- PCT nhà thầu đại tu: báo mở ngày sau 30 phút, báo kết thúc ngay sau khi lưu; kết thúc trước 30 phút có thể gộp hai phần trong một tin; bàn giao CHTT có bản tin riêng;
- 00:00: tổng nhân sự đại tu, nhân sự đã làm việc và danh sách số hiệu PCT của từng nhà thầu trong ngày vừa kết thúc.

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
TELEGRAM_OVERHAUL_CHAT_IDS=""
TELEGRAM_TIMEZONE="Asia/Ho_Chi_Minh"
TELEGRAM_SYNC_ALERT_AFTER_MINUTES="30"
TELEGRAM_SYNC_REMINDER_MINUTES="240"
TELEGRAM_JOB_TOKEN="token-rieng-cua-systemd"
SYNC_MONITOR_REPORT_TOKEN="token-rieng-de-worker-bao-trang-thai"
```

`TELEGRAM_CHAT_IDS` nhận nhiều nơi gửi, phân cách bằng dấu phẩy. Không commit
token thật. File `.env` production phải có quyền `600`.

Nhóm **Báo cáo tự động** nằm trong `TELEGRAM_CHAT_IDS`, tiếp tục nhận khiếm khuyết,
phiếu vật tư và cảnh báo đồng bộ. Nhóm **Trưởng ca DH1** được chuyển sang nhận báo cáo
đại tu: đặt chat ID của nhóm đó trong `TELEGRAM_OVERHAUL_CHAT_IDS`.
Nhóm đã nằm trong danh sách đại tu tự động bị loại khỏi danh sách nhận chung,
kể cả `TELEGRAM_CHAT_IDS` cũ vẫn chứa cả hai nhóm. Đại tu không dùng nhóm chung
làm dự phòng khi chưa có `TELEGRAM_OVERHAUL_CHAT_IDS`; hàng đợi giữ lại và báo lỗi cấu hình.
Các bản tin đang chờ thử lại cũng không gửi tới nhóm đã bị gỡ khỏi danh sách đại tu.
Đây là thay đổi nơi nhận trong ứng dụng, không đổi tên nhóm Telegram.

## API tác vụ

```http
POST /api/internal/telegram-jobs
Authorization: Bearer TELEGRAM_JOB_TOKEN
Content-Type: application/json

{"job":"weekly"}
```

`job` nhận `monitor`, `shift`, `level-one`, `weekly`, `overhaul`, `overhaul-daily`. Thêm `"dryRun":true` để xem nội
dung mà không gửi và không ghi nhật ký `SENT`.

## Báo cáo PCT đại tu

Chỉ áp dụng PCT `CONTRACTOR` / `OVERHAUL`. Bật riêng bằng `TELEGRAM_OVERHAUL_ENABLED=true`
sau khi đã áp dụng `prisma/manual/add-work-permit-telegram-outbox.sql`. Biến này mặc định tắt;
không bật trước khi có bảng hàng đợi. Dùng chung bot, gửi riêng tới nhóm trong `TELEGRAM_OVERHAUL_CHAT_IDS`.

- **Mở ngày**: chờ 30 phút tính từ `openedAt` (thời điểm cho phép). Timer kiểm tra mỗi phút,
  nên thường gửi trong phút đầu sau mốc đó. Đếm người thực sự đã vào làm tại lúc gửi, không gồm CHTT.
- **Kết thúc**: sau transaction lưu thành công, gửi số PCT dạng `số/năm/VH1-NĐDH`, nhà thầu,
  cương vị cho phép (`WorkPermit.position`), nội dung, CHTT, số nhân viên đã tham gia (kể cả đã ra),
  giờ cho phép/kết thúc. Không thêm tổ máy. Tiến độ lấy các hạng mục có đổi % hoặc ghi chú,
  so với ảnh chụp % tại lúc mở, ví dụ `30% → 50%`. Cập nhật giữa chừng vẫn được tính vào thay đổi cuối ngày.
- **Kết thúc trước đủ 30 phút**: nếu có lịch mở nhưng chưa gửi thì huỷ lịch còn chờ, gửi một tin gộp mở/kết thúc.
  Quyết định riêng theo từng nhóm: nhóm đã nhận mở thì chỉ nhận kết thúc, nhóm chưa nhận mở thì nhận bản gộp.
  Đúng mốc 30 phút hoặc muộn hơn chỉ báo kết thúc, kể cả báo mở gặp lỗi. Lượt cũ không có lịch mở
  (ví dụ mở trước khi bật chức năng) chỉ báo kết thúc. Nếu một worker đang gửi mở, bản kết thúc chờ worker đó xong để không gửi ngược thứ tự.
- **Bàn giao CHTT**: gửi riêng số PCT, nhà thầu, cương vị cho phép, nội dung, CHTT cũ/mới,
  giờ và ghi chú bàn giao; ghi rõ PCT tiếp tục làm việc. Giữ lịch mở ban đầu (không tính lại 30 phút
  từ lúc bàn giao), không gửi lại mở nếu đã gửi. Báo kết thúc thật giữ giờ mở, số người không trùng
  và tiến độ xuyên suốt chuỗi bàn giao, so với ảnh chụp đầu ngày.
- **Tên nhà thầu**: kèm mã đơn vị trong ngoặc, lấy từ `WorkPermitCompany.code`, ví dụ `Nhà thầu A (IDC)`.
  Áp dụng cho mở, kết thúc, bàn giao và tổng hợp cuối ngày. Đơn vị chưa khai mã vẫn hiện tên.
- **00:00 giờ Việt Nam**: tổng hợp ngày vừa kết thúc theo khoảng `[0h, 0h ngày sau)`;
  chỉ liệt kê nhà thầu có làm đại tu. Mỗi nhà thầu có tổng hồ sơ nhân sự `scope=OVERHAUL`,
  số người không trùng đã làm trong ngày (gồm CHTT, không tách vai trò), danh sách số hiệu PCT không trùng.
  Lần làm việc xuyên ngày thuộc cả hai ngày; nhiều lần làm việc của một PCT chỉ liệt kê một số hiệu trong ngày.
  Sĩ số theo hồ sơ đơn vị hiện tại, giống bảng nhân sự; dữ liệu cũ thiếu lượt vào/ra tính theo danh sách lần làm việc.

`WorkPermitTelegramOutbox` được tạo cùng transaction nghiệp vụ: không mất lịch chờ khi reload,
không gửi nếu transaction thất bại. Lịch mở lấy số người mới nhất; bản kết thúc và tổng hợp được chốt nội dung.
Sau lần xử lý đầu tiên, từng đoạn tin của từng nhóm được giữ nguyên cho lần thử lại.
Mỗi đoạn có khoá riêng trong `TelegramNotificationLog`, đoạn đã `SENT` được bỏ qua khi thử lại.
Lease 10 phút cho worker bị gián đoạn; lỗi được thử lại mỗi phút. Telegram không cung cấp khoá idempotency:
nếu tiến trình chết đúng sau khi Telegram nhận nhưng trước khi ghi `SENT`, tin có thể được gửi lại.

Xem trước (không gửi, không claim và không ghi hàng đợi):

```bash
node scripts/run-telegram-job.mjs overhaul --dry-run
node scripts/run-telegram-job.mjs overhaul-daily --dry-run
```

Job `overhaul` xử lý hàng đợi đã đến giờ; job `overhaul-daily` tạo bản tổng hợp của hôm qua,
không tạo tin nếu không có nhà thầu đại tu làm việc. Bản tổng hợp lỗi được job mỗi phút thử lại.
SQL và hai timer mới cần cài riêng khi được phép triển khai; sửa mã cục bộ không tự bật chúng.

```bash
# Sau khi được phép deploy/áp dụng SQL và thay đổi cấu hình:
./scripts/deploy-server.sh --sql prisma/manual/add-work-permit-telegram-outbox.sql
# Đặt TELEGRAM_OVERHAUL_ENABLED=true trong .env theo quy trình cấu hình dịch vụ.
cp scripts/systemd/dh1-telegram-overhaul.timer \
   scripts/systemd/dh1-telegram-overhaul-daily.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dh1-telegram-overhaul.timer dh1-telegram-overhaul-daily.timer
```

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
