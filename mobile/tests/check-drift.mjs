// check-drift.mjs — pure-Node unit test for src/lib/iso-week.ts.
//
// Two guarantees:
//   1. DRIFT: the mobile client's isoWeekKey and the server Edge Function's
//      (supabase/functions/_shared/iso-week.ts) are the source of truth for
//      the weekly-review idempotency key. If they ever diverge, a review can
//      be re-earned (or wrongly blocked) across the boundary — so this test
//      asserts their implementations are identical, not just that they happen
//      to agree on today.
//   2. VECTORS: both implementations agree with independently-known ISO-8601
//      week values, so an innocent "clean-up" that changes rounding fails.
//
// Run: `node tests/check-drift.mjs` (no TS/runtime/debug deps required).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function readTest(name) {
  return readFileSync(join(here, name), 'utf8');
}

/** Extract the balanced `{ … }` body of `function <name>` from source. */
function extractFunctionBody(source, name) {
  const marker = `function ${name}`;
  const fn = source.indexOf(marker);
  const open = source.indexOf('{', fn);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`Could not find a balanced body for ${name}`);
}

const clientBody = extractFunctionBody(
  readTest('../src/lib/iso-week.ts'),
  'isoWeekKey',
);
const serverBody = extractFunctionBody(
  readTest('../../supabase/functions/_shared/iso-week.ts'),
  'isoWeekKey',
);

// Drift check — the two production implementations must be identical.
const norm = (s) => s.replace(/\s+/g, ' ').trim();
if (norm(clientBody) !== norm(serverBody)) {
  throw new Error(
    'DRIFT: client isoWeekKey differs from server isoWeekKey!\n' +
      `CLIENT: ${clientBody}\nSERVER: ${serverBody}`,
  );
}

// Vector check — run the real code (JS-evaluated) against known ISO values.
const evalIsoWeek = (body) => eval(`(function (date) ${body})`);

/** Known ISO-8601 reference vectors (verified independently). */
const vectors = [
  [Date.UTC(2024, 0, 1), '2024-01'], // Mon start of ISO 2024-W1
  [Date.UTC(2024, 5, 10), '2024-24'], // Mon 2024-06-10 → 2024-W24
  [Date.UTC(2024, 11, 30), '2025-01'], // Mon 2024-12-30 → ISO 2025-W1
  [Date.UTC(2025, 11, 28), '2025-52'], // Sun 2025-12-28 → 2025-W52
  [Date.UTC(2026, 0, 1), '2026-01'], // Thu 2026-01-01 → 2026-W1
  [Date.UTC(2026, 0, 5), '2026-02'], // Mon 2026-01-05 → 2026-W2
];

const clientFn = evalIsoWeek(clientBody);
const serverFn = evalIsoWeek(serverBody);

let failed = 0;
for (const [utcMs, expected] of vectors) {
  const d = new Date(utcMs);
  const clientKey = clientFn(d);
  const serverKey = serverFn(d);
  if (clientKey !== expected || serverKey !== expected) {
    failed++;
    console.error(
      `FAIL ${d.toISOString()}: client=${clientKey} server=${serverKey} expected=${expected}`,
    );
  }
}

if (failed > 0) {
  throw new Error(`${failed} ISO-8601 vector assertion(s) failed.`);
}

console.log('check-drift.mjs: client/server isoWeekKey agree and match ISO reference ✓');