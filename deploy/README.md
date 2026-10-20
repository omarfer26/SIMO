# Despliegue de SIMO (Docker + Cloudflare Tunnel)

El servidor es la Mac del equipo. Todo corre en contenedores y el acceso desde internet entra solo por un túnel de Cloudflare: no se abren puertos en el router ni se expone la IP de la casa.

```
                    Cloudflare (alejandrostore.com)
                     ├── db.alejandrostore.com   (TCP, protegido con Cloudflare Access)
                     ├── app.alejandrostore.com  (frontend, protegido con Cloudflare Access)
                     └── api.alejandrostore.com  (HTTP, fase 2)
                                │
                          túnel saliente
                                │
┌─────────────────────── Mac (Docker) ─────────────────────────┐
│  tunnel (cloudflared) ──► db  (PostgreSQL 18)  ◄── backup     │
│                     ├───► api (Node 22 / Express)             │
│                     └───► frontend (Next.js)                  │
│  Puertos solo en 127.0.0.1: 5432 db, 3000 api, 3001 frontend  │
└───────────────────────────────────────────────────────────────┘
```

| Servicio | Qué hace |
|---|---|
| `db` | PostgreSQL 18. La primera vez ejecuta las migraciones de `backend/db` y crea el rol `simo_app` |
| `api` | Backend Express. Se conecta como `simo_app` (sin permisos para alterar Kardex ni auditoría) |
| `frontend` | Vista web (Next.js) compilada desde `simoapp/` con `deploy/frontend/Dockerfile`, sin cambios en su código |
| `backup` | `pg_dump` diario de la base oficial en Neon y de la base local a `deploy/backups/`, verificado y con 14 días de retención (RNF-05, SCRUM-134) |
| `tunnel` | Conector de Cloudflare; publica los servicios según lo configurado en el panel |

## 1. Requisitos en la Mac

1. **Docker Desktop** instalado y abierto. En *Settings → General* activar **Start Docker Desktop when you sign in**.
2. **No correr al mismo tiempo** el entorno de desarrollo (`backend/docker-compose.yml`): ambos usan los puertos 5432 y 3000 de la Mac. Para desarrollar en la misma Mac, detener primero el despliegue con `docker compose stop`.
3. **Que la Mac no se duerma**: *Configuración del Sistema → Batería → Opciones* → activar **Evitar la suspensión automática con el adaptador de corriente cuando la pantalla está apagada**, y dejarla conectada. Si la Mac se apaga o se duerme, la base deja de estar disponible para el equipo.

## 2. Configurar Cloudflare (una sola vez)

