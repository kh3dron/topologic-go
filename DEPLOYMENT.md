# DEPLOYMENT.md — online play + hosting design

Design doc for putting topologic-go on `games.kh3dron.net` with user accounts and
online games, using **server-authoritative move validation**. Scoped to a low-traffic
hobby deployment.

## Principles

- The frontend is static (Vite build, zero runtime deps). It never needs a "real server."
- Only accounts + shared, validated game state need a backend. That is a managed service.
- Subdomains decouple hosting. Each piece lives wherever it is cheapest, independently.
- No playability patches (see `CLAUDE.md`). One engine, run in two places (browser + server),
  so the rules can never drift and no topology gets special-cased. The server is the arbiter.

## Architecture

```
  kh3dron.net              games.kh3dron.net                    *.supabase.co
  ┌──────────────┐        ┌──────────────────┐                ┌────────────────────────┐
  │ personal site │        │ topologic-go SPA │  read (WSS)    │ Supabase               │
  │ GitHub Pages  │        │ static build     │ ◄───────────── │  Postgres + Realtime   │
  │ (UNCHANGED)   │        │  - shared engine │                │  Auth                  │
  └──────────────┘        │  - optimistic UI │  write (HTTPS) │  Edge Functions (Deno) │
        ▲                  └──────────────────┘ ─────────────► │   - shared engine      │
        │ Route 53                   ▲                         │   - sole writer        │
        └────────────────────────────┴── kh3dron.net zone (AWS) └────────────────────────┘
```

- Clients never write game tables directly. They call Edge Functions; the functions validate
  with the engine and write as the only privileged writer.
- Clients read game state over Realtime (WebSocket) and render optimistically for instant feel.
- Nothing "migrates into AWS." The personal site stays on GitHub Pages. Route 53 already hosts
  the `kh3dron.net` zone, so adding the game is one new DNS record.

## Hosting decisions

- Static game frontend
  - Default: keep on GitHub Pages (the `.github/workflows/static.yml` pipeline already works).
  - Alternative: Cloudflare Pages / Vercel free tier for nicer env injection + instant TLS.
- Backend: Supabase (managed Postgres + Auth + Realtime + Edge Functions).
  - Realtime pushes validated state to the opponent. Turn-based, so latency is irrelevant.
  - Edge Functions (Deno/TS) run the SAME engine as the browser to validate every move
    server-side. Scale to zero, no always-on box, on the free tier.
  - Why not a Postgres function for validation? The chess/go engine can't reasonably be ported
    to plpgsql. Why not a dedicated Node server? Unnecessary for turn-based play and adds an
    always-on cost. Edge Functions are the fit.

Cost: $0 to start (Pages free + Supabase free tier: 500 MB Postgres, ~50k MAU auth, Realtime,
500k Edge Function invocations/mo). Free projects pause after ~1 week idle; Supabase Pro
($25/mo) removes that if it becomes annoying.

## DNS (Route 53)

The `kh3dron.net` hosted zone lives in Route 53. Leave the apex records alone (personal site).
Add one record for the subdomain:

- Frontend on GitHub Pages (DONE — record live, custom domain bound):
  ```
  Name:  games.kh3dron.net
  Type:  CNAME
  Value: kh3dron.github.io
  ```
  The repo ships `public/CNAME` (→ `dist/CNAME`) so the Actions Pages deploy keeps the
  custom domain bound on every build; the domain is also set in repo Settings → Pages.
  GitHub provisions TLS automatically.
- Vercel: `CNAME games.kh3dron.net → cname.vercel-dns.com`.
- Cloudflare Pages: add the custom domain in the CF Pages dashboard; it manages the record.

`games.kh3dron.net` is a subdomain, so a plain CNAME is valid (apex-CNAME restriction does not
apply). Supabase (`<project-ref>.supabase.co`) needs no DNS entry; the SPA calls it directly.

## The refactor this requires: a shared, pure engine core

This is the main body of work. Today the rules live in `chess.ts` / `go.ts` but read and mutate
module-level globals (`chessBoard`, `currentTopology`, `goBoard`, `seenPositions`, ...). To run
them on the server they must become pure functions: state in, result out, no globals, no DOM.

`topology.ts` is already pure and Deno-compatible — no change needed there.

Target shape (`src/engine/`, imported by both the browser and Edge Functions):

