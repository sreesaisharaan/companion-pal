// One-off E2E: sign up a fresh user through the Clerk-powered web app.
// Creates a disposable inbox via mail.tm, drives installed Chrome, reads the
// emailed verification code back out of the inbox, and verifies the session
// survives a reload. Screenshots land in /tmp/clerk-e2e/.
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:8081';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MAIL_API = 'https://api.mail.tm';

const APP_PASSWORD = 'TestPass123!';
const shots = '/tmp/clerk-e2e';
const { mkdirSync } = await import('node:fs');
mkdirSync(shots, { recursive: true });

function log(step, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? ` — ${detail}` : ''}`);
}

// ── Disposable inbox via mail.tm ──────────────────────────────────────────
async function createInbox() {
  const domains = await (await fetch(`${MAIL_API}/domains`)).json();
  const domain = domains['hydra:member'][0].domain;
  const address = `clerk-e2e-${Date.now()}@${domain}`;
  const password = `tmp-${Math.random().toString(36).slice(2, 12)}`;
  const res = await fetch(`${MAIL_API}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  });
  if (!res.ok) throw new Error(`mail.tm account create failed: ${res.status} ${await res.text()}`);
  const tokenRes = await fetch(`${MAIL_API}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  });
  if (!tokenRes.ok) throw new Error('mail.tm token failed');
  const { token } = await tokenRes.json();
  return { address, token };
}

async function fetchVerificationCode(token, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAIL_API}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const body = await res.json();
      const msg = body['hydra:member']?.[0];
      if (msg) {
        const detail = await (
          await fetch(`${MAIL_API}/messages/${msg.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).json();
        const text = detail.text ?? '';
        const match = text.match(/\b\d{6}\b/);
        if (match) return { code: match[0], subject: msg.subject };
      }
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error('Timed out waiting for the verification email');
}

// ── Main ──────────────────────────────────────────────────────────────────
const failures = [];
const check = (step, ok, detail) => {
  log(step, ok, detail);
  if (!ok) failures.push(step);
};

const { address, token } = await createInbox();
log('disposable inbox ready', true, address);

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: process.env.HEADED !== '1',
  args: ['--window-size=1280,900'],
});
const page = await browser.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log(`[browser console.error] ${msg.text()}`);
});
page.on('pageerror', (err) => console.log(`[browser pageerror] ${err.message}`));

try {
  // 1. Reach the sign-in screen and switch to sign-up.
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.getByPlaceholder('you@example.com').waitFor({ state: 'visible', timeout: 90_000 });
  await page.getByText('Create an account', { exact: true }).click();
  await page.getByText('Create account', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  check('sign-up mode reached', true);

  // 2. Fill the form and submit.
  await page.getByPlaceholder('you@example.com').fill(address);
  await page.getByPlaceholder('At least 6 characters').fill(APP_PASSWORD);
  await page.getByText('Create account', { exact: true }).click();

  // 3. The verification step appears (code field) or an error shows.
  let codeField;
  try {
    codeField = page.getByPlaceholder('6-digit code');
    await codeField.waitFor({ state: 'visible', timeout: 30_000 });
    check('verification step reached (code requested)', true);
  } catch {
    await page.screenshot({ path: `${shots}/signup-blocked.png`, fullPage: true });
    const bodyText = await page.locator('body').innerText().catch(() => '');
    // Show the sign-up card only — it carries the error/state.
    const card = bodyText.slice(bodyText.indexOf('Continue with Google'), bodyText.indexOf('Preferences') >= 0 ? bodyText.indexOf('Preferences') : undefined).trim();
    check('verification step reached', false, card.slice(0, 400) || bodyText.slice(0, 400));
    throw new Error('sign-up did not reach the verification step');
  }
  await page.screenshot({ path: `${shots}/code-requested.png` });

  // 4. Pull the code from the disposable inbox and submit it.
  const { code, subject } = await fetchVerificationCode(token);
  log('verification code received from inbox', true, `${subject} → ${code}`);
  await codeField.fill(code);
  await page.getByText('Verify email', { exact: true }).click();

  // 5. Should land inside the app (the auth layout redirects once signed in).
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 30_000 });
  check('signed in — redirected out of /sign-in', true, page.url());
  await page.waitForTimeout(3_000); // let the Today screen settle
  await page.screenshot({ path: `${shots}/signed-in.png`, fullPage: true });

  // 6. Reload: the Clerk session must restore without re-authenticating.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const stayedIn = await page
    .waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  check('session restored after reload (no re-auth)', stayedIn);
  const formGone = (await page.getByPlaceholder('you@example.com').count()) === 0;
  check('sign-in form absent after reload', formGone);
} catch (err) {
  check('e2e run', false, err.message);
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} FAILED CHECK(S)` : '\nALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
