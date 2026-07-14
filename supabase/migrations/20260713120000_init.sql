-- Initial schema for online play (see DEPLOYMENT.md).
--
-- Design invariants encoded here:
--   * The schema is game-agnostic and does NOT grow per game. All per-game
--     variation lives in jsonb (board_state, move) + the code registry.
--     `variant` is text + a game_types reference table, never an enum, so adding
--     a game is one INSERT, not an `alter type ... add value` migration.
--   * Server-authoritative: clients may READ games/moves but never write them.
--     All writes come from Edge Functions using the service role (which bypasses
--     RLS). This closes the devtools-tampering hole.
--   * board_state is a denormalized snapshot maintained solely by the server;
--     moves is the append-only source of truth. `ply` is an optimistic
--     concurrency token.

-- ==================== REFERENCE ====================
create type game_status as enum ('waiting', 'active', 'done');

-- Mirrors the code GAMES registry. Adding a game = one insert here.
create table game_types (
  id           text primary key,   -- 'chess' | 'go' | 'hexchess' | ...
  name         text not null,
  board_family text not null       -- 'square-grid' | 'hex-glinski' | ...
);

insert into game_types (id, name, board_family) values
  ('chess',    'Chess',            'square-grid'),
  ('go',       'Go',               'square-grid'),
  ('hexchess', 'Hexagonal Chess',  'hex-glinski');

-- ==================== PROFILES ====================
create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  username   text unique not null,
  rating     int  not null default 1200,
  created_at timestamptz not null default now()
);

-- Create a profile row automatically on signup.
create function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'player_' || left(new.id::text, 8)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();

-- ==================== GAMES ====================
create table games (
  id           uuid primary key default gen_random_uuid(),
  variant      text         not null references game_types(id),
  topology     text,                         -- topology id within the game's board family; null if none
  -- Readable composite identity for URLs / matchmaking / logs. NOT a hash.
  variant_id   text generated always as (variant || '@' || coalesce(topology, '-')) stored,
  white_player uuid references profiles(id),
  black_player uuid references profiles(id),
  status       game_status  not null default 'waiting',
  turn         uuid references profiles(id), -- whose move it is
  ply          int          not null default 0,  -- optimistic concurrency token + move count
  board_state  jsonb        not null,        -- authoritative snapshot, server-written only
  winner       uuid references profiles(id),
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

create index games_status_idx on games (status);
create index games_variant_idx on games (variant);
create index games_players_idx on games (white_player, black_player);

create table moves (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references games(id) on delete cascade,
  player_id  uuid not null references profiles(id),
  ply        int  not null,
  move       jsonb not null,                 -- game-defined shape (chess {from,to} | go {kind,...} | ...)
  created_at timestamptz not null default now(),
  unique (game_id, ply)
);

create index moves_game_idx on moves (game_id);

-- ==================== ROW-LEVEL SECURITY ====================
-- Clients read; the server (service role) writes. There are intentionally NO
-- client insert/update/delete policies on games/moves.
alter table game_types enable row level security;
alter table profiles   enable row level security;
alter table games      enable row level security;
alter table moves      enable row level security;

create policy game_types_read on game_types for select using (true);

create policy profiles_read   on profiles for select using (true);
create policy profiles_update on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- true = spectating allowed; tighten to participants-only if undesired.
create policy games_read on games for select using (true);
create policy moves_read on moves for select using (true);

-- ==================== REALTIME ====================
-- Opponents subscribe to postgres_changes on these tables.
alter publication supabase_realtime add table games, moves;
