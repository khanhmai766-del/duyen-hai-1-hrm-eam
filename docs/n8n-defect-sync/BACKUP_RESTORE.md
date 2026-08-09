# Sao lưu và khôi phục n8n Duyên Hải 1

Tài liệu này dùng cho n8n self-hosted chạy bằng `compose.yml` trong cùng thư
mục. Không đưa file `.env`, database dump hoặc khóa mã hóa lên GitHub.

## Bộ backup bắt buộc

Mỗi bản backup hoàn chỉnh phải có:

- `postgres.dump`: database n8n, gồm workflow, credential và OAuth refresh token.
- `n8n-data.tar.gz`: nội dung volume `/home/node/.n8n`.
- `workflows.json`: bản xuất workflow để xem/import nhanh.
- `compose.yml` và `n8n.env`: cấu hình đúng phiên bản và khóa mã hóa.
- `MANIFEST.txt` và `SHA256SUMS`: phiên bản, image và checksum.

`N8N_ENCRYPTION_KEY` trong `n8n.env` phải khớp tuyệt đối với database. Mất khóa
này đồng nghĩa các credential đã mã hóa không thể sử dụng.

## Tạo backup trên server production

Chép `backup-n8n.sh` lên server rồi chạy bằng tài khoản có quyền Docker:

```bash
chmod 700 backup-n8n.sh
./backup-n8n.sh /opt/n8n/compose.yml /opt/n8n/.env /var/backups/dh1-n8n
```

Script không dừng n8n. Sau khi hoàn tất, chép nguyên thư mục được tạo sang một
nơi lưu trữ mã hóa ngoài server. Nên giữ ít nhất ba bản gần nhất và thử khôi
phục trên máy thử nghiệm định kỳ.

Nếu file `.env` của website nằm trên cùng server, có thể đưa nó vào bản backup
để giữ hai token đồng bộ (file vẫn được đặt quyền chỉ chủ sở hữu đọc):

```bash
WEBSITE_ENV_FILE=/opt/dh1-website/.env ./backup-n8n.sh \
  /opt/n8n/compose.yml /opt/n8n/.env /var/backups/dh1-n8n
```

Ít nhất một lần, tạo thêm bản chứa cả Docker image để vẫn dựng lại được nếu
registry không còn cung cấp đúng phiên bản:

```bash
INCLUDE_DOCKER_IMAGES=1 ./backup-n8n.sh \
  /opt/n8n/compose.yml /opt/n8n/.env /var/backups/dh1-n8n
```

## Kiểm tra backup

```bash
cd /var/backups/dh1-n8n/n8n-backup-YYYYMMDDTHHMMSSZ
sha256sum -c SHA256SUMS
pg_restore --list postgres.dump >/dev/null
tar -tzf n8n-data.tar.gz >/dev/null
```

Tất cả lệnh phải kết thúc thành công. Không mở hoặc gửi nội dung `n8n.env` qua
email/chat.

## Khôi phục trên máy mới

> Thao tác khôi phục ghi vào database và volume đích. Chỉ thực hiện trên máy
> mới hoặc sau khi đã xác nhận chính xác stack cần thay thế.

1. Cài Docker Engine và Docker Compose.
2. Chép thư mục backup vào máy mới, kiểm tra `SHA256SUMS`.
3. Tạo `/opt/n8n`, chép `compose.yml` và `n8n.env` thành `/opt/n8n/.env`.
4. Khởi động riêng PostgreSQL:

   ```bash
   cd /opt/n8n
   docker compose --env-file .env up -d n8n-db
   ```

5. Chờ database healthy, sau đó phục hồi dump vào database trống:

   ```bash
   docker compose --env-file .env exec -T n8n-db sh -c \
     'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' \
     < /duong-dan-backup/postgres.dump
   ```

6. Phục hồi volume khi dịch vụ n8n chưa chạy, sau đó mới khởi động:

   ```bash
   docker compose --env-file .env stop n8n
   docker compose --env-file .env run --rm --no-deps -T n8n sh -c \
     'tar -C /home/node/.n8n -xzf -' \
     < /duong-dan-backup/n8n-data.tar.gz
   docker compose --env-file .env up -d n8n
   ```

7. Đăng nhập n8n, kiểm tra Google OAuth và Header Auth credential.
8. Chạy thủ công từng workflow. Chỉ Publish sau khi đọc/ghi thử thành công.
9. Kiểm tra domain, HTTPS, webhook và hàng chờ đồng bộ trên website.

Không cần import `workflows.json` nếu database đã phục hồi thành công. File đó
chỉ dùng khi cần xem hoặc dựng lại workflow độc lập.

## Lịch vận hành đề xuất

- Backup PostgreSQL và volume mỗi ngày.
- Chép bản backup ra khỏi server ngay sau khi tạo.
- Kiểm tra checksum tự động sau mỗi lần backup.
- Mỗi tháng thử khôi phục trên một máy/container riêng.
- Kiểm tra dung lượng, HTTPS và execution lỗi hằng tuần.
- Không tự nâng n8n; backup và thử trên môi trường riêng trước khi đổi phiên bản.
