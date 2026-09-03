#!/usr/bin/env bash
#
# DEPLOY PRODUCTION — chạy TRÊN SERVER (VPS /var/www/dh1-app, pm2 dh1-app).
#
#   cd /var/www/dh1-app && ./scripts/deploy-server.sh
#   ./scripts/deploy-server.sh --sql prisma/sql/tbycnn-init.sql --sql prisma/sql/abc.sql
#   ./scripts/deploy-server.sh --dry-run          # xem sẽ làm gì, không đụng gì
#   ./scripts/deploy-server.sh --rollback         # quay lại bản build trước
#
# Gom đúng thứ tự bắt buộc của docs/deploy-equipment-tree.md:
#   sao lưu DB → pull → SQL → chụp bản đang chạy → build → restart → smoke test → dọn bản cũ
#
# BA NGUYÊN TẮC nằm sau cách viết script này:
#
#   1. SQL KHÔNG TỰ ĐỘNG CHẠY HẾT. `prisma/sql/` có cả file một lần dùng và file XOÁ dữ
#      liệu (purge-*, remove-*, drop-*). Quét cả thư mục rồi chạy tuốt là có ngày xoá nhầm
#      bảng thật. Vì vậy phải liệt kê tường minh từng file bằng --sql.
#
#   2. BUILD HỎNG PHẢI KHÔI PHỤC ĐƯỢC. `next build` xoá sạch .next rồi mới dựng lại; build
#      gãy giữa chừng là .next hỏng, lần restart sau app chết. Nên chụp .next TRƯỚC khi
#      build, build gãy thì trả lại ngay.
#
#   3. BẢN CHỤP BỎ `.next/cache`. Cache webpack chiếm ~700MB/1.8GB mà rollback không cần
#      tới — chính nó làm 12 bản cũ ngốn 20GB đĩa.
#
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
APP_DIR=$(pwd)
PM2_NAME=${PM2_NAME:-dh1-app}
APP_URL=${APP_URL:-http://localhost:3000}
BACKUP_DIR=${BACKUP_DIR:-/root}

BRANCH=main
KEEP=2
DRY_RUN=0
DO_ROLLBACK=0
SKIP_BACKUP=0
SQL_FILES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sql) SQL_FILES+=("$2"); shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --rollback) DO_ROLLBACK=1; shift ;;
    --no-backup) SKIP_BACKUP=1; shift ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Tham số lạ: $1" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
run()  { if [[ $DRY_RUN == 1 ]]; then echo "  [dry-run] $*"; else eval "$@"; fi }

# Chuỗi kết nối cho psql/pg_dump: bỏ phần query vì đó là tham số riêng của Prisma
# (schema=, connection_limit=) — psql gặp là báo "invalid URI query parameter".
db_url() {
  grep -m1 '^DATABASE_URL=' .env | sed 's/^DATABASE_URL=//; s/^"//; s/"$//; s/?.*$//'
}

newest_rollbacks() { ls -1dt .next.rollback-* 2>/dev/null || true; }

# ---------------------------------------------------------------- rollback
if [[ $DO_ROLLBACK == 1 ]]; then
  step "QUAY LẠI BẢN BUILD TRƯỚC"
  SNAP=$(newest_rollbacks | head -1)
  [[ -n "$SNAP" ]] || die "Không còn bản .next.rollback-* nào để quay lại."
  warn "Sẽ thay .next hiện tại bằng: $SNAP"
  warn "LƯU Ý: chỉ quay lại MÃ NGUỒN. Thay đổi đã ghi vào DB thì không tự lùi —"
  warn "muốn lùi cả DB phải nạp lại bản dump trong $BACKUP_DIR."
  run "rm -rf .next.before-rollback && mv .next .next.before-rollback"
  run "cp -r '$SNAP' .next"
  run "pm2 restart $PM2_NAME --update-env >/dev/null"
  ok "Đã quay lại $SNAP và restart."
  exit 0
fi

# ---------------------------------------------------------------- kiểm tra đầu vào
step "KIỂM TRA TRƯỚC KHI DEPLOY"
[[ -f .env ]] || die "Không thấy .env trong $APP_DIR"
[[ -f package.json ]] || die "Không thấy package.json — chạy sai thư mục?"
command -v pm2 >/dev/null || die "Không có pm2"
pm2 describe "$PM2_NAME" >/dev/null 2>&1 || die "pm2 không có tiến trình '$PM2_NAME'"

for f in "${SQL_FILES[@]:-}"; do
  [[ -z "$f" ]] && continue
  [[ -f "$f" ]] || die "Không thấy file SQL: $f"
done

# Sửa tay trên server rồi deploy đè là mất sạch phần sửa đó mà không ai biết.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  git status --short --untracked-files=no | sed 's/^/    /'
  die "Có thay đổi chưa commit trên server. Xử lý xong rồi hãy deploy."
fi

FREE_GB=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
[[ $FREE_GB -ge 6 ]] || die "Đĩa chỉ còn ${FREE_GB}GB — build cần ít nhất 6GB. Chạy --keep 1 hoặc dọn bớt."
ok "Đĩa còn ${FREE_GB}GB · pm2 '$PM2_NAME' đang chạy · cây làm việc sạch"

OLD_SHA=$(git rev-parse --short HEAD)
git fetch origin --quiet
INCOMING=$(git log --oneline "HEAD..origin/$BRANCH" | wc -l)
if [[ $INCOMING -eq 0 ]]; then
  warn "Không có commit mới trên origin/$BRANCH (đang ở $OLD_SHA)."
else
  echo "  $INCOMING commit sắp lên:"
  git log --oneline "HEAD..origin/$BRANCH" | sed 's/^/    /'
