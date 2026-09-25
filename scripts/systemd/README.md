# scripts/systemd — unit & timer chạy trên production

## ⚠️ Đọc trước: unit KHÔNG đi theo `git pull`

Các tệp ở đây chỉ là **bản gốc để cài**. Bản đang chạy nằm ở `/etc/systemd/system/`
trên server và **không đổi khi deploy**. Hệ quả hai chiều:

- Sửa unit trong repo mà không chép lên server thì **không có tác dụng gì**.
- Có unit chỉ tồn tại trên server mà không ai biết. Tháng 9/2026 đã xảy ra: bốn tệp
  `dh1-rollover-*` chạy suốt nhiều tháng nhưng không có bản sao nào trong repo, chỉ
  lòi ra khi chạy `systemctl list-timers`. **Thêm unit mới trên server thì chép về
  đây ngay**, kẻo cài lại máy là mất.

Soát định kỳ xem hai bên còn khớp không:

```bash
ls /etc/systemd/system/dh1-*                                   # server có gì
systemctl list-timers --all --no-pager | grep -i dh1           # timer nào đang chạy
```

## Giờ: server chạy UTC, giờ VN = UTC+7

systemd 249 trên server **chưa hỗ trợ hậu tố múi giờ trong `OnCalendar`**, nên mọi mốc
đều phải quy đổi tay. Sửa lịch thì nhớ trừ 7 tiếng.

| Timer | `OnCalendar` (UTC) | Giờ VN | Gọi gì |
|---|---|---|---|
| `dh1-rollover-close` | `*-*-* 16:45` | 23:45 hằng ngày | `npm run tbycnn:rollover -- --close-now`, rồi `pccc:rollover` |
| `dh1-rollover-open` | `*-*-* 17:05` | 00:05 hằng ngày | `npm run tbycnn:rollover`, rồi `pccc:rollover` |
| `dh1-telegram-monitor` | `*-*-* *:00/5:00` | mỗi 5 phút | `run-telegram-job.mjs monitor` |
| `dh1-telegram-shift` | `23:00`, `07:00`, `15:00` | 06:00, 14:00, 22:00 | `run-telegram-job.mjs shift` |
| `dh1-telegram-level-one` | `*-*-* 00:00` | 07:00 hằng ngày | `run-telegram-job.mjs level-one` |
| `dh1-telegram-weekly` | `Mon *-*-* 00:15` | 07:15 thứ Hai | `run-telegram-job.mjs weekly` |
| `dh1-disk-guard` | `Sun *-*-* 20:37` | 03:37 thứ Hai | `server-disk-guard.sh` |
| `dh1-permit-people-sync` | `*-*-* 17:00` | 00:00 hằng đêm | `npm run import:permit-people` (thẻ nhà thầu từ Google Sheets) |

## Vì sao timer rollover chạy HẰNG NGÀY

`OnCalendar` không diễn tả được "ngày cuối tháng". Nên timer chạy mỗi ngày và **chính
script tự chặn**: `pccc-rollover.ts` / `tbycnn-rollover.ts` thoát `1` vào những ngày
không phải cuối tháng.

Vì vậy `dh1-rollover-close.service` đặt `ExecStart=-` (dấu trừ = bỏ qua mã thoát khác 0),
nếu không unit sẽ báo `failed` 29/30 ngày và che mất lỗi thật. **Mặt trái: dấu `-` bỏ qua
MỌI lỗi, không riêng lỗi "chưa tới cuối tháng"** — hỏng thật ở unit này cũng im lặng.
Đừng chỉ tin `systemctl status`, thỉnh thoảng xem log:

```bash
journalctl -u dh1-rollover-close.service --since "-40 days" | tail -40
```

`dh1-rollover-open.service` cố ý **không** có dấu `-`: lệnh mở kỳ idempotent, tháng chưa
sang thì không sinh gì mà vẫn thoát 0 — nên thoát khác 0 là sự cố thật, phải hiện ra.

## Bốn unit rollover gọi gián tiếp qua `npm run`

`ExecStart` dùng `npm run tbycnn:rollover` với `WorkingDirectory=/var/www/dh1-app`, **không**
ghi thẳng đường dẫn tệp. Nhờ vậy khi `scripts/` được sắp xếp lại (9/2026: `pccc-rollover.ts`
→ `scripts/data-ops/`), chỉ cần `package.json` đúng là timer vẫn chạy. **Giữ nguyên cách
gián tiếp này** khi thêm unit mới — ghi đường dẫn tệp vào `ExecStart` là tự tạo ra một liên
kết mà repo không kiểm được.

## Cài / cập nhật

```bash
cd /var/www/dh1-app
cp scripts/systemd/dh1-rollover-*.service scripts/systemd/dh1-rollover-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dh1-rollover-open.timer dh1-rollover-close.timer
systemctl list-timers --all --no-pager | grep -i dh1     # xác nhận
```

Hai tệp còn lại cài theo ghi chú ở dòng đầu của chính nó:
`journald-dh1-limit.conf` → `/etc/systemd/journald.conf.d/`, `logrotate-dh1-pm2` → `/etc/logrotate.d/`.
