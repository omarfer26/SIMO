#!/bin/sh
# SIMO - Restauración verificada de un respaldo (SCRUM-134, SCRUM-171)
#
#   sh restaurar.sh <respaldo.dump> <cadena de conexión destino>
#
# Pasos (plan DRP: deploy/DRP.md):
#   1. Comprueba el respaldo: suma SHA-256 (si existe <respaldo>.sha256) e
#      índice legible con pg_restore --list.
#   2. Restaura en UNA transacción: si algo falla, la base queda como estaba.
#   3. Verifica la base restaurada: cuenta las filas principales y audita el
#      inventario con sp_auditar_kardex(p_estricto => true) (saldos del Kardex
#      y cada movimiento contra su documento, SCRUM-169). Si el inventario no
#      cuadra, termina con error: el respaldo NO se debe poner en servicio.
#   4. Si se define SIMO_APP_PASSWORD y está disponible el script de rol
#      (SIMO_ROL_SQL, por defecto backend/db/roles/001_rol_aplicacion.sql del
#      repositorio), vuelve a crear los permisos mínimos del rol simo_app: el
#      respaldo no incluye roles ni permisos.
#
# Por seguridad se niega a restaurar sobre una base que ya tenga el esquema
# de SIMO (tabla productos), salvo SIMO_REEMPLAZAR=si: en ese caso, dentro de
# la misma transacción, borra los esquemas que trae el respaldo (public y
# respaldo_sprint1) y los recrea. Restaurar sobre la base oficial
# de Neon exige además SIMO_CONFIRMAR_NEON=si.
#
# Ejemplo (prueba de restauración en una base local vacía, desde deploy/):
#   docker compose exec db createdb -U postgres simo_restaurada
#   docker compose exec backup sh /opt/backup/restaurar.sh \
#       /backups/simo_neon_20261019_0300.dump postgres://postgres:CLAVE@db:5432/simo_restaurada
#
# Códigos de salida: 0 restaurado y verificado, 1 error, 2 uso incorrecto,
#                    3 restaurado pero el inventario no cuadra.
set -eu

if [ $# -ne 2 ]; then
    echo "Uso: sh restaurar.sh <respaldo.dump> <cadena de conexión destino>" >&2
    exit 2
fi
RESPALDO="$1"
DESTINO="$2"
INICIO="$(date +%s)"

[ -f "$RESPALDO" ] || { echo "ERROR: no existe $RESPALDO" >&2; exit 1; }
if [ -f "$RESPALDO.sha256" ]; then
    esperado="$(cut -d' ' -f1 < "$RESPALDO.sha256")"
    real="$(sha256sum "$RESPALDO" | cut -d' ' -f1)"
    if [ "$esperado" != "$real" ]; then
        echo "ERROR: la suma SHA-256 de $RESPALDO no coincide: el archivo está dañado o fue modificado" >&2
        exit 1
    fi
    echo "$(date '+%F %T') suma SHA-256 verificada"
fi
pg_restore --list "$RESPALDO" > /dev/null || { echo "ERROR: $RESPALDO no es un respaldo válido" >&2; exit 1; }

case "$DESTINO" in
    *neon.tech*)
        if [ "${SIMO_CONFIRMAR_NEON:-}" != "si" ]; then
            echo "ERROR: el destino es Neon. Para restaurar sobre la base oficial defina SIMO_CONFIRMAR_NEON=si" >&2
            exit 1
        fi ;;
esac

tiene_esquema="$(psql -X -At "$DESTINO" -c "SELECT to_regclass('public.productos') IS NOT NULL")"
limpiar=""
if [ "$tiene_esquema" = "t" ]; then
    if [ "${SIMO_REEMPLAZAR:-}" != "si" ]; then
        echo "ERROR: la base destino ya tiene datos de SIMO. Use una base vacía o defina SIMO_REEMPLAZAR=si" >&2
        exit 1
    fi
    # Esquemas que contiene el respaldo (las líneas "SCHEMA - nombre" del índice) y public
    for esquema in public $(pg_restore --list "$RESPALDO" | awk '$4 == "SCHEMA" && $5 == "-" {print $6}'); do
        limpiar="$limpiar DROP SCHEMA IF EXISTS \"$esquema\" CASCADE;"
    done
    limpiar="$limpiar CREATE SCHEMA public;"
fi

echo "$(date '+%F %T') restaurando $(basename "$RESPALDO")..."
# El respaldo se convierte a SQL y se aplica con psql en una sola transacción
# junto con la limpieza: si cualquier sentencia falla, no cambia nada.
{
    echo "BEGIN; SET client_min_messages = warning;"
    echo "$limpiar"
    pg_restore --no-owner --no-privileges --file=- "$RESPALDO"
    echo "COMMIT;"
} | psql -X -q -v ON_ERROR_STOP=1 --dbname="$DESTINO" > /dev/null

echo "$(date '+%F %T') restauración terminada; verificando:"
psql -X -v ON_ERROR_STOP=1 "$DESTINO" <<'SQL'
\pset footer off
SELECT (SELECT count(*) FROM usuarios)               AS usuarios,
       (SELECT count(*) FROM productos)              AS productos,
       (SELECT count(*) FROM clientes)               AS clientes,
       (SELECT count(*) FROM ventas)                 AS ventas,
       (SELECT count(*) FROM compras)                AS compras,
       (SELECT count(*) FROM movimientos_inventario) AS movimientos;
SQL

# Auditoría estricta del inventario. Los respaldos anteriores a la migración
# 025 no traen sp_auditar_kardex: para ellos se usa fn_validar_kardex (012).
if [ "$(psql -X -At "$DESTINO" -c "SELECT to_regproc('sp_auditar_kardex') IS NOT NULL")" = "t" ]; then
    if ! psql -X -q -v ON_ERROR_STOP=1 "$DESTINO" -c "CALL sp_auditar_kardex(NULL, NULL, NULL, NULL, true)"; then
        echo "ERROR: el inventario restaurado no cuadra (SM033). Revise: SELECT * FROM fn_auditar_documentos_kardex();" >&2
        exit 3
    fi
else
    malos="$(psql -X -At "$DESTINO" -c "SELECT count(*) FROM fn_validar_kardex() WHERE NOT consistente")"
    if [ "$malos" != "0" ]; then
        echo "ERROR: $malos productos con el Kardex inconsistente en la base restaurada" >&2
        exit 3
    fi
    echo "Kardex consistente (respaldo anterior a la auditoría de documentos)"
fi

if [ -n "${SIMO_APP_PASSWORD:-}" ]; then
    ROL_SQL="${SIMO_ROL_SQL:-$(dirname "$0")/../../backend/db/roles/001_rol_aplicacion.sql}"
    if [ -f "$ROL_SQL" ]; then
        psql -X -q -v ON_ERROR_STOP=1 -v app_password="$SIMO_APP_PASSWORD" "$DESTINO" -f "$ROL_SQL" > /dev/null
        echo "$(date '+%F %T') permisos del rol simo_app aplicados"
    else
        echo "AVISO: no se encontró $ROL_SQL; aplique backend/db/roles/001_rol_aplicacion.sql antes de conectar la API" >&2
    fi
else
    echo "Recuerde: aplicar backend/db/roles/001_rol_aplicacion.sql (o definir SIMO_APP_PASSWORD) antes de conectar la API"
fi

echo "$(date '+%F %T') restauración verificada en $(( $(date +%s) - INICIO )) s"
