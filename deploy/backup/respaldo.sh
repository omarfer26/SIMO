#!/bin/sh
# SIMO - Respaldo diario de PostgreSQL (RNF-05: respaldos diarios).
#
# Corre dentro del contenedor "backup" del despliegue:
#   * cada día a la hora BACKUP_HOUR genera /backups/simo_AAAAMMDD_HHMM.dump
#   * borra los respaldos con más de BACKUP_RETENTION_DAYS días
#
# Respaldo manual inmediato:
#   docker compose exec backup /respaldo.sh ahora
#
# Variables: PGHOST, PGUSER, PGPASSWORD, PGDATABASE (conexión, estándar de libpq),
#            BACKUP_HOUR (0-23, por defecto 3), BACKUP_RETENTION_DAYS (por defecto 14)
set -eu

DESTINO="${BACKUP_DIR:-/backups}"
HORA="$(printf '%02d' "${BACKUP_HOUR:-3}")"
RETENCION="${BACKUP_RETENTION_DAYS:-14}"

respaldar() {
    archivo="$DESTINO/simo_$(date +%Y%m%d_%H%M).dump"
    # Se escribe a un temporal y se renombra al final: nunca queda un
    # respaldo a medias con nombre válido.
    if pg_dump --format=custom --no-owner --file="$archivo.tmp"; then
        mv "$archivo.tmp" "$archivo"
        echo "$(date '+%F %T') respaldo creado: $(basename "$archivo") ($(du -h "$archivo" | cut -f1))"
    else
        rm -f "$archivo.tmp"
        echo "$(date '+%F %T') ERROR: falló el respaldo" >&2
        return 1
    fi
    find "$DESTINO" -name 'simo_*.dump' -type f -mtime +"$RETENCION" -print -delete \
        | sed 's/^/respaldo antiguo eliminado: /'
}

mkdir -p "$DESTINO"

if [ "${1:-}" = "ahora" ]; then
    respaldar
    exit $?
fi

echo "$(date '+%F %T') servicio de respaldo iniciado: diario a las ${HORA}:00, retención ${RETENCION} días"
ultimo=""
while true; do
    hoy="$(date +%F)"
    if [ "$(date +%H)" = "$HORA" ] && [ "$ultimo" != "$hoy" ]; then
        # Un fallo no detiene el servicio: se reintenta en la siguiente vuelta.
        respaldar && ultimo="$hoy" || true
    fi
    sleep 60
done