En [one.dash.cloudflare.com](https://one.dash.cloudflare.com) (Zero Trust):

1. **Crear el túnel:** *Networks → Tunnels → Create a tunnel → Cloudflared*, nombre `simo`. En la pantalla de instalación elegir **Docker** y copiar el valor que aparece después de `--token`: va en `CLOUDFLARE_TUNNEL_TOKEN`. No hace falta ejecutar el comando que muestra Cloudflare; el contenedor `tunnel` ya lo hace.
2. **Publicar la base de datos:** en el túnel, *Public Hostname → Add*:
   - Subdomain `db`, dominio del equipo
   - Service **TCP** → `db:5432`
3. **Proteger la base con Access:** *Access → Applications → Add → Self-hosted*:
   - Domain: `db.alejandrostore.com`
   - Policy **Allow** → Include → *Emails*: los correos de los 5 integrantes
   - Método de inicio de sesión: *One-time PIN* (código al correo)
4. **Publicar el frontend:** aplicación de Access para `app.alejandrostore.com` con la misma política del equipo, y en el túnel el hostname `app` → Service **HTTP** → `frontend:3001`. Mientras el login del frontend sea simulado (acepta cualquier credencial), debe seguir detrás de Access.
5. **Fase 2 — API** (cuando existan el login y el middleware de roles, SCRUM-16 / SCRUM-18): agregar el hostname `api` → Service **HTTP** → `api:3000`. Antes de eso **no se publica**, porque `GET /api/users` todavía no exige token y expondría la lista de usuarios.

## 3. Primer arranque

```bash
cd deploy
cp .env.example .env
```

Completar `deploy/.env`. Para las contraseñas:

```bash
openssl rand -base64 24
```

Levantar todo:

```bash
docker compose up -d --build
```

Verificar que los 4 contenedores estén `running` / `healthy`:

```bash
docker compose ps
```

Crear el administrador real (el seed de prueba está apagado en producción). Si no se define `ADMIN_PASSWORD`, se genera una contraseña aleatoria y se muestra una sola vez:

```bash
docker compose exec api node tools/crear-admin.js "Ramón Machuca" ramondavidmc@ufps.edu.co rmachuca
```

Comprobar la API desde la Mac:

```bash
curl http://localhost:3000/api/health
```

## 4. Operación diaria

Ver registros de un servicio (`db`, `api`, `backup`, `tunnel`):

```bash
docker compose logs -f api
```

Actualizar la API o el frontend después de un `git pull`:

```bash
docker compose up -d --build api frontend
```

### Respaldos diarios (SCRUM-134)

El servicio `backup` respalda todos los días a las `BACKUP_HOUR` (03:00, hora de Colombia):

| Base | Se activa con | Archivo |
|---|---|---|
| Oficial en Neon | `BACKUP_DATABASE_URL` en `.env` (cadena **directa**, sin `-pooler`) | `backups/simo_neon_AAAAMMDD_HHMM.dump` |
| Local del despliegue | variables `PG*` del servicio (ya configuradas) | `backups/simo_AAAAMMDD_HHMM.dump` |

- Formato `custom` de `pg_dump` (comprimido, restaurable por partes).
- Cada archivo se escribe como `.tmp` y solo se renombra si `pg_restore --list` lo lee
  completo: nunca queda un respaldo dañado con nombre válido.
- Si una base falla, se reintenta cada minuto durante esa hora sin repetir la otra.
- Se borran los respaldos con más de `BACKUP_RETENTION_DAYS` días (14).
- Conviene copiar alguno de vez en cuando fuera de la Mac (Drive, disco externo).

Respaldo manual inmediato y registro del servicio:

```bash
docker compose exec backup sh /opt/backup/respaldo.sh ahora
```

```bash
docker compose logs --tail 20 backup
```

### Aplicar migraciones nuevas

El script de inicialización solo corre con el volumen vacío. Con datos reales **no** usar `down -v` (borra la base). Una migración nueva se aplica así:

```bash
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d simo_retail < ../backend/db/migrations/008_nombre.sql
```

Después de crear tablas nuevas, volver a dar permisos a `simo_app` (el comando pide la contraseña del rol, que está en `.env`):

```bash
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d simo_retail -v app_password="$(grep SIMO_APP_PASSWORD .env | cut -d= -f2-)" < ../backend/db/roles/001_rol_aplicacion.sql
```

### Respaldos en GitHub Actions (no dependen de esta Mac)

`.github/workflows/respaldo-neon.yml` respalda Neon todos los días a las 03:00 desde los
servidores de GitHub: `pg_dump`, verificación con `pg_restore --list`, cifrado AES-256
(el repositorio puede ser público) y artefacto de la ejecución guardado 14 días.

Requisitos (los configura quien administra el repositorio):

1. Settings > Secrets and variables > Actions > New repository secret:
   - `NEON_BACKUP_URL`: cadena **directa** de Neon (sin `-pooler`) del rol dueño.
   - `RESPALDO_CLAVE`: frase larga para cifrar; guardarla en un gestor de contraseñas.
2. Que el workflow llegue a la rama `main`: GitHub solo ejecuta los workflows
   programados desde la rama principal. Luego se puede lanzar a mano en
   Actions > Respaldo diario Neon > Run workflow.

Para restaurar: descargar el artefacto de la ejecución (Actions > ejecución > Artifacts),
descomprimir el .zip y descifrar:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in simo_neon_AAAAMMDD_HHMM.dump.enc -out simo_neon.dump
```

Después usar `restaurar.sh` como se indica abajo (o `pg_restore` sobre una rama nueva de Neon).

### Restaurar un respaldo

`backup/restaurar.sh` restaura en **una sola transacción** (si algo falla, la base queda
como estaba) y al final verifica: cuenta filas de las tablas principales y audita el
Kardex con `fn_validar_kardex()`.

**Prueba de restauración** (recomendada una vez por sprint): restaurar el último respaldo
de Neon en una base local vacía y revisar la verificación.

```bash
docker compose exec db createdb -U postgres simo_restaurada
```

```bash
docker compose exec backup sh -c 'sh /opt/backup/restaurar.sh "$(ls -t /backups/simo_neon_*.dump | head -1)" "postgres://$PGUSER:$PGPASSWORD@db:5432/simo_restaurada"'
```

**Recuperar la base local** del despliegue (reemplaza su contenido):

```bash
docker compose stop api
```

```bash
docker compose exec -e SIMO_REEMPLAZAR=si backup sh -c 'sh /opt/backup/restaurar.sh /backups/simo_AAAAMMDD_HHMM.dump "postgres://$PGUSER:$PGPASSWORD@db:5432/$PGDATABASE"'
```

```bash
docker compose start api
```

**Recuperar la base de Neon**: lo más seguro es crear en el panel de Neon una rama
nueva (Branches > Create branch), restaurar allí con su cadena de conexión y, una vez
verificada, apuntar la API a esa rama. Restaurar directamente sobre la rama principal
exige `SIMO_REEMPLAZAR=si` y `SIMO_CONFIRMAR_NEON=si`. Neon además guarda su propio
historial (restauración a un punto en el tiempo) según el plan del proyecto.

### Empezar de cero (borra TODOS los datos)

```bash
docker compose down -v && docker compose up -d --build
```

## 5. Seguridad

- `deploy/.env` y `deploy/backups/` están en `.gitignore`: nunca se suben al repositorio.
- PostgreSQL y la API solo escuchan en `127.0.0.1`; desde la red WiFi o internet no se puede llegar a ellos sin pasar por Cloudflare.
- La base solo es accesible para los correos autorizados en Cloudflare Access, y además pide usuario y contraseña de PostgreSQL.
- La API usa `simo_app`: no puede crear o borrar tablas, ni modificar el Kardex, el historial de pedidos o el log de auditoría.
- El superusuario `postgres` se usa solo para administración y respaldos; no se comparte con la API.

## Operar sin esta Mac (base oficial en Neon)

La base oficial es Neon; esta Mac solo era un servidor más. Si se apaga:

| Pieza | Dónde queda |
|---|---|
| Base de datos | Neon (proyecto *retail*, base `neondb`), con historial propio de Neon |
| Respaldos diarios | GitHub Actions (`respaldo-neon.yml`), cifrados, 14 días |
| API | Cualquier servidor con Node 22 o Docker, configurado con las variables de abajo |
| Credenciales | Panel de Neon (Roles: `neondb_owner` y `simo_app`; se pueden restablecer allí) |

Variables mínimas para correr la API en otro servidor (o en un servicio como Render/Railway):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | cadena de Neon del rol `simo_app` con el host `-pooler` y `sslmode=require` |
| `JWT_SECRET` | clave larga y aleatoria (si falta se usa la de desarrollo) |
| `JWT_EXPIRES_IN` | opcional, por defecto `30m` |
| `PORT` | puerto HTTP, por defecto 3000 |

```bash
cd backend && npm ci --omit=dev && node index.js
```

La API se conecta con `simo_app` (mínimo privilegio: no puede modificar el Kardex ni la
auditoría). Las migraciones nuevas se aplican con el dueño de la base:
`DATABASE_URL=<cadena directa del dueño> sh db/neon/aplicar.sh` y después se vuelve a
correr `db/roles/001_rol_aplicacion.sql` para dar permisos a `simo_app` sobre lo nuevo.
