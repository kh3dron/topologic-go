// Self-hosted client error reporting; imported for its side effect by every
// page entry. window errors and unhandled rejections POST to the backend's
// report-error function (see supabase/functions/report-error). No third-party
// trackers, no identifiers beyond the browser's user agent; usage analytics
// stay derivable from the games tables, so nothing else is collected.
// Fail-silent by construction: reporting must never break the app, so every
// path swallows its own errors. Disabled when the backend env is absent
// (local dev without .env). At most 5 reports per page load, deduped by
// message, so an error in a render loop cannot flood the backend.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const sent = new Set<string>();
let budget = 5;

function report(message: string, stack?: string): void {
  if (!url || !anon || budget <= 0 || sent.has(message)) return;
  sent.add(message);
  budget--;
  try {
    fetch(`${url}/functions/v1/report-error`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({
        message: message.slice(0, 500),
        stack: stack?.slice(0, 4000),
        page: location.pathname + location.search,
        version: __APP_VERSION__,
      }),
    }).catch(() => {});
  } catch {
    // fetch itself threw (CSP, malformed URL): stay silent
  }
}

window.addEventListener('error', (e) => {
  report(String(e.message ?? 'unknown error'), e.error instanceof Error ? e.error.stack : undefined);
});

window.addEventListener('unhandledrejection', (e) => {
  const r: unknown = e.reason;
  if (r instanceof Error) report(`unhandled rejection: ${r.message}`, r.stack);
  else report(`unhandled rejection: ${String(r).slice(0, 200)}`);
});
