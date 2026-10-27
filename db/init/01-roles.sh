#!/bin/sh
# Lo ejecuta la imagen oficial de PostgreSQL solo al crear el volumen por primera vez.
#   postgres     superusuario, solo para mantenimiento y respaldos.
#   citas_owner  dueño del esquema; lo usan únicamente las migraciones.
#   citas_app    rol de la aplicación: sin DDL ni DELETE, aunque la app se viera comprometida
#                no podría borrar ni alterar la estructura.
set -eu
: "${OWNER_DB_PASSWORD:?Define OWNER_DB_PASSWORD}"
: "${APP_DB_PASSWORD:?Define APP_DB_PASSWORD}"

psql -v ON_ERROR_STOP=1 \
  -v owner_password="$OWNER_DB_PASSWORD" -v app_password="$APP_DB_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE citas_owner LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE citas_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;

ALTER DATABASE :"DBNAME" OWNER TO citas_owner;
REVOKE ALL ON DATABASE :"DBNAME" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"DBNAME" TO citas_app;

ALTER SCHEMA public OWNER TO citas_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO citas_app;

ALTER DEFAULT PRIVILEGES FOR ROLE citas_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO citas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE citas_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO citas_app;
SQL
