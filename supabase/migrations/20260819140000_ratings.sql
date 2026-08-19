-- Elo ratings (T-63): profiles.rating (default 1200) existed but was never
-- written. One global rating across variants and topologies, updated on the
-- games row's active -> done transition by trigger, so every end path is
-- covered — mate/score via apply_move, resign/agreed draw via game-action —
-- without any Edge Function knowing about ratings.
--
-- Standard Elo, K = 32, draws score 0.5. Deltas are zero-sum up to integer
-- rounding (round(-x) = -round(x) in Postgres). Both profile rows are locked
-- in id order first, so two games between the same pair ending simultaneously
-- cannot deadlock. security definer: the update must land regardless of the
-- caller's RLS standing (profiles are only client-updatable on username).
-- Historical done games are not retro-rated; the trigger fires on transitions.

create or replace function update_ratings() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  k  constant numeric := 32;
  rw numeric;
  rb numeric;
  ew numeric;
  sw numeric;
begin
  if new.white_player is null or new.black_player is null then
    return new;
  end if;

  perform 1 from profiles
    where id in (new.white_player, new.black_player)
    order by id
    for update;
  select rating into rw from profiles where id = new.white_player;
  select rating into rb from profiles where id = new.black_player;

  ew := 1 / (1 + power(10, (rb - rw) / 400.0));
  sw := case
    when new.winner = new.white_player then 1
    when new.winner = new.black_player then 0
    else 0.5
  end;

  update profiles set rating = round(rating + k * (sw - ew)) where id = new.white_player;
  update profiles set rating = round(rating + k * (ew - sw)) where id = new.black_player;
  return new;
end $$;

create trigger games_rating_on_done
  after update of status on games
  for each row
  when (old.status = 'active' and new.status = 'done')
  execute function update_ratings();
