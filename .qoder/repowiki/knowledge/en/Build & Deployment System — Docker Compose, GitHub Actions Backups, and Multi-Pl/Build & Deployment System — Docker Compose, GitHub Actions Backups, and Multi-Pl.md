---
kind: build_system
name: Build & Deployment System — Docker Compose, GitHub Actions Backups, and Multi-Platform Deployments
category: build_system
scope:
    - '**'
source_files:
    - backend/Dockerfile
    - deploy/frontend/Dockerfile
    - deploy/docker-compose.yml
    - .github/workflows/respaldo-neon.yml
    - backend/package.json
    - simoapp/package.json
    - package.json
    - railway.json
    - render.yaml
    - backend/db/00_init.sh
    - backend/db/index.js
    - deploy/backup/respaldo.sh
---

## Build Approach

SIMO is a multi-package monorepo (root `package.json` + `backend/` + `simoapp/`) with no top-level build tool. Each subproject manages its own dependencies and scripts via npm:

- **Root**: `npm run install:all` installs both `backend` and `simoapp`; `npm run dev` runs them concurrently via the root `concurrently` dependency.
- **Backend** (`backend/package.json`): `start` → `node index.js`, `dev` → `nodemon -r dotenv/config index.js`, `test:integracion` uses Node's built-in test runner with `dotenv/config`, unit tests via Jest (integration tests excluded from Jest config).
- **Frontend** (`simoapp/package.json`): standard Next.js scripts (`dev`, `build`, `start`, `lint`).

There are no Makefiles or shell-based build orchestration at the repo root; npm workspaces are not used — each package is installed independently.

## Containerization

Two separate Dockerfiles produce production images on `node:22-alpine`:

- **Backend** (`backend/Dockerfile`): single-stage image that copies `package*.json` first for layer caching, runs `npm ci --omit=dev`, switches to the non-root `node` user, exposes port 3000, and runs `node index.js` directly (no `npm start`).
- **Frontend** (`deploy/frontend/Dockerfile`): two-stage build — Stage 1 (`AS build`) installs deps, copies source, sets `NEXT_PUBLIC_API_URL` via `ARG`/`ENV`, runs `npm run build && npm prune --omit=dev`; Stage 2 copies only `package.json`, `node_modules`, `.next`, and `public`, runs `next start -p 3001` as the `node` user.

The frontend Dockerfile explicitly notes the build context is `simoapp/` (see `deploy/docker-compose.yml`).

## Local Orchestration (`deploy/docker-compose.yml`)

Named compose project `simon` defines five services:

| Service | Image / Build | Port | Purpose |
|---|---|---:|---|
| `db` | `postgres:18-alpine` | 5432 (localhost only) | PostgreSQL with init scripts mounted from `../backend/db` into `/docker-entrypoint-initdb.d:ro` |
| `api` | builds `../backend` | 3000 (localhost only) | Express API, depends on `db` being healthy |
| `frontend` | builds `../simoapp` via `deploy/frontend/Dockerfile` | 3001 (localhost only) | Next.js app, receives `NEXT_PUBLIC_API_URL` as build arg |
| `backup` | `postgres:18-alpine` | none | Runs `deploy/backup/respaldo.sh` as entrypoint, mounts `./backup:/opt/backup:ro` and `./backups:/backups` |
| `tunnel` | `cloudflare/cloudflared:latest` | none | Cloudflare tunnel, requires `TUNNEL_TOKEN` env var |

All published ports bind to `127.0.0.1` so nothing is exposed to the local network or internet; external access goes through Cloudflare Tunnel. The compose file enforces this by design and documents it in comments.

Health checks:
- `db`: `pg_isready`
- `api`: `wget -qO- http://localhost:3000/api/health`
- `frontend`: `wget -qO- http://localhost:3001/login`

`depends_on` uses `condition: service_healthy` for `api`, `backup`, and `tunnel` against `db`.

## CI / Scheduled Jobs

`.github/workflows/respaldo-neon.yml` implements daily backups of the Neon production database:

- Triggered by cron `0 8 * * *` (03:00 Colombia time, UTC-5) and `workflow_dispatch`.
- Runs in a `postgres:18-alpine` container on `ubuntu-latest` with `timeout-minutes: 20`.
- Requires secrets `NEON_BACKUP_URL` and `RESPALDO_CLAVE` (fails early if missing).
- Produces a `pg_dump --format=custom --no-owner --no-privileges`, verifies it with `pg_restore --list`, encrypts with `openssl enc -aes-256-cbc -pbkdf2 -iter 200000`, then uploads the encrypted artifact via `actions/upload-artifact@v4` with `retention-days: 14`.
- Workflow comment states it "only starts when this file reaches main" (GitHub default behavior for scheduled workflows).

## Platform-Specific Deployments

- **Railway** (`railway.json`): declares `builder: DOCKERFILE` pointing at `backend/Dockerfile`, `startCommand: node index.js`, healthcheck path `/api/health`, restart policy `ON_FAILURE` with max 10 retries.
- **Render** (`render.yaml`): web service with `runtime: node`, `rootDir: backend`, `buildCommand: npm install`, `startCommand: npm start`, environment variables synced except `DATABASE_URL` (set manually in Render dashboard).

## Database Initialization

PostgreSQL initialization is handled by files under `backend/db/`:
- `00_init.sh` and `index.js` are the entry points referenced by the compose `db` service.
- Migrations live in `backend/db/migrations/` (numbered `001_base.sql` … `013_indices_ventas.sql`).
- Seed data in `backend/db/seeds/001_datos_desarrollo.sql`.
- Neon-specific migration script in `backend/db/neon/aplicar.sh`.
- The `SIMO_SEED` env var toggles seeding; the `roles/001_rol_aplicacion.sql` creates the least-privilege `simo_app` role.

## Conventions Observed

- Production images always use `node:22-alpine` and run as the non-root `node` user.
- Dependency installation uses `npm ci` (not `npm install`) inside containers to pin versions from `package-lock.json`.
- Development dependencies are omitted in production images via `--omit=dev`.
- Frontend build-time public URLs are injected through Docker `ARG` (`NEXT_PUBLIC_API_URL`) rather than runtime env vars.
- All externally bound ports in docker-compose bind to `127.0.0.1` only.
- Secrets are supplied exclusively via environment variables (`.env` / compose env), never baked into images.
- The backup workflow names artifacts with a timestamp derived from Colombia timezone (`TZ='<-05>5' date +%Y%m%d_%H%M`).
- Health endpoints are required: the API exposes `/api/health` and the compose healthchecks probe it.