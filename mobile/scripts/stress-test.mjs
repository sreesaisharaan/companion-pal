// Stress-test helper for the live Supabase project (test account only).
// Usage (from mobile/): E2E_EMAIL=... E2E_PASSWORD=... node scripts/stress-test.mjs seed|concurrency|cleanup
// - seed:        inserts 400 marked tasks + 400 marked transactions
// - concurrency: fires parallel award-xp / weekly-review / category-creation requests
// - cleanup:     deletes every row marked with the STRESS prefix/note
// Every write goes through the anon key + the test account's JWT, so RLS applies
// exactly as it does for the app. Markers: task title "STRESS-TASK-###",
// transaction note "STRESS", category name "STRESS-CAT-###".
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const MODE = process.argv[2] ?? 'seed';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Set E2E_EMAIL and E2E_PASSWORD (the confirmed test account).');
  process.exit(2);
}

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error('EXPO_PUBLIC_SUPABASE_URL / ANON_KEY missing from .env');
  process.exit(2);
}

const supabase = createClient(url, anon);

function pad(n, w) {
  return String(n).padStart(w, '0');
}

async function main() {
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (authError || !auth.session) {
    console.error('sign-in failed:', authError?.message);
    process.exit(1);
  }
  const userId = auth.user.id;
  console.log(`signed in as ${EMAIL} (${userId})`);

  if (MODE === 'seed') {
    await seed(userId);
  } else if (MODE === 'concurrency') {
    await concurrency(userId);
  } else if (MODE === 'cleanup') {
    await cleanup(userId);
  } else {
    console.error(`unknown mode: ${MODE}`);
    process.exit(2);
  }
}

async function seed(userId) {
  const db = supabase;

  // --- Tasks: 400 total ---
  // 300 undated ("someday" → bottom of Next up), 60 due today/tomorrow,
  // 20 completed today (Done today), 20 due far future (Upcoming).
  const tasks = [];
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const future = new Date(today);
  future.setDate(future.getDate() + 30);
  const todayIso = today.toISOString();
  const tomorrowIso = tomorrow.toISOString();
  const futureIso = future.toISOString();
  let n = 0;
  const dueFor = (i) => {
    if (i < 300) return null;
    if (i < 360) return i % 2 === 0 ? todayIso : tomorrowIso;
    if (i < 380) return null; // completed ones, completed_at set below
    return futureIso;
  };
  for (let i = 0; i < 400; i += 1) {
    n += 1;
    const row = {
      user_id: userId,
      title: `STRESS-TASK-${pad(n, 3)}`,
      due_at: dueFor(i),
      recurrence: null,
    };
    if (i >= 360 && i < 380) row.completed_at = todayIso;
    tasks.push(row);
  }
  for (let i = 0; i < tasks.length; i += 50) {
    const { error } = await db.from('tasks').insert(tasks.slice(i, i + 50));
    if (error) {
      console.error('task insert failed:', error.message);
      process.exit(1);
    }
  }
  console.log(`seeded ${tasks.length} tasks`);

  // --- Transactions: 400 this month, note 'STRESS' ---
  const txs = [];
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  for (let i = 0; i < 400; i += 1) {
    const day = new Date(monthStart);
    day.setDate(1 + (i % today.getDate()));
    const amount = (i % 2 === 0 ? -1 : 1) * Math.round((5 + (i % 200)) * 100);
    txs.push({
      user_id: userId,
      category_id: null,
      amount_minor: amount,
      note: 'STRESS',
      occurred_on: `${day.getFullYear()}-${pad(day.getMonth() + 1, 2)}-${pad(day.getDate(), 2)}`,
    });
  }
  for (let i = 0; i < txs.length; i += 50) {
    const { error } = await db.from('transactions').insert(txs.slice(i, i + 50));
    if (error) {
      console.error('transaction insert failed:', error.message);
      process.exit(1);
    }
  }
  console.log(`seeded ${txs.length} transactions`);
}

