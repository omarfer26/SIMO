---
kind: configuration_system
name: Environment-Based Configuration System (dotenv + process.env)
category: configuration_system
scope:
    - '**'
source_files:
    - backend/src/config/db.js
    - backend/src/config/jwt.js
    - backend/index.js
    - backend/.env
    - deploy/.env.example
    - simoapp/.env.local
    - simoapp/next.config.ts
    - simoapp/middleware.ts
---

## Overview

SIMO uses a straightforward environment-variable configuration system with no dedicated config library. Both the Next.js frontend and the Express backend read runtime settings directly from `process.env`, loaded by Node/Next from `.env*` files. There is no schema validation, no typed config object, and no centralized loader — each module reads only the variables it needs.

## Key Files and Packages

- **Backend config modules**
  - `backend/src/config/db.js` — PostgreSQL connection pool; exports a single shared `Pool` instance.
  - `backend/src/config/jwt.js` — JWT signing secret and expiration; exported as `{ SECRETO, EXPIRACION }`.
- **Backend entrypoint** — `backend/index.js` reads `PORT`, `RATE_LIMIT_MAX`, imports `./db` (pool) and `./src/config/jwt`.
- **Backend env file** — `backend/.env` (local dev: Neon `DATABASE_URL`, `PORT=3001`).
- **Deployment env template** — `deploy/.env.example` documents every variable consumed by Docker Compose, backups, Cloudflare tunnel, and the frontend.
- **Frontend env file** — `simoapp/.env.local` sets `NEXT_PUBLIC_API_URL=http://localhost:3001/api`.
- **Frontend Next config** — `simoapp/next.config.ts` is intentionally empty (`const nextConfig = {}`).
- **Frontend auth middleware** — `simoapp/middleware.ts` performs client-side route protection using cookies (`token`, `role`) set by the backend login response.

## Architecture and Conventions

### Two-mode database configuration

`backend/src/config/db.js` implements an explicit two-mode selection:

1. If `DATABASE_URL` is defined → use it as-is with SSL enabled (defaulting to `rejectUnauthorized: false` for Neon).
2. Otherwise → build a `pg.Pool` from `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, with SSL disabled by default.

SSL behavior is controlled by `DB_SSL`: `'true'` forces SSL, `'false'` disables it, otherwise it follows the mode default. The comment in the file explicitly documents both modes.

### JWT configuration centralization

`backend/src/config/jwt.js` was introduced to fix a previous problem where login and the auth middleware each read `JWT_SECRET` independently and could disagree. It now exports a single `{ SECRETO, EXPIRACION }` object used by both the `/api/auth/login` endpoint (signing) and the auth middleware (verification). A development fallback secret `Simo2026_Secreto_Super_Seguro!` is used when `JWT_SECRET` is absent, with a warning logged when running in production without `JWT_SECRET`.

### Environment variable conventions

| Variable | Consumer | Default / Behavior |
|---|---|---|
| `DATABASE_URL` | `backend/src/config/db.js` | Neon-style connection string; takes precedence over per-field vars |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `backend/src/config/db.js` | Fallback when `DATABASE_URL` is unset |
| `DB_SSL` | `backend/src/config/db.js` | `'true'` / `'false'` toggles SSL |
| `JWT_SECRET` | `backend/src/config/jwt.js` | Falls back to hardcoded dev secret |
| `JWT_EXPIRES_IN` | `backend/src/config/jwt.js` | Defaults to `'30m'` (documented as RNF-05) |
| `PORT` | `backend/index.js` | Defaults to `3001` |
| `RATE_LIMIT_MAX` | `backend/index.js` | Rate-limit max requests; defaults to `100` |
| `NEXT_PUBLIC_API_URL` | Frontend via `simoapp/.env.local` | Base URL for API calls |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `deploy/docker-compose.yml` | Local PostgreSQL container |
| `SIMO_APP_PASSWORD` | `deploy/docker-compose.yml` | Dedicated app role password |
| `SIMO_SEED` | Deployment scripts | Controls whether seed data runs |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare tunnel container |
| `BACKUP_DATABASE_URL`, `BACKUP_HOUR`, `BACKUP_RETENTION_DAYS` | Backup scripts |

### File-level organization

- Backend secrets live in `backend/.env` (not committed; listed in `.gitignore`).
- Deployment secrets are documented in `deploy/.env.example` with comments explaining each variable's purpose and security implications (e.g., "Copiar a deploy/.env y completar", "deploy/.env NUNCA se sube a GitHub").
- Frontend public-only variables go in `simoapp/.env.local` under the `NEXT_PUBLIC_` prefix so Next.js exposes them at build time.
- No `.env.production`, `.env.development`, or other environment-specific files exist in the repo.

### Runtime vs Build-time separation

The frontend uses Next.js's `NEXT_PUBLIC_*` convention to expose `NEXT_PUBLIC_API_URL` to the browser bundle. The backend has no equivalent split — all variables are read at process start via `process.env`. There is no typed configuration layer between `process.env` and consumers.

## Conventions and Constraints

- **No config library**: The codebase does not import `dotenv`, `config`, `conf`, or any schema validator. All values come straight from `process.env`.
- **Two-mode DB connection is enforced by code**: `backend/src/config/db.js` checks `process.env.DATABASE_URL` first; if present, the per-field variables are ignored. This is a hard runtime branch, not a suggestion.
- **JWT secret must be overridden in production**: `backend/src/config/jwt.js` logs a warning when `JWT_SECRET` is missing while `NODE_ENV === 'production'`; the hardcoded fallback is used otherwise.
- **JWT session expiry is fixed at 30 minutes unless overridden**: `backend/src/config/jwt.js` sets `EXPIRACION` to `process.env.JWT_EXPIRES_IN || '30m'`, annotated with `// RNF-05: la sesión expira a los 30 minutos`.
- **Rate limit is configurable but capped at a default of 100**: `backend/index.js` parses `RATE_LIMIT_MAX` as a number and falls back to `100`.
- **Port defaults to 3001**: `backend/index.js` uses `process.env.PORT || 3001`.
- **`.env` files are excluded from version control**: `deploy/.env.example` states "deploy/.env NUNCA se sube a GitHub (está en .gitignore)"; the root `.gitignore` excludes `*.env*` patterns.
- **Frontend route protection is cookie-based**: `simoapp/middleware.ts` reads `token` and `role` cookies from the request and redirects unauthenticated users to `/login`, and non-admin users away from `/usuarios`.
- **Next.js config is intentionally empty**: `simoapp/next.config.ts` declares `nextConfig = {}` with no overrides, meaning all Next.js behavior relies on defaults plus env-driven values.