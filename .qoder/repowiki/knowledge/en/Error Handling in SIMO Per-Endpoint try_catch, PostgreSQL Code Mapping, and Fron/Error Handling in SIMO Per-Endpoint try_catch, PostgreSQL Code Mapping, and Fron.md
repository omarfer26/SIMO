---
kind: error_handling
name: 'Error Handling in SIMO: Per-Endpoint try/catch, PostgreSQL Code Mapping, and Frontend ErrorAuth Types'
category: error_handling
scope:
    - '**'
source_files:
    - backend/index.js
    - backend/middleware/authMiddleware.js
    - backend/src/controllers/clientes.controller.js
    - backend/src/controllers/inventario.controller.js
    - backend/src/controllers/usuarios.controller.js
    - backend/src/repositories/inventario.repository.js
    - backend/src/repositories/usuarios.repository.js
    - simoapp/lib/apiClient.ts
    - simoapp/lib/auth/authService.ts
    - simoapp/middleware.ts
---

## Overview

SIMO is a monorepo with two error-handling surfaces:

1. **Backend (Express + Node.js)** — Each route/controller wraps its logic in a `try`/`catch`, maps PostgreSQL error codes (`23505` unique violation, `23503` foreign-key violation, custom `SM008`) to HTTP status codes, and returns a uniform `{ error, message }` JSON body.
2. **Frontend (Next.js App Router)** — A single Axios client (`simoapp/lib/apiClient.ts`) centralizes request/response interceptors; an `ErrorAuth` domain type plus a `mensajeDeError` helper translate HTTP responses into user-facing Spanish messages.

There is no global Express error middleware, no centralized error class on the backend, and no `panic`/`recover` equivalent (Node.js does not have those). Errors are handled locally at the boundary where they become meaningful.

## Backend conventions

### Per-endpoint try/catch
Every handler in `backend/index.js` and `backend/src/controllers/*.controller.js` follows the same shape:

```js
async function handler(req, res) {
  try {
    // validation → business logic → DB call
    return res.status(2xx).json({ ... });
  } catch (error) {
    console.error('[PATH] Error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error interno al ...'
    });
  }
}
```

Examples: `backend/index.js` lines 64–70 (healthcheck), 130–151 (POST /api/products), 225–231 (GET /api/products), 320–341 (PUT /api/products/:id), 416–422 (login), 462–468 (logout); `src/controllers/clientes.controller.js` every exported function.

### PostgreSQL code mapping
Database errors are translated by inspecting `error.code`:

| PG code | Meaning | HTTP response |
|---|---|---|
| `23505` | Unique constraint violation (e.g. duplicate SKU, duplicate identity document) | `409 Conflict` with `{ error: "Conflict", message: "..." }` |
| `23503` | Foreign-key constraint violation (referenced row missing) | `400 Bad Request` with a human-readable message |
| `SM008` | Custom application-level error from repositories | `400 Bad Request`, forwarding `error.message` |

The mapping appears in `backend/index.js` (products CRUD, lines 133–145, 323–335), `backend/src/controllers/clientes.controller.js` (lines 115, 243), `backend/src/controllers/inventario.controller.js` (line 241), and `backend/src/controllers/usuarios.controller.js` (lines 75, 246).

### Validation errors vs. server errors
Input validation failures return `400 Bad Request` with a descriptive Spanish message before any DB call. Business-rule violations (e.g. selling price ≤ purchase price) also return `400`. Only unexpected exceptions reach the generic `500 Internal Server Error` branch.

### Auth & RBAC error handling
`backend/middleware/authMiddleware.js` defines two reusable middlewares:

- `verificarToken`: returns `401 Unauthorized` for missing/malformed tokens, `403 Forbidden` for invalid/expired JWTs, `401 Unauthorized` when the token is blacklisted or the user account is inactive, and `500 Internal Server Error` if the blacklist lookup itself fails.
- `verificarRol(...rolesPermitidos)`: returns `401 Unauthorized` if no authenticated user is attached, `403 Forbidden` otherwise.

These middlewares short-circuit with `res.status(...).json({...})` rather than throwing, so controllers never see auth errors.

### Silent catches
A few repository calls swallow errors intentionally:
- `backend/src/repositories/inventario.repository.js` line 57: `await cliente.query('ROLLBACK').catch(() => {});`
- `backend/src/repositories/usuarios.repository.js` lines 167, 225: same pattern.
This suppresses cleanup failures after a transaction has already been aborted.

## Frontend conventions

### Axios client interceptor
`simoapp/lib/apiClient.ts` creates one axios instance with:

- **Request interceptor**: attaches `Authorization: Bearer <token>` read from cookies via `leerToken()`.
- **Response interceptor**: if the response status is `401` or `403` **and** the request is not `/auth/login`, it calls `cerrarSesion()` and redirects to `/login` via `window.location.href = '/login'`. The login endpoint is excluded because a `401` there means "bad credentials" and should surface as a message instead of redirecting.

All other errors are re-thrown (`Promise.reject(error)`), letting individual service functions handle them.

### `ErrorAuth` domain type
`simoapp/lib/auth/authService.ts` defines a typed error model (`ErrorAuth` with fields `tipo: TipoErrorAuth` and `message: string`). The helper `aErrorAuth(error, porEstado)` converts any Axios error into an `ErrorAuth`, mapping HTTP status codes per-operation via a `porEstado` table:

| Status | Login | User creation/edit | List/Edit state |
|---|---|---|---|
| `400` | `datos_invalidos` | `datos_invalidos` | `datos_invalidos` |
| `401` | `credenciales` | `sin_permiso` | `sin_permiso` |
| `403` | `cuenta_inactiva` | `sin_permiso` | `sin_permiso` |
| `404` | — | `no_encontrado` | `no_encontrado` |
| `409` | — | `duplicado` | — |
| no response | `sin_conexion` | `servidor` | `servidor` |

### User-facing messages
`simoapp/lib/auth/authService.ts` exports `mensajeDeError(error: unknown): string`, which switches on `error.tipo` and returns localized Spanish strings such as:

- `credenciales` → "Correo o contraseña incorrectos. Revísalos e inténtalo de nuevo."
- `cuenta_inactiva` → "Tu cuenta está inactiva. Comunícate con el administrador."
- `duplicado` → "Ya existe un usuario con ese correo o nombre de usuario."
- `sin_permiso` → "No tienes permiso para hacer esto. Inicia sesión como Administrador."
- `sin_conexion` → "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo en unos minutos."
- `servidor` → "El servidor tuvo un problema. Inténtalo de nuevo en unos minutos."

### Next.js middleware (route protection)
`simoapp/middleware.ts` performs server-side route guards:
- Redirects logged-in users away from `/login` and `/recuperar-password`.
- Redirects unauthenticated requests to `/login`.
- Blocks non-admin access to `/usuarios`.

It uses `NextResponse.redirect(new URL('/login', request.url))` rather than throwing, so Next.js handles the response directly.

## Architecture summary

```
Frontend component
  └── lib/auth/*Service.ts   (try/catch → aErrorAuth → throw ErrorAuth)
        └── apiClient.ts     (Axios interceptor: 401/403 → logout + redirect)
              └── Express app
                    ├── middleware/authMiddleware.js (verificarToken, verificarRol)
                    └── src/controllers/*.controller.js (per-handler try/catch, PG code mapping)
```

There is no shared error base class on the backend, no global Express error handler, and no centralized error propagation between layers — each layer owns its own translation from low-level failure to HTTP response or typed frontend error.