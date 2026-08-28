# KATI LAWYER — Pravo relay

Purpose: provide a narrow server-to-server transport from KATI LAWYER to the documented Pravo metadata endpoints when direct data-center access to `publication.pravo.gov.ru` is unavailable.

This service is **not** a VPN and **not** an open proxy.

## Security contract

The shared handler:

- accepts only `GET`;
- requires `Authorization: Bearer <KATI_RELAY_TOKEN>`;
- allows only `/api/Documents` and `/api/Document`;
- always targets the fixed upstream `https://publication.pravo.gov.ru`;
- rejects arbitrary paths before any upstream request;
- stores no content and performs no database writes.

No `SUPABASE_SERVICE_ROLE_KEY`, database password, Postgres URL or browser credential belongs on this relay.

## Runtime options

`worker.ts` remains the worker-style adapter.

`server.ts` is the RU VPS adapter. It binds only to:

```text
127.0.0.1:8787
```

and should be exposed externally only through nginx/TLS.

Required environment variable:

```text
KATI_RELAY_TOKEN=<random high-entropy secret>
```

## VPS layout

Recommended:

```text
/opt/kati-lawyer/pravo-relay/
  handler.ts
  server.ts

/etc/kati-lawyer/pravo-relay.env
/etc/systemd/system/kati-pravo-relay.service
/etc/nginx/sites-available/pravo-relay.conf
```

The environment file must be readable only by the service/root account and must never be committed.

Example:

```text
KATI_RELAY_TOKEN=<secret>
```

## Deno service

Install a pinned/current supported Deno release on the VPS, copy `handler.ts` and `server.ts`, then install the supplied systemd unit example.

The unit intentionally grants network access only to:

```text
127.0.0.1:8787
publication.pravo.gov.ru:443
```

Enable only after local validation:

```text
systemctl daemon-reload
systemctl enable --now kati-pravo-relay
```

## nginx

Copy `deploy/nginx-pravo-relay.conf.example`, replace `pravo-relay.example.com` with the chosen test hostname, validate with `nginx -t`, and provision TLS using the host's standard Let's Encrypt process.

The nginx example exposes only the two exact paths. Everything else returns `404`.

## Pre-Preview checks from the RU VPS

Run these on the VPS before configuring Supabase Preview:

```text
1. VPS -> publication.pravo.gov.ru TCP/TLS/HTTP works.
2. Relay without Authorization -> 401.
3. Relay with wrong token -> 401.
4. POST /api/Documents -> 405.
5. GET /proxy?url=... -> 404.
6. GET /api/AnythingElse -> 404.
7. Authenticated GET /api/Documents?... -> upstream response.
8. Authenticated GET /api/Document?eoNumber=... -> upstream response.
```

Do not continue if the VPS itself cannot reach Pravo.

## Supabase Preview only

After the relay passes the checks above, configure only the approved Preview project with:

```text
PRAVO_API_BASE_URL=https://pravo-relay.<test-domain>/api
PRAVO_RELAY_TOKEN=<same secret as KATI_RELAY_TOKEN>
OFFICIAL_LEGAL_SOURCES_ENABLED=true
```

The Analyzer already reads `PRAVO_API_BASE_URL` and sends `PRAVO_RELAY_TOKEN` as a bearer token when relay mode is active.

Do not place `KATI_RELAY_TOKEN` in frontend/browser environment variables.

## Expected Preview verification

For the existing NK_RF article 54.1 probe, transport success alone is not substantive verification. Expected safe progression:

```text
mode = relay
relay_base_configured = true
relay_token_configured = true
Pravo metadata request succeeds
```

Until a documented official-content observation exists:

```text
content_verified = false
substantive_use_allowed = false
```

That fail-closed boundary must remain.

## Rollback

Preview rollback:

- remove/restore `PRAVO_API_BASE_URL`, `PRAVO_RELAY_TOKEN`, and `OFFICIAL_LEGAL_SOURCES_ENABLED` in Preview;
- Analyzer falls back to its prior configuration;
- no Law7 corpus data is changed by the relay.

VPS rollback:

```text
systemctl disable --now kati-pravo-relay
```

Then remove the nginx site from the active configuration. Do not change Production or Lovable as part of this procedure.
