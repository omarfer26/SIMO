---
kind: external_dependency
name: Neon — Serverless PostgreSQL (host of the production database)
slug: neon
category: external_dependency
category_hints:
    - vendor_identity
    - client_constraint
scope:
    - '**'
source_files:
    - .github/workflows/respaldo-neon.yml
    - backend/db/neon/aplicar.sh
    - deploy/README.md
---

### Identity
Neon is the hosted PostgreSQL provider holding the production database (`neondb`, project *retail*). The local Docker stack runs a separate PostgreSQL instance; the two are distinct.

### Role in this repo
- Production data lives on Neon; the Mac-only deployment described in `deploy/README.md` is an operational mirror.
- Backups are taken from Neon via GitHub Actions (`respaldo-neon.yml`) using `pg_dump` against a direct connection string stored in the `NEON_BACKUP_URL` repository secret.
- Schema migrations are applied through `backend/db/neon/aplicar.sh` with the Neon owner role; afterwards `backend/db/roles/001_rol_aplicacion.sql` must be re-run to grant the `simo_app` role permissions on new objects.

### Durable integration notes
- The runtime `DATABASE_URL` points at Neon's pooler host (`-pooler`) with `sslmode=require`; the backup URL is the **direct** connection string without `-pooler`. Do not swap them.
- Neon retains its own point-in-time history per branch; restoring directly onto the main branch requires explicit flags (`SIMO_REEMPLAZAR=si`, `SIMO_CONFIRMAR_NEON=si`).
- The `simo_app` role has minimal privileges: it cannot alter the Kardex or auditoría tables.

Verify exact migration/backup commands against the current Neon docs before changing the scripts.