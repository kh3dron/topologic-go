// End-to-end smoke test of the online backend against the live project.
// Creates two throwaway users, runs a full game handshake, and asserts the
// server-authoritative validation accepts legal moves and rejects illegal /
// out-of-turn / stale ones. Cleans up the users + game afterwards.
//
// Env (never printed): SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY
import { randomUUID } from 'node:crypto';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.ANON_KEY;
const SVC = process.env.SERVICE_ROLE_KEY;
if (!URL || !ANON || !SVC) { console.error('missing env'); process.exit(2); }

const results = [];
const ok = (name, pass, detail = '') => results.push([name, pass, detail]);

async function adminCreateUser(email, password) {
  const r = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const j = await r.json();
  return j.id;
}
async function signIn(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  return j.access_token;
}
async function fn(name, token, body) {
  const r = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function adminDeleteUser(id) {
  await fetch(`${URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  }).catch(() => {});
}

const pw = 'Test-' + randomUUID();
const emailA = `smoke-a-${randomUUID().slice(0, 8)}@example.com`;
const emailB = `smoke-b-${randomUUID().slice(0, 8)}@example.com`;
let aId, bId, gameId;

try {
  aId = await adminCreateUser(emailA, pw);
  bId = await adminCreateUser(emailB, pw);
  const tokA = await signIn(emailA, pw);
  const tokB = await signIn(emailB, pw);
  ok('auth: two users signed in', !!tokA && !!tokB);

  // Unauthenticated create -> 401
  const unauth = await fetch(`${URL}/functions/v1/create-game`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ variant: 'chess', topology: 'classic' }),
  });
  ok('unauthenticated create-game rejected', unauth.status === 401, `status=${unauth.status}`);

  // A creates a chess game
  const created = await fn('create-game', tokA, { variant: 'chess', topology: 'classic' });
  gameId = created.body.game?.id;
  ok('create-game', created.status === 200 && created.body.game?.status === 'waiting'
    && created.body.game?.white_player === aId && created.body.game?.ply === 0,
    `status=${created.status} game.status=${created.body.game?.status}`);

  // A cannot join own game
  const selfJoin = await fn('join-game', tokA, { game_id: gameId });
  ok('cannot join own game', selfJoin.status === 409, `status=${selfJoin.status}`);

  // B joins -> active, white(A) to move
  const joined = await fn('join-game', tokB, { game_id: gameId });
  ok('join-game', joined.status === 200 && joined.body.game?.status === 'active'
    && joined.body.game?.black_player === bId && joined.body.game?.turn === aId,
    `status=${joined.status} turn=${joined.body.game?.turn === aId ? 'A' : joined.body.game?.turn}`);

  // A plays a legal move e2-e4 (row6col4 -> row4col4)
  const legal = await fn('submit-move', tokA, { game_id: gameId, expected_ply: 0, move: { from: [6, 4], to: [4, 4] } });
  const b = legal.body.game?.board_state?.board;
  ok('legal move accepted', legal.status === 200 && legal.body.game?.ply === 1
    && legal.body.game?.turn === bId && b?.[4]?.[4]?.type === 'pawn' && b?.[6]?.[4] === null,
    `status=${legal.status} ply=${legal.body.game?.ply}`);

  // A tries to move again -> not your turn (403)
  const wrongTurn = await fn('submit-move', tokA, { game_id: gameId, expected_ply: 1, move: { from: [6, 0], to: [5, 0] } });
  ok('out-of-turn rejected', wrongTurn.status === 403, `status=${wrongTurn.status}`);

  // B plays an illegal move (pawn 3 squares) -> 422
  const illegal = await fn('submit-move', tokB, { game_id: gameId, expected_ply: 1, move: { from: [1, 4], to: [4, 4] } });
  ok('illegal move rejected', illegal.status === 422, `status=${illegal.status} body=${JSON.stringify(illegal.body)}`);

  // B plays with stale ply (0) -> 409
  const stale = await fn('submit-move', tokB, { game_id: gameId, expected_ply: 0, move: { from: [1, 4], to: [3, 4] } });
  ok('stale ply rejected', stale.status === 409, `status=${stale.status}`);

  // B plays a legal move -> ply 2, back to A
  const bMove = await fn('submit-move', tokB, { game_id: gameId, expected_ply: 1, move: { from: [1, 4], to: [3, 4] } });
  ok('black legal move accepted', bMove.status === 200 && bMove.body.game?.ply === 2 && bMove.body.game?.turn === aId,
    `status=${bMove.status} ply=${bMove.body.game?.ply}`);
} finally {
  // cleanup
  if (gameId) await fetch(`${URL}/rest/v1/games?id=eq.${gameId}`, {
    method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, Prefer: 'return=minimal' },
  }).catch(() => {});
  if (aId) await adminDeleteUser(aId);
  if (bId) await adminDeleteUser(bId);
}

console.log('\n=== ONLINE SMOKE TEST ===');
let all = true;
for (const [name, pass, detail] of results) { all = all && pass; console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? '  (' + detail + ')' : ''}`); }
console.log(all ? '\nALL PASS (test users + game cleaned up)' : '\nFAILURES PRESENT (test users + game cleaned up)');
process.exit(all ? 0 : 1);
