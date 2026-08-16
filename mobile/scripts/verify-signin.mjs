// One-off E2E check for the sign-in flow on the running web app (port 8081).
// Usage: E2E_EMAIL=you@example.com E2E_PASSWORD=... node scripts/verify-signin.mjs
// Drives the installed Chrome via playwright-core; verifies the session lands
// in storage and survives a full page reload (the AsyncStorage migration's
// core promise). Screenshots land in /tmp/verify-signin/.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:8081';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('Set E2E_EMAIL and E2E_PASSWORD (e.g. E2E_EMAIL=you@example.com E2E_PASSWORD=...).');
  process.exit(2);
}

const shots = '/tmp/verify-signin';
mkdirSync(shots, { recursive: true });

function log(step, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[browser console.error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.log(`[browser pageerror] ${err.message}`));

  const failures = [];
  const check = (step, ok, detail) => {
    log(step, ok, detail);
    if (!ok) failures.push(step);
  };

  try {
    // 1. Boot and reach the sign-in screen.
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const emailField = page.getByPlaceholder('you@example.com');
    await emailField.waitFor({ state: 'visible', timeout: 60_000 });
    check('sign-in screen renders', true);

    // 2. Attempt the sign-in.
    await emailField.fill(EMAIL);
    await page.getByPlaceholder('Your password').fill(PASSWORD);
    await page.getByText('Sign in', { exact: true }).click();

    // 3. Either we land in the app or the form reports an auth error.
    let signedIn = false;
    try {
      await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 20_000 });
      signedIn = true;
    } catch {
      const errText = await page
        .locator('text=/Invalid login|Email not confirmed|rate limit|Login/')
        .first()
        .textContent()
        .catch(() => null);
      check('sign-in attempt rejected with error message', Boolean(errText), errText ?? 'no error text found');
    }

    if (!signedIn) {
      await page.screenshot({ path: `${shots}/sign-in-error.png` });
      console.log(`screenshot: ${shots}/sign-in-error.png`);
      return finish();
    }

    // 4. Session must be persisted in storage (AsyncStorage on web = localStorage).
    const sessionKey = await page.evaluate(() =>
      Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token')) ?? null,
    );
    check('session stored in localStorage', Boolean(sessionKey), sessionKey ?? 'no sb-*-auth-token key');
    const hasAccessToken = await page.evaluate((k) => {
      const raw = localStorage.getItem(k);
      return raw ? raw.includes('access_token') : false;
    }, sessionKey);
    check('stored value contains access_token', hasAccessToken);

    // 5. Hard reload: the session must restore and keep us out of sign-in.
    await page.reload({ waitUntil: 'domcontentloaded' });
    const stayedIn = await page
      .waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    check('session restored after reload (no re-auth)', stayedIn);
    const signInFormGone = (await page.getByPlaceholder('you@example.com').count()) === 0;
    check('sign-in form absent after reload', signInFormGone);

    await page.screenshot({ path: `${shots}/signed-in.png` });
    console.log(`screenshot: ${shots}/signed-in.png`);
  } finally {
    await browser.close();
  }

  function finish() {
    process.exit(failures.length ? 1 : 0);
  }

  finish();
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
