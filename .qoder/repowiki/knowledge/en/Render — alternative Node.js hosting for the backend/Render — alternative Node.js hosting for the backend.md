---
kind: external_dependency
name: Render — alternative Node.js hosting for the backend
slug: render
category: external_dependency
category_hints:
    - vendor_identity
scope:
    - '**'
source_files:
    - render.yaml
---

### Identity
Render is another PaaS declared as an alternative deployment target for the Express backend.

### Role in this repo
- `render.yaml` defines a web service named `simo-backend` running from `backend/`, building with `npm install` and starting with `npm start`.
- `DATABASE_URL` is marked `sync: false`, meaning it must be set manually in the Render dashboard rather than synced from the repo.

This file is a deploy target definition; no active deployment is evidenced beyond the presence of the config.