#!/usr/bin/env bash
# Sao lưu định kỳ dh1db (KTKT, PCT, toàn bộ DB) + tệp KTKT/PCT trên MinIO, bằng restic.
# Hướng dẫn, lịch chạy và cách khôi phục: docs/huong-dan-deploy-production.md phụ lục E.
#
# Bản cài trên server: /usr/local/sbin/dh1-db-backup (chép từ tệp này — KHÔNG chạy thẳng từ
# /var/www/dh1-app để lịch sao lưu không phụ thuộc trạng thái git/deploy). Sửa tệp này rồi chép lại:
#   install -m 0750 scripts/server-db-backup.sh /usr/local/sbin/dh1-db-backup
#
# Dữ liệu đi: pg_dump (vai trò dh1_backup, chỉ đọc) → kho restic CỤC BỘ /var/backups/dh1/restic
#             → `restic copy` sang kho trên MinIO (s3 …/yen-nn-cbsxdh1/db-backups/restic).
# Cả hai kho mã hoá bằng cùng mật khẩu /root/.config/dh1-backup/restic-password — MẤT MẬT KHẨU
# LÀ MẤT HẾT bản sao lưu.
#
# Cách dùng: dh1-db-backup <lệnh>
#   init          tạo 2 kho (chạy 1 lần)
#   shift         bảng KTKT + PCT + RbacConfig (sau mỗi ca)
#   core          toàn bộ DB trừ dữ liệu bảng AiKnowledgeChunk (hằng ngày)
#   ai            riêng bảng AiKnowledgeChunk (hằng tháng)
#   files         chép tệp ctktkt/ + work-permits/ từ MinIO về máy app (hằng ngày)
#   verify        kiểm độ tươi + phát hiện bản cũ bị mất trên MinIO (hằng ngày)
#   check         restic check đọc mẫu dữ liệu + prune kho MinIO (hằng tuần)
#   restore-test  khôi phục bản core mới nhất vào Postgres tạm (Docker) rồi so số dòng (hằng tháng)
#   status        in danh sách bản sao lưu
set -Eeuo pipefail
umask 077

MODE=${1:-}
APP_DIR=${APP_DIR:-/var/www/dh1-app}
CONF_DIR=${CONF_DIR:-/root/.config/dh1-backup}
LOCAL_REPO=${LOCAL_REPO:-/var/backups/dh1/restic}
FILES_DIR=${FILES_DIR:-/var/backups/dh1/minio-files}
STATE_DIR=${STATE_DIR:-/var/lib/dh1-backup}
REMOTE_PREFIX=${REMOTE_PREFIX:-db-backups/restic}
BACKUP_ROLE=${BACKUP_ROLE:-dh1_backup}
MC_ALIAS=${MC_ALIAS:-dh1}
FILE_PREFIXES=(ctktkt work-permits)
RESTORE_IMAGE=${RESTORE_IMAGE:-pgvector/pgvector:0.8.1-pg16}
export HOME=${HOME:-/root}
export RESTIC_PASSWORD_FILE=$CONF_DIR/restic-password
export RESTIC_CACHE_DIR=${RESTIC_CACHE_DIR:-/var/cache/restic}

