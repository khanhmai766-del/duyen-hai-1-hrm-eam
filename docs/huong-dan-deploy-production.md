# Hướng dẫn deploy production — duyenhai1.vn

Áp dụng từ 13/09/2026 (commit `0274e87`). Server: `ssh -p 38791 root@103.42.56.80`, app ở
`/var/www/dh1-app`, chạy bằng pm2 tên `dh1-app`.

**Một câu tóm tắt:** trên server chỉ deploy bằng `./scripts/deploy-server.sh`. Script build ra thư
mục riêng rồi mới đổi sang, nên người đang dùng web chỉ bị gián đoạn khoảng 1 giây.

---

## 0. Những lệnh KHÔNG được chạy tay trong `/var/www/dh1-app`

| Lệnh | Hậu quả | Làm thay bằng |
|---|---|---|
| `npm run build`, `npx next build` | Xoá sạch `.next` đang chạy rồi dựng lại tại chỗ. Trong 2–3 phút đó mọi người dùng bị lỗi 500 `Cannot find module .next/server/…` (đã xảy ra 3 lần ngày 13/09: lưu tiếp địa, n8n chốt lịch sử khiếm khuyết…) | `./scripts/deploy-server.sh` |
| `git pull` rồi `pm2 reload`/`pm2 restart` (không build) | Mã nguồn mới chạy với bản build cũ, lệch nhau, lỗi khó đoán | `./scripts/deploy-server.sh` |
| `npm install` khi web đang chạy | Ghi đè `node_modules` dưới chân app | Script tự chạy khi `package.json`/lock thay đổi |
| `rm -rf .next`, xoá/sửa tay trong `.next` hay `.next-builds/` | Mất bản đang chạy hoặc mất bản để quay lại | `./scripts/deploy-server.sh --rollback` |
| Sửa code trực tiếp trên server | Lần deploy sau bị chặn (cây làm việc bẩn), hoặc bị ghi đè mất | Sửa trên máy dev → commit → push |

Chạy `npm run build` **trên máy dev** thì hoàn toàn bình thường — cấm là cấm trên server.

---

## 1. Trên máy dev

1. Kiểm tra: `npx tsc --noEmit` và `npm run build` (trên máy dev).
2. Commit rồi `git push origin main`.
3. Nếu bản này **thêm bảng/cột** trong DB: đặt file SQL vào `prisma/manual/` (nơi duy nhất
   chứa SQL thủ công) và ghi lại đường dẫn — lúc deploy phải truyền từng file bằng `--sql`.

## 2. Vào server

```bash
ssh -p 38791 root@103.42.56.80
cd /var/www/dh1-app
```

## 3. Kiểm tra trước khi deploy (bắt buộc, khoảng 1 phút)

```bash
git status --short --untracked-files=no   # phải TRỐNG (riêng package-lock.json thì script tự trả về)
git log --oneline -1                      # bản đang chạy
git fetch origin
git log --oneline HEAD..origin/main       # các commit SẮP LÊN — đọc kỹ từng dòng
./scripts/deploy-server.sh --dry-run      # xem trước mọi bước, KHÔNG thay đổi gì
```

- Danh sách commit sắp lên có commit của người khác mà mình không biết → **hỏi trước**, đừng deploy
  thay người khác.
- `--dry-run` phải đi hết tới dòng `✔ DEPLOY XONG`. Dừng ở đâu thì đọc thông báo ở đó (xem mục 6).

## 4. Deploy

Server không có `tmux`/`screen`, nên **luôn chạy nền** — rớt SSH giữa chừng thì deploy vẫn chạy
tiếp, không bị cắt ngang:

```bash
LOG=/root/deploy-$(date +%F-%H%M).log
setsid nohup ./scripts/deploy-server.sh > "$LOG" 2>&1 < /dev/null &
tail -f "$LOG"        # Ctrl+C chỉ thoát xem log — deploy vẫn chạy
```

Có file SQL thì thêm `--sql` cho **từng** file, đúng thứ tự cần chạy:

```bash
setsid nohup ./scripts/deploy-server.sh --sql prisma/manual/them-cot-abc.sql > "$LOG" 2>&1 < /dev/null &
```

