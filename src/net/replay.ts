// Replay of an online game: every position is recomputed by running the
// world-readable moves log through the shared engine from the canonical
// initial state — nothing is stored per ply, so this works for any game the
// server ever validated (the log was applied by the same engine).
//
// Positions are served through a forward cursor: stepping ahead applies just
// the next moves, while any backward jump replays from the start. Full-game
// snapshots are never accumulated (a long Go game's snapshots embed the whole
// superko `seen` list, so a materialized timeline would be quadratic).

import { GAMES, usesTopology } from '../engine';
import { TOPOLOGY_MAP } from '../topology';

export interface MoveRow {
  ply: number;
  move: unknown;
}

export interface ReplayHandle {
  length: number; // plies in the log; positions run 0..length
  stateAt(ply: number): unknown; // serialized state after `ply` moves
}

export function makeReplay(
  variant: string,
  topologyId: string | null,
  finalBoardState: unknown,
  moves: MoveRow[],
): ReplayHandle {
  const mod = GAMES.get(variant);
  if (!mod) throw new Error(`unknown variant: ${variant}`);

  let board: unknown = null;
  if (usesTopology(variant)) {
    board = TOPOLOGY_MAP.get(topologyId ?? '');
    if (!board) throw new Error(`unknown topology: ${topologyId}`);
  }
  // Go's board size is a new-game option, not derivable from the topology;
  // recover it from the final snapshot (older rows lack the explicit field).
  const snap = finalBoardState as { size?: number; board?: unknown[] } | null;
  const options = variant === 'go'
    ? { size: snap?.size ?? (Array.isArray(snap?.board) ? snap.board.length : undefined) }
    : undefined;

  const ordered = [...moves].sort((a, b) => a.ply - b.ply);
  let cursorPly = 0;
  let cursorState = mod.initialState(board, options);

  return {
    length: ordered.length,
    stateAt(ply: number): unknown {
      const p = Math.max(0, Math.min(ordered.length, ply));
      if (p < cursorPly) {
        cursorPly = 0;
        cursorState = mod.initialState(board, options);
      }
      while (cursorPly < p) {
        cursorState = mod.applyMove(cursorState, ordered[cursorPly].move).state;
        cursorPly++;
      }
      return mod.serialize(cursorState);
    },
  };
}
