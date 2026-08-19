# selfhost/ — self-hosted Supabase backend

Replaces the hosted Supabase project (free-tier pause problem). Runs the same
services in Docker on `lawrence` (the always-on Mac), trimmed from the upstream
reference compose (`supabase/supabase` docker directory, fetched 2026-07-28).
The frontend keeps `@supabase/supabase-js` unchanged; only `VITE_SUPABASE_URL`
and `VITE_SUPABASE_ANON_KEY` differ.

> **STATUS 2026-08-19: stack host MOVED to `huey`** (Linux server on the
> tailnet). The same compose stack + `.env` run from the repo checkout at
> `/home/tristan/Documents/Github/topologic-go` on huey; docker is
> systemd-enabled and every container restarts `unless-stopped`, so unattended
> reboots are covered without LaunchDaemons. cloudflared moved with it (same
> tunnel + hostname, zero DNS changes). lawrence's containers are stopped and
> stale. Deploying engine/function changes = `git pull` on huey +
> `docker compose restart functions`. References to lawrence below are
> historical; the procedures themselves are unchanged.
>
> **STATUS 2026-07-31: Cloudflare Tunnel cutover COMPLETE + verified.** The
> registrar nameservers were moved to the cloudflare pair, the CF zone is
> `active`, Universal SSL issued, and the public path works end-to-end:
> `https://games-api.kh3dron.net/auth/v1/health` → 200 (valid TLS), REST reads
> 200, Studio 404'd at the edge, `games.kh3dron.net` frontend intact. The old
> Caddy front is stopped. The GitHub Pages deploy was also unblocked (it had
> been gated on a transiently-failing semantic-release step, so the live bundle
> predated `VITE_SUPABASE_URL=games-api`; `static.yml` now has `if: always()` on
> build-and-deploy and the frontend is redeployed pointing at the tunnel).
> Residual: delete the old hosted project `sejoivuxqifdokdqigwh.supabase.co`.
>
> The Caddy + router-port-forward front (sections 1.0/4.0) is retired: Xfinity
> refuses inbound 443, so no port-forward path works. cloudflared makes an
> outbound tunnel to Cloudflare's edge — no open ports, no ACME, IP-independent.
> The public hostname `games-api.kh3dron.net` is unchanged, so frontend env and
> the backend `API_EXTERNAL_URL`/`SITE_URL` are unchanged.

## 1.0 Topology

```
 games.kh3dron.net            games-api.kh3dron.net             lawrence (this Mac)
┌──────────────────┐  HTTPS  ┌───────────────────────┐        ┌───────────────────────────┐
│ topologic-go SPA │ ──────► │ Caddy :443 (brew)     │ ─────► │ colima VM / docker        │
│ GitHub Pages     │  WSS    │  TLS via Let's Encrypt│  :8000 │  kong ── auth (GoTrue)    │
└──────────────────┘         │  /auth|rest|realtime| │        │       ├─ rest (PostgREST) │
                             │  /functions only      │        │       ├─ realtime         │
                             └───────────────────────┘        │       ├─ functions (Deno) │
                                                              │       ├─ studio+meta      │
                             router forwards 443 (+80) ──►    │       └─ db (Postgres 17) │
                                                              └───────────────────────────┘
```

| Component | Where | Version |
|---|---|---|
| Postgres | container `supabase-db` | supabase/postgres:17.6.1.136 |
| Auth | container `supabase-auth` | supabase/gotrue:v2.189.0 |
| REST | container `supabase-rest` | postgrest/postgrest:v14.12 |
| Realtime | container `realtime-dev.supabase-realtime` | supabase/realtime:v2.102.3 |
| Edge Functions | container `supabase-edge-functions` | supabase/edge-runtime:v1.74.0 |
| Gateway | container `supabase-kong`, 127.0.0.1:8000 | kong/kong:3.9.1 |
| Dashboard | container `supabase-studio` via kong `/`, basic auth | supabase/studio 2026.07.07 |
| VM | colima (lima), 3 CPU / 4 GiB / 40 GiB | colima 0.10.3 |
| TLS proxy | Caddy (brew service, host) | v2.11.4 |

Dropped vs upstream: storage + imgproxy (unused), supavisor pooler (db port is
127.0.0.1:55432 direct), analytics/vector (Studio log pages disabled).

## 2.0 Bootstrap (already performed, repeat only on a new machine)

```sh
brew install colima docker docker-compose caddy
ln -sfn /opt/homebrew/opt/docker-compose/bin/docker-compose ~/.docker/cli-plugins/docker-compose
colima start --cpu 3 --memory 4 --disk 40
brew services start colima          # start VM at login; containers auto-restart
node scripts/generate-secrets.mjs   # writes .env (NEVER commit)
docker compose up -d
./scripts/apply-migrations.sh       # applies ../supabase/migrations/*.sql
cp Caddyfile /opt/homebrew/etc/Caddyfile
brew services start caddy
```

## 3.0 Operations

| Action | Command |
|---|---|
| Status | `docker compose ps` (from this dir) |
| Logs | `docker compose logs -f functions` (or auth/rest/realtime/kong/db) |
| Stop / start | `docker compose down` / `docker compose up -d` (data persists) |
| psql | `docker exec -it supabase-db psql -U postgres` or host port 127.0.0.1:55432 |
| Studio dashboard | http://127.0.0.1:8000 — basic auth, creds in `.env` (`DASHBOARD_*`) |
| New migration | add `../supabase/migrations/<ts>_<name>.sql`, run `./scripts/apply-migrations.sh` |
| Edge function changes | files are bind-mounted; `docker compose restart functions` reloads |
| Full reset | `docker compose down -v && rm -rf volumes/db/data`, then bootstrap steps 5-7 |

NOTE: edge functions bundle per-request workers from the bind-mounted repo
(`../supabase/functions` at `/home/deno/functions`, `../src` at `/home/src`),
so the `../../../src/engine` imports resolve to the same shared engine the
browser runs. `supabase/functions/main/` is the self-host router — it is not
deployed anywhere else.

## 4.0 Security model

- Kong binds 127.0.0.1 only. Caddy is the sole public entry and forwards only
  `/auth/v1`, `/rest/v1`, `/realtime/v1`, `/functions/v1` — Studio and the
  pg-meta route are unreachable from the internet.
- `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` are generated per-install
  (`scripts/generate-secrets.mjs`). The Supabase CLI dev stack was rejected for
  exposure because its JWT secret is a publicly known constant.
- RLS + Edge Functions remain the security boundary, unchanged from the hosted
  design (`../DEPLOYMENT.md`). The anon key is public by design.
- SMTP is unconfigured: signups auto-confirm (`ENABLE_EMAIL_AUTOCONFIRM=true`),
  magic links fail until `SMTP_*` in `.env` are filled with a real provider and
  `docker compose up -d` re-applies env.

## 5.0 Data migration from the hosted project

`./scripts/import-from-hosted.sh` — needs `SOURCE_DB_URL` (dashboard → Connect
→ Session pooler string; restore the project first if paused). Copies
`auth.users` + `auth.identities` (password hashes intact — players keep their
logins) and profiles/games/moves/friendships/snake_scores. Sessions do not
migrate; everyone signs in again.

## 6.0 Known limits

- Availability = this Mac + home connection. `brew services` are LaunchAgents:
  they start at login, not boot — keep auto-login on (or migrate to
  `sudo brew services` LaunchDaemons) for unattended reboots.
- Home IP changes break `games-api.kh3dron.net` until the Route 53 A record is
  updated (see repo TODO).
- Realtime tenant is the upstream default (`realtime-dev`), keyed off the
  container name — do not rename that container.

## 7.0 Cloudflare Tunnel (public ingress)

