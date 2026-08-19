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

// Cloudflare fronts the API, and its edge occasionally answers with a
// transient HTML error page where JSON belongs; retry those once instead of
// crashing the run. An empty body (204) is not an error and never retried.
async function jfetch(url, opts, tries = 2) {
  for (let i = 1; ; i++) {
    const r = await fetch(url, opts);
    const text = await r.text();
    try {
      return { status: r.status, body: text ? JSON.parse(text) : null };
    } catch {
      if (i >= tries) return { status: r.status, body: null };
      await new Promise((res) => setTimeout(res, 1500));
    }
  }
}

async function adminCreateUser(email, password, meta) {
  const { body } = await jfetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: meta ?? {} }),
  });
  return body?.id;
}
// Authenticated PostgREST call with a user token (RLS applies).
function rest(path, token, opts = {}) {
  return jfetch(`${URL}/rest/v1/${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}
async function svcSelect(path) {
  const { body } = await jfetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  });
  return body ?? [];
}
async function signIn(email, password) {
  const { body } = await jfetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return body?.access_token;
}
async function fn(name, token, body) {
  const r = await jfetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: r.body ?? {} };
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

  // ==================== chess specials: castling + en passant ====================
  // The deployed engine must accept a castle, accept an en passant capture
  // inside its one-ply window, and reject the same capture once the window
  // has closed. A plays white (creator is seated white), B black.
  const playout = async (id, tokWhite, tokBlack, seq) => {
    let last = null;
    for (let i = 0; i < seq.length; i++) {
      last = await fn('submit-move', i % 2 === 0 ? tokWhite : tokBlack,
        { game_id: id, expected_ply: i, move: { from: seq[i][0], to: seq[i][1] } });
      if (last.status !== 200) return { failedAt: i, ...last };
    }
    return last;
  };
  const newChessGame = async () => {
    const c = await fn('create-game', tokA, { variant: 'chess', topology: 'classic' });
    const id = c.body.game?.id;
    if (id) gameIds.push(id);
    await fn('join-game', tokB, { game_id: id });
    return id;
  };

  const castleId = await newChessGame();
  const castled = await playout(castleId, tokA, tokB, [
    [[7, 6], [5, 5]], [[0, 6], [2, 5]], // Nf3, Nf6
    [[6, 6], [5, 6]], [[1, 6], [2, 6]], // g3, g6
    [[7, 5], [6, 6]], [[0, 5], [1, 6]], // Bg2, Bg7
    [[7, 4], [7, 6]],                   // O-O
  ]);
  const cb = castled.body?.game?.board_state?.board;
  ok('castling accepted server-side', castled.status === 200
    && cb?.[7]?.[6]?.type === 'king' && cb?.[7]?.[5]?.type === 'rook' && cb?.[7]?.[7] === null
    && castled.body.game?.board_state?.castling?.whiteK === false,
    `status=${castled.status} failedAt=${castled.failedAt ?? '-'}`);

  const epId = await newChessGame();
  const eped = await playout(epId, tokA, tokB, [
    [[6, 4], [4, 4]], [[1, 0], [2, 0]], // e4, a6
    [[4, 4], [3, 4]], [[1, 3], [3, 3]], // e5, d5 (double step past e5)
    [[3, 4], [2, 3]],                   // exd6 en passant
  ]);
  const eb = eped.body?.game?.board_state?.board;
  ok('en passant accepted inside its window', eped.status === 200
    && eb?.[2]?.[3]?.type === 'pawn' && eb?.[2]?.[3]?.color === 'white' && eb?.[3]?.[3] === null,
    `status=${eped.status} failedAt=${eped.failedAt ?? '-'}`);

  const lateId = await newChessGame();
  await playout(lateId, tokA, tokB, [
    [[6, 4], [4, 4]], [[1, 0], [2, 0]], // e4, a6
    [[4, 4], [3, 4]], [[1, 3], [3, 3]], // e5, d5
    [[6, 0], [5, 0]], [[1, 7], [2, 7]], // a3, h6 (window closes)
  ]);
  const lateEp = await fn('submit-move', tokA, { game_id: lateId, expected_ply: 6, move: { from: [3, 4], to: [2, 3] } });
  ok('en passant rejected after the window closes', lateEp.status === 422, `status=${lateEp.status}`);

  // ==================== off-board actions: resign + draw offers ====================
  // game-action(game_id, action). Resign works off turn; an offer is cleared
  // by any applied move; accept ends the game as a draw with no on-board end.
  const resignId = await newChessGame();
  const offTurnResign = await fn('game-action', tokB, { game_id: resignId, action: 'resign' }); // white to move, black resigns
  ok('resign accepted off turn', offTurnResign.status === 200
    && offTurnResign.body.game?.status === 'done' && offTurnResign.body.game?.winner === aId
    && offTurnResign.body.game?.turn === null,
    `status=${offTurnResign.status} winner=${offTurnResign.body.game?.winner === aId ? 'A' : offTurnResign.body.game?.winner}`);

  const resignDone = await fn('game-action', tokA, { game_id: resignId, action: 'resign' });
  ok('action on a done game rejected', resignDone.status === 409, `status=${resignDone.status}`);

  const drawId = await newChessGame();
  const offer = await fn('game-action', tokA, { game_id: drawId, action: 'offer-draw' });
  ok('draw offer lands', offer.status === 200 && offer.body.game?.draw_offer === aId, `status=${offer.status}`);

  const reOffer = await fn('game-action', tokB, { game_id: drawId, action: 'offer-draw' });
  ok('counter-offer rejected while one is pending', reOffer.status === 409, `status=${reOffer.status}`);

  const selfAcceptDraw = await fn('game-action', tokA, { game_id: drawId, action: 'accept-draw' });
  ok('offerer cannot accept own offer', selfAcceptDraw.status === 409, `status=${selfAcceptDraw.status}`);

  const moveClears = await fn('submit-move', tokA, { game_id: drawId, expected_ply: 0, move: { from: [6, 4], to: [4, 4] } });
  ok('applied move clears the pending offer', moveClears.status === 200 && moveClears.body.game?.draw_offer === null,
    `status=${moveClears.status} draw_offer=${moveClears.body.game?.draw_offer}`);

  const staleAccept = await fn('game-action', tokB, { game_id: drawId, action: 'accept-draw' });
  ok('accept after the offer was cleared rejected', staleAccept.status === 409, `status=${staleAccept.status}`);

  const offer2 = await fn('game-action', tokB, { game_id: drawId, action: 'offer-draw' });
  const accepted = await fn('game-action', tokA, { game_id: drawId, action: 'accept-draw' });
  ok('accepted draw ends the game', offer2.status === 200 && accepted.status === 200
    && accepted.body.game?.status === 'done' && accepted.body.game?.winner === null
    && accepted.body.game?.draw_offer === null,
    `offer=${offer2.status} accept=${accepted.status} winner=${accepted.body.game?.winner}`);

  // ==================== ratings (Elo trigger on active -> done) ====================
  // Both users started this run at 1200. The resign gave A a win (+16/-16);
  // the agreed draw then moved a point back to the lower-rated B. Deltas are
  // zero-sum, so the pair always sums to 2400.
  const ratingOf = async (id) => (await svcSelect(`profiles?id=eq.${id}&select=rating`))[0]?.rating;
  const [rA, rB] = [await ratingOf(aId), await ratingOf(bId)];
  ok('resign updated ratings (winner up, zero-sum)', rA > 1200 && rA + rB === 2400, `A=${rA} B=${rB}`);
  ok('agreed draw rated (favorite gave up a point)', rA === 1215 && rB === 1185, `A=${rA} B=${rB}`);

  // ==================== registration usernames ====================
  cId = await adminCreateUser(emailC, pw, { username: usernameC });
  const tokC = await signIn(emailC, pw);
  const [profC] = await svcSelect(`profiles?id=eq.${cId}&select=username`);
  ok('signup: chosen username lands on profile', profC?.username === usernameC, `got=${profC?.username}`);

  // C is not seated in A/B's game -> no off-board actions.
  const outsiderResign = await fn('game-action', tokC, { game_id: gameId, action: 'resign' });
  ok('non-seated player cannot resign a game', outsiderResign.status === 403, `status=${outsiderResign.status}`);

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

  // ==================== snake scores (replay-validated writes) ====================
  // Hand-crafted deterministic run on 'classic': the rand values place food
  // exactly where the log expects it. Start: body (6,4)-(6,6), heading right.
  // rand r places food at free cell floor(r * freeCount) in row-major order.
  const foodAt = (cellIdx, occupiedBefore, occupiedTotal) =>
    (cellIdx - occupiedBefore + 0.5) / (169 - occupiedTotal);
  // Run 1 (score 1): food at (6,7), one tick right eats it, respawn at (0,0),
  // steer up and run off the top wall.
  const run1 = {
    topology: 'classic',
    food_rands: [foodAt(6 * 13 + 7, 3, 3), 0],
    events: [-4, 1, -1, 7],
  };
  const sub1 = await fn('submit-snake-score', tokC, run1);
  ok('snake score accepted (replayed)', sub1.status === 200 && sub1.body.score === 1 && sub1.body.improved === true,
    `status=${sub1.status} body=${JSON.stringify(sub1.body)}`);

  const sub1again = await fn('submit-snake-score', tokC, run1);
  ok('equal score does not improve best', sub1again.status === 200 && sub1again.body.improved === false
    && sub1again.body.best === 1, `body=${JSON.stringify(sub1again.body)}`);

  // Run 2 (score 2): second food at (6,8), eaten on the next tick.
  const run2 = {
    topology: 'classic',
    food_rands: [foodAt(6 * 13 + 7, 3, 3), foodAt(6 * 13 + 8, 4, 4), 0],
    events: [-4, 2, -1, 7],
  };
  const sub2 = await fn('submit-snake-score', tokC, run2);
  ok('better run replaces best', sub2.status === 200 && sub2.body.score === 2 && sub2.body.improved === true,
    `body=${JSON.stringify(sub2.body)}`);

  const unfinished = await fn('submit-snake-score', tokC, { topology: 'classic', food_rands: [0.5], events: [-4, 1] });
  ok('unfinished run rejected', unfinished.status === 422, `status=${unfinished.status}`);

  const forgedScore = await rest('snake_scores', tokC,
    { method: 'POST', body: { player: cId, topology: 'torus', score: 999 } });
  ok('client cannot write snake_scores directly', forgedScore.status === 403 || forgedScore.status === 401,
    `status=${forgedScore.status}`);

  const bestRows = await svcSelect(`snake_scores?player=eq.${cId}&select=topology,score`);
  ok('one best row per (player, topology)', bestRows.length === 1 && bestRows[0]?.score === 2,
    `rows=${JSON.stringify(bestRows)}`);
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
