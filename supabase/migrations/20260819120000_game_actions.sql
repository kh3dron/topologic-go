-- Off-board game actions: resign + draw offers (T-64).
--
-- games.draw_offer holds the profile id of the seated player whose draw offer
-- is pending; null = no offer. Written only by the game-action Edge Function
-- (service role) — clients never write games. An offer stands until it is
-- accepted, declined/retracted, or any move is applied: apply_move now clears
-- it, matching the over-the-board convention that a move supersedes an offer.
--
-- A game ended by resignation or agreed draw keeps board_state.gameOver null
-- (no mate/scoring on the board), so clients distinguish it from an on-board
-- end without an extra column.

alter table games add column draw_offer uuid references profiles(id);

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
    draw_offer  = null,
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
