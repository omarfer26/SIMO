#!/bin/sh
# SIMO - Aplica el esquema del repositorio a una base PostgreSQL remota (Neon).
#
#   DATABASE_URL='postgresql://...' sh db/neon/aplicar.sh [--con-seed]
#
# Pasos, en orden:
#   1. db/neon/001_mover_esquema_anterior.sql (solo actúa si encuentra el
#      esquema anterior del Sprint 1; se puede re-ejecutar)
#   2. db/migrations/*.sql en orden numérico (todas se pueden re-ejecutar)
#   3. db/seeds/*.sql si se pasa --con-seed (usuarios de prueba)
#
# Requiere psql 16+. Con Docker, sin instalar nada:
#   docker run --rm -e DATABASE_URL -v "$PWD:/b" -w /b postgres:18-alpine sh db/neon/aplicar.sh --con-seed
set -eu

: "${DATABASE_URL:?Defina DATABASE_URL con la cadena de conexión directa (sin pooler) de Neon}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PGOPTIONS="-c client_min_messages=warning"

ejecutar() {
    echo "SIMO > $1"
    psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f "$DIR/$1"
}

ejecutar neon/001_mover_esquema_anterior.sql
for f in "$DIR"/migrations/*.sql; do
    ejecutar "migrations/$(basename "$f")"
done
if [ "${1:-}" = "--con-seed" ]; then
    for f in "$DIR"/seeds/*.sql; do
        ejecutar "seeds/$(basename "$f")"
    done
fi
echo "SIMO > esquema aplicado"