```ts
// chess-core.ts
export function isLegalChessMove(
  board: ChessBoard, turn: Color, topo: Topology, from: Sq, to: Sq): boolean;

export function applyChessMove(
  board: ChessBoard, turn: Color, topo: Topology, from: Sq, to: Sq
): { board: ChessBoard; turn: Color; gameOver: Color | 'draw' | null };

// go-core.ts
export function isValidGoMove(
  board: GoBoard, color: Color, topo: Topology, seen: Set<string>): boolean;

export function applyGoMove(
  state: GoState, row: number, col: number
): GoState;   // GoState = { board, turn, passes, captures, seen, lastMove, gameOver }
```

Refactor steps:

- Parameterize topology: `proj()` / `getNeighbors()` take a `Topology` arg instead of reading
  the `currentTopology` global.
- Chess: lift `chessBoard` out of module scope. `moveLeavesKingInCheck` already clones the board
  for its check test — make that clone local to a passed-in board. `clickChessSquare` stays in
  the browser UI layer and calls the pure core.
- Go: make `seenPositions` (superko history) an explicit field of `GoState`, not a module global.
  Scoring is nearly pure already; just thread `topo` through `getNeighbors`.
- The browser keeps thin stateful wrappers (the current globals) that delegate to the core, so
  `render.ts` and `main.ts` barely change.

Payoff beyond validation: the engine becomes headlessly testable — you can batch-evaluate every
topology from the move-zero position (does the torus really mate White immediately?), which is
the project's research question.

## Extensibility: two orthogonal registries (topology × game)

Two axes, deliberately asymmetric: **topologies are the fast-growing axis (hundreds eventually),
games are few (~10 max)**. That asymmetry is exactly why they must stay orthogonal. `TOPOLOGIES`
already works this way — adding a board shape is one entry and it lights up for every game that
uses that board. Games need the same treatment: a `GAMES` registry, one entry per game, so all
dispatch becomes `GAMES.get(id)` instead of the `currentGame === 'chess' | 'go' | 'hexchess'`
branches scattered across `play.ts`, `render.ts`, `routes.ts`, `landing.ts`, `game.ts`.

### Validators are per-game, not per-(game, topology)

A tempting-but-wrong model is one validator per (game, topology) pair, keyed by a UID/hash.
Reject it:

- Topology is a **parameter** to the one per-game validator, not a dimension to enumerate.
  `getPseudoDestinations` already walks the plane and calls `project()`, so one chess validator
  runs on every topology. Per-pair would mean ~10 games × hundreds of topologies = thousands of
  validators, and every new topology would force re-implementing all 10 games against it. The
  big axis being topologies is the argument *for* parameterization, not against it.
- It breaks no-playability-patches (`CLAUDE.md`): a per-pair slot is a per-pair rule exception,
  the exact divergence the project forbids. The honest degenerate outcomes (torus mates White at
  move zero) are only meaningful because one generic validator produced them.

The pair is still a useful **identity** — for the DB key, deep-link URLs, and matchmaking — but
identity ≠ code unit. Use a readable composite (`chess@torus`), never an opaque hash: greppable,
URL-friendly, self-describing in logs and rows.

### Board families: topologies are not a global shared by all games

Topologies should not be a single universal list every game consumes — hexchess is a hexagonal
Gliński board that doesn't touch the square-grid `TOPOLOGIES` at all. Model it as board families:

- A game declares its board family. Chess + go → the square-grid family (current `TOPOLOGIES`).
  Hexchess → its own family (today one fixed board).
- Topologies belong to a family, not the universe. A game's playable variants = game ×
  (topologies in its family). Adding a topology to the square family lights up chess and go and
  leaves hex untouched.
- The validator stays per-game, parameterized by whatever board its family hands it.

A game is one entry implementing a pure `GameModule`:

```ts
// src/engine/game.ts  (pure, shared by browser + Edge Functions)
export type GameResult =
  | { status: 'active'; turn: string }
  | { status: 'done'; winner: string /* player id */ | 'draw' };

export interface GameModule<S, M> {
  id: string;                       // 'chess' | 'go' | 'hexchess' | ...
  name: string;
  boardFamily: string;              // 'square-grid' (chess, go) | 'hex-glinski' (hexchess) | ...
  initialState(board: Board): S;    // Board = a member of this game's family; topology baked into S
  isLegalMove(state: S, move: M): boolean;   // topology-agnostic signature; S carries the board
  applyMove(state: S, move: M): { state: S; result: GameResult };  // incl. mate/pass-end/scoring
  serialize(state: S): unknown;     // -> games.board_state jsonb
  deserialize(data: unknown): S;
}

export const GAMES = new Map<string, GameModule<any, any>>([/* chess, go, hexchess, ... */]);
```

Rendering/DOM is NOT in the shared module (Edge Functions must stay DOM-free). Each game has:

