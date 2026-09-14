#!/usr/bin/env bash
#
# DEPLOY PRODUCTION — chạy TRÊN SERVER (VPS /var/www/dh1-app, pm2 dh1-app).
#
#   cd /var/www/dh1-app && ./scripts/deploy-server.sh
#   ./scripts/deploy-server.sh --sql prisma/sql/tbycnn-init.sql --sql prisma/sql/abc.sql
#   ./scripts/deploy-server.sh --dry-run          # xem sẽ làm gì, không đụng gì
#   ./scripts/deploy-server.sh --rollback         # quay lại bản build trước
#   Hướng dẫn từng bước + sự cố: docs/huong-dan-deploy-production.md
#   ĐỪNG chạy `npm run build` tay trên server — nó ghi đè .next đang chạy (xem nguyên tắc 2).
#
# Gom đúng thứ tự bắt buộc (rút từ runbook cây thiết bị 07/2026 — docs/huong-dan-deploy-production.md phụ lục D):
#   sao lưu DB → pull → SQL → build RA THƯ MỤC RIÊNG → đổi sang → reload → smoke test → dọn bản cũ
#
# BỐN NGUYÊN TẮC nằm sau cách viết script này:
#
#   1. SQL KHÔNG TỰ ĐỘNG CHẠY HẾT. `prisma/sql/` có cả file một lần dùng và file XOÁ dữ
#      liệu (purge-*, remove-*, drop-*). Quét cả thư mục rồi chạy tuốt là có ngày xoá nhầm
#      bảng thật. Vì vậy phải liệt kê tường minh từng file bằng --sql.
#
#   2. BUILD KHÔNG ĐƯỢC ĐỤNG VÀO .next ĐANG CHẠY. `next build` xoá sạch .next rồi dựng lại
#      mất 2–3 phút; request nào rơi vào khoảng đó ăn 500 "Cannot find module .next/server/…"
#      (cả 3 lượt deploy ngày 2026-09-13 đều dính: lưu tiếp địa, n8n chốt lịch sử…). Nên build
#      trong một MOUNT NAMESPACE riêng: thư mục `.next-builds/<sha>-<giờ>` được bind-mount đè
#      lên `.next` CHỈ với tiến trình build — nó thấy .next mới tinh, còn app đang chạy vẫn
#      thấy .next cũ. Build gãy thì xoá thư mục đó là xong, app không hề bị ảnh hưởng.
#
#   3. ĐỔI BẰNG `mv`, KHÔNG BẰNG SYMLINK HAY distDir KHÁC. Bản build chứa đường dẫn tuyệt đối
#      (/var/www/dh1-app/.next/…), và next build tự sửa tsconfig.json theo tên distDir. Nên
#      build lẫn chạy đều phải đúng tên `.next`: build xong thì 2 lệnh mv (vài mili-giây) đưa
#      bản mới vào chỗ `.next`, cất bản cũ sang `.next-builds/`, rồi reload NGAY. Rollback cũng
#      chỉ là đổi tên ngược lại — không phải copy.
#
#   4. BẢN CŨ GIỮ LẠI BỎ `cache`. Cache webpack (~900MB) chỉ cần lúc build — chính nó từng làm
#      12 bản cũ ngốn 20GB đĩa. Bản build mới được chép cache của bản đang chạy để build nhanh.
#
# CÒN LẠI (chưa khử được): `npm install` (chỉ khi package.json/lock đổi) và `prisma generate`
# vẫn ghi đè node_modules tại chỗ; và pm2 chạy fork 1 instance nên reload vẫn gián đoạn vài giây.
#
set -Eeuo pipefail

# CHẠY TỪ MỘT BẢN SAO Ở /tmp, KHÔNG CHẠY TRỰC TIẾP FILE NÀY.
#
# Bước 2 `git pull` có thể thay đổi CHÍNH FILE NÀY trong lúc bash đang đọc nó. Bash đọc
# script theo byte offset chứ không nạp hết một lần: file đổi độ dài giữa chừng là con trỏ
# nhảy vào giữa một câu lệnh khác, hành vi không đoán trước được. Lần deploy 31251c6 may
# mà không gãy — nhưng đó là may, không phải đúng.
if [[ -z "${DEPLOY_SELF_COPY:-}" ]]; then
  _self=$(mktemp /tmp/dh1-deploy.XXXXXX.sh)
  cp "${BASH_SOURCE[0]}" "$_self"
  chmod +x "$_self"
  # Bản sao nằm ở /tmp nên không tự suy ra được thư mục app — truyền sang bằng biến.
  export DEPLOY_SELF_COPY="$_self"
  export DEPLOY_APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  exec "$_self" "$@"
