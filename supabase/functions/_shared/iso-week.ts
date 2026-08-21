// _shared/iso-week.ts — ISO-8601 week key.
//
// Used by award-xp to make weekly reviews unique per ISO week, and mirrored
// (not duplicated in spirit) by the mobile app's src/lib/iso-week.ts — the two
// must stay in lockstep, because the client computes the idempotency key for
// the weekly review card. mobile/tests/iso-week.test.ts asserts both agree on
// the same known vectors, so an uncoordinated change fails CI on either side.

/** ISO-8601 week key (e.g. "2026-32") for a Date. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}