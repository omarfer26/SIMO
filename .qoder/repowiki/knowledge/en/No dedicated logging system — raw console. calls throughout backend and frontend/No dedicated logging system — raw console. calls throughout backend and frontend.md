---
kind: logging_system
name: No dedicated logging system — raw console.* calls throughout backend and frontend
category: logging_system
scope:
    - '**'
source_files:
    - backend/package.json
    - backend/src/config/jwt.js
    - backend/db/index.js
    - backend/src/controllers/clientes.controller.js
    - backend/src/controllers/usuarios.controller.js
    - backend/middleware/authMiddleware.js
    - backend/routes/ventasRoutes.js
    - simoapp/components/catalogo/ProductosContext.tsx
    - simoapp/app/(protected)/ventas/page.tsx
---

## What system/approach is used

The SIMO repository does **not** use a logging framework or library. There is no Winston, Pino, Bunyan, Morgan, debug, or any other logger dependency in either `backend/package.json` or `simoapp/package.json`. All log output goes through the platform's built-in `console.*` methods (`console.log`, `console.error`, `console.warn`).

- Backend (Express/Node): every controller, route, middleware, and config file uses bare `console.log` / `console.error` / `console.warn`.
- Frontend (Next.js/React): components and services similarly use `console.error` for error paths; `console.log` appears only in comments explaining why it was removed from production-visible code.

There is no central logger module, no log-level configuration, no structured-log fields, and no sink/routing layer. Log output is unstructured text written directly to stdout/stderr.

## Key files and packages

- `backend/package.json` — no logging dependencies declared.
- `backend/src/config/jwt.js` — uses `console.warn` to signal missing `JWT_SECRET`.
- `backend/db/index.js` — uses `console.log` on successful PostgreSQL connection and `console.error` on pool errors.
- `backend/src/controllers/*.controller.js` — each controller wraps DB calls in try/catch and emits `console.error('[METHOD /api/... ] Error:', error)`.
- `backend/middleware/authMiddleware.js` — logs JWT verification failures via `console.error`.
- `backend/routes/*.js` — legacy routes at repo root also emit `console.error` around DB operations.
- `simoapp/components/catalogo/ProductosContext.tsx` — uses `console.error` when catalog fetches fail.
- `simoapp/app/(protected)/ventas/page.tsx` — uses `console.error` for POS-related failures.
- `simoapp/lib/pedidos/pedidosService.ts` and `lib/ventas/anulacionService.ts` — use `console.error` for local-storage write failures.

## Architecture and conventions

Observed patterns (descriptive, not enforced by tooling):

1. **Error-only logging**: The overwhelming majority of `console.*` calls are `console.error`; informational `console.log` is limited to startup/connection messages (e.g., "Servidor de inventario corriendo en…", "Conexión exitosa a PostgreSQL").
2. **Route-scoped prefixes**: Controller errors include an HTTP verb + path prefix inside the message string, e.g. `[POST /api/customers] Error:` or `[GET /api/users/:id] Error:`, so a human scanning stderr can identify the originating endpoint.
3. **No log levels**: There is no runtime level filter; everything emitted reaches the process's default stdout/stderr.
4. **No structured fields**: Messages are plain strings with concatenated context; no JSON objects, no correlation IDs, no request IDs.
5. **No transport abstraction**: There is no wrapper function, no logger singleton, and no way to redirect output to a file, syslog, or external service without editing call sites.
6. **Frontend comment convention**: Two files contain comments explicitly noting that `console.log` was intentionally avoided because it would appear in the browser console during development (see `simoapp/app/(protected)/formuProductos/page.tsx` and `simoapp/components/catalogo/ProductosContext.tsx`).

## Conventions and constraints

- **Convention observed**: Errors are logged with `console.error` and prefixed with the HTTP method and route pattern to aid manual debugging.
- **Constraint enforced by absence**: No logging library is installed, so there is no programmatic way to change verbosity, format, or destination — developers must edit source code to alter log behavior.
- **No documented logging policy**: There is no README, style guide, or ADR describing how to log; the only guidance visible is inline comments discouraging `console.log` in user-facing pages.

In short, the logging system is effectively "use `console.*` directly" — a minimal, ad-hoc approach with no framework, no configuration, and no cross-cutting infrastructure.