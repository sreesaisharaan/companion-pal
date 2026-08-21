// _shared/cors.ts — shared CORS helpers for Edge Functions.
//
// Keep the origin logic in ONE place. The allowlist must actually be enforced:
// an incoming Origin is only ever echoed back when it is present in
// ALLOWED_ORIGINS — never reflected unconditionally. Reflecting any origin
// would let any website call these functions with a user's (Amber) token
// and read/change their data from the browser.

/** Normalize an origin for comparison: lower-case, no trailing slash. */
function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * Origin to stamp on the response, or null when the browser should be refused
 * (no Allow-Origin header means a cross-origin browser fetch fails).
 *
 * - ALLOWED_ORIGINS unset  → '*' (developer convenience; MUST be set to a real
 *   list before deploying to production).
 * - ALLOWED_ORIGINS set     → only an Origin on the list is reflected. One that
 *   is not on it (or a browser that sends none) gets no Allow-Origin header and
 *   is blocked by the browser.
 * - No Origin header        → native mobile / server-to-server; CORS never
 *   applies, so no Allow-Origin is added (which is correct and harmless).
 */
export function allowedOrigin(req: Request): string | null {
  const allowlist = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(/[\s,]+/)
    .map(normalizeOrigin)
    .filter(Boolean);

  if (allowlist.length === 0) return '*';

  const origin = req.headers.get('Origin');
  if (!origin) return null;
  return allowlist.includes(normalizeOrigin(origin)) ? origin : null;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = allowedOrigin(req);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}