- a pure engine module `src/engine/games/<id>.ts` — the `GameModule` above (rules + serialize),
  imported by both the browser and the server
- a client view adapter (DOM/render) registered separately, keyed by the same `id`

### Why the data model does NOT grow per game

This is the payoff, and it answers the worry directly: the schema is game-agnostic and stays
fixed as games multiply. All per-game variation lives in two places only — jsonb columns and
the code registry:

- `board_state` and `move` are `jsonb`. Each game defines its own shape via `serialize` /
  `deserialize`. A new game with a totally different state (hex board, 3-player, whatever) needs
  zero column or table changes.
- `variant` is `text` (not a Postgres enum). Enums require an `ALTER TYPE ... ADD VALUE`
  migration per game; text + a `game_types` reference table means adding a game is one `insert`,
  and the code `GAMES` registry is the real gate (the Edge Function rejects unknown variants).
- One generic `submit-move` function dispatches through `GAMES.get(variant)` — there is never a
  per-game Edge Function, table, or RLS policy.

So "the data model" is not what grows. What grows is application code: one `GameModule` + one
view adapter + one `game_types` row. Same one-entry ethos as `TOPOLOGIES`.

### Checklist: adding a new game

1. `src/engine/games/<id>.ts` — implement `GameModule` (initial state, `isLegalMove`,
   `applyMove`, serialize/deserialize). Pure, DOM-free, Deno-compatible.
