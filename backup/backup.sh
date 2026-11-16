#!/bin/sh
# Sao lưu tự động hằng ngày: cơ sở dữ liệu (pg_dump) + ảnh; giữ BACKUP_KEEP bản gần nhất (PRD mục 9).
set -eu

DIR=/backups
KEEP="${BACKUP_KEEP:-30}"
HOUR="${BACKUP_HOUR:-2}"
mkdir -p "$DIR"

backup() {
  ts=$(date +%Y%m%d-%H%M%S)
  echo "[backup] $(date '+%F %T') bắt đầu sao lưu $ts"
  pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6 -f "$DIR/giapha-$ts.dump.tmp"
  mv "$DIR/giapha-$ts.dump.tmp" "$DIR/giapha-$ts.dump"
  tar -czf "$DIR/giapha-$ts.tar.gz.tmp" -C /media . 2>/dev/null || true
  [ -f "$DIR/giapha-$ts.tar.gz.tmp" ] && mv "$DIR/giapha-$ts.tar.gz.tmp" "$DIR/giapha-$ts.tar.gz"
  for ext in dump tar.gz; do
    ls -1t "$DIR"/giapha-*."$ext" 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
  done
  echo "[backup] xong: $(ls -1 "$DIR"/giapha-*.dump | wc -l) bản đang giữ"
}

if [ "${1:-}" = "now" ]; then
  backup
  exit 0
fi

until pg_isready -h db -U "$POSTGRES_USER" -q; do sleep 2; done
echo "[backup] chạy lúc ${HOUR}:00 mỗi ngày (giờ $(date +%Z)), giữ $KEEP bản"

while true; do
  today=$(date +%Y%m%d)
  hour=$(date +%-H 2>/dev/null || date +%H | sed 's/^0//')
  if ! ls "$DIR"/giapha-"$today"-*.dump >/dev/null 2>&1; then
    # Chưa có bản hôm nay: chạy khi đến giờ, hoặc ngay nếu chưa từng có bản nào
    if [ "$hour" -ge "$HOUR" ] || ! ls "$DIR"/giapha-*.dump >/dev/null 2>&1; then
      backup || echo "[backup] LỖI sao lưu" >&2
    fi
  fi
  sleep 600
done
