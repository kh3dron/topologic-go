// Self-hosted Web Push: RFC 8291 (aes128gcm message encryption) + RFC 8292
// (VAPID) implemented directly on WebCrypto - no third-party push provider
// and no npm dependency; the only external parties are the push services the
// user's own browser chose (the subscription endpoint). Keys come from the
// environment: VAPID_PUBLIC_KEY (base64url uncompressed P-256 point),
// VAPID_PRIVATE_KEY (base64url 32-byte scalar d), VAPID_SUBJECT (mailto:).
//
// notifyPlayer() is best-effort by design: a move must never fail because a
// push service is down, so every send is raced against a timeout, errors are
// logged and swallowed, and dead subscriptions (404/410) are deleted.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const enc = new TextEncoder();

function b64uToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function bytesToB64u(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    len * 8,
  );
  return new Uint8Array(bits);
}

interface Vapid {
  publicKey: string;  // base64url uncompressed point (65 bytes)
  privateKey: string; // base64url scalar d (32 bytes)
  subject: string;    // mailto:
}

function vapidFromEnv(): Vapid | null {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@kh3dron.net' };
}

async function vapidJwt(vapid: Vapid, audience: string): Promise<string> {
  const pub = b64uToBytes(vapid.publicKey);
  const x = bytesToB64u(pub.slice(1, 33));
  const y = bytesToB64u(pub.slice(33, 65));
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d: vapid.privateKey },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64u(enc.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: vapid.subject,
  })));
  const signingInput = `${header}.${claims}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(signingInput) as BufferSource,
  );
  return `${signingInput}.${bytesToB64u(new Uint8Array(sig))}`;
}

// RFC 8291: encrypt `plaintext` for a subscription's (p256dh, auth) keys.
async function encryptPayload(p256dh: string, auth: string, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64uToBytes(p256dh);
  const authSecret = b64uToBytes(auth);

  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey(
    'raw', uaPublic as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  // IKM = HKDF(auth, ecdh, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublicRaw), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  // Single record: plaintext || 0x02 delimiter (last record), AES-128-GCM.
  const padded = concat(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, aesKey, padded as BufferSource),
  );

  // Header: salt(16) | rs(4) | idlen(1) | keyid(65) then the one record.
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublicRaw.length]), asPublicRaw, ciphertext);
}

export interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Sends one push. Returns 'ok', 'gone' (subscription dead - delete it), or
// 'error'.
export async function sendWebPush(
  sub: PushSubscriptionRow,
  payload: unknown,
  vapid: Vapid,
): Promise<'ok' | 'gone' | 'error'> {
  try {
    const url = new URL(sub.endpoint);
    const jwt = await vapidJwt(vapid, `${url.protocol}//${url.host}`);
    const body = await encryptPayload(sub.p256dh, sub.auth, enc.encode(JSON.stringify(payload)));
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'normal',
      },
      body: body as BodyInit,
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    if (!res.ok) {
      console.error(`webpush: ${res.status} from ${url.host}: ${await res.text()}`);
      return 'error';
    }
    return 'ok';
  } catch (e) {
    console.error(`webpush: send failed: ${e instanceof Error ? e.message : e}`);
    return 'error';
  }
}

// Best-effort notify: all of a player's subscriptions in parallel, each raced
// against a 3s timeout; dead subscriptions are deleted. Never throws.
export async function notifyPlayer(
  svc: SupabaseClient,
  playerId: string,
  payload: { title: string; body: string; path: string },
): Promise<void> {
  try {
    const vapid = vapidFromEnv();
    if (!vapid) return; // push not configured on this deployment
    const { data: subs } = await svc
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('player', playerId);
    if (!subs || subs.length === 0) return;

    const timeout = new Promise<'error'>(r => setTimeout(() => r('error'), 3000));
    const results = await Promise.all(
      subs.map(s => Promise.race([sendWebPush(s as PushSubscriptionRow, payload, vapid), timeout])),
    );
    const dead = subs.filter((_, i) => results[i] === 'gone').map(s => s.id);
    if (dead.length > 0) {
      await svc.from('push_subscriptions').delete().in('id', dead);
    }
  } catch (e) {
    console.error(`webpush: notify failed: ${e instanceof Error ? e.message : e}`);
  }
}
