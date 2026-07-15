# Online play

Server-authoritative multiplayer on Supabase. Full design rationale in `../DEPLOYMENT.md`; provisioning in `../supabase/README.md`.

## Shape

- One engine, run in two places: the browser (optimistic UI) and Deno Edge Functions (the arbiter). Functions import `src/engine` directly so rules cannot drift
- Clients never write game tables; all writes go through Edge Functions, reads via RLS-guarded selects + Realtime subscriptions
- Offline play never touches any of this: `net/online.ts` is lazy-imported by `play.ts` only when `?online=<id>` is present, so the Supabase SDK stays out of the offline bundle

## Client modules (`src/net/`)

- `client.ts` — typed Supabase client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; both optional (`hasSupabase` false = offline-only build keeps working)
- `auth.ts` — passwordless magic-link sign-in, session helpers, `profiles` lookup (username, rating)
- `games.ts` — Edge Function invokers (`create-game`, `join-game`, `submit-move` with `expected_ply` optimistic-concurrency check), `fetchGame`, `listOpenGames`, `subscribeGame` (Realtime)
- `online.ts` — `enterOnlineGame(id)`: loads authoritative state into the game wrapper via the view's `loadState`, gates input to the seated color (`setOnline`), submits moves optimistically, reconciles on Realtime updates, renders the `#online-banner`

## Flow

```
game.html (lobby)                          play.html?online=<id>
  sign in (magic link)                       enterOnlineGame(id)
  create-game / join-game  ──redirect──►     fetchGame + subscribe
                                             local move -> applyMove locally
                                             -> submit-move(expected_ply)
                                             server validates with same engine
                                             Realtime update -> reconcile
```

## Backend (`supabase/`)

- `migrations/` — schema (game-agnostic tables, RLS, signup trigger, realtime publication); applied in filename order
- `functions/` — `create-game`, `join-game`, `submit-move`, `_shared`; the only privileged writers
- Personal-account project; do NOT provision under a company Supabase org
- `scripts/smoke-online.mjs` — full handshake against the live project: two throwaway users, legal/illegal/out-of-turn/stale moves, cleanup. Needs `SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`

## Gotchas

- `soloOnly` games (snake) never route to the lobby; `routes.ts` keeps their links on `play.html` even in challenge mode
- Turn color is read from `board_state.turn` on the game row; state is the engine's `serialize()` output
- Spectators get `lockColor = null` (view is read-only); pass button shows only for a seated Go player
