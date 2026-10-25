#!/bin/sh
# SIMO - Respaldo diario de PostgreSQL (RNF-05: respaldos diarios) - SCRUM-134
#
# Corre dentro del contenedor "backup" del despliegue. Cada día a la hora
# BACKUP_HOUR respalda:
#   * la base oficial en Neon, si BACKUP_DATABASE_URL está definida
#       -> /backups/simo_neon_AAAAMMDD_HHMM.dump
#   * la base local del despliegue (variables PG* de libpq), si PGHOST está definida
#       -> /backups/simo_AAAAMMDD_HHMM.dump
# Cada respaldo se verifica leyendo su índice con pg_restore --list antes de
# darlo por bueno, y se borran los respaldos con más de BACKUP_RETENTION_DAYS días.
#
# Respaldo manual inmediato:
#   docker compose exec backup sh /opt/backup/respaldo.sh ahora
# Restauración: ver deploy/backup/restaurar.sh y deploy/README.md
#
# Variables: BACKUP_DATABASE_URL (Neon), PGHOST, PGUSER, PGPASSWORD, PGDATABASE,
#            BACKUP_HOUR (0-23, por defecto 3), BACKUP_RETENTION_DAYS (por defecto 14)
set -eu

DESTINO="${BACKUP_DIR:-/backups}"
HORA="$(printf '%02d' "${BACKUP_HOUR:-3}")"
RETENCION="${BACKUP_RETENTION_DAYS:-14}"

# respaldar_base <prefijo> [cadena de conexión]
respaldar_base() {
    archivo="$DESTINO/$1_$(date +%Y%m%d_%H%M).dump"
    # Se escribe a un temporal y se renombra al final: nunca queda un
    # respaldo a medias con nombre válido.
    if pg_dump --format=custom --no-owner --no-privileges --file="$archivo.tmp" ${2:+"$2"} \
       && pg_restore --list "$archivo.tmp" > /dev/null; then
        mv "$archivo.tmp" "$archivo"
        echo "$(date '+%F %T') respaldo creado: $(basename "$archivo") ($(du -h "$archivo" | cut -f1))"
    else
        rm -f "$archivo.tmp"
        echo "$(date '+%F %T') ERROR: falló el respaldo $1" >&2
        return 1
    fi
}

respaldar() {
    fallos=0
    if [ -n "${BACKUP_DATABASE_URL:-}" ]; then
        respaldar_base simo_neon "$BACKUP_DATABASE_URL" || fallos=$((fallos + 1))
    fi
    if [ -n "${PGHOST:-}" ]; then
        respaldar_base simo || fallos=$((fallos + 1))
    fi
    limpiar
    [ "$fallos" -eq 0 ]
}

limpiar() {
    find "$DESTINO" -name 'simo_*.dump' -type f -mtime +"$RETENCION" -print -delete \
        | sed 's/^/respaldo antiguo eliminado: /'
}

mkdir -p "$DESTINO"

if [ -z "${BACKUP_DATABASE_URL:-}" ] && [ -z "${PGHOST:-}" ]; then
    echo "ERROR: defina BACKUP_DATABASE_URL (Neon) o PGHOST (base local)" >&2
    exit 1
fi

if [ "${1:-}" = "ahora" ]; then
    respaldar
    exit $?
fi

echo "$(date '+%F %T') servicio de respaldo iniciado: diario a las ${HORA}:00, retención ${RETENCION} días," \
     "Neon: $([ -n "${BACKUP_DATABASE_URL:-}" ] && echo sí || echo no), local: $([ -n "${PGHOST:-}" ] && echo sí || echo no)"
# Cada base lleva su propio registro: si una falla se reintenta cada minuto
# sin repetir el respaldo de la que ya salió bien.
ultimo_neon=""
ultimo_local=""
while true; do
    hoy="$(date +%F)"
    if [ "$(date +%H)" = "$HORA" ]; then
        if [ -n "${BACKUP_DATABASE_URL:-}" ] && [ "$ultimo_neon" != "$hoy" ]; then
            respaldar_base simo_neon "$BACKUP_DATABASE_URL" && ultimo_neon="$hoy" || true
        fi
        if [ -n "${PGHOST:-}" ] && [ "$ultimo_local" != "$hoy" ]; then
            respaldar_base simo && ultimo_local="$hoy" || true
        fi
        limpiar
    fi
    sleep 60
done
