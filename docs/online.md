# Online play

Server-authoritative multiplayer on Supabase. Full design rationale in `../DEPLOYMENT.md`; provisioning in `../supabase/README.md`.

## Shape

- One engine, run in two places: the browser (optimistic UI) and Deno Edge Functions (the arbiter). Functions import `src/engine` directly so rules cannot drift
- Clients never write game tables; all game writes go through Edge Functions, reads via RLS-guarded selects + Realtime subscriptions
- Friendships are the one client-written table (RLS-guarded): a friend edge carries no game state, so there is nothing for the server to arbitrate
- Offline play never touches any of this: `net/online.ts` is lazy-imported by `play.ts` only when `?online=<id>` is present, so the Supabase SDK stays out of the offline bundle

## Accounts

- Register with email + password + chosen username (`auth-ui.ts` panel, shared by the lobby and the hub). The username rides in signup metadata; the `handle_new_user` trigger writes the profile and dodges collisions with a random suffix rather than aborting signup
- Password sign-in plus a magic-link fallback; confirmation emails redirect back to the page that started the flow
- Usernames: 3-24 chars `[A-Za-z0-9_]`, case-insensitively unique (DB check + `lower(username)` unique index); rename from the hub (owner-only RLS update)

## Client modules (`src/net/`)

- `client.ts` — typed Supabase client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; both optional (`hasSupabase` false = offline-only build keeps working)
- `auth.ts` — password sign-up/sign-in, magic link, session helpers, `profiles` lookup, `updateUsername`
- `auth-ui.ts` — the shared signed-out panel (tabs: sign in / create account)
- `ui.ts` — shared DOM helpers: the `el()` factory plus `section()`, the bordered titled boxes the hub and lobby organize their content into
- `games.ts` — Edge Function invokers (`create-game` with optional opponent, `join-game`, `cancel-game`, `submit-move` with `expected_ply`), `fetchGame`, `listOpenGames` (excludes challenges), `listMyGames`, `subscribeGame` (Realtime)
- `social.ts` — friendships CRUD (request by username, accept, remove), profile lookups, `subscribeSocial` (one channel over my friendships + my games, used by the hub to live-refresh)
- `online.ts` — `enterOnlineGame(id)`: loads authoritative state into the game wrapper via the view's `loadState`, gates input to the seated color (`setOnline`), submits moves optimistically, reconciles on Realtime updates, renders the `#online-banner`. The banner also carries the share/copy-link button (creator), a join button (signed-in visitor), or a sign-in handoff link (signed-out visitor)

## Pages

- `home.html` (`home.ts`) — the account hub: a profile strip (rename, sign out) above one section box per area - games in progress (your-move badge), challenges (accept / decline / cancel), friends (requests / friends / sent requests grouped, add by username). Live-refreshes via `subscribeSocial`
- `game.html` (`game.ts`) — the per-variant lobby, one section box per action: start an open game, challenge a friend (picker over accepted friends), join a listed open game. Also the `?join=<id>` handoff target: sign in, claim the seat, land on the live board
- `play.html?online=<id>` — the live board (spectators welcome; `lockColor = null` keeps the view read-only)

## Flows

```
share-a-link                                  challenge-a-friend
  create game (game.html lobby)                 pick variant in catalog (challenge mode)
  -> play.html?online=<id> "Copy link"          -> game.html, pick friend, Challenge
  friend opens link                             friend sees it on home.html
    signed in  -> "Join this game" banner       -> Accept (join-game) -> live board
    signed out -> game.html?join=<id>           -> Decline (cancel-game, deletes it)
                  sign in/register -> join
move loop (both):
  local move -> applyMove locally -> submit-move(expected_ply)
  server validates with the same engine -> Realtime update -> reconcile
```

## Backend (`supabase/`)

- `migrations/` — schema, applied in filename order: game-agnostic tables + RLS + signup trigger + realtime (`init`), atomic move RPC (`apply_move`), friendships + `games.invited_player` + username rules (`social`)
- `functions/` — the only privileged game writers:
  - `create-game(variant, topology?, opponent?)` — canonical initial state; `opponent` (profile id) makes it a directed challenge via `invited_player`
  - `join-game(game_id)` — atomically claims the open seat; enforces the invite when `invited_player` is set
  - `cancel-game(game_id)` — deletes a `waiting` game; creator cancels, invitee declines. Active games end through resign/mate, never cancellation
  - `submit-move(game_id, expected_ply, move)` — validates with the shared engine, applies atomically via the `apply_move` RPC
- Personal-account project; do NOT provision under a company Supabase org
- `scripts/smoke-online.mjs` — full handshake against the live project: throwaway users, legal/illegal/out-of-turn/stale moves, username registration + collision, friendship RLS (forged insert, self-accept), challenge gating, cancel/decline. Needs `SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`

## Gotchas

- `soloOnly` games (snake) never route to the lobby; `routes.ts` keeps their links on `play.html` even in challenge mode
- Turn color is read from `board_state.turn` on the game row; state is the engine's `serialize()` output
- Spectators get `lockColor = null` (view is read-only); the pass button tracks the seat on every server update because a viewer can claim a seat mid-session from the banner
- `listOpenGames` filters `invited_player is null` — challenges never appear in the public lobby list
- The friendships pair index (`least/greatest`) means A->B and B->A cannot coexist; inserts surface as "already friends or pending"
- `index.html?mode=challenge` boots the catalog with the challenge toggle on (hub links use it)