### Các tuỳ chọn

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--dry-run` | In ra sẽ làm gì, không thay đổi gì |
| `--sql <file>` | Chạy file SQL trước khi đổi sang bản mới (lặp lại cho nhiều file) |
| `--no-backup` | Bỏ sao lưu DB. **Chỉ dùng** khi bản deploy không có SQL và sao lưu đang hỏng |
| `--keep <n>` | Số bản cũ giữ để quay lại (mặc định **3**) |
| `--branch <nhánh>` | Deploy nhánh khác `main` (hầu như không dùng) |
| `--rollback` | Quay lại bản build trước (mục 7) |

### Script làm gì và mất bao lâu

| Bước | Việc | Thời gian | Web |
|---|---|---|---|
| Kiểm tra | Cây làm việc sạch, vai trò sao lưu, đĩa, pm2 | ~5 giây | Bình thường |
| 1/7 | Sao lưu DB (vai trò `dh1_backup`) → `/root/backup-dh1db-<ngày>-truoc-<sha>.sql.gz` | ~5 giây | Bình thường |
| 2/7 | `git pull` (+ `npm install` nếu phụ thuộc đổi) | vài giây – vài phút | Bình thường* |
| 3/7 | Chạy các file `--sql` | tuỳ file | Bình thường |
| 4/7 | Tạo `.next-builds/<sha>-<giờ>`, chép cache build | ~5–10 giây | Bình thường |
| 5/7 | **Build trong thư mục riêng** — app đang chạy không bị đụng | ~2–3 phút | Bình thường |
| 6/7 | Đổi thư mục (vài mili-giây) + `pm2 reload` + tự kiểm tra | ~10 giây | **Gián đoạn ~1 giây** |
| 7/7 | Dọn bản cũ, giữ 3 bản gần nhất | ~1 giây | Bình thường |

\* `npm install` vẫn ghi đè `node_modules` tại chỗ — chỉ xảy ra khi `package.json`/lock thay đổi.

Thành công khi dòng cuối log là: `✔ DEPLOY XONG — dh1-app đang chạy <sha>`.

## 5. Kiểm tra sau deploy

```bash
pm2 describe dh1-app | grep -E "status|restarts|node.js version"      # online
curl -s -o /dev/null -w "%{http_code}\n" https://duyenhai1.vn/login  # 200
tail -n 30 /root/.pm2/logs/dh1-app-error.log                          # không có lỗi mới
# Lỗi 5xx trong 10 phút gần nhất (không in ra gì là tốt):
awk -v t="$(date -u -d '-10 min' +%d/%b/%Y:%H:%M)" '$4>"["t && $9>=500' /var/log/nginx/access.log
```

Sau đó mở web, đăng nhập, vào đúng trang vừa sửa để xem tận mắt.

## 6. Khi có sự cố

| Tình huống | Trạng thái web | Làm gì |
|---|---|---|
| Script dừng ở **KIỂM TRA** (cây bẩn, đĩa đầy, pm2…) | Chưa bị đụng | Xử lý đúng thông báo, chạy lại |
| **Vai trò sao lưu** không đăng nhập được | Chưa bị đụng | Xem **Phụ lục C** (dựng vai trò `dh1_backup`). Chỉ dùng `--no-backup` nếu bản này không có SQL |
| **BUILD GÃY** | Vẫn chạy bản cũ, không ảnh hưởng | Server đã pull mã mới nhưng chưa dùng. Sửa lỗi trên máy dev → push → deploy lại. Muốn server khớp bản đang chạy: `git reset --hard <sha cũ>` (script in sẵn sha) |
| **Tự kiểm tra sau reload thất bại** / web lỗi sau deploy | Đang chạy bản mới bị lỗi | `./scripts/deploy-server.sh --rollback` |
| Rớt SSH khi chạy **không** có `setsid nohup` | Tuỳ lúc bị cắt | Xem mục 6.1 |
| **Lỡ tay** chạy `npm run build` trong `/var/www/dh1-app` | Lỗi 500 trong lúc build | Xem mục 6.2 |

### 6.1. Deploy bị cắt ngang giữa chừng

```bash
cd /var/www/dh1-app
echo "BUILD_ID $(cat .next/BUILD_ID) | commit $(cat .next/.deploy-sha)"   # bản đang chạy
ls -la .next-builds/                         # thư mục <sha>-<giờ> mới nhất là bản đang build dở
pm2 describe dh1-app | grep status
```

- Bị cắt **trước bước 6** → `.next` vẫn là bản cũ, web không sao. Xoá thư mục build dở
  (`rm -rf .next-builds/<sha>-<giờ>` — đúng thư mục **không có** file `BUILD_ID`) rồi deploy lại.
- Bị cắt **trong bước 6** (hiếm, cửa sổ vài mili-giây): nếu **không còn** `.next` → đưa bản vừa cất
  về: `mv -T .next-builds/<sha-cũ>-truoc-<sha-mới>-<giờ> .next && pm2 reload dh1-app`.

### 6.2. Lỡ chạy `npm run build` tay

1. **Đừng chạy thêm lệnh nào khác**, đừng Ctrl+C giữa chừng nếu build đã chạy được một lúc.
2. Build **thành công** → chạy ngay `pm2 reload dh1-app` (tiến trình đang chạy phải nạp lại bản vừa
   build).
3. Build **gãy** → `.next` đã hỏng, web đang lỗi → `./scripts/deploy-server.sh --rollback` để đưa
   bản build tốt gần nhất vào.
4. Lần deploy sau vẫn dùng script như bình thường.

## 7. Quay lại bản trước (rollback)

```bash
cd /var/www/dh1-app
cat .next/.deploy-sha                                      # bản đang chạy
ls -1dt .next-builds/*/ .next.rollback-*/ 2>/dev/null      # các bản quay lại được, MỚI NHẤT TRƯỚC
./scripts/deploy-server.sh --rollback --dry-run            # xem sẽ đưa bản nào vào
./scripts/deploy-server.sh --rollback
```

- Rollback chỉ **đổi tên thư mục** + `pm2 reload`, xong trong vài giây.
- Chạy `--rollback` thêm lần nữa là **về lại** bản vừa gỡ.
- Rollback chỉ lùi **mã nguồn**, KHÔNG lùi DB. Cần lùi DB (nạp lại file `/root/backup-dh1db-…sql.gz`)
  là việc lớn — hỏi quản trị, không tự làm.
- Server giữ **3 bản** gần nhất (đã bỏ cache, mỗi bản ~35MB).

## 8. Dung lượng server — thứ gì tự dọn, thứ gì phải tự quyết

Ổ đĩa từng bị ăn dần mà không ai thấy (18 bản chụp `.next` 20GB, 27 bản sao lưu DB, journald 2.8GB,
cache npm 3.1GB — đo 13/09/2026). Nay có ba lớp chặn:

| Thứ tích luỹ | Ai dọn | Quy tắc |
|---|---|---|
| Bản build để rollback `.next-builds/` | `deploy-server.sh` mỗi lượt deploy | Giữ 3 bản gần nhất, bỏ cache |
| Sao lưu DB `/root/backup-dh1db-<ngày>-truoc-<sha>.sql.gz` | deploy + chốt chặn hằng tuần | **Luôn giữ 10 bản mới nhất**; bản ngoài số đó chỉ xoá khi **cũ hơn 14 ngày**; bản dở `.INCOMPLETE` xoá luôn |
| Log deploy `/root/deploy-*.log` | deploy + chốt chặn hằng tuần | Giữ 20 file |
| Cache npm `/root/.npm` | deploy + chốt chặn hằng tuần | Quá 2GB thì dọn |
| Journald (log hệ thống) | systemd | Tối đa 500MB, giữ 1 tháng (`/etc/systemd/journald.conf.d/dh1-limit.conf`) |
| Log pm2 `/root/.pm2/logs` | logrotate | Xoay hằng tuần, giữ 8 bản nén (`/etc/logrotate.d/dh1-pm2`) |
| Gói `.deb` apt đã tải | chốt chặn hằng tuần | `apt-get clean` |

**Chốt chặn hằng tuần** `dh1-disk-guard.timer` chạy `scripts/server-disk-guard.sh` lúc 03:37 sáng thứ Hai
(giờ VN). Nếu ổ còn dưới **15GB**, nó liệt kê thư mục lớn nhất và báo **failed** (không tự xoá gì thêm):

```bash
systemctl list-timers dh1-disk-guard.timer           # lần chạy kế tiếp
journalctl -u dh1-disk-guard.service -n 30           # kết quả lần chạy gần nhất
systemctl --failed                                   # có dh1-disk-guard = ổ sắp đầy
/var/www/dh1-app/scripts/server-disk-guard.sh --dry-run   # xem sẽ dọn gì, không xoá
```

**KHÔNG tự dọn — người vận hành phải quyết:** dump tạo tay (`/root/*.sql` không theo mẫu tên trên), thư mục
bản cũ sau nâng cấp (`/var/www/dh1-app-node20`, `dh1-app-next14`, `dh1-pct-release-*`), file trong `/tmp`.
Nguyên tắc: **ai tạo thư mục/bản sao tạm thì dọn ngay khi xong việc**, đừng để lại "phòng khi cần".

Cài lại trên máy mới (một lần):

```bash
cd /var/www/dh1-app
mkdir -p /etc/systemd/journald.conf.d
cp scripts/systemd/journald-dh1-limit.conf /etc/systemd/journald.conf.d/dh1-limit.conf && systemctl restart systemd-journald
cp scripts/systemd/logrotate-dh1-pm2 /etc/logrotate.d/dh1-pm2
cp scripts/systemd/dh1-disk-guard.service scripts/systemd/dh1-disk-guard.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now dh1-disk-guard.timer
```

---

## Phụ lục A — Script thực chất chạy những lệnh gì

> Chỉ để **hiểu** hoặc dùng khi chính script bị hỏng. Bình thường LUÔN dùng script — gõ tay rất dễ
> bỏ sót bước, nhất là quên `unshare` ở bước 5 là quay lại lỗi build tại chỗ.

```bash
cd /var/www/dh1-app
APP=/var/www/dh1-app
SHA_CU=$(git rev-parse --short HEAD)

# 1. Sao lưu DB bằng vai trò dh1_backup (mật khẩu trong ~/.pgpass) — chỉ nhận khi có dòng kết thúc
DUMP=/root/backup-dh1db-$(date +%F-%H%M)-truoc-$SHA_CU.sql.gz
URL=$(grep -m1 '^DATABASE_URL=' .env | sed 's/^DATABASE_URL=//; s/^"//; s/"$//; s/?.*$//' \
      | sed -E 's#^(postgres(ql)?://)[^@/]*@#\1dh1_backup@#')
pg_dump -w "$URL" | gzip > "$DUMP.partial" \
  && gzip -dc "$DUMP.partial" | tail -n 5 | grep -q "dump complete" \
  && mv "$DUMP.partial" "$DUMP" && echo "Sao lưu OK: $DUMP"

# 2. Lấy code (+ cài phụ thuộc nếu đổi)
git pull origin main
SHA_MOI=$(git rev-parse --short HEAD)
git diff --quiet "$SHA_CU" "$SHA_MOI" -- package.json package-lock.json || npm install

# 3. SQL (nếu có) — từng file
# npx prisma db execute --file prisma/manual/<file>.sql --schema prisma/schema.prisma

# 4. Thư mục build riêng + chép cache build
MOI=.next-builds/$SHA_MOI-$(date +%Y%m%d-%H%M%S)
mkdir -p "$MOI/cache" && cp -a .next/cache/webpack "$MOI/cache/"

# 5. BUILD TRONG NAMESPACE — dòng quan trọng nhất, KHÔNG được bỏ `unshare … mount --bind`
unshare --mount --propagation private -- bash -c \
  'mount --bind "$1" "$2/.next" && cd "$2" && npm run build' _ "$APP/$MOI" "$APP"
test -f "$MOI/BUILD_ID" && echo "BUILD OK" || echo "BUILD GÃY — dừng lại, xoá $MOI"
echo "$SHA_MOI" > "$MOI/.deploy-sha"
(cd "$MOI" && find static -type f) > "$MOI/.static-own"

# 6. Chép static của bản đang chạy sang (tab đang mở không vỡ), rồi ĐỔI + RELOAD liền một dòng
[ -f .next/.static-own ] && tar -C .next -cf - -T .next/.static-own | tar -C "$MOI" --skip-old-files -xf -
CU=.next-builds/$SHA_CU-truoc-$SHA_MOI-$(date +%Y%m%d-%H%M%S)
mv -T .next "$CU" && mv -T "$MOI" .next && touch "$CU" && pm2 reload dh1-app
# Nếu lệnh mv thứ hai báo lỗi: mv -T "$CU" .next   (trả bản cũ về chỗ)

# 7. Dọn bản cũ: để lượt deploy bằng script kế tiếp tự làm (giữ 3 bản, bỏ cache, giữ mtime).
```

## Phụ lục B — Vì sao lại làm như vậy

- **Build trong mount namespace:** `.next-builds/<sha>-<giờ>` được gắn đè lên `.next` *chỉ với tiến
  trình build*. Build thấy một `.next` trống để ghi, còn app đang chạy vẫn thấy `.next` cũ. Build
  gãy thì chỉ cần xoá thư mục kia.
- **Đổi bằng `mv`, không bằng symlink hay `distDir` khác:** bản build chứa đường dẫn tuyệt đối
  `/var/www/dh1-app/.next/…`, và `next build` tự sửa `tsconfig.json` theo tên `distDir` — nên cả lúc
  build lẫn lúc chạy đều phải đúng tên `.next`.
- **Còn gián đoạn ~1 giây:** pm2 chạy 1 tiến trình (fork) để giữ cache trong bộ nhớ; `reload` ở chế
  độ này là tắt rồi bật lại.
- Kiểm chứng ngày 13/09/2026: diễn tập 236/236 lượt gọi web thành công trong lúc build; lần deploy
  thật đầu tiên 524/528 lượt thành công — 4 lượt hỏng đều rơi đúng 1 giây pm2 khởi động lại.

## Phụ lục C — Vai trò sao lưu `dh1_backup`

`scripts/deploy-server.sh` sao lưu DB trước mỗi lượt deploy bằng vai trò riêng `dh1_backup`
(chỉ đọc, `BYPASSRLS`), **không** bằng tài khoản của website. (Gộp từ `docs/deploy-backup-role.md` ngày 14/09/2026.)

### Vì sao cần vai trò riêng

Mọi bảng TCMS bật `FORCE ROW LEVEL SECURITY`, và tài khoản của website cố ý **không** có
`BYPASSRLS` (xem `docs/contract-integration.md`). `pg_dump` bằng tài khoản đó hỏng giữa chừng ở
`tcms.acceptances` — gặp 2026-09-13, để lại file gzip 11MB trông hợp lệ nhưng thiếu dữ liệu.

`dh1_backup` chỉ đọc được (`pg_read_all_data` + `default_transaction_read_only`), và chỉ script
sao lưu dùng. Website vẫn chạy bằng tài khoản cũ, vẫn chịu RLS như thiết kế.

### Dựng một lần (người quản trị tự chạy — không đưa mật khẩu cho ai)

**Bước 1 — trên máy app (103.42.56.80): sinh mật khẩu, ghi `~/.pgpass`**

```bash
PW=$(openssl rand -hex 24)
umask 077
printf '192.168.45.81:5432:dh1db:dh1_backup:%s\n' "$PW" >> ~/.pgpass
chmod 600 ~/.pgpass
echo "Mật khẩu (dán vào bước 2 rồi xoá khỏi màn hình): $PW"
unset PW
```

Mật khẩu hex nên không vướng ký tự `:` hay `\` — hai ký tự `.pgpass` phải escape.

**Bước 2 — trên máy DB (103.42.56.81): tạo vai trò, mở pg_hba**

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

**Bước 3 — trên máy app: kiểm tra**

```bash
psql -w "postgresql://dh1_backup@192.168.45.81:5432/dh1db" -XAtc \
  "select format('%s bypassrls=%s', current_user, rolbypassrls) from pg_roles where rolname = current_user"
# Phải in: dh1_backup bypassrls=t

cd /var/www/dh1-app && ./scripts/deploy-server.sh --dry-run
# Phải có dòng: ✓ Vai trò sao lưu dh1_backup đăng nhập được, có BYPASSRLS
```

### Gỡ bỏ

Trên máy DB: xoá dòng `dh1_backup` trong `pg_hba.conf`, `systemctl reload postgresql@16-main`,
rồi `sudo -u postgres psql -c 'DROP ROLE dh1_backup'`. Trên máy app: xoá dòng tương ứng trong
`~/.pgpass`.

## Phụ lục D — Ràng buộc hạ tầng từ đợt cây thiết bị (23/07/2026)

Rút từ runbook lịch sử `docs/deploy-equipment-tree.md` (đã gộp và xoá ngày 14/09/2026; các bước build/restart tay
trong đó đã bị thay bằng `deploy-server.sh`, bản đầy đủ xem lịch sử Git).

- **pm2 giữ 1 tiến trình (fork), không chuyển cluster:** cache cây thiết bị (node/index/quyền truy cập) nằm trong
  bộ nhớ tiến trình — nhiều instance thì xoá cache ở một instance không lan sang instance khác.
- **nginx bật gzip cho `application/json`** (giảm payload ~10 lần cho các form còn tải cây đầy đủ). Kiểm tra:
  `curl -H "Accept-Encoding: gzip" -sI https://duyenhai1.vn/api/equipment-tree | grep -i content-encoding`.
- `DATABASE_URL` giữ `connection_limit=10&pool_timeout=20`.
- Không dùng `prisma db push` trên production — SQL additive truyền qua `./scripts/deploy-server.sh --sql`.
- Số đo khi đó (22.708 node): `/api/equipment-tree/roots` · `/children` 1–2 ms; tìm không dấu ~10 ms;
  cây đầy đủ (chỉ export và form cũ) 220 ms DB + ~3 MB JSON (~300 KB gzip), cache server 60 s.
- Việc còn ghi nhận: picker cây thiết bị/form khiếm khuyết/thẻ phân quyền còn tải cây đầy đủ (kế hoạch chuyển
  lazy theo cương vị); `/api/devices` trả ~20k lá cần phân trang phía server; nối `machine` (S1/S2/COMMON) vào luồng
  ghi vật tư/QR; file Excel nguồn búa gõ (DH1.S1.1.13.2) còn 720 dòng cũ — sửa file nguồn trước khi nhập lại.
