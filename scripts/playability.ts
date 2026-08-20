// Move-zero playability analysis: the machine-checked half of
// docs/playability.md. For every topology it computes, from the pure engine:
//   - which enemy pieces attack each king at move 0 (the check sources)
//   - the number of legal white moves at move 0
//   - every cross-army attack available at move 0 (contacts through gluings)
// and then verifies the characterization theorem:
//   white is in check at move 0  <=>  the bottom edge is glued onto the top
//   edge (a vertical wrap, straight or column-flipped)
// The prose proof of the general lemmas is in docs/playability.md; this
// script is the exhaustive case check over the registry.
//
// Run with a TS runner, e.g.:  npx tsx scripts/playability.ts

import { TOPOLOGIES, Topology } from '../src/topology';
import {
  CHESS_SIZE, ChessBoard, createInitialChessBoard, getPseudoDestinations,
  hasAnyLegalMove, isInCheck,
} from '../src/engine/games/chess';
import { Color } from '../src/engine/core';

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

const FILES = 'abcdefgh';
function sqName(r: number, c: number): string {
  return `${FILES[c]}${CHESS_SIZE - r}`;
}

function findKing(board: ChessBoard, color: Color): [number, number] {
  for (let r = 0; r < CHESS_SIZE; r++) {
    for (let c = 0; c < CHESS_SIZE; c++) {
      const p = board[r][c];
      if (p && p.type === 'king' && p.color === color) return [r, c];
    }
  }
  throw new Error('no king');
}

// Every (attacker -> victim) pair across armies at move 0.
function crossArmyAttacks(board: ChessBoard, topo: Topology): string[] {
  const out: string[] = [];
  for (let r = 0; r < CHESS_SIZE; r++) {
    for (let c = 0; c < CHESS_SIZE; c++) {
      const p = board[r][c];
      if (!p) continue;
      for (const key of getPseudoDestinations(board, topo, r, c)) {
        const [tr, tc] = key.split(',').map(Number);
        const victim = board[tr][tc];
        if (victim && victim.color !== p.color) {
          out.push(`${p.color[0]}${p.type} ${sqName(r, c)} x ${victim.color[0]}${victim.type} ${sqName(tr, tc)}`);
        }
      }
    }
  }
  return out;
}

function checkersOf(board: ChessBoard, topo: Topology, color: Color): string[] {
  const [kr, kc] = findKing(board, color);
  const key = `${kr},${kc}`;
  const out: string[] = [];
  for (let r = 0; r < CHESS_SIZE; r++) {
    for (let c = 0; c < CHESS_SIZE; c++) {
      const p = board[r][c];
      if (p && p.color !== color && getPseudoDestinations(board, topo, r, c).has(key)) {
        out.push(`${p.type} ${sqName(r, c)}`);
      }
    }
  }
  return out;
}

// The characterization predicate: the vertical edge treatment is a wrap -
// crossing the bottom edge re-enters through the top edge at EVERY column
// (straight or column-flipped). The "some column" version is falsified by
// the windmill, whose bottom edge glues onto its right edge: one corner cell
// does touch row 0, but the armies only meet through long bent slider rays
// (mutual queen attack along rank 5), never as a check.
function bottomGluesToTop(topo: Topology): boolean {
  for (let c = 0; c < CHESS_SIZE; c++) {
    const p = topo.project(CHESS_SIZE, c, CHESS_SIZE);
    if (!p || p[0] !== 0) return false;
  }
  return true;
}

console.log('=== MOVE-ZERO PLAYABILITY ANALYSIS (chess, standard setup) ===');
console.log(
  pad('TOPOLOGY', 15) + pad('W-CHECKERS', 22) + pad('B-CHECKERS', 22) +
  pad('W-LEGAL', 8) + pad('BOT->TOP', 9) + 'CROSS-ARMY ATTACKS',
);

let violations = 0;
for (const topo of TOPOLOGIES) {
  const board = createInitialChessBoard();
  const wCheckers = checkersOf(board, topo, 'white');
  const bCheckers = checkersOf(board, topo, 'black');
  const whiteHasMove = hasAnyLegalMove(board, topo, 'white');
  const attacks = crossArmyAttacks(board, topo);
  const glued = bottomGluesToTop(topo);

  const whiteInCheck = isInCheck(board, topo, 'white');
  if (whiteInCheck !== glued) {
    violations++;
    console.log(`CHARACTERIZATION VIOLATED on ${topo.id}: check=${whiteInCheck} glued=${glued}`);
  }
  if (whiteInCheck !== wCheckers.length > 0) throw new Error('checker enumeration disagrees with isInCheck');

  console.log(
    pad(topo.id, 15) +
    pad(wCheckers.join(', ') || '-', 22) +
    pad(bCheckers.join(', ') || '-', 22) +
    pad(whiteHasMove ? '>0' : '0', 8) +
    pad(glued ? 'YES' : 'no', 9) +
    (attacks.length ? `${attacks.length}: ${attacks.slice(0, 4).join('; ')}${attacks.length > 4 ? '; ...' : ''}` : '-'),
  );
}

console.log(violations === 0
  ? '\nCHARACTERIZATION HOLDS: white in check at move 0 <=> bottom edge glued onto top edge (all topologies)'
  : `\n${violations} CHARACTERIZATION VIOLATIONS`);
process.exit(violations === 0 ? 0 : 1);
