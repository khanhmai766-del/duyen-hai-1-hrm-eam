#!/usr/bin/env bash
#
# CHỐT CHẶN DUNG LƯỢNG HẰNG TUẦN — chạy TRÊN SERVER bằng systemd timer dh1-disk-guard.timer.
#
#   /var/www/dh1-app/scripts/server-disk-guard.sh            # dọn + báo cáo
#   /var/www/dh1-app/scripts/server-disk-guard.sh --dry-run  # chỉ báo sẽ dọn gì
#
# Vì sao có file này: ổ đĩa từng bị ăn dần mà không ai thấy — 18 bản chụp .next (20GB), 27 bản
# sao lưu DB, journald 2.8GB, cache npm 3.1GB (đo 2026-09-13). scripts/deploy-server.sh đã tự dọn
# phần sinh ra theo lượt deploy; file này lo phần tích luỹ THEO THỜI GIAN và làm lưới an toàn khi
# lâu không deploy. Mỗi mục chỉ đụng đúng mẫu tên do hệ thống tự sinh — KHÔNG xoá dump/tệp tạo tay,
# KHÔNG đụng thư mục app, .next, .next-builds (việc của deploy-server.sh).
#
# Kết quả ghi vào journal:  journalctl -u dh1-disk-guard.service
set -uo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

BACKUP_DIR=${BACKUP_DIR:-/root}
KEEP_DUMPS=${KEEP_DUMPS:-10}          # khớp scripts/deploy-server.sh
DUMP_MAX_AGE_DAYS=${DUMP_MAX_AGE_DAYS:-14}
KEEP_DEPLOY_LOGS=${KEEP_DEPLOY_LOGS:-20}
NPM_CACHE_MAX_MB=${NPM_CACHE_MAX_MB:-2048}
WARN_FREE_GB=${WARN_FREE_GB:-15}

log() { echo "[disk-guard] $*"; }
del() { if [[ $DRY_RUN == 1 ]]; then log "  (dry-run) xoá $*"; else rm -rf -- "$@"; fi; }

free_gb() { df -BG --output=avail / | tail -1 | tr -dc '0-9'; }
BEFORE=$(free_gb)
log "bắt đầu — ổ / trống ${BEFORE}GB"

# 1. Sao lưu DB trước deploy: LUÔN giữ KEEP_DUMPS bản mới nhất; bản ngoài số đó chỉ xoá khi cũ hơn
#    DUMP_MAX_AGE_DAYS ngày. Bản dở (.INCOMPLETE) xoá luôn.
for f in "$BACKUP_DIR"/backup-dh1db-*-truoc-*.INCOMPLETE*.sql.gz; do
  [[ -e "$f" ]] && { log "bản dump dở: $(basename "$f")"; del "$f"; }
done
mapfile -t dumps < <(ls -1t "$BACKUP_DIR"/backup-dh1db-????-??-??-????-truoc-*.sql.gz 2>/dev/null | grep -v INCOMPLETE)
if (( ${#dumps[@]} > KEEP_DUMPS )); then
  old=0
  for f in "${dumps[@]:$KEEP_DUMPS}"; do
    [[ -n "$(find "$f" -maxdepth 0 -mtime +"$DUMP_MAX_AGE_DAYS" 2>/dev/null)" ]] || continue
    del "$f"; old=$(( old + 1 ))
  done
  log "sao lưu DB: ${#dumps[@]} bản — xoá $old bản vừa ngoài $KEEP_DUMPS bản mới nhất vừa cũ hơn $DUMP_MAX_AGE_DAYS ngày"
fi

# 2. Log deploy.
mapfile -t logs < <(ls -1t "$BACKUP_DIR"/deploy-*.log 2>/dev/null)
if (( ${#logs[@]} > KEEP_DEPLOY_LOGS )); then
  log "log deploy: ${#logs[@]} file → giữ $KEEP_DEPLOY_LOGS"
  for f in "${logs[@]:$KEEP_DEPLOY_LOGS}"; do del "$f"; done
fi

# 3. Bản sao script deploy sót trong /tmp (deploy bị giết giữa chừng không kịp tự xoá).
while IFS= read -r f; do log "bản sao deploy sót: $f"; del "$f"; done \
  < <(find /tmp -maxdepth 1 -name 'dh1-deploy*.sh' -mmin +1440 2>/dev/null)

# 4. Cache npm.
if [[ -d "$HOME/.npm" ]]; then
  NPM_MB=$(du -sm "$HOME/.npm" | cut -f1)
  if (( NPM_MB > NPM_CACHE_MAX_MB )); then
    log "cache npm ${NPM_MB}MB > ${NPM_CACHE_MAX_MB}MB → dọn"
    [[ $DRY_RUN == 1 ]] || npm cache clean --force > /dev/null 2>&1
  fi
fi

# 5. Gói .deb apt đã tải.
if [[ $DRY_RUN == 0 ]]; then apt-get clean > /dev/null 2>&1; fi

# 6. Journald — giới hạn cứng nằm ở /etc/systemd/journald.conf.d/dh1-limit.conf; đây chỉ ép lại.
[[ $DRY_RUN == 1 ]] || journalctl --vacuum-size=500M --vacuum-time=30d > /dev/null 2>&1

AFTER=$(free_gb)
log "xong — ổ / trống ${AFTER}GB (thu hồi $(( AFTER - BEFORE ))GB)"

# 7. Cảnh báo sớm: liệt kê thứ đang chiếm chỗ để người vận hành quyết định (KHÔNG tự xoá).
if (( AFTER < WARN_FREE_GB )); then
  log "CẢNH BÁO: ổ / chỉ còn ${AFTER}GB (< ${WARN_FREE_GB}GB). Lớn nhất:"
  du -xsh /var/www/* /root /opt/* /var/log /tmp 2>/dev/null | sort -rh | head -8 | sed 's/^/[disk-guard]   /'
  exit 2
fi
exit 0
