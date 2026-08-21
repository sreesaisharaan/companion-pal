// delete-account — permanent account deletion.
//
// The client cannot delete itself: deleting a Clerk user requires the secret
// key. This function verifies the caller's Clerk session token, deletes the
// Clerk user via the Clerk Backend API, then removes their profile row. Every
// other table (tasks, transactions, budget_categories, companions, xp_events)
// cascades from profiles — so one delete removes everything, with no orphaned
// rows.
//
// The user is prompted twice in the UI before this is ever called; this
// function itself is deliberately unguarded beyond token verification, because
// the user has the right to delete their own account at any time.
//
// Deployment: `supabase secrets set CLERK_SECRET_KEY=...` then
// `supabase functions deploy delete-account`.

import { verifyToken } from 'npm:@clerk/backend@1';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authorization = req.headers.get('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : authorization;
  if (!token) return json({ error: 'missing authorization' }, 401);

  const secretKey = Deno.env.get('CLERK_SECRET_KEY') ?? '';
  if (!secretKey) return json({ error: 'CLERK_SECRET_KEY is not configured' }, 500);

  let userId: string | null = null;
  try {
    const payload = await verifyToken(token, { secretKey });
    userId = payload.sub ?? null;
  } catch {
    return json({ error: 'unauthorized' }, 401);
  }
  if (!userId) return json({ error: 'unauthorized' }, 401);

  // 1. Delete the Clerk user. Idempotent: a retry after a lost response must
  //    still report success, so a 404 is treated as already-deleted.
  const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (clerkResponse.status !== 404 && !clerkResponse.ok) {
    return json({ error: 'could not delete the account' }, 500);
  }

  // 2. Remove the profile row; every user table cascades from it. The service
  //    role bypasses RLS, so this is the one place an authenticated user's
  //    rows can be deleted wholesale.
  const { error } = await supabase.from('profiles').delete().eq('id', userId);
  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({ deleted: true });
});