fi

if [[ ${#SQL_FILES[@]} -gt 0 ]]; then
  echo "  SQL sẽ chạy:"
  printf '    %s\n' "${SQL_FILES[@]}"
else
  warn "Không có --sql nào. Nếu bản này thêm bảng/cột mới thì PHẢI truyền --sql, nếu không app sẽ lỗi 500."
fi

# ---------------------------------------------------------------- 1. sao lưu DB
if [[ $SKIP_BACKUP == 1 ]]; then
  warn "Bỏ qua sao lưu DB (--no-backup)."
else
  step "1/7 · SAO LƯU DATABASE"
  DUMP="$BACKUP_DIR/backup-dh1db-$(date +%F-%H%M)-truoc-$OLD_SHA.sql.gz"
  run "pg_dump \"\$(db_url)\" | gzip > '$DUMP'"
  if [[ $DRY_RUN == 0 ]]; then
    gzip -t "$DUMP" || die "Bản dump hỏng — DỪNG, không deploy khi chưa có bản lưu tốt."
    ok "$DUMP ($(du -h "$DUMP" | cut -f1))"
  fi
fi

# ---------------------------------------------------------------- 2. lấy code
step "2/7 · LẤY CODE origin/$BRANCH"
run "git pull origin '$BRANCH'"
NEW_SHA=$([[ $DRY_RUN == 1 ]] && echo "$OLD_SHA" || git rev-parse --short HEAD)
ok "$OLD_SHA → $NEW_SHA"

# npm install chỉ khi khai báo phụ thuộc thực sự đổi — đỡ vài phút mỗi lần deploy.
if [[ $DRY_RUN == 0 ]] && ! git diff --quiet "$OLD_SHA" "$NEW_SHA" -- package-lock.json package.json; then
  step "2b · package.json/lock đổi → npm install"
  npm install
  ok "Đã cài phụ thuộc"
fi

# ---------------------------------------------------------------- 3. SQL
if [[ ${#SQL_FILES[@]} -gt 0 ]]; then
  step "3/7 · ÁP SCHEMA (trước khi restart)"
  for f in "${SQL_FILES[@]}"; do
    run "npx prisma db execute --file '$f' --schema prisma/schema.prisma"
    ok "$f"
  done
fi

# ---------------------------------------------------------------- 4. chụp bản đang chạy
step "4/7 · CHỤP BẢN ĐANG CHẠY ĐỂ ROLLBACK"
SNAP=".next.rollback-$OLD_SHA"
if [[ -d .next ]]; then
  run "rm -rf '$SNAP'"
  run "cp -r .next '$SNAP'"
  # Cache webpack không cần cho rollback mà chiếm ~40% dung lượng — chính là thủ phạm
  # khiến 12 bản cũ ngốn 20GB.
  run "rm -rf '$SNAP/cache'"
  [[ $DRY_RUN == 1 ]] || ok "$SNAP ($(du -sh "$SNAP" | cut -f1), đã bỏ cache)"
else
  warn "Chưa có .next để chụp (lần build đầu?)"
fi

# ---------------------------------------------------------------- 5. build
step "5/7 · BUILD"
if [[ $DRY_RUN == 1 ]]; then
  echo "  [dry-run] npm run build"
elif npm run build; then
  ok "Build thành công"
else
  warn "BUILD GÃY — trả .next về bản cũ, app giữ nguyên như trước khi deploy."
  if [[ -d "$SNAP" ]]; then
    rm -rf .next && cp -r "$SNAP" .next
    warn "Đã khôi phục .next từ $SNAP. Mã nguồn đang ở $NEW_SHA — chạy 'git reset --hard $OLD_SHA' nếu muốn lùi hẳn."
  fi
  die "Dừng deploy. Sửa lỗi build rồi chạy lại."
fi

# ---------------------------------------------------------------- 6. restart + smoke test
step "6/7 · RESTART & KIỂM TRA"
run "pm2 restart '$PM2_NAME' --update-env >/dev/null"
if [[ $DRY_RUN == 0 ]]; then
  sleep 8
  FAILED=0
  for path in /login /api/auth/session; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$APP_URL$path" || echo 000)
    # 2xx/3xx đều là app sống (route cần đăng nhập trả 307 về /login).
    if [[ $code =~ ^[23] ]]; then ok "$path → $code"; else warn "$path → $code"; FAILED=1; fi
  done
  if [[ $FAILED == 1 ]]; then
    pm2 logs "$PM2_NAME" --lines 30 --nostream 2>&1 | tail -20
    die "App không phản hồi đúng. Quay lại bằng: ./scripts/deploy-server.sh --rollback"
  fi
fi

# ---------------------------------------------------------------- 7. dọn bản cũ
step "7/7 · DỌN BẢN BUILD CŨ (giữ $KEEP bản mới nhất)"
mapfile -t SNAPS < <(newest_rollbacks)
if [[ ${#SNAPS[@]} -le $KEEP ]]; then
  ok "Có ${#SNAPS[@]} bản, chưa cần dọn"
else
  for old in "${SNAPS[@]:$KEEP}"; do
    run "rm -rf '$old'"
    ok "đã xoá $old"
  done
fi
[[ $DRY_RUN == 1 ]] || df -h / | tail -1 | awk '{print "  Đĩa: dùng " $3 " / trống " $4 " (" $5 ")"}'

printf '\n\033[1;32m✔ DEPLOY XONG — %s đang chạy %s\033[0m\n' "$PM2_NAME" "$NEW_SHA"
echo "  Quay lại nếu có sự cố:  ./scripts/deploy-server.sh --rollback"