log()  { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
die()  { log "LỖI: $*" >&2; exit 1; }

env_value() {
  grep -m1 "^$1=" "$APP_DIR/.env" | sed -E "s/^$1=//; s/^[\"']//; s/[\"']\$//"
}

# Chuỗi kết nối như deploy-server.sh: host/port/DB của app, đăng nhập bằng dh1_backup (mật khẩu ở ~/.pgpass).
backup_db_url() {
  env_value DATABASE_URL | sed -E 's/\?.*$//' | sed -E "s#^(postgres(ql)?://)[^@/]*@#\1${BACKUP_ROLE}@#"
}

remote_repo() {
  local endpoint bucket
  endpoint=$(env_value S3_ENDPOINT); bucket=$(env_value S3_BUCKET)
  [[ -n $endpoint && -n $bucket ]] || die "Thiếu S3_ENDPOINT/S3_BUCKET trong $APP_DIR/.env"
  printf 's3:%s/%s/%s' "${endpoint%/}" "$bucket" "$REMOTE_PREFIX"
}

local_restic() { restic -r "$LOCAL_REPO" "$@"; }
remote_restic() {
  AWS_ACCESS_KEY_ID=$(env_value S3_ACCESS_KEY) AWS_SECRET_ACCESS_KEY=$(env_value S3_SECRET_KEY) \
    restic -r "$(remote_repo)" -o s3.bucket-lookup=path -o "s3.region=$(env_value S3_REGION)" "$@"
}

notify() {
  local token chats id
  [[ $(env_value TELEGRAM_ALERT_ENABLED) == true ]] || { log "Telegram tắt — không gửi: $1"; return 0; }
  token=$(env_value TELEGRAM_BOT_TOKEN); chats=$(env_value TELEGRAM_CHAT_IDS)
  [[ -n $token && -n $chats ]] || { log "Thiếu TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_IDS — không gửi: $1"; return 0; }
  for id in ${chats//,/ }; do
    curl -fsS --max-time 15 -o /dev/null "https://api.telegram.org/bot$token/sendMessage" \
      --data-urlencode "chat_id=$id" --data-urlencode "text=$1" || log "Gửi Telegram tới $id lỗi"
  done
}

LOG_FILE=$(mktemp /tmp/dh1-backup.XXXXXX)
exec > >(tee -a "$LOG_FILE") 2>&1
on_error() {
  local code=$? line=$1
  notify "❌ Sao lưu DH1 ($MODE) LỖI (mã $code, dòng $line) trên $(hostname):
$(tail -n 12 "$LOG_FILE" | cut -c1-300)"
  exit "$code"
}
trap 'on_error $LINENO' ERR
trap 'rm -f "$LOG_FILE"' EXIT

mkdir -p "$STATE_DIR" "$RESTIC_CACHE_DIR"
[[ $MODE == init || -s $RESTIC_PASSWORD_FILE ]] || die "Chưa có $RESTIC_PASSWORD_FILE — chạy 'init' trước."
exec 9>/run/lock/dh1-db-backup.lock
flock -w 3600 9 || die "Một lượt sao lưu khác đang chạy quá 1 giờ."

# ------------------------------------------------------------------ sao lưu DB
# --stdin-from-command: pg_dump thoát mã khác 0 thì restic KHÔNG tạo snapshot (không có bản dở dang).
dump_snapshot() {
  local tag=$1 name=$2; shift 2
  log "pg_dump → kho cục bộ (tag $tag, tệp $name)"
  local_restic backup --quiet --host dh1 --tag "$tag" --stdin-filename "$name" \
    --stdin-from-command -- pg_dump -w "$@" "$(backup_db_url)"
  log "Chép sang MinIO"
  RESTIC_FROM_PASSWORD_FILE=$RESTIC_PASSWORD_FILE remote_restic copy --quiet --from-repo "$LOCAL_REPO" --tag "$tag"
}

forget_both() {
  local tag=$1 local_policy=$2 remote_policy=$3
  # shellcheck disable=SC2086 # chính sách là danh sách cờ
  local_restic forget --quiet --tag "$tag" $local_policy --prune
  # Kho MinIO chỉ forget ở đây; prune (xoá gói dữ liệu, tốn băng thông) dồn vào lượt `check` hằng tuần.
  # shellcheck disable=SC2086
  remote_restic forget --quiet --tag "$tag" $remote_policy
}

case $MODE in
  init)
    mkdir -p "$CONF_DIR" "$(dirname "$LOCAL_REPO")"
    chmod 700 "$CONF_DIR"
    if [[ ! -s $RESTIC_PASSWORD_FILE ]]; then
      openssl rand -base64 48 | tr -d '\n' > "$RESTIC_PASSWORD_FILE"
      chmod 600 "$RESTIC_PASSWORD_FILE"
      log "Đã tạo mật khẩu mới: $RESTIC_PASSWORD_FILE — CHÉP GIỮ MỘT BẢN Ở NƠI KHÁC."
    fi
    [[ -f $LOCAL_REPO/config ]] || local_restic init
    # Cùng tham số chia khối với kho cục bộ thì `restic copy` mới khử trùng được.
    remote_restic cat config >/dev/null 2>&1 \
      || RESTIC_FROM_PASSWORD_FILE=$RESTIC_PASSWORD_FILE remote_restic init --from-repo "$LOCAL_REPO" --copy-chunker-params
    [[ -f $STATE_DIR/started ]] || date +%s > "$STATE_DIR/started"
    log "Kho cục bộ: $LOCAL_REPO · Kho MinIO: $(remote_repo)"
    ;;

  shift)
    dump_snapshot shift dh1db-ktkt-pct.sql \
      -t 'public.ctktkt_*' -t 'public."WorkPermit"*' -t 'public."RbacConfig"'
    forget_both shift "--keep-within 2d" "--keep-within 14d"
    ;;

  core)
    dump_snapshot core dh1db-core.sql --exclude-table-data='public."AiKnowledgeChunk"'
    forget_both core "--keep-within 7d" "--keep-daily 35 --keep-weekly 12 --keep-monthly 12"
    ;;

  ai)
    dump_snapshot ai dh1db-ai-knowledge.sql -t 'public."AiKnowledgeChunk"'
    forget_both ai "--keep-last 1" "--keep-monthly 3"
    ;;

  files)
    # Không --remove: tệp bị xoá trên MinIO vẫn còn ở đây (đó chính là thứ cần giữ). Lịch sử theo
    # ngày nằm trong kho restic cục bộ (tag files) — không chép tệp MinIO ngược lên chính MinIO.
    for prefix in "${FILE_PREFIXES[@]}"; do
      mkdir -p "$FILES_DIR/$prefix"
      log "mc mirror $prefix/"
      mc mirror --quiet --overwrite "$MC_ALIAS/$(env_value S3_BUCKET)/$prefix" "$FILES_DIR/$prefix" >/dev/null
    done
    local_restic backup --quiet --host dh1 --tag files "$FILES_DIR"
    local_restic forget --quiet --tag files --keep-daily 30 --keep-monthly 6 --prune
    log "Tệp: $(du -sh "$FILES_DIR" | cut -f1)"
    ;;

  verify)
    started=$(cat "$STATE_DIR/started" 2>/dev/null || date +%s)
    problems=$(remote_restic snapshots --json | node -e '
      const snaps = JSON.parse(require("fs").readFileSync(0, "utf8"));
      const now = Date.now(), H = 3600e3, D = 24 * H;
      const since = Number(process.argv[1]) * 1000; // lúc chạy init — kho trẻ hơn mức giữ thì chưa đòi bản cũ
      // [tag, bản mới nhất phải trẻ hơn, bản cũ nhất phải già ít nhất (tối đa) — theo chính sách giữ]
      const rules = [["shift", 9.5 * H, 13 * D], ["core", 26 * H, 30 * D], ["ai", 33 * D, 0]];
      const out = [];
      for (const [tag, maxNewest, keepAtLeast] of rules) {
        const times = snaps.filter(s => (s.tags || []).includes(tag)).map(s => Date.parse(s.time)).sort((a, b) => a - b);
        if (!times.length) { out.push(`Không có bản "${tag}" nào trên MinIO`); continue; }
        const newestAge = now - times.at(-1);
        if (newestAge > maxNewest) out.push(`Bản "${tag}" mới nhất đã ${(newestAge / H).toFixed(1)} giờ`);
        const expected = Math.min(now - since, keepAtLeast) - 2 * D;
        const oldestAge = now - times[0];
        if (expected > 0 && oldestAge < expected)
          out.push(`Bản "${tag}" cũ nhất chỉ ${(oldestAge / D).toFixed(1)} ngày (lẽ ra ≥ ${(expected / D).toFixed(0)}) — có thể MinIO tự xoá`);
      }
      console.log(out.join("\n"));
    ' "$started")
    remote_restic check --quiet || problems+=$'\n'"restic check kho MinIO báo lỗi"
    local_restic check --quiet || problems+=$'\n'"restic check kho cục bộ báo lỗi"
    if [[ -n ${problems//$'\n'/} ]]; then
      log "Phát hiện vấn đề:"; echo "$problems"
      notify "⚠️ Sao lưu DH1 cần xem:
$problems"
      exit 1
    fi
    log "Bản sao lưu trên MinIO đủ và tươi."
    ;;

  check)
    remote_restic prune --quiet
    remote_restic check --read-data-subset=5%
    local_restic check --read-data-subset=10%
    # Bản core mới nhất phải có dòng kết thúc của pg_dump.
    # Đọc hết rồi mới grep: `grep -q` thoát sớm làm restic nhận SIGPIPE → pipefail báo lỗi nhầm.
    # pg_dump 16.10+ ghi thêm dòng `\unrestrict …` SAU dòng kết thúc → lấy 10 dòng cuối cho chắc.
    tail_lines=$(remote_restic dump latest --tag core /dh1db-core.sql | tail -n 10)
    [[ $tail_lines == *"PostgreSQL database dump complete"* ]] \
      || die "Bản core mới nhất trên MinIO thiếu dòng kết thúc pg_dump"
    log "check OK"
    ;;

  restore-test)
    name=dh1-restore-test
    docker rm -f "$name" >/dev/null 2>&1 || true
    cleanup_container() { docker rm -f "$name" >/dev/null 2>&1 || true; }
    trap 'cleanup_container; rm -f "$LOG_FILE"' EXIT
    docker run -d --rm --name "$name" --memory 1g -e POSTGRES_PASSWORD=restoretest -e POSTGRES_DB=dh1db "$RESTORE_IMAGE" >/dev/null
    for _ in $(seq 60); do docker exec "$name" pg_isready -U postgres -d dh1db >/dev/null 2>&1 && break; sleep 2; done
    tpsql()    { docker exec "$name" psql -X -q -U postgres -d dh1db "$@"; }      # không -i: khỏi nuốt stdin vòng lặp
    tpsql_in() { docker exec -i "$name" psql -X -q -U postgres -d dh1db "$@"; }
    # Tạo sẵn các vai trò mà bản dump gán quyền/chủ sở hữu, để lỗi còn lại là lỗi thật.
    psql -w -XAt "$(backup_db_url)" -c "select rolname from pg_roles where rolname !~ '^pg_' and rolname <> 'postgres'" \
      | while read -r role; do tpsql -c "CREATE ROLE \"$role\" NOLOGIN" >/dev/null; done
    log "Khôi phục bản core mới nhất từ MinIO vào $RESTORE_IMAGE"
    restore_err=$(mktemp)
    remote_restic dump latest --tag core /dh1db-core.sql | tpsql_in -v ON_ERROR_STOP=0 >/dev/null 2>"$restore_err"
    errors=$(grep -c 'ERROR' "$restore_err" || true)
    grep -m5 'ERROR' "$restore_err" || true
    rm -f "$restore_err"
    count_sql="select format('%s.%s', table_schema, table_name), (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
      from information_schema.tables where table_type = 'BASE TABLE' and table_schema in ('public','tcms') and table_name <> 'AiKnowledgeChunk' order by 1"
    diff_report=$(join -t'|' -a1 -e MISSING -o 0,1.2,2.2 \
      <(psql -w -XAt "$(backup_db_url)" -c "$count_sql" | LC_ALL=C sort) \
      <(tpsql -At -c "$count_sql" | LC_ALL=C sort) | LC_ALL=C node -e '
        const rows = require("fs").readFileSync(0, "utf8").trim().split("\n").map(l => l.split("|"));
        let tables = 0, rowsTotal = 0; const bad = [];
        for (const [t, prod, rest] of rows) {
          tables++; const p = Number(prod), r = Number(rest);
          if (rest === "MISSING" || (p > 0 && r === 0) || (p >= 100 && r < p * 0.9)) bad.push(`${t}: thật ${prod}, khôi phục ${rest}`);
          else rowsTotal += r;
        }
        console.log(JSON.stringify({ tables, rowsTotal, bad }));')
    log "Kết quả: $diff_report · lỗi psql: $errors"
    summary=$(node -e 'const r = JSON.parse(process.argv[1]); console.log(`${r.tables} bảng, ${r.rowsTotal} dòng khớp${r.bad.length ? `; LỆCH: ${r.bad.slice(0, 8).join("; ")}` : ""}`)' "$diff_report")
    if [[ $diff_report == *'"bad":[]'* && $errors -eq 0 ]]; then
      notify "✅ Thử khôi phục sao lưu DH1 tháng $(date +%m/%Y): OK — $summary"
    else
      notify "❌ Thử khôi phục sao lưu DH1 tháng $(date +%m/%Y) CÓ VẤN ĐỀ — $summary · lỗi psql: $errors"
      exit 1
    fi
    ;;

  status)
    echo "== Kho MinIO: $(remote_repo)"; remote_restic snapshots --compact
    echo "== Kho cục bộ: $LOCAL_REPO";   local_restic snapshots --compact
    remote_restic stats --mode raw-data | grep -E 'Total Size|Uncompressed' || true
    ;;

  *)
    sed -n '2,25p' "$0"; exit 2 ;;
esac
