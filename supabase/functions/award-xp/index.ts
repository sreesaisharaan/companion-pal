// award-xp — server-side XP award for task completion.
//
// The client never decides reward amounts. This function verifies the caller's
// Clerk session token and then delegates the actual award to a database
// function (award_task_xp / award_weekly_review_xp in migration 0007). Those
// RPCs run with the service role, serialise per user with a row lock (so the
// 50 XP/day cap can't be overshot by concurrent completions), and keep the
// companion's derived XP/stage consistent with the ledger under concurrency.
// The weekly review has its own once-per-week budget and is excluded from the
// task cap.
//
// Deployment: `supabase db push` (applies the RPCs), then
// `supabase secrets set CLERK_SECRET_KEY=...` and
// `supabase functions deploy award-xp`.

import { verifyToken } from 'npm:@clerk/backend@1';
import { createClient } from 'npm:@supabase/supabase-js@2';

// CORS answers are computed per request. By default any origin is allowed
// (dev convenience); set the ALLOWED_ORIGINS secret to a comma-separated list
// to restrict the function to specific web origins. OPTIONS preflights carry
// no Authorization header, so they are answered before the auth check —
// otherwise every web client is blocked by CORS.
function allowedOrigin(req: Request): string | null {
  const allowlist = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length === 0) return '*';
  return req.headers.get('Origin') ?? null;
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = allowedOrigin(req);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

function json(body: unknown, req: Request, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

/** ISO-8601 week key (e.g. "2026-32") — weekly reviews are unique per week. */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
  // 0. Answer CORS preflights before anything else.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  // 1. Identify the caller from their Clerk session token.
  const authorization = req.headers.get('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : authorization;
  if (!token) return json({ error: 'missing authorization' }, req, 401);

  const secretKey = Deno.env.get('CLERK_SECRET_KEY') ?? '';
  if (!secretKey) return json({ error: 'CLERK_SECRET_KEY is not configured' }, req, 500);

  let userId: string | null = null;
  try {
    const payload = await verifyToken(token, { secretKey });
    userId = payload.sub ?? null;
  } catch {
    return json({ error: 'unauthorized' }, req, 401);
  }
  if (!userId) return json({ error: 'unauthorized' }, req, 401);

  // 2. Read and validate the payload.
  let taskId: string | undefined;
  let source: string | undefined;
  try {
    ({ task_id: taskId, source } = await req.json());
  } catch {
    return json({ error: 'invalid JSON body' }, req, 400);
  }

  // 3. Weekly review path: no task, +15 XP, once per ISO week (idempotent
  //    server-side, exempt from the task daily cap).
  if (!taskId && source === 'weekly_review') {
    const { data, error } = await supabase.rpc('award_weekly_review_xp', {
      p_user_id: userId,
      p_idempotency_key: `weekly_review:${isoWeekKey(new Date())}`,
    });
    if (error) return json({ error: error.message }, req, 500);
    return json(data as object, req);
  }

  // 4. Anything else is a task completion — task_id is required.
  if (typeof taskId !== 'string' || !taskId) {
    return json({ error: 'task_id is required (or source: weekly_review)' }, req, 400);
  }

  const { data, error } = await supabase.rpc('award_task_xp', {
    p_user_id: userId,
    p_task_id: taskId,
  });
  if (error) return json({ error: error.message }, req, 500);

  const result = (data ?? {}) as { error?: string };
  if (result.error) {
    return json({ error: result.error }, req, result.error === 'task not found' ? 404 : 400);
  }
  return json(result, req);
});
