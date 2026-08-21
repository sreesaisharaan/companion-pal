// run-tests.mjs — tiny orchestration for the pure-Node unit-test suites.
//
// Each suite module under tests/ throws on failure (and prints nothing else
// when passing). Add new suites to the list below. Run with: `node tests/run-tests.mjs`
// (wired up as the `npm test` script).

const suites = ['./check-drift.mjs'];

let failed = 0;
for (const suite of suites) {
  try {
    await import(suite);
    console.log(`✓ ${suite}`);
  } catch (error) {
    failed++;
    console.error(`✗ ${suite}`);
    console.error(String(error?.stack ?? error));
  }
}

if (failed > 0) {
  console.error(`\n${failed} test suite(s) failed.`);
  process.exit(1);
}

console.log(`run-tests.mjs: ${suites.length} suite(s) passed ✓`);