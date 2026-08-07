// delete-account — permanent account deletion.
//
// The client cannot delete itself: deleting an auth user requires the service
// role. This function verifies the caller's JWT, then deletes their auth user.
// profiles.id references auth.users (id) on delete cascade, and every other
// table (tasks, transactions, budget_categories, companions, xp_events) cascades
// from profiles — so one delete removes everything, with no orphaned rows.
//
// The user is prompted twice in the UI before this is ever called; this
// function itself is deliberately unguarded beyond JWT verification, because
// the user has the right to delete their own account at any time.

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

  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  const { error } = await supabase.auth.admin.deleteUser(userId);
  // Idempotent: if a previous call already deleted the user but the response
  // was lost, the retry must still report success rather than an error.
  if (error && error.code !== 'user_not_found' && !/not found/i.test(error.message)) {
    return json({ error: error.message }, 500);
  }

  return json({ deleted: true });
});
