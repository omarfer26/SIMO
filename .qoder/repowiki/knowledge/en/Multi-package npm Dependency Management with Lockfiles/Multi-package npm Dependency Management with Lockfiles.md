---
kind: dependency_management
name: Multi-package npm Dependency Management with Lockfiles
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - simoapp/package.json
    - backend/package.json
    - package-lock.json
    - simoapp/package-lock.json
    - backend/package-lock.json
---

## Approach

SIMO is a Node.js monorepo using **npm** as the package manager across three packages: a root orchestrator, `simoapp` (Next.js frontend), and `backend` (Express API). Each package has its own `package.json` and `package-lock.json`, and there is no workspace configuration — dependencies are installed per-package.

## Key Files

- `package.json` (root) — declares only `concurrently` (devDependency) and `axios` (dependency); provides `install:all` (`npm install --prefix backend && npm install --prefix simoapp`) and `dev` scripts that run both servers concurrently via `concurrently`.
- `simoapp/package.json` — Next.js 16.3.5 + React 19.2.8 + TypeScript + Tailwind CSS v4 + Recharts; devDependencies include `eslint-config-next@16.3.5`, `@tailwindcss/postcss@^4`, `typescript@^5`, `@types/react@^19`.
- `backend/package.json` — Express 5.3.0, `pg`, `jsonwebtoken`, `bcrypt`, `helmet`, `express-rate-limit`, `xss-clean`; test stack uses Jest 30.x and Supertest.
- `package-lock.json` (root, `simoapp/`, `backend/`) — lockfiles for each package pin exact transitive versions.
- `.gitignore` — ignores `node_modules/` at all levels.
- No `.npmrc`, no private registry config, no vendored third-party code.

## Architecture & Conventions

- **Per-package manifests**: The repo does not use npm workspaces or a single top-level manifest. Each subproject owns its own dependencies, scripts, and lockfile.
- **Version ranges vs pinned**: Runtime dependencies in `simoapp` and `backend` use caret ranges (`^`) for most packages, while `next` and `react` are pinned to exact patch versions (`16.3.5`, `19.2.8`). The root `package.json` pins `axios@^1.20.0` and `concurrently@^8.2.2`.
- **Dev vs runtime separation**: Both `simoapp` and `backend` separate build/test tooling into `devDependencies` (eslint, typescript, jest, nodemon, supertest, tailwind, etc.) from runtime dependencies.
- **No vendoring / no private registry**: All packages resolve from the public `https://registry.npmjs.org/` (confirmed by entries in `backend/package-lock.json`). There is no `.npmrc`, no `GOPRIVATE`, no private registry URL, and no vendored third-party source.
- **CI integration**: GitHub Actions workflow `deploy/respaldor-neon.yml` deploys to Railway/Neon but does not contain dependency update automation (no Dependabot, Renovate, or similar).

## Constraints Observed

- Dependencies are declared exclusively in `package.json` files under each package directory; there is no alternative manifest format.
- Transitive dependency versions are locked via `package-lock.json` per package — the lockfiles are committed alongside manifests.
- The root `install:all` script is the documented entry point for installing dependencies across the monorepo; individual packages can also be installed independently via `npm install` inside their directories.
- No enforcement of version alignment between packages (e.g., `axios` appears in both root and `simoapp` with the same range, but this is coincidental rather than centralized).
- No automated update tooling (Dependabot/Renovate) is configured in `.github/`.