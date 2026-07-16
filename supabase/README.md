# supabase/

Backend for online play (see `../DEPLOYMENT.md` for the full design). This is a
personal-account project — do NOT provision it in any company Supabase org.

## Layout

- `migrations/` — SQL migrations, applied in filename order. `20260713120000_init.sql`
  is the initial schema (game-agnostic tables, RLS, signup trigger, realtime).
- `functions/` — Edge Functions (Deno): `create-game`, `join-game`, `submit-move`,
  `cancel-game`, `submit-snake-score`, plus `_shared/`. They import the pure engine
  from `../../src/engine`.

## Applying to your personal project

One-time, in your own Supabase account:

1. Create a project in the Supabase dashboard (pick region + a DB password), or:
   `npx supabase projects create topologic-go --org-id <your-personal-org>`
2. Authenticate the CLI and link this repo to it:
   ```
   npx supabase login
   npx supabase init            # only if supabase/config.toml does not exist yet
   npx supabase link --project-ref <your-project-ref>
   ```
3. Apply migrations:
   ```
   npx supabase db push
   ```

4. Auth URL config (dashboard: Authentication → URL Configuration, or
   `PATCH /v1/projects/<ref>/config/auth` on the management API). Without this,
   confirmation/magic-link emails redirect to the default `http://localhost:3000`:
   - Site URL: `https://games.kh3dron.net`
   - Redirect allow-list: `https://games.kh3dron.net/**`, `http://localhost:5173/**`,
     `http://localhost:4173/**`

Frontend env (never commit real values):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon/publishable key>
```

The anon key is public by design; RLS + the Edge Functions are the security
boundary, not the key.
