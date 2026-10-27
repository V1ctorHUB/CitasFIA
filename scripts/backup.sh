#!/usr/bin/env bash
# Respaldo lógico completo de la base (pg_dump formato custom) con verificación de integridad.
# Uso: scripts/backup.sh            (lo ejecuta diariamente deploy/systemd/citas-backup.timer)
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a

: "${BACKUP_DIR:?Define BACKUP_DIR en .env}"
DB_NAME="${POSTGRES_DB:-citas}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/citas-$STAMP.dump"

mkdir -p "$BACKUP_DIR"
umask 077

docker compose exec -T db pg_dump -U postgres -d "$DB_NAME" --format=custom --compress=9 > "$TARGET.partial"

# Un dump truncado no se lista correctamente: se descarta antes de reemplazar respaldos buenos.
docker compose exec -T db pg_restore --list < "$TARGET.partial" > /dev/null
mv "$TARGET.partial" "$TARGET"
sha256sum "$TARGET" > "$TARGET.sha256"

if [ -n "${BACKUP_MIRROR_DIR:-}" ]; then
  if [ -d "$BACKUP_MIRROR_DIR" ]; then
    cp "$TARGET" "$TARGET.sha256" "$BACKUP_MIRROR_DIR"/
  else
    echo "AVISO: BACKUP_MIRROR_DIR ($BACKUP_MIRROR_DIR) no está montado; solo hay copia local." >&2
  fi
fi

find "$BACKUP_DIR" -name 'citas-*.dump*' -mtime +"$RETENTION_DAYS" -delete
echo "Respaldo listo: $TARGET ($(du -h "$TARGET" | cut -f1))"
