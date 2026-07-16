-- Register hyperbolic chess in the game_types reference table so games.variant
-- accepts it (the code registry gained it in the hyperbolic chess commit, but
-- adding a game is one INSERT here - see the init migration's invariants).
insert into game_types (id, name, board_family) values
  ('hyperchess', 'Hyperbolic Chess', 'hyperbolic-46')
on conflict (id) do nothing;
