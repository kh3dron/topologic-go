-- Atomic move application. The Edge Function (submit-move) does the validation
-- with the shared engine, then calls this to commit the result in a single
-- transaction with an optimistic-concurrency guard.
--
-- The guard (ply = expected AND turn = player AND status = active) means two
-- simultaneous submissions can't both land: the loser updates 0 rows and gets
-- null back, and its client refetches. The move row insert shares the same
-- transaction, so board_state and the move log never diverge.
--
-- SECURITY: this bypasses RLS (security definer) and writes game state without
-- re-checking legality, so it must be callable ONLY by the service role (the
-- Edge Function). A normal client calling it directly would be able to write an
-- arbitrary board_state, defeating server-authoritative validation.

create or replace function apply_move(
  p_game_id      uuid,
  p_expected_ply int,
  p_player       uuid,
  p_move         jsonb,
  p_board_state  jsonb,
  p_turn         uuid,
  p_status       game_status,
  p_winner       uuid
) returns games
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  g games;
begin
  update games set
    board_state = p_board_state,
    turn        = p_turn,
    status      = p_status,
    winner      = p_winner,
    ply         = ply + 1,
    updated_at  = now()
  where id = p_game_id
    and ply = p_expected_ply
    and turn = p_player
    and status = 'active'
  returning * into g;

  if not found then
    return null;  -- stale ply / not your turn / not active: reject, client refetches
  end if;

  insert into moves (game_id, player_id, ply, move)
  values (p_game_id, p_player, p_expected_ply, p_move);

  return g;
end $$;

revoke all on function apply_move(uuid, int, uuid, jsonb, jsonb, uuid, game_status, uuid) from public;
grant execute on function apply_move(uuid, int, uuid, jsonb, jsonb, uuid, game_status, uuid) to service_role;
