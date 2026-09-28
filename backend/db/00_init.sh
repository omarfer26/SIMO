#!/bin/sh
# SIMO - Inicialización de la base de datos.
#
# Docker ejecuta este script automáticamente la PRIMERA vez que se crea el
# volumen de PostgreSQL (carpeta montada en /docker-entrypoint-initdb.d).
# Para recrear la base desde cero: docker compose down -v && docker compose up -d
#
# También se puede ejecutar a mano contra una base local:
#   POSTGRES_USER=postgres POSTGRES_DB=simo_retail sh db/00_init.sh
#
# Variables opcionales:
#   SIMO_SEED=false          omite los datos de desarrollo
#   SIMO_APP_PASSWORD=...    crea/actualiza el rol simo_app que usa la API
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
# Si Docker "sourcea" el script (sin permiso de ejecución), $0 no apunta
# aquí: se usa la carpeta de inicialización del contenedor.
[ -d "$DIR/migrations" ] || DIR=/docker-entrypoint-initdb.d
# Oculta los NOTICE de "DROP ... IF EXISTS" en la primera ejecución
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

PSQL="psql -v ON_ERROR_STOP=1 --username $POSTGRES_USER --dbname $POSTGRES_DB -q"

run_dir() {
    for file in "$DIR/$1"/*.sql; do
        [ -e "$file" ] || continue
        echo "SIMO > ejecutando $1/$(basename "$file")"
        $PSQL -f "$file"
    done
}

run_dir migrations

if [ "${SIMO_SEED:-true}" = "true" ]; then
    run_dir seeds
fi

if [ -n "${SIMO_APP_PASSWORD:-}" ]; then
    echo "SIMO > configurando el rol simo_app"
    $PSQL -v app_password="$SIMO_APP_PASSWORD" -f "$DIR/roles/001_rol_aplicacion.sql"
fi
