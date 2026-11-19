#!/bin/sh
# SIMO - Tiempos de respuesta de la API (SCRUM-168)
#
# Mide los endpoints que usan las pantallas: mejor de 3 intentos, en segundos,
# con el tamaño de la respuesta. Úselo contra una base poblada con
# db/carga/poblar_masivo.sql, nunca contra producción.
#
#   API=http://localhost:3000/api sh db/carga/medir_api.sh
#
# Requiere los usuarios del seed (contraseña Simo2026*) y curl.
API=${API:-http://localhost:3000/api}
token() { curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
            -d "{\"email\":\"$1@simo.local\",\"password\":\"Simo2026*\"}" | sed 's/.*"token":"\([^"]*\)".*/\1/'; }
G=$(token gerente); V=$(token vendedor); I=$(token inventario)
P=$(curl -s "$API/products?search=CARGA-000777" -H "Authorization: Bearer $G" | sed 's/.*"id_producto":\([0-9]*\).*/\1/')
medir() { t="$1"; ruta="$2"; mejor=99; codigo=0; tam=0
  for n in 1 2 3; do r=$(curl -s -o /dev/null -w '%{http_code} %{time_total} %{size_download}' "$API$ruta" -H "Authorization: Bearer $t"); set -- $r
    codigo=$1; tam=$3; mejor=$(awk -v a=$2 -v b=$mejor 'BEGIN{print (a<b)?a:b}'); done
  printf "%-52s %s %7.3f s %9s bytes\n" "$ruta" "$codigo" "$mejor" "$tam"; }
medir $G "/products?limit=100"
medir $G "/products?search=Producto%20de%20carga%201999&limit=100"
medir $G "/products?search=CARGA-000777"
medir $V "/sales"
medir $G "/sales?desde=$(date -u +%Y-%m-01)"
medir $G "/sales/daily-summary"
medir $V "/orders"
medir $V "/orders?estado=CONFIRMADO"
medir $G "/orders?desde=$(date -u +%Y-%m-01)"
medir $G "/inventory/kardex/$P"
medir $V "/customers?q=Cliente%20de%20carga%204999"
medir $G "/dashboard/metrics"
medir $I "/dashboard/alerts"
medir $G "/dashboard/alerts"
medir $G "/payments/wallet?estado=PENDIENTE"
medir $G "/payments/wallet"
medir $G "/audit"
medir $G "/reports"
for id in 1 2 3 4 5 6 7 8 9; do medir $G "/reports/$id/download"; done
medir $G "/users?limit=100"
