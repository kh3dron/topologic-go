-- Snake leaderboard: best score per (player, topology).
--
-- Same invariant as games/moves: clients READ, only the server writes. The
-- submit-snake-score Edge Function replays the client's full run log through
-- the shared pure engine and derives the score itself, so a devtools-crafted
-- score can never land here — only a score some legal game actually produced.
-- One row per player per topology (the function upserts when a run beats the
-- stored best), so the leaderboard query is a plain ordered select.

create table snake_scores (
  player      uuid not null references profiles(id) on delete cascade,
  topology    text not null,             -- topology id from the code registry
  score       int  not null check (score > 0),
  ticks       int  not null default 0,   -- run length, for context
  achieved_at timestamptz not null default now(),
  primary key (player, topology)
);

create index snake_scores_topology_idx on snake_scores (topology, score desc);

alter table snake_scores enable row level security;

-- World-readable; intentionally NO client insert/update/delete policies.
create policy snake_scores_read on snake_scores for select using (true);
