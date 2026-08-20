-- Web Push subscriptions for per-move notifications (self-hosted VAPID, no
-- third-party notification provider - the endpoint is whatever push service
-- the user's own browser uses).
--
-- Clients manage ONLY their own rows (RLS on auth.uid()); the submit-move
-- function reads them via the service role to notify the player whose turn
-- it became. Dead endpoints (404/410 from the push service) are deleted by
-- the sender.

create table push_subscriptions (
  id         bigint generated always as identity primary key,
  player     uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_player_idx on push_subscriptions (player);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_select on push_subscriptions for select
  using (auth.uid() = player);
create policy push_subscriptions_insert on push_subscriptions for insert
  with check (auth.uid() = player);
create policy push_subscriptions_delete on push_subscriptions for delete
  using (auth.uid() = player);
