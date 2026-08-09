#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

usage() {
  echo "Cách dùng: $0 <compose.yml> <file .env> <thư mục chứa backup>" >&2
  echo "Ví dụ: $0 /opt/n8n/compose.yml /opt/n8n/.env /var/backups/dh1-n8n" >&2
}

if [[ $# -ne 3 ]]; then
  usage
  exit 2
fi

compose_file=$1
env_file=$2
backup_parent=$3

if [[ ! -f "$compose_file" ]]; then
  echo "Không tìm thấy compose file: $compose_file" >&2
  exit 1
fi
if [[ ! -f "$env_file" ]]; then
  echo "Không tìm thấy file môi trường: $env_file" >&2
  exit 1
fi
if [[ "$backup_parent" != /* || "$backup_parent" == "/" || "$backup_parent" == "$HOME" ]]; then
  echo "Thư mục backup phải là đường dẫn tuyệt đối, không được là / hoặc HOME." >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || { echo "Máy chưa cài Docker." >&2; exit 1; }
docker compose version >/dev/null

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="${backup_parent%/}/n8n-backup-${timestamp}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

compose=(docker compose --env-file "$env_file" -f "$compose_file")

echo "Kiểm tra dịch vụ n8n..."
"${compose[@]}" ps --status running >/dev/null

echo "Sao lưu PostgreSQL..."
"${compose[@]}" exec -T n8n-db sh -c \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > "$backup_dir/postgres.dump"

echo "Sao lưu volume n8n_data..."
"${compose[@]}" exec -T n8n tar -C /home/node/.n8n -czf - . \
  > "$backup_dir/n8n-data.tar.gz"

echo "Xuất workflow JSON để kiểm tra nhanh..."
container_export="/tmp/dh1-workflows-${timestamp}.json"
"${compose[@]}" exec -T n8n n8n export:workflow --all --pretty --output="$container_export" >/dev/null
"${compose[@]}" cp "n8n:${container_export}" "$backup_dir/workflows.json" >/dev/null
"${compose[@]}" exec -T n8n rm -f "$container_export"

cp "$compose_file" "$backup_dir/compose.yml"
cp "$env_file" "$backup_dir/n8n.env"
chmod 600 "$backup_dir/n8n.env"

if [[ -n "${WEBSITE_ENV_FILE:-}" ]]; then
  if [[ ! -f "$WEBSITE_ENV_FILE" ]]; then
    echo "Không tìm thấy WEBSITE_ENV_FILE: $WEBSITE_ENV_FILE" >&2
    exit 1
  fi
  cp "$WEBSITE_ENV_FILE" "$backup_dir/website.env"
  chmod 600 "$backup_dir/website.env"
fi

if [[ "${INCLUDE_DOCKER_IMAGES:-0}" == "1" ]]; then
  echo "Sao lưu các Docker image (có thể mất vài phút)..."
  mapfile -t docker_images < <("${compose[@]}" config --images | sort -u)
  docker save "${docker_images[@]}" | gzip -1 > "$backup_dir/docker-images.tar.gz"
fi

{
  echo "created_at_utc=$timestamp"
  echo "host=$(hostname)"
  printf "n8n_version="
  "${compose[@]}" exec -T n8n n8n --version | tr -d '\r'
  echo "images:"
  "${compose[@]}" config --images
} > "$backup_dir/MANIFEST.txt"

checksum_files=(postgres.dump n8n-data.tar.gz workflows.json compose.yml n8n.env MANIFEST.txt)
[[ -f "$backup_dir/website.env" ]] && checksum_files+=(website.env)
[[ -f "$backup_dir/docker-images.tar.gz" ]] && checksum_files+=(docker-images.tar.gz)
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$backup_dir" && sha256sum "${checksum_files[@]}" > SHA256SUMS)
elif command -v shasum >/dev/null 2>&1; then
  (cd "$backup_dir" && shasum -a 256 "${checksum_files[@]}" > SHA256SUMS)
else
  echo "Cảnh báo: không có sha256sum/shasum nên chưa tạo checksum." >&2
fi

echo "Backup hoàn tất: $backup_dir"
echo "Hãy chép thư mục này sang nơi lưu trữ mã hóa ngoài máy chủ."