2. Register it in `GAMES`.
3. Add a client view adapter (render + input) keyed by `id`; register it.
4. `insert into game_types (id, name, board_family) values (...)`.
5. Add it to the landing catalog (which itself iterates `GAMES` × its family's topologies).
6. No new tables, columns, Edge Functions, or RLS policies. No migration beyond the seed row.

## Sharing the engine with Deno (logistics)

Supabase functions live in `supabase/functions/<name>/index.ts` and run under Deno. Deno wants
explicit `.ts` extensions on relative imports; Vite/`tsc` tolerate them with
`"moduleResolution": "bundler"` + `"allowImportingTsExtensions": true`. Options, simplest first:

- Write `src/engine/*` with explicit `.ts` extensions and import it from the function via a
  relative path; flip the two tsconfig flags so the browser build still typechecks.
- Or add a Deno import map / `deno.json` in `supabase/` mapping the engine dir.
- Keep `src/engine/` free of any browser/Node API so it stays runnable in both runtimes.

## Data model

`moves` is the append-only history; `board_state` is a denormalized snapshot maintained solely
by the server (so it is trustworthy — clients can't write it). `ply` on `games` is an optimistic
concurrency token.

```sql
create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  username   text unique not null,
  rating     int  not null default 1200,
  created_at timestamptz not null default now()
);

create type game_status as enum ('waiting', 'active', 'done');

-- Reference table mirroring the code GAMES registry. Adding a game is one insert,
-- NOT an `alter type ... add value` migration. Seed it from the registry.
create table game_types (
  id           text primary key,    -- 'chess' | 'go' | 'hexchess' | ...
  name         text not null,
  board_family text not null        -- 'square-grid' | 'hex-glinski' | ...; picks the topology set
);

create table games (
  id           uuid primary key default gen_random_uuid(),
  variant      text         not null references game_types(id),
  topology     text,                         -- topology id within the game's board family; null if the family has no topologies
  -- Readable composite identity for URLs / matchmaking / logs. NOT a hash.
  variant_id   text generated always as (variant || '@' || coalesce(topology, '-')) stored,
  white_player uuid references profiles(id),
  black_player uuid references profiles(id),
  status       game_status  not null default 'waiting',
  turn         uuid references profiles(id), -- whose move it is
  ply          int          not null default 0,  -- concurrency token + move count
  board_state  jsonb        not null,        -- authoritative snapshot, server-written only
  winner       uuid references profiles(id),
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

create table moves (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references games(id) on delete cascade,
  player_id  uuid not null references profiles(id),
  ply        int  not null,
  move       jsonb not null,                 -- {kind:'move',from,to} | {kind:'pass'} | {kind:'resign'}
  created_at timestamptz not null default now(),
  unique (game_id, ply)
);
```

`board_state` jsonb schema:

- chess: `{ board: (Piece|null)[][], turn: 'white'|'black' }`
- go: `{ board, turn, passes, captures:{black,white}, lastMove, seen: string[] }`
  — `seen` is the superko position-hash history, required to validate the next move.

Signup trigger (creates a profile row on auth signup):

```sql
create function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username','player_'||left(new.id::text,8)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();
```

## Row-Level Security: clients read, server writes

Because validation is authoritative, no client writes to `games` or `moves`. Those tables are
read-only to clients; all writes come from Edge Functions using the service role (which bypasses
RLS). This closes the devtools-tampering hole entirely.

```sql
alter table profiles enable row level security;
alter table games    enable row level security;
alter table moves    enable row level security;

-- profiles: world-readable, owner may edit own
create policy profiles_read   on profiles for select using (true);
create policy profiles_update on profiles for update using (auth.uid() = id);

-- games & moves: clients may READ only (participants, or true for spectating).
-- NO client insert/update/delete policies -> only the service role can write.
create policy games_read on games for select using (true);
create policy moves_read on moves for select using (true);

alter publication supabase_realtime add table games, moves;
```

## Edge Functions (the only writers)

Three functions, each: verify the caller's JWT, do a guarded write with the service role.

- `create-game(variant, topology)`
  - Sets `board_state` from the engine's canonical initial position (clients can't inject a
    doctored start), seats the caller, `status='waiting'`.
- `join-game(game_id)`
  - Atomically claims the empty seat: `update games set black_player=$me, status='active',
    turn=<first mover> where id=$1 and black_player is null` — 0 rows updated → seat taken.
- `submit-move(game_id, expected_ply, move)`
  1. Verify JWT → caller id.
  2. Load the game (service role). Check `status='active'`, caller is a participant, it is
     caller's `turn`, and `expected_ply = games.ply` (stale/duplicate → reject).
  3. `const g = GAMES.get(game.variant)` — one generic function, no per-game code. Validate
     `g.isLegalMove(g.deserialize(board_state), move)`.
  4. If legal, `g.applyMove(...)` computes next state + result (mate / two-pass end + scoring /
     etc., each game's own logic). Persist `g.serialize(next.state)`.
  5. Apply atomically with an optimistic guard:
     ```sql
     update games set board_state=$next, turn=$nextturn, ply=ply+1,
        status=$status, winner=$winner, updated_at=now()
      where id=$1 and ply=$expected_ply;          -- 0 rows -> someone moved first, reject
     insert into moves (game_id, player_id, ply, move) values ($1,$me,$expected_ply,$move);
     ```
     (Do both in one RPC / plpgsql function so it's a single transaction with a row lock.)
  6. Return the new state; Realtime pushes it to the opponent.

`pass` and `resign` are `submit-move` variants (Go pass affects turn/superko; resign sets
`status='done'` + `winner`).

Auth pattern inside a function: build a user-scoped client from the request `Authorization`
header to read `auth.uid()`, and a separate service-role client for the privileged writes.

## Realtime flow

1. Both clients subscribe to `postgres_changes` on `games` filtered by `game_id`.
2. Mover plays: client validates locally (same engine), renders optimistically, and calls
   `submit-move` with `expected_ply`.
3. The function validates authoritatively and writes; Realtime pushes the new `games` row.
4. Opponent applies it. Mover reconciles: server state matches its optimistic state on success;
   on rejection (illegal / not your turn / stale ply) it rolls back and refetches.

The client running the same engine is a UX optimization, not a trust boundary — the server is
the arbiter. They agree because it's literally the same code.

## Frontend changes to this repo

- Refactor rules into `src/engine/` (see above). Browser wrappers delegate to it.
- Add `@supabase/supabase-js`.
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon key is public by design; RLS + the
  Edge Functions are the security boundary).
- New modules: auth/session, network (call functions, subscribe to Realtime), lobby UI.
- Online mode: submit via `submit-move`, render optimistically, reconcile on Realtime updates.
  Local hotseat play stays as the default offline mode.
- `base: './'` stays. If staying on GitHub Pages, add the `CNAME` file.

## Rollout phases

1. Engine refactor: extract `src/engine/` with the `GAMES` registry and pure `GameModule`s for
   chess/go/hexchess; collapse the scattered `currentGame === ...` branches into `GAMES.get(id)`
   dispatch; keep local play working; add a headless test evaluating each topology from move
   zero. (No backend yet — pure prerequisite, and independently useful.)
2. DNS + hosting: point `games.kh3dron.net` at the current build; ship offline-only.
3. Supabase project: tables, RLS, trigger, realtime publication (SQL above as a migration).
4. Auth: sign-in + profile creation.
5. Edge Functions: `create-game`, `join-game`, `submit-move` importing `src/engine/`.
6. Online play: lobby → create/join → optimistic move + Realtime reconcile.
7. Polish: history from the `moves` log, ratings, draw offers, reconnection, spectating.
```