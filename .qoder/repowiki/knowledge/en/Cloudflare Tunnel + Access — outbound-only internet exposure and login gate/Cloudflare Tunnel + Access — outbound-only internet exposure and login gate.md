---
kind: external_dependency
name: Cloudflare Tunnel + Access — outbound-only internet exposure and login gate
slug: cloudflare-tunnel
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
source_files:
    - deploy/README.md
---

### Identity
Cloudflare provides two services here: the outbound tunnel (`cloudflared`) that publishes internal containers without opening router ports, and Zero Trust Access that gates access by email + one-time PIN.

### Role in this repo
- All inbound traffic enters through `alejandrostore.com` subdomains (`app.`, `api.`, `db.`) routed via a single Cloudflare Tunnel running inside the `tunnel` container.
- The database hostname `db.alejandrostore.com` is published as TCP and protected by Access (email allow-list + OTP). The API hostname is intentionally unpublished until SCRUM-16/SCRUM-18 are complete.
- The frontend is also behind Access while its own login still accepts any token cookie.

### Durable integration notes
- The tunnel token comes from the Cloudflare Zero Trust dashboard and is injected via the `CLOUDFLARE_TUNNEL_TOKEN` environment variable.
- Access policies are configured in the Cloudflare One dashboard, not in code.

Verify policy configuration in the Zero Trust dashboard whenever team membership changes.