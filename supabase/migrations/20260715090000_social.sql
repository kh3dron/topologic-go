-- Social layer: registration usernames, friendships, and directed challenges.
--
-- Design invariants:
--   * Friendships are client-written under RLS — no server authority needed
--     (a friend edge carries no game state, so devtools tampering gains nothing).
--   * Challenges reuse the games table: a 'waiting' game with invited_player set
--     is a challenge. Seat claiming stays in the Edge Functions (join-game
--     enforces the invite; cancel-game lets the creator cancel / invitee decline).
--   * Usernames are chosen at registration (raw_user_meta_data.username). The
--     trigger falls back past collisions so a duplicate name never aborts signup.

-- ==================== CHALLENGES ====================
alter table games add column invited_player uuid references profiles(id);

create index games_invited_idx on games (invited_player) where status = 'waiting';

-- ==================== USERNAMES ====================
alter table profiles add constraint profiles_username_format
  check (username ~ '^[A-Za-z0-9_]{3,24}$');

create unique index profiles_username_lower_idx on profiles (lower(username));

create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  base      text := coalesce(nullif(new.raw_user_meta_data->>'username', ''),
                             'player_' || left(new.id::text, 8));
  candidate text;
begin
  if base !~ '^[A-Za-z0-9_]{3,24}$' then
    base := 'player_' || left(new.id::text, 8);
  end if;
  candidate := base;
  loop
    begin
      insert into public.profiles (id, username) values (new.id, candidate);
      return new;
    exception when unique_violation then
      candidate := left(base, 19) || '_' || left(md5(random()::text), 4);
    end;
  end loop;
end $$;

-- ==================== FRIENDSHIPS ====================
create table friendships (
  requester  uuid not null references profiles(id) on delete cascade,
  addressee  uuid not null references profiles(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

-- One edge per pair regardless of direction.
create unique index friendships_pair_idx
  on friendships (least(requester, addressee), greatest(requester, addressee));

create index friendships_addressee_idx on friendships (addressee);

alter table friendships enable row level security;

-- Participants see their own edges; the requester opens one as 'pending';
-- only the addressee flips it to 'accepted'; either side deletes
-- (cancel / decline / unfriend).
create policy friendships_read on friendships for select
  using (auth.uid() in (requester, addressee));
create policy friendships_request on friendships for insert
  with check (auth.uid() = requester and status = 'pending');
create policy friendships_accept on friendships for update
  using (auth.uid() = addressee)
  with check (auth.uid() = addressee and status = 'accepted');
create policy friendships_remove on friendships for delete
  using (auth.uid() in (requester, addressee));

-- ==================== REALTIME ====================
alter publication supabase_realtime add table friendships;
