#!/usr/bin/env bash
# Prueba real de restauración: restaura un respaldo en una base temporal y compara conteos.
# Uso: scripts/verify-backup.sh [archivo.dump]   (por defecto, el más reciente)
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a

: "${BACKUP_DIR:?Define BACKUP_DIR en .env}"
DUMP="${1:-$(ls -1t "$BACKUP_DIR"/citas-*.dump | head -n 1)}"
CHECK_DB="citas_verificacion_respaldo"

sha256sum --check --status "$DUMP.sha256"

psql_db() { docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -At "$@"; }

psql_db -d postgres -c "DROP DATABASE IF EXISTS $CHECK_DB" -c "CREATE DATABASE $CHECK_DB"
trap 'psql_db -d postgres -c "DROP DATABASE IF EXISTS $CHECK_DB" > /dev/null' EXIT

docker compose exec -T db pg_restore -U postgres -d "$CHECK_DB" --no-owner --exit-on-error < "$DUMP"

COUNT_SQL="SELECT (SELECT count(*) FROM proyectos) || ' proyectos, ' || (SELECT count(*) FROM estudiantes) || ' estudiantes, ' || (SELECT count(*) FROM citas) || ' citas'"
echo "Respaldo:   $(psql_db -d "$CHECK_DB" -c "$COUNT_SQL")"
echo "Producción: $(psql_db -d "${POSTGRES_DB:-citas}" -c "$COUNT_SQL")"
echo "Restauración verificada: $DUMP"
