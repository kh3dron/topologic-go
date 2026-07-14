// Headless move-zero census + registry smoke test. Proves the engine runs
// entirely outside the browser (no DOM): it evaluates every (game, topology)
// pair from the starting position and round-trips each game through its
// GameModule serializer. This is the project's research instrument — which
// topologies yield a live game at move zero.
//
// Run with a TS runner, e.g.:  npx tsx scripts/census.ts
// (No test framework is configured; tsx is not a committed dependency.)

import { TOPOLOGIES, TOPOLOGY_MAP } from '../src/topology';
import { variantVerdict } from '../src/census';
import { GAMES } from '../src/engine';

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

console.log('=== MOVE-ZERO CENSUS ===');
console.log(pad('GAME', 6) + pad('TOPOLOGY', 13) + pad('MOVE-0', 27) + pad('SING', 5) + 'VERDICT');
for (const game of ['chess', 'go'] as const) {
  for (const topo of TOPOLOGIES) {
    const { moveZero, singular, verdict } = variantVerdict(game, topo);
    console.log(pad(game, 6) + pad(topo.id, 13) + pad(moveZero, 27) + pad(String(singular), 5) + verdict);
  }
}

console.log('\n=== REGISTRY SERIALIZE ROUND-TRIP ===');
const classic = TOPOLOGY_MAP.get('classic')!;
let ok = true;
for (const [id, mod] of GAMES) {
  const board = mod.boardFamily === 'square-grid' ? classic : null;
  const state = mod.initialState(board);
  const once = JSON.stringify(mod.serialize(state));
  const twice = JSON.stringify(mod.serialize(mod.deserialize(mod.serialize(state))));
  const pass = once === twice;
  ok = ok && pass;
  console.log(`${pad(id, 12)} family=${pad(mod.boardFamily, 13)} round-trip=${pass ? 'OK' : 'FAIL'}`);
}

if (!ok) {
  console.error('\nSerialize round-trip FAILED');
  process.exit(1);
}
console.log('\nAll good.');
