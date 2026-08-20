// Per-move Web Push: subscribe this browser to move notifications. Fully
// self-hosted - the VAPID keypair is ours (public half in
// VITE_VAPID_PUBLIC_KEY), the server half signs sends from the submit-move
// function, and the only third party is the push service the user's own
// browser picked. The service worker (public/sw.js) shows the notification
// and focuses the game on click.
//
// A subscription belongs to (browser, account): the push_subscriptions row is
// RLS-scoped to the signed-in player, keyed by the browser's endpoint.

import { requireClient } from './client';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on';

function swSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('./sw.js');
}

export async function pushState(): Promise<PushState> {
  if (!swSupported()) return 'unsupported';
  if (!VAPID_PUBLIC) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub ? 'on' : 'off';
}

function keyBytes(b64u: string): Uint8Array {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function subKey(sub: PushSubscription, name: 'p256dh' | 'auth'): string {
  const buf = sub.getKey(name);
  if (!buf) throw new Error(`subscription is missing ${name}`);
  let s = '';
  for (const x of new Uint8Array(buf)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Subscribe this browser and store the subscription for `userId`. Throws with
// a human-readable message on refusal/failure.
export async function enablePush(userId: string): Promise<void> {
  if (!swSupported()) throw new Error('this browser does not support push notifications');
  if (!VAPID_PUBLIC) throw new Error('push is not configured on this deployment');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('notification permission was not granted');

  const reg = await registration();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(VAPID_PUBLIC) as BufferSource,
  });

  const client = requireClient();
  // The endpoint is unique per (browser, subscription); replace any stale row
  // (e.g. the same browser previously subscribed under another account).
  await client.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  const { error } = await client.from('push_subscriptions').insert({
    player: userId,
    endpoint: sub.endpoint,
    p256dh: subKey(sub, 'p256dh'),
    auth: subKey(sub, 'auth'),
  });
  if (error) {
    await sub.unsubscribe().catch(() => {});
    throw new Error(error.message);
  }
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await requireClient().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
