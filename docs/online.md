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
- `games.ts` — Edge Function invokers (`create-game` with optional opponent, `join-game`, `cancel-game`, `submit-move` with `expected_ply`), `fetchGame`, `listOpenGames` (excludes challenges), `listMyGames`, `listActiveGames` (spectator browse), `listGamesForStats` / `listMyGamesForStats` (narrow-column rows for derived stats + achievements), `subscribeGame` (Realtime)
- `achievements.ts` — the achievement registry (id, name, description, points, predicate) plus `playerStats(rows, playerId)`. Nothing is persisted: a player's earned set is a pure function of their world-readable game rows (create-game seats the creator as `white_player`, which makes "games started" derivable), so new achievements apply retroactively with no migration. Tiers cover starting/finishing/winning games, winning as both colors, winning off-classic, and exploring topologies/game types
- `social.ts` — friendships CRUD (request by username, accept, remove), profile lookups, `listProfiles` (players directory), `subscribeSocial` (one channel over my friendships + my games, used by the hub to live-refresh)
- `scores.ts` — snake leaderboard: `submitSnakeScore(log)` (invokes `submit-snake-score` with the run log recorded by `src/snake.ts`), `listSnakeScores()` (all best-score rows, highest first; grouped per topology client-side)
- `online.ts` — `enterOnlineGame(id)`: loads authoritative state into the game wrapper via the view's `loadState`, gates input to the seated color (`setOnline`), submits moves optimistically, reconciles on Realtime updates, renders the `#online-banner`. The banner also carries the share/copy-link button (creator), a join button (signed-in visitor), or a sign-in handoff link (signed-out visitor). Two ambient cues per server update: the tab title gains a `● Your move —` prefix while it's the seated player's turn (restored on destroy), and an opponent Go stone landing plays the stone sound (new ply that leaves the turn with us + non-null `lastMove`, so passes and our own move's Realtime echo stay silent)

## Pages

- `home.html` (`home.ts`) — the account hub: a profile strip (rename, sign out, achievement points) above one section box per area - games in progress (your-move badge), challenges (accept / decline / cancel), friends (requests / friends / sent requests grouped, add by username), achievements (every achievement with its points, locked ones dimmed; header shows earned / total · points). Live-refreshes via `subscribeSocial`
- `game.html` (`game.ts`) — the per-variant lobby, one section box per action: directed challenge (when `?opponent=<profileId>` is present, carried from the players page through the catalog), start an open game, challenge a friend (picker over accepted friends), join a listed open game. Also the `?join=<id>` handoff target: sign in, claim the seat, land on the live board
- `players.html` (`players.ts`) — directory of every profile (world-readable) with rating, won/played counts, and achievement count + points, all computed client-side from game rows (the achievements cell's tooltip lists the earned names); Challenge opens the catalog in challenge mode with `?opponent=<id>`, which `landing.ts` carries opaquely into the lobby link
- `watch.html` (`watch.ts`) — spectator browse: active games newest-move first (variant, players, ply, age), each linking to the live board; refreshes on the button and on tab focus
- `leaderboard.html` (`leaderboard.ts`) — snake leaderboard: one table per topology of best scores (rank, player, score, age), world-readable so it works signed out; empty topologies link straight into the playground
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

- `migrations/` — schema, applied in filename order: game-agnostic tables + RLS + signup trigger + realtime (`init`), atomic move RPC (`apply_move`), friendships + `games.invited_player` + username rules (`social`), `game_types` registration of later games (`hyperchess`), snake best-score table (`snake_scores`). Registering a game in code without the matching `game_types` INSERT fails at create-game with a `games_variant_fkey` violation
- `functions/` — the only privileged game writers:
  - `create-game(variant, topology?, opponent?, options?)` — canonical initial state; `opponent` (profile id) makes it a directed challenge via `invited_player`; `options` is the per-game new-game bag (Go `{size: 9|13|19}`), validated by the engine module (bad values 400). Size lives in `board_state`, no schema change — `goBoardSizeOf()` in `net/games.ts` reads it back for list labels
  - `join-game(game_id)` — atomically claims the open seat; enforces the invite when `invited_player` is set
  - `cancel-game(game_id)` — deletes a `waiting` game; creator cancels, invitee declines. Active games end through resign/mate, never cancellation
  - `submit-move(game_id, expected_ply, move)` — validates with the shared engine, applies atomically via the `apply_move` RPC
  - `submit-snake-score(topology, food_rands, events)` — the snake leaderboard's only write path. Replays the client's run log through the shared engine (`food_rands` = the Math.random values food placement consumed, `events` = tick runs as positive ints + steer codes -1..-4 in applied order) and derives the score itself; a bare number is never trusted. Upserts `snake_scores` (best per player per topology) only when the run beats the stored best
- Personal-account project; do NOT provision under a company Supabase org
- `scripts/smoke-online.mjs` — full handshake against the live project: throwaway users, legal/illegal/out-of-turn/stale moves, username registration + collision, friendship RLS (forged insert, self-accept), challenge gating, cancel/decline, snake scores (hand-crafted deterministic run logs: replay accepted, unfinished log rejected, direct insert blocked, best-per-topology upsert). Needs `SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`

## Gotchas

- `soloOnly` games (snake) never route to the lobby; `routes.ts` keeps their links on `play.html` even in challenge mode
- Snake scores submit from the playground (`views/snake.ts`) on death/win via lazy imports guarded by `import.meta.env.VITE_SUPABASE_URL`, so the Supabase SDK still stays out of the offline play bundle; signed-out runs just show "sign in to post scores" in the status line
- The snake run log stops growing at 100k ticks (mirrors the server cap); a longer run simply fails replay and isn't submitted
- Turn color is read from `board_state.turn` on the game row; state is the engine's `serialize()` output
- Spectators get `lockColor = null` (view is read-only); the pass button tracks the seat on every server update because a viewer can claim a seat mid-session from the banner
- Go's hover affordances (ghost stone, crosshair, cross-tile hover sync) follow `canPlayGoNow()` in the wrapper: always on offline, online only on the seated colour's turn, never for spectators — the view skips the validity cache entirely, so `.valid-move` is never applied
- `listOpenGames` filters `invited_player is null` — challenges never appear in the public lobby list
- The friendships pair index (`least/greatest`) means A->B and B->A cannot coexist; inserts surface as "already friends or pending"
- `index.html?mode=challenge` boots the catalog with the challenge toggle on (hub links use it)
