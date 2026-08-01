// Edge-runtime main router for the SELF-HOSTED stack only (selfhost/). The
// hosted Supabase platform provides its own router; this file exists so the
// supabase/edge-runtime container can dispatch /<function-name> requests to
// the sibling function directories. Adapted from the upstream reference
// (supabase/supabase docker/volumes/functions/main/index.ts), minus JWT
// pre-verification: every function here resolves the caller itself via
// requireUser() and returns 401, so the router stays out of the way (and
// CORS preflights pass untouched).

const FUNCTIONS_BASE = '/home/deno/functions';

Deno.serve(async (req: Request) => {
  const { pathname } = new URL(req.url);
  const serviceName = pathname.split('/')[1];

  if (!serviceName) {
    return new Response(JSON.stringify({ msg: 'missing function name in request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const envVarsObj = Deno.env.toObject();
  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `${FUNCTIONS_BASE}/${serviceName}`,
      memoryLimitMb: 150,
      workerTimeoutMs: 60 * 1000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.entries(envVarsObj),
    });
    return await worker.fetch(req);
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ msg: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
