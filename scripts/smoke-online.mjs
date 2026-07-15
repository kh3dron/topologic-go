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

async function adminCreateUser(email, password, meta) {
  const r = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: meta ?? {} }),
  });
  const j = await r.json();
  return j.id;
}
// Authenticated PostgREST call with a user token (RLS applies).
async function rest(path, token, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function svcSelect(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  });
  return r.json();
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
const emailC = `smoke-c-${randomUUID().slice(0, 8)}@example.com`;
const emailD = `smoke-d-${randomUUID().slice(0, 8)}@example.com`;
const usernameC = `smoke_c_${randomUUID().slice(0, 6).replace(/-/g, '_')}`;
let aId, bId, cId, dId, gameId;
const gameIds = [];

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

  // ==================== registration usernames ====================
  cId = await adminCreateUser(emailC, pw, { username: usernameC });
  const tokC = await signIn(emailC, pw);
  const [profC] = await svcSelect(`profiles?id=eq.${cId}&select=username`);
  ok('signup: chosen username lands on profile', profC?.username === usernameC, `got=${profC?.username}`);

  // Same username again -> trigger must dodge the collision, not abort signup.
  dId = await adminCreateUser(emailD, pw, { username: usernameC });
  const [profD] = dId ? await svcSelect(`profiles?id=eq.${dId}&select=username`) : [null];
  ok('signup: duplicate username gets a suffix', !!dId && !!profD && profD.username !== usernameC,
    `got=${profD?.username}`);

  // ==================== friendships (RLS-guarded client writes) ====================
  const req = await rest('friendships', tokA, { method: 'POST', body: { requester: aId, addressee: bId } });
  ok('friend request insert', req.status === 201, `status=${req.status}`);

  const forged = await rest('friendships', tokA, { method: 'POST', body: { requester: bId, addressee: aId } });
  ok('forged request (as someone else) rejected', forged.status === 403 || forged.status === 401,
    `status=${forged.status}`);

  const selfAccept = await rest(`friendships?requester=eq.${aId}&addressee=eq.${bId}`, tokA,
    { method: 'PATCH', body: { status: 'accepted' } });
  const stillPending = await svcSelect(`friendships?requester=eq.${aId}&addressee=eq.${bId}&select=status`);
  ok('requester cannot self-accept', Array.isArray(selfAccept.body) && selfAccept.body.length === 0
    && stillPending[0]?.status === 'pending', `rows=${selfAccept.body?.length} status=${stillPending[0]?.status}`);

  const accept = await rest(`friendships?requester=eq.${aId}&addressee=eq.${bId}`, tokB,
    { method: 'PATCH', body: { status: 'accepted' } });
  ok('addressee accepts', accept.status === 200 && accept.body?.[0]?.status === 'accepted',
    `status=${accept.status}`);

  // ==================== challenges (invited games) ====================
  const chal = await fn('create-game', tokA, { variant: 'go', topology: 'torus', opponent: cId });
  const chalId = chal.body.game?.id;
  if (chalId) gameIds.push(chalId);
  ok('create challenge', chal.status === 200 && chal.body.game?.invited_player === cId,
    `status=${chal.status}`);

  const gatecrash = await fn('join-game', tokB, { game_id: chalId });
  ok('non-invited join rejected', gatecrash.status === 403, `status=${gatecrash.status}`);

  const invitedJoin = await fn('join-game', tokC, { game_id: chalId });
  ok('invited player joins', invitedJoin.status === 200 && invitedJoin.body.game?.status === 'active'
    && invitedJoin.body.game?.turn === cId, // go: black (joiner) moves first
    `status=${invitedJoin.status}`);

  const selfChal = await fn('create-game', tokA, { variant: 'chess', topology: 'classic', opponent: aId });
  ok('cannot challenge yourself', selfChal.status === 400, `status=${selfChal.status}`);

  // ==================== cancel-game ====================
  const chal2 = await fn('create-game', tokA, { variant: 'chess', topology: 'classic', opponent: bId });
  const chal2Id = chal2.body.game?.id;
  if (chal2Id) gameIds.push(chal2Id);
  const cancelStranger = await fn('cancel-game', tokC, { game_id: chal2Id });
  ok('stranger cannot cancel', cancelStranger.status === 403, `status=${cancelStranger.status}`);
  const decline = await fn('cancel-game', tokB, { game_id: chal2Id });
  const declinedRow = await svcSelect(`games?id=eq.${chal2Id}&select=id`);
  ok('invitee declines (game deleted)', decline.status === 200 && declinedRow.length === 0,
    `status=${decline.status} rows=${declinedRow.length}`);

  const open2 = await fn('create-game', tokA, { variant: 'chess', topology: 'classic' });
  const open2Id = open2.body.game?.id;
  if (open2Id) gameIds.push(open2Id);
  const creatorCancel = await fn('cancel-game', tokA, { game_id: open2Id });
  ok('creator cancels own open game', creatorCancel.status === 200, `status=${creatorCancel.status}`);

  const cancelActive = await fn('cancel-game', tokA, { game_id: gameId });
  ok('active game cannot be cancelled', cancelActive.status === 409, `status=${cancelActive.status}`);
} finally {
  // cleanup (games first: they reference profiles without cascade)
  for (const id of [gameId, ...gameIds].filter(Boolean)) {
    await fetch(`${URL}/rest/v1/games?id=eq.${id}`, {
      method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, Prefer: 'return=minimal' },
    }).catch(() => {});
  }
  for (const id of [aId, bId, cId, dId].filter(Boolean)) await adminDeleteUser(id);
}

console.log('\n=== ONLINE SMOKE TEST ===');
let all = true;
for (const [name, pass, detail] of results) { all = all && pass; console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? '  (' + detail + ')' : ''}`); }
console.log(all ? '\nALL PASS (test users + game cleaned up)' : '\nFAILURES PRESENT (test users + game cleaned up)');
process.exit(all ? 0 : 1);
