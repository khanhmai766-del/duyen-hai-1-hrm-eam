# Vai trò sao lưu `dh1_backup`

`scripts/deploy-server.sh` sao lưu DB trước mỗi lượt deploy bằng vai trò riêng `dh1_backup`
(chỉ đọc, `BYPASSRLS`), **không** bằng tài khoản của website.

## Vì sao cần vai trò riêng

Mọi bảng TCMS bật `FORCE ROW LEVEL SECURITY`, và tài khoản của website cố ý **không** có
`BYPASSRLS` (xem `docs/contract-integration.md`). `pg_dump` bằng tài khoản đó hỏng giữa chừng ở
`tcms.acceptances` — gặp 2026-09-13, để lại file gzip 11MB trông hợp lệ nhưng thiếu dữ liệu.

`dh1_backup` chỉ đọc được (`pg_read_all_data` + `default_transaction_read_only`), và chỉ script
sao lưu dùng. Website vẫn chạy bằng tài khoản cũ, vẫn chịu RLS như thiết kế.

## Dựng một lần (người quản trị tự chạy — không đưa mật khẩu cho ai)

### Bước 1 — trên máy app (103.42.56.80): sinh mật khẩu, ghi `~/.pgpass`

```bash
PW=$(openssl rand -hex 24)
umask 077
printf '192.168.45.81:5432:dh1db:dh1_backup:%s\n' "$PW" >> ~/.pgpass
chmod 600 ~/.pgpass
echo "Mật khẩu (dán vào bước 2 rồi xoá khỏi màn hình): $PW"
unset PW
```

Mật khẩu hex nên không vướng ký tự `:` hay `\` — hai ký tự `.pgpass` phải escape.

### Bước 2 — trên máy DB (103.42.56.81): tạo vai trò, mở pg_hba

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dh1_backup') THEN
    CREATE ROLE dh1_backup LOGIN;
  END IF;
END$$;
ALTER ROLE dh1_backup LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE dh1_backup SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE dh1db TO dh1_backup;
GRANT pg_read_all_data TO dh1_backup;
SQL

# Gõ (dán) mật khẩu ở bước 1 — hỏi hai lần, màn hình không hiện ký tự.
sudo -u postgres psql -c '\password dh1_backup'

HBA=/etc/postgresql/16/main/pg_hba.conf
grep -q dh1_backup "$HBA" || echo "host dh1db dh1_backup 192.168.45.80/32 scram-sha-256" >> "$HBA"
systemctl reload postgresql@16-main
```

### Bước 3 — trên máy app: kiểm tra

```bash
psql -w "postgresql://dh1_backup@192.168.45.81:5432/dh1db" -XAtc \
  "select format('%s bypassrls=%s', current_user, rolbypassrls) from pg_roles where rolname = current_user"
# Phải in: dh1_backup bypassrls=t

cd /var/www/dh1-app && ./scripts/deploy-server.sh --dry-run
# Phải có dòng: ✓ Vai trò sao lưu dh1_backup đăng nhập được, có BYPASSRLS
```

## Gỡ bỏ

Trên máy DB: xoá dòng `dh1_backup` trong `pg_hba.conf`, `systemctl reload postgresql@16-main`,
rồi `sudo -u postgres psql -c 'DROP ROLE dh1_backup'`. Trên máy app: xoá dòng tương ứng trong
`~/.pgpass`.
