// src/lib/iso-week.ts — pure ISO-8601 week helpers (no imports, fully testable).
//
// This is the client-side copy of the server's supabase/functions/_shared/
// iso-week.ts. They MUST agree byte-for-byte on the rounding rules: the client
// computes the weekly-review idempotency key (`weekly_review:<ISO week>`) and
// the server awards on the same key, so any mismatch lets a review be
// re-earned (or wrongly blocked) across the boundary. mobile/tests/iso-week.test.ts
// asserts BOTH files produce identical keys for the same known vectors.

/** ISO-8601 week key (e.g. "2026-32") — must match supabase/_shared/iso-week.ts. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}