async function concurrency(userId) {
  const db = supabase;

  // --- 1. Concurrent award-xp for the SAME completed task: must award
  //        exactly once. (award_task_xp only rewards completed tasks.) ---
  const { data: task, error: taskError } = await db
    .from('tasks')
    .insert({ user_id: userId, title: 'STRESS-XP-TARGET', due_at: null, completed_at: new Date().toISOString() })
    .select('id')
    .single();
  if (taskError) {
    console.error('could not create XP target task:', taskError.message);
    process.exit(1);
  }
  const taskId = task.id;
  const xpBefore = await companionXp(userId);
  const results = await Promise.all(
    Array.from({ length: 30 }, () =>
      db.functions.invoke('award-xp', { body: { task_id: taskId } }),
    ),
  );
  const failures = results.filter((r) => r.error).map((r) => r.error.message);
  const xpAfter = await companionXp(userId);
  const awarded = xpAfter - xpBefore;
  const { count: eventCount } = await db
    .from('xp_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .like('idempotency_key', `task:${taskId}%`);
  console.log(`[concurrent task award] 30 parallel calls → errors=${failures.length}${failures.length ? ` (${failures.slice(0, 3).join('; ')})` : ''}, XP +${awarded} (expected +10), xp_events=${eventCount} (expected 1)`);

  // --- 2. Concurrent weekly review: once per ISO week. ---
  const { count: reviewBefore } = await db
    .from('xp_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'weekly_review');
  const reviewResults = await Promise.all(
    Array.from({ length: 20 }, () =>
      db.functions.invoke('award-xp', { body: { source: 'weekly_review' } }),
    ),
  );
  const reviewFailures = reviewResults.filter((r) => r.error);
  const { count: reviewAfter } = await db
    .from('xp_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'weekly_review');
  console.log(`[concurrent weekly review] 20 parallel calls → errors=${reviewFailures.length}${reviewFailures.length ? ` (${reviewFailures.slice(0, 2).map((r) => r.error.message).join('; ')})` : ''}, weekly_review rows ${reviewBefore} → ${reviewAfter} (expected ${reviewBefore}+1)`);

  // --- 3. Concurrent get-or-create of the SAME new category, replicating the
  //        app's resolveCategoryId sequence (read → if missing, insert → save
  //        transaction). The 23505 fallback must absorb the race: exactly one
  //        category row, zero unhandled errors. ---
  const catName = 'STRESS-CAT-1';
  async function saveWithCategory() {
    const { data: existing } = await db
      .from('budget_categories')
      .select('id')
      .eq('user_id', userId)
      .eq('name', catName)
      .maybeSingle();
    let categoryId = existing?.id ?? null;
    if (!categoryId) {
      const { data: created, error } = await db
        .from('budget_categories')
        .insert({ user_id: userId, name: catName })
        .select('id')
        .maybeSingle();
      if (error) {
        if (error.code === '23505') {
          const { data: raced } = await db
            .from('budget_categories')
            .select('id')
            .eq('user_id', userId)
            .eq('name', catName)
            .maybeSingle();
          categoryId = raced?.id ?? null;
          if (!categoryId) return { error: new Error('race re-read found no row') };
        } else {
          return { error };
        }
      } else {
        categoryId = created?.id ?? null;
      }
    }
    const { error } = await db.from('transactions').insert({
      user_id: userId,
      category_id: categoryId,
      amount_minor: -100,
      note: 'STRESS',
      occurred_on: '2026-08-16',
    });
    return { error };
  }
  const catResults = await Promise.all(Array.from({ length: 20 }, saveWithCategory));
  const catFailures = catResults.filter((r) => r.error);
  const { count: catCount } = await db
    .from('budget_categories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('name', catName);
  console.log(`[category get-or-create] 20 parallel saves of "${catName}" → unhandled errors=${catFailures.length}${catFailures.length ? ` (${catFailures[0].error.message})` : ''}, category rows=${catCount} (expected 1)`);
}

async function companionXp(userId) {
  const { data } = await supabase
    .from('companions')
    .select('xp')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.xp ?? 0;
}

async function cleanup(userId) {
  const db = supabase;
  const { count: tasks, error: tErr } = await db
    .from('tasks')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .like('title', 'STRESS-%');
  if (tErr) console.error('task cleanup error:', tErr.message);
  const { count: txs, error: xErr } = await db
    .from('transactions')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('note', 'STRESS');
  if (xErr) console.error('transaction cleanup error:', xErr.message);
  // Categories created by the concurrency test (no transactions reference them —
  // those rows were cleaned above; RLS forbids cross-user damage anyway).
  const { count: cats, error: cErr } = await db
    .from('budget_categories')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .like('name', 'STRESS-%');
  if (cErr) console.error('category cleanup error:', cErr.message);
  console.log(`cleanup: deleted ${tasks} tasks, ${txs} transactions, ${cats} categories`);
}

main().catch((err) => {
  console.error('script error:', err);
  process.exit(1);
});
