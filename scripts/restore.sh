#!/usr/bin/env bash
# Khôi phục toàn bộ cây về một bản sao lưu: ./scripts/restore.sh giapha-YYYYMMDD-HHMMSS.dump
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -ne 1 ]; then
  echo "Cách dùng: $0 giapha-YYYYMMDD-HHMMSS.dump"
  echo "Các bản hiện có:"
  docker compose exec -T backup sh -c 'ls -1t /backups/*.dump 2>/dev/null | xargs -n1 basename' </dev/null || true
  exit 1
fi

FILE="$(basename "$1")"
TS="${FILE#giapha-}"
TS="${TS%.dump}"
docker compose exec -T backup test -f "/backups/$FILE" </dev/null || { echo "Không tìm thấy /backups/$FILE"; exit 1; }

answer=""
read -r -p "Toàn bộ dữ liệu hiện tại sẽ bị thay bằng bản $FILE. Gõ KHOI PHUC để tiếp tục: " answer || true
[ "$answer" = "KHOI PHUC" ] || { echo "Đã hủy."; exit 1; }

echo "→ Sao lưu trạng thái hiện tại trước khi khôi phục…"
docker compose exec -T backup /bin/sh /backup.sh now </dev/null

echo "→ Tạm dừng backend và worker…"
docker compose stop backend worker

echo "→ Khôi phục cơ sở dữ liệu…"
docker compose exec -T backup sh -c "pg_restore -h db -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --clean --if-exists --no-owner --single-transaction /backups/$FILE" </dev/null

if docker compose exec -T backup test -f "/backups/giapha-$TS.tar.gz" </dev/null; then
  echo "→ Khôi phục ảnh…"
  docker compose exec -T backup sh -c "find /media -mindepth 1 -delete && tar -xzf /backups/giapha-$TS.tar.gz -C /media" </dev/null
fi

echo "→ Xóa cache và khởi động lại…"
docker compose exec -T redis redis-cli FLUSHALL </dev/null >/dev/null
docker compose start backend worker
echo "✓ Đã khôi phục về bản $FILE"