Outbound tunnel from lawrence to Cloudflare's edge. Cloudflare terminates public
TLS for `games-api.kh3dron.net` and forwards down the tunnel to `kong:8000`.
No inbound ports (Xfinity refuses inbound 443), no ACME, survives home-IP changes.

```
 games.kh3dron.net        Cloudflare edge            lawrence / colima / docker
┌──────────────────┐ HTTPS ┌──────────────┐  tunnel  ┌───────────────────────────┐
│ topologic-go SPA │ ────► │ TLS + routing│ ◄──────── │ cloudflared (outbound)    │
│ GitHub Pages     │  WSS  │ games-api.*  │           │   └─ kong:8000 ── stack   │
└──────────────────┘       └──────────────┘           └───────────────────────────┘
```

Ingress allow-list lives in `cloudflared/config.yml`: only `/auth`, `/rest`,
`/realtime`, `/functions` `/v1/*` reach kong; everything else (Studio at kong's
`/`) is 404'd at the edge — same exposure the old Caddyfile enforced.

### 7.1 One-time setup

USER steps (need a Cloudflare login + AWS registrar access):

1. Cloudflare dashboard → add site `kh3dron.net` (Free plan). It scans existing
   records; verify `games.kh3dron.net` (GitHub Pages) and any MX/email survived.
2. At the AWS registrar, change the **registered-domain nameservers** —
   Route 53 → **Registered domains** → kh3dron.net → **Edit name servers** —
   to exactly `andy.ns.cloudflare.com` + `wanda.ns.cloudflare.com` (remove the
   four `awsdns` entries). This pushes the delegation to the `.net` registry.
   TRAP: editing the `NS` *record inside the Route 53 hosted zone* does nothing —
   the parent `.net` delegation is what resolvers follow, and it is set only on
   the Registered-domains screen. Verify with
   `dig @a.gtld-servers.net kh3dron.net NS` (must return the cloudflare pair, not
   awsdns). Then wait until Cloudflare shows the zone **Active** (minutes–hours);
   Universal SSL for `*.kh3dron.net` issues on activation — until then the edge
   has no cert for `games-api` and TLS handshakes fail. No DNSSEC is configured
   (0 DS at parent), so no DS-removal pre-step is needed.
   PARITY: before switching, the Cloudflare zone must already hold every record
   the live Route 53 zone serves, or those hostnames go NXDOMAIN at cutover. As
   of 2026-07-31 the zone holds apex A/AAAA + `www` + `games` (all → GitHub Pages,
   proxied) and `games-api` → tunnel; Route 53 has no MX/TXT/email records.
   Set SSL/TLS mode to **Full** (dashboard → SSL/TLS) so the proxied GitHub Pages
   hostnames don't redirect-loop.
3. On lawrence: `cloudflared tunnel login` (opens a browser; pick the
   `kh3dron.net` zone). Writes `~/.cloudflared/cert.pem`.

OPERATOR steps (repo-side, after login):

4. `cloudflared tunnel create topologic-go` → prints a UUID and writes
   `~/.cloudflared/<UUID>.json`.
5. Put `<UUID>` in `cloudflared/config.yml` (`tunnel:` field) and copy the creds:
   `cp ~/.cloudflared/<UUID>.json cloudflared/creds.json` (gitignored).
6. `cloudflared tunnel route dns topologic-go games-api.kh3dron.net` — creates
   the proxied CNAME in the Cloudflare zone.
7. `docker compose up -d cloudflared`, then verify from off-LAN:
   `curl -H "apikey: <ANON_KEY>" https://games-api.kh3dron.net/auth/v1/health`.
8. Retire the old front: `brew services stop caddy` (no longer used).

### 7.2 Operations

| Action | Command |
|---|---|
| Tunnel status | `docker compose logs -f cloudflared` (or CF dashboard → Networks → Tunnels) |
| Restart | `docker compose restart cloudflared` |
| Edit ingress | change `cloudflared/config.yml`, then `docker compose restart cloudflared` |
| Rotate creds | re-run `tunnel create`/`route dns`, replace `cloudflared/creds.json` |
