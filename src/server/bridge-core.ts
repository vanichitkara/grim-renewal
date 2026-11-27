/**
 * Pure request validation for the local browser bridge (server/browser-bridge.ts).
 * No I/O here, so it is unit-testable. Privacy: nothing is logged.
 */

/** The dev server and the live site. The key is still required on every call. */
export const LIVE_SITE = 'https://vanichitkara.github.io';
export const LIVE_APP_URL = `${LIVE_SITE}/grim-renewal/app.html`;
export const ALLOWED_ORIGINS: readonly string[] = ['http://localhost:5173', 'http://127.0.0.1:5173', LIVE_SITE];

/** Returns the origin to echo in CORS headers, or undefined. Never a wildcard. */
export function matchOrigin(origin: string | undefined): string | undefined {
  return origin !== undefined && ALLOWED_ORIGINS.includes(origin) ? origin : undefined;
}

export const ALLOWED_TOOLS: ReadonlySet<string> = new Set([
  'browser_navigate',
  'browser_snapshot',
  'browser_click',
  'browser_type',
  'browser_close',
]);

export interface BridgeRequest {
  method: string;
  path: string;
  token: string | undefined;
  body: unknown;
}

export type BridgeDecision =
  | { kind: 'reply'; status: number; json: object }
  | { kind: 'call'; tool: string; args: Record<string, unknown> };

const reply = (status: number, json: object): BridgeDecision => ({ kind: 'reply', status, json });

export function decide(req: BridgeRequest, expectedToken: string): BridgeDecision {
  if (req.token !== expectedToken) return reply(401, { ok: false, error: 'unauthorized' });
  if (req.method === 'GET' && req.path === '/health') return reply(200, { ok: true });
  if (req.method !== 'POST' || req.path !== '/call') return reply(404, { ok: false, error: 'not_found' });

  const b = req.body as { tool?: unknown; args?: unknown } | null;
  if (!b || typeof b.tool !== 'string' || !ALLOWED_TOOLS.has(b.tool)) {
    return reply(400, { ok: false, error: 'tool_not_allowed' });
  }
  const args = b.args ?? {};
  if (typeof args !== 'object' || Array.isArray(args)) return reply(400, { ok: false, error: 'bad_args' });
  // Defense in depth: the server cannot see field types, so refuse any typing that mentions password.
  if (b.tool === 'browser_type' && /password/i.test(JSON.stringify(args))) {
    return reply(400, { ok: false, error: 'password_refused' });
  }
  return { kind: 'call', tool: b.tool, args: args as Record<string, unknown> };
}