fi
# Dọn bản sao khi chạy xong, kể cả khi lỗi giữa chừng.
trap 'rm -f -- "${DEPLOY_SELF_COPY:-}"' EXIT

cd "${DEPLOY_APP_DIR:-$(dirname "${BASH_SOURCE[0]}")/..}"
APP_DIR=$(pwd)
PM2_NAME=${PM2_NAME:-dh1-app}
APP_URL=${APP_URL:-http://localhost:3000}
BACKUP_DIR=${BACKUP_DIR:-/root}
BUILDS_DIR=.next-builds
# `reload` thay cho `restart` để hạn chế gián đoạn.
#
# NÓI THẲNG GIỚI HẠN: pm2 chỉ thật sự reload không-downtime khi chạy CLUSTER mode. App này
# chạy FORK mode (1 instance — cố ý, vì cache node/index/access là in-process, xem
# docs/huong-dan-deploy-production.md phụ lục D), mà ở fork mode `reload` rơi về đúng hành vi của
# `restart`. Vẫn để `reload` vì nó không hại gì và đúng ý muốn giảm gián đoạn; muốn
# downtime bằng 0 thật thì phải chuyển sang cluster, việc đó lại phá cache in-process.
PM2_ACTION=${PM2_ACTION:-reload}

BRANCH=main
# Số bản build cũ giữ lại để --rollback (ngoài bản đang chạy). Mỗi bản đã bỏ cache chỉ ~35MB.
KEEP=3
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
    -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 0 ;;
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

# Chuỗi kết nối cho SAO LƯU: cùng host/port/DB với app nhưng đăng nhập bằng vai trò
# `dh1_backup` (chỉ đọc, BYPASSRLS), mật khẩu lấy từ ~/.pgpass. KHÔNG dùng tài khoản của app
# được: mọi bảng TCMS bật FORCE ROW LEVEL SECURITY nên pg_dump bằng tài khoản đó hỏng giữa
# chừng ở tcms.acceptances. Cách dựng vai trò: docs/huong-dan-deploy-production.md phụ lục C.
BACKUP_ROLE=${BACKUP_ROLE:-dh1_backup}
backup_db_url() {
  db_url | sed -E "s#^(postgres(ql)?://)[^@/]*@#\1${BACKUP_ROLE}@#"
}

# Các bản build có thể quay lại, mới nhất trước: `.next-builds/*` và `.next.rollback-*`
# (kiểu chụp cũ trước 2026-09-13 — vẫn là thư mục .next đầy đủ nên đổi tên vào là chạy).
previous_builds() {
  local items=()
  shopt -s nullglob
  items=("$BUILDS_DIR"/*/ .next.rollback-*/)
  shopt -u nullglob
  ((${#items[@]})) || return 0
  ls -1dt "${items[@]}" | sed 's#/$##'
}

# Bản build này là của commit nào (ghi trong .deploy-sha; bản kiểu cũ thì lấy theo tên).
build_label() {
  if [[ -f "$1/.deploy-sha" ]]; then cat "$1/.deploy-sha"; else basename "$1"; fi
}

# Đưa bản build $1 vào chỗ .next, cất .next hiện tại sang $2. Hai lệnh mv trên cùng ổ đĩa chỉ
# mất vài mili-giây — ngay sau đó PHẢI reload, để tiến trình cũ không nạp lẫn file của bản mới.
swap_in() {
  local incoming=$1 park=$2
  # Kiểm bản đưa vào TRƯỚC khi đụng .next — dời .next đi rồi mới phát hiện bản kia hỏng là
  # để app không có .next trong lúc trả về.
  [[ -f "$incoming/BUILD_ID" ]] || die "$incoming không phải bản build hợp lệ (thiếu BUILD_ID) — .next giữ nguyên."
  mkdir -p "$BUILDS_DIR"
  mv -T -- .next "$park" || die "Không cất được .next sang $park — chưa đổi gì, app vẫn chạy bản cũ."
  if ! mv -T -- "$incoming" .next; then
    mv -T -- "$park" .next
    die "Không đưa được $incoming vào .next — đã trả bản cũ về chỗ."
  fi
  # mv không đổi mtime của thư mục; chạm vào để bản vừa cất đứng đầu danh sách --rollback.
  touch -- "$park"
}

# ---------------------------------------------------------------- rollback
if [[ $DO_ROLLBACK == 1 ]]; then
  step "QUAY LẠI BẢN BUILD TRƯỚC"
  [[ -d .next && ! -L .next ]] || die ".next phải là thư mục thật (xem nguyên tắc 3)."
  SNAP=$(previous_builds | head -1)
  [[ -n "$SNAP" ]] || die "Không còn bản build cũ nào trong $BUILDS_DIR/ hay .next.rollback-* để quay lại."
  PARK="$BUILDS_DIR/truoc-rollback-$(date +%Y%m%d-%H%M%S)"
  warn "Sẽ đưa $SNAP ($(build_label "$SNAP")) vào thay .next hiện tại ($(build_label .next))."
  warn "LƯU Ý: chỉ quay lại MÃ NGUỒN. Thay đổi đã ghi vào DB thì không tự lùi —"
  warn "muốn lùi cả DB phải nạp lại bản dump trong $BACKUP_DIR."
  if [[ $DRY_RUN == 1 ]]; then
    echo "  [dry-run] mv .next → $PARK; mv $SNAP → .next"
  else
    [[ -f .next/.deploy-sha ]] || git rev-parse --short HEAD > .next/.deploy-sha
    swap_in "$SNAP" "$PARK"
  fi
  run "pm2 $PM2_ACTION $PM2_NAME --update-env >/dev/null"
  ok "Đã quay lại $SNAP và nạp lại app. Bản vừa gỡ cất ở $PARK — chạy --rollback lần nữa là về lại nó."
  exit 0
fi

# ---------------------------------------------------------------- kiểm tra đầu vào
step "KIỂM TRA TRƯỚC KHI DEPLOY"
[[ -f .env ]] || die "Không thấy .env trong $APP_DIR"
[[ -f package.json ]] || die "Không thấy package.json — chạy sai thư mục?"
command -v pm2 >/dev/null || die "Không có pm2"

# Build tách thư mục cần mount namespace — chỉ root làm được (xem nguyên tắc 2).
[[ $(id -u) == 0 ]] || die "Phải chạy bằng root: build ra thư mục riêng cần unshare/mount."
command -v unshare >/dev/null || die "Không có unshare (gói util-linux) — cần để build ra thư mục riêng."
[[ ! -L .next ]] || die ".next đang là symlink — script cần .next là thư mục thật (xem nguyên tắc 3)."

# Build dưới Node khác bản đang chạy thật là tạo ra .next "trông như ổn" nhưng lệch runtime.
# Chỉ cảnh báo chứ không chặn — lượt deploy khẩn cấp không nên kẹt vì chuyện này.
if [[ -f .nvmrc ]]; then
  WANT_NODE=$(tr -dc '0-9' < .nvmrc)
  HAVE_NODE=$(node -p 'process.versions.node.split(".")[0]')
  if [[ "$WANT_NODE" != "$HAVE_NODE" ]]; then
    warn "Node trên server là $(node -v) nhưng .nvmrc yêu cầu $WANT_NODE — kiểm tra lại trước khi build."
  fi
fi
pm2 describe "$PM2_NAME" >/dev/null 2>&1 || die "pm2 không có tiến trình '$PM2_NAME'"

for f in "${SQL_FILES[@]:-}"; do
  [[ -z "$f" ]] && continue
  [[ -f "$f" ]] || die "Không thấy file SQL: $f"
done

# Sửa tay trên server rồi deploy đè là mất sạch phần sửa đó mà không ai biết.
#
# TRỪ package-lock.json: lockfile sinh trên Windows, `npm install` chạy trên Linux luôn
# viết lại nó (thêm cờ "dev" cho các gói nhị phân theo nền tảng) mà không đổi phiên bản
# gói nào. Đó là rác của chính bước npm install ở deploy TRƯỚC — chặn vì nó thì lần deploy
# nào cũng chặn. Trả file về bản gốc rồi đi tiếp.
if ! git diff --quiet -- package-lock.json; then
  warn "package-lock.json bị npm viết lại (rác nền tảng) — trả về bản trong git."
  run "git checkout -- package-lock.json"
fi
DIRTY=$(git status --porcelain --untracked-files=no)
if [[ -n "$DIRTY" ]]; then
  echo "$DIRTY" | sed 's/^/    /'
  die "Có thay đổi chưa commit trên server. Xử lý xong rồi hãy deploy."
fi

# Sao lưu không chạy được thì phải lộ ra NGAY ĐÂY, trước khi pull — đừng để tới bước 1.
if [[ $SKIP_BACKUP == 0 ]]; then
  command -v pg_dump >/dev/null || die "Không có pg_dump trên server."
  BACKUP_CHECK=$(PGCONNECT_TIMEOUT=10 psql -w -XAt "$(backup_db_url)" \
    -c "select format('%s %s', current_user, case when rolbypassrls then 'bypassrls' else 'no-bypassrls' end) from pg_roles where rolname = current_user" 2>&1) \
    || die "Vai trò sao lưu '$BACKUP_ROLE' chưa đăng nhập được: $BACKUP_CHECK
    Dựng theo docs/huong-dan-deploy-production.md phụ lục C, hoặc chạy --no-backup nếu bản này không đụng DB."
  [[ "$BACKUP_CHECK" == "$BACKUP_ROLE bypassrls" ]] \
    || die "Vai trò sao lưu phải là '$BACKUP_ROLE' có BYPASSRLS, nhận được: '$BACKUP_CHECK'"
  ok "Vai trò sao lưu $BACKUP_ROLE đăng nhập được, có BYPASSRLS"
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
  step "1/7 · SAO LƯU DATABASE (vai trò $BACKUP_ROLE)"
  DUMP="$BACKUP_DIR/backup-dh1db-$(date +%F-%H%M)-truoc-$OLD_SHA.sql.gz"
  if [[ $DRY_RUN == 1 ]]; then
    echo "  [dry-run] pg_dump (vai trò $BACKUP_ROLE) | gzip > $DUMP"
  else
    # Ghi ra .partial rồi mới đổi tên: pg_dump hỏng giữa chừng vẫn để lại một file gzip HỢP
    # LỆ (gzip -t báo ok) mang tên y như bản tốt — gặp 2026-09-13, 11MB mà thiếu cả TCMS.
    if ! pg_dump -w "$(backup_db_url)" | gzip > "$DUMP.partial"; then
      rm -f -- "$DUMP.partial"
      die "pg_dump hỏng — DỪNG, không deploy khi chưa có bản lưu tốt."
    fi
    # pg_dump chỉ ghi dòng kết thúc khi chạy tới cuối — đó mới là bằng chứng bản lưu đủ.
    if ! gzip -dc "$DUMP.partial" | tail -n 5 | grep -q "PostgreSQL database dump complete"; then
      rm -f -- "$DUMP.partial"
      die "Bản dump thiếu dòng kết thúc — DỪNG, không deploy khi chưa có bản lưu tốt."
    fi
    mv -- "$DUMP.partial" "$DUMP"
    ok "$DUMP ($(du -h "$DUMP" | cut -f1), $(gzip -dc "$DUMP" | grep -c '^COPY tcms\.') bảng TCMS)"
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

# ---------------------------------------------------------------- 4. thư mục build riêng
step "4/7 · CHUẨN BỊ THƯ MỤC BUILD RIÊNG"
NEW_BUILD="$BUILDS_DIR/$NEW_SHA-$(date +%Y%m%d-%H%M%S)"
run "mkdir -p '$NEW_BUILD/cache'"
# Chép cache build của bản đang chạy: không có nó build lâu hơn, cả site chậm theo. Next 14 dùng
# cache/webpack, Next 16 (Turbopack) dùng cache/turbopack — chép cái nào đang có.
for c in webpack turbopack; do
  if [[ -d ".next/cache/$c" ]]; then
    run "cp -a '.next/cache/$c' '$NEW_BUILD/cache/'"
  fi
done
[[ $DRY_RUN == 1 ]] || ok "$NEW_BUILD (đã chép cache build: $(du -sh "$NEW_BUILD/cache" | cut -f1))"

# ---------------------------------------------------------------- 5. build
step "5/7 · BUILD VÀO $NEW_BUILD — app đang chạy KHÔNG bị đụng"
# Trong namespace riêng, $NEW_BUILD được bind-mount ĐÈ lên .next: next build thấy một .next mới
# tinh và ghi vào đó; mọi tiến trình khác — gồm app đang phục vụ — vẫn thấy .next cũ. Mount chỉ
# sống cùng namespace nên tự biến mất khi build xong hay bị giết, không để lại gì.
build_isolated() {
  unshare --mount --propagation private -- bash -c \
    'mount --bind "$1" "$2/.next" && cd "$2" && npm run build' _ "$APP_DIR/$NEW_BUILD" "$APP_DIR"
}
if [[ $DRY_RUN == 1 ]]; then
  echo "  [dry-run] unshare --mount … mount --bind $NEW_BUILD .next && npm run build"
elif build_isolated; then
  [[ -f "$NEW_BUILD/BUILD_ID" ]] || die "Build báo thành công nhưng $NEW_BUILD không có BUILD_ID — dừng, app vẫn chạy bản cũ."
  echo "$NEW_SHA" > "$NEW_BUILD/.deploy-sha"
  # Danh sách file static DO CHÍNH BẢN NÀY sinh ra — lượt deploy sau chỉ chép đúng những file này
  # sang bản kế tiếp (xem bước 6), nên static không phình qua nhiều thế hệ.
  (cd "$NEW_BUILD" && find static -type f) > "$NEW_BUILD/.static-own"
  ok "Build thành công (BUILD_ID $(cat "$NEW_BUILD/BUILD_ID")) — app vẫn đang chạy bản cũ"
else
  rm -rf -- "$NEW_BUILD"
  warn "BUILD GÃY — đã xoá $NEW_BUILD. App KHÔNG bị ảnh hưởng, vẫn chạy bản cũ."
  warn "Mã nguồn đang ở $NEW_SHA — chạy 'git reset --hard $OLD_SHA' nếu muốn lùi hẳn."
  die "Dừng deploy. Sửa lỗi build rồi chạy lại."
fi

# ---------------------------------------------------------------- 6. đổi sang + reload + smoke test
step "6/7 · ĐỔI SANG BẢN MỚI, NẠP LẠI & KIỂM TRA"
PARK="$BUILDS_DIR/$OLD_SHA-truoc-$NEW_SHA-$(date +%Y%m%d-%H%M%S)"
if [[ $DRY_RUN == 1 ]]; then
  echo "  [dry-run] chép static của bản đang chạy sang bản mới; mv .next → $PARK; mv $NEW_BUILD → .next"
else
  # Tab mở từ trước vẫn xin chunk JS của bản đang chạy — chép static của nó sang bản mới (không
  # đè file trùng tên) để các tab đó không vỡ khi chuyển trang, cho tới lúc người dùng tải lại.
  # Chỉ chép file bản đang chạy TỰ SINH (.static-own); chép cả thư mục thì chunk thừa kế từ các
  # lần trước cũng đi theo và static phình mãi. Bản build kiểu cũ chưa có danh sách thì chép hết.
  if [[ -f .next/.static-own ]]; then
    tar -C .next -cf - -T .next/.static-own | tar -C "$NEW_BUILD" --skip-old-files -xf - \
      || warn "Không chép được static cũ — tab đang mở có thể phải tải lại trang."
  else
    cp -an .next/static/. "$NEW_BUILD/static/" 2>/dev/null \
      || warn "Không chép được static cũ — tab đang mở có thể phải tải lại trang."
  fi
  [[ -f .next/.deploy-sha ]] || echo "$OLD_SHA" > .next/.deploy-sha
  swap_in "$NEW_BUILD" "$PARK"
  ok "Đã đổi: .next = bản $NEW_SHA · bản $OLD_SHA cất ở $PARK"
fi
run "pm2 $PM2_ACTION '$PM2_NAME' --update-env >/dev/null"
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
step "7/7 · DỌN BẢN BUILD CŨ (giữ $KEEP bản gần nhất để --rollback)"
# Giữ $KEEP bản gần nhất (bỏ cache — rollback không cần mà mỗi bản ~900MB, nguyên tắc 4), xoá
# phần còn lại. Bỏ cache phải GIỮ NGUYÊN mtime của thư mục: --rollback chọn bản theo mtime, mà
# xoá thư mục con là mtime nhảy lên — bản cũ hơn vọt lên đầu và rollback về nhầm bản.
prune_builds() {
  local olds=() i b m
  mapfile -t olds < <(previous_builds)
  if [[ ${#olds[@]} -eq 0 ]]; then
    ok "Chưa có bản cũ nào"
    return 0
  fi
  for i in "${!olds[@]}"; do
    b=${olds[$i]}
    if (( i < KEEP )); then
      if [[ -d "$b/cache" ]]; then
        m=$(stat -c %Y "$b")
        run "rm -rf '$b/cache'"
        run "touch -m -d '@$m' '$b'"
      fi
      ok "giữ $b ($(build_label "$b"))"
    else
      run "rm -rf '$b'"
      ok "đã xoá $b"
    fi
  done
}
prune_builds

# Sao lưu DB trước mỗi lượt deploy (~10MB/bản) và log deploy trước đây KHÔNG ai xoá — đến
# 2026-09-13 đã có 27 bản. LUÔN giữ KEEP_DUMPS bản gần nhất; bản ngoài số đó chỉ xoá khi cũ hơn
# MAX_AGE ngày — một ngày deploy dồn dập (13/09 có 8 lượt) không được đẩy mất lịch sử 2 tuần.
# Bản dở (.INCOMPLETE) không dùng được nên xoá luôn. Chỉ đụng đúng mẫu tên script sinh ra.
KEEP_DUMPS=${KEEP_DUMPS:-10}
DUMP_MAX_AGE_DAYS=${DUMP_MAX_AGE_DAYS:-14}
KEEP_DEPLOY_LOGS=${KEEP_DEPLOY_LOGS:-20}
# prune_files <nhãn> <số giữ> <số ngày tối đa, 0 = không xét tuổi> <mẫu…>
prune_files() {
  local label=$1 keep=$2 max_age=$3; shift 3
  local files=() i removed=0
  mapfile -t files < <(ls -1t "$@" 2>/dev/null | grep -v INCOMPLETE)
  for i in "${!files[@]}"; do
    (( i < keep )) && continue
    if (( max_age > 0 )) && [[ -z "$(find "${files[$i]}" -maxdepth 0 -mtime +"$max_age" 2>/dev/null)" ]]; then
      continue
    fi
    run "rm -f -- '${files[$i]}'"
    removed=$(( removed + 1 ))
  done
  ok "$label: ${#files[@]} bản, xoá $removed (giữ $keep mới nhất$( (( max_age > 0 )) && echo " + mọi bản trong $max_age ngày"))"
}
for f in "$BACKUP_DIR"/backup-dh1db-*-truoc-*.INCOMPLETE*.sql.gz; do
  [[ -e "$f" ]] && run "rm -f -- '$f'" && ok "xoá bản dump dở $(basename "$f")"
done
prune_files "Sao lưu DB trước deploy" "$KEEP_DUMPS" "$DUMP_MAX_AGE_DAYS" "$BACKUP_DIR"/backup-dh1db-????-??-??-????-truoc-*.sql.gz
prune_files "Log deploy" "$KEEP_DEPLOY_LOGS" 0 "$BACKUP_DIR"/deploy-*.log

# Cache npm chỉ lớn lên qua các lượt `npm install` — quá 2GB thì dọn (lượt cài sau tải lại gói).
if [[ -d "$HOME/.npm" ]] && (( $(du -sm "$HOME/.npm" | cut -f1) > 2048 )); then
  run "npm cache clean --force >/dev/null 2>&1"
  ok "Cache npm vượt 2GB — đã dọn"
fi
[[ $DRY_RUN == 1 ]] || df -h / | tail -1 | awk '{print "  Đĩa: dùng " $3 " / trống " $4 " (" $5 ")"}'

printf '\n\033[1;32m✔ DEPLOY XONG — %s đang chạy %s\033[0m\n' "$PM2_NAME" "$NEW_SHA"
echo "  Quay lại nếu có sự cố:  ./scripts/deploy-server.sh --rollback"
