---
kind: external_dependency
name: Railway — alternative Node.js hosting for the backend
slug: railway
category: external_dependency
category_hints:
    - vendor_identity
scope:
    - '**'
source_files:
    - railway.json
---

### Identity
Railway is a PaaS declared as an alternative deployment target for the Express backend.

### Role in this repo
- `railway.json` configures Railway to build from `backend/Dockerfile`, start with `node index.js`, and use `/api/health` as the healthcheck endpoint with ON_FAILURE restart policy (max 10 retries).

This file is a deploy target definition; no active deployment is evidenced beyond the presence of the config.