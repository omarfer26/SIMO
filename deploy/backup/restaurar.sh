#!/bin/sh
# SIMO - Restauración de un respaldo (SCRUM-134)
#
#   sh restaurar.sh <respaldo.dump> <cadena de conexión destino>
#
# Restaura el respaldo en la base destino en UNA transacción (si algo falla,
# la base queda como estaba) y luego verifica la base restaurada: cuenta las
# filas de las tablas principales y audita el Kardex con fn_validar_kardex().
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
set -eu

if [ $# -ne 2 ]; then
    echo "Uso: sh restaurar.sh <respaldo.dump> <cadena de conexión destino>" >&2
    exit 2
fi
RESPALDO="$1"
DESTINO="$2"

[ -f "$RESPALDO" ] || { echo "ERROR: no existe $RESPALDO" >&2; exit 1; }
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
SELECT count(*) FILTER (WHERE consistente)     AS productos_kardex_ok,
       count(*) FILTER (WHERE NOT consistente) AS productos_kardex_mal
FROM fn_validar_kardex();
SQL
