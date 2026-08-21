// award-xp — server-side XP award for task completion.
//
// The client never decides reward amounts. This function verifies the caller's
// Clerk session token and then delegates the actual award to a database
// function (award_task_xp / award_weekly_review_xp in migration 0011). Those
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

import { corsHeaders } from '../_shared/cors.ts';
import { isoWeekKey } from '../_shared/iso-week.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

function json(body: unknown, req: Request, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
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
