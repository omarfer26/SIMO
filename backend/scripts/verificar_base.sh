#!/bin/sh
# SIMO - Verificación completa de la base de datos (SCRUM-172)
#
# La ejecuta la integración continua (.github/workflows/ci.yml) en cada Pull
# Request, y cualquiera la puede correr en local con Docker:
#
#   docker run --rm --network <red> -e PG_ADMIN_URL=postgres://postgres:CLAVE@<host>:5432 \
#       -e APP_PASSWORD=<clave para simo_app> -v "$PWD:/b" -w /b postgres:18-alpine \
#       sh scripts/verificar_base.sh            (desde backend/)
#
# Sobre un servidor PostgreSQL de PRUEBAS (crea y borra las bases simo_ci y
# simo_ci_carga; se niega a correr contra Neon):
#   1. Aplica todas las migraciones y el seed en una base nueva.
#   2. Las vuelve a aplicar: toda migración debe poder re-ejecutarse, porque
#      el despliegue automático las aplica sobre la base de producción.
#   3. Crea el rol de la API (simo_app) con permisos mínimos.
#   4. Ejecuta las pruebas SQL de db/tests (cada una en una transacción que
#      se revierte) y cuenta las que pasan.
#   5. Audita el inventario con sp_auditar_kardex en modo estricto.
#   6. En otra base, ejecuta la población masiva (SCRUM-170) y vuelve a auditar.
# Termina con error al primer fallo. Deja lista la base simo_ci para las
# pruebas de integración de la API.
set -eu

: "${PG_ADMIN_URL:?Defina PG_ADMIN_URL, p. ej. postgres://postgres:clave@localhost:5432 (sin nombre de base)}"
: "${APP_PASSWORD:?Defina APP_PASSWORD, la contraseña que tendrá el rol simo_app}"
case "$PG_ADMIN_URL" in
    *neon.tech*) echo "ERROR: este script crea y borra bases; no se usa contra Neon" >&2; exit 1 ;;
esac
DIR="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${PG_ADMIN_URL%/}"
export PGOPTIONS="-c client_min_messages=notice"
INICIO="$(date +%s)"

paso() { echo; echo "== $1"; }

recrear() {
    psql -X -q "$BASE/postgres" -c "DROP DATABASE IF EXISTS $1 WITH (FORCE)" -c "CREATE DATABASE $1"
}

paso "1. Migraciones y seed en una base nueva"
recrear simo_ci
DATABASE_URL="$BASE/simo_ci" sh "$DIR/db/neon/aplicar.sh" --con-seed

paso "2. Las migraciones se pueden volver a aplicar"
DATABASE_URL="$BASE/simo_ci" sh "$DIR/db/neon/aplicar.sh" > /dev/null
echo "OK: segunda aplicación sin errores"

paso "3. Rol de la API con permisos mínimos"
psql -X -q -v ON_ERROR_STOP=1 -v app_password="$APP_PASSWORD" "$BASE/simo_ci" -f "$DIR/db/roles/001_rol_aplicacion.sql" > /dev/null
echo "OK: rol simo_app"

paso "4. Pruebas SQL"
total=0
for prueba in "$DIR"/db/tests/[0-9]*.sql; do
    salida="$(psql -X -q -v ON_ERROR_STOP=1 "$BASE/simo_ci" -f "$prueba" 2>&1)" || {
        echo "$salida" | tail -20
        echo "FALLÓ: $(basename "$prueba")" >&2
        exit 1
    }
    n="$(echo "$salida" | grep -c 'OK ' || true)"
    total=$((total + n))
    printf '%-40s %4s pruebas\n' "$(basename "$prueba")" "$n"
done
echo "OK: $total pruebas SQL"

paso "5. Auditoría estricta del inventario"
psql -X -q -v ON_ERROR_STOP=1 "$BASE/simo_ci" -c "CALL sp_auditar_kardex(NULL, NULL, NULL, NULL, true)"

paso "6. Población masiva y auditoría"
recrear simo_ci_carga
DATABASE_URL="$BASE/simo_ci_carga" sh "$DIR/db/neon/aplicar.sh" --con-seed > /dev/null
psql -X -q -v ON_ERROR_STOP=1 -v productos="${CARGA_PRODUCTOS:-200}" -v clientes="${CARGA_CLIENTES:-500}" \
     -v ventas="${CARGA_VENTAS:-5000}" "$BASE/simo_ci_carga" -f "$DIR/db/carga/poblar_masivo.sql"
psql -X -q -v ON_ERROR_STOP=1 "$BASE/simo_ci_carga" -c "CALL sp_auditar_kardex(NULL, NULL, NULL, NULL, true)"
psql -X -q "$BASE/postgres" -c "DROP DATABASE simo_ci_carga WITH (FORCE)"

echo
echo "Base de datos verificada en $(( $(date +%s) - INICIO )) s: $total pruebas SQL, inventario consistente."
