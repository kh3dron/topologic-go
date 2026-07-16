// Bridge to the shared pure engine. This is the whole point of the engine
// refactor: the SAME rules that run in the browser run here on the server, so
// server-side validation can never drift from the client. The engine is
// DOM-free and its internal imports carry .ts extensions, so Deno resolves it.

import { GAMES, GameResult, usesTopology } from '../../../src/engine/index.ts';
import { TOPOLOGY_MAP } from '../../../src/topology.ts';

function moduleFor(variant: string) {
  const mod = GAMES.get(variant);
  if (!mod) throw new Error(`unknown variant: ${variant}`);
  return mod;
}

// Canonical initial state for a (variant, topology, options) triple. Computed
// here so a client can't inject a doctored starting position; options (e.g. Go
// board size) are validated by the game module, which throws on bad values.
export function initialBoardState(variant: string, topologyId: string | null, options?: unknown): {
  boardState: unknown;
  turnColor: 'white' | 'black';
} {
  const mod = moduleFor(variant);
  let board: unknown = null;
  if (usesTopology(variant)) {
    board = TOPOLOGY_MAP.get(topologyId ?? '');
    if (!board) throw new Error(`unknown topology: ${topologyId}`);
  }
  const state = mod.initialState(board, options ?? undefined);
  return { boardState: mod.serialize(state), turnColor: state.turn };
}

// Validate a move against the authoritative board_state and apply it. Returns
// null if the move is illegal.
export function validateAndApply(variant: string, boardState: unknown, move: unknown): {
  boardState: unknown;
  result: GameResult;
} | null {
  const mod = moduleFor(variant);
  const state = mod.deserialize(boardState);
  if (!mod.isLegalMove(state, move)) return null;
  const { state: next, result } = mod.applyMove(state, move);
  return { boardState: mod.serialize(next), result };
}
