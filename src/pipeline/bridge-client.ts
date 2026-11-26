/**
 * Browser bridge client. The bridge secret is a local per-run value (not a Gmail credential).
 * It is kept in sessionStorage so it survives the Google redirect, never logged,
 * and only ever sent to 127.0.0.1:8787.
 */
import { setAdapters } from '../agents/reaper.ts';
import type { CancelAdapter } from '../agents/reaper.ts';
import { createBrowserAdapter, createPlaywrightMcpDriver } from '../agents/adapters/browser.ts';

export const BRIDGE = 'http://127.0.0.1:8787';
export const STORE_KEY = 'grim_bridge_token';

/** Set by the Vite dev server only (see src/server/dev-env.ts). Empty in every built site. */
declare const __GRIM_DEV_BRIDGE_TOKEN__: string | undefined;
function devToken(): string {
  return typeof __GRIM_DEV_BRIDGE_TOKEN__ === 'string' ? __GRIM_DEV_BRIDGE_TOKEN__ : '';
}

export type BridgeStatus = 'connected' | 'not_found' | 'wrong_token';

export const STATUS_LABEL: Record<BridgeStatus, string> = {
  connected: 'Browser: connected',
  not_found: 'Browser: bridge not found',
  wrong_token: 'Browser: wrong token',
};

/** Pulls `bridge=<value>` out of a location.hash. Pure. */
export function extractBridgeToken(hash: string): string | null {
  const t = new URLSearchParams(hash.replace(/^#/, '')).get('bridge');
  return t && /^[A-Za-z0-9_-]{8,128}$/.test(t) ? t : null;
}

/** Saves the value from the URL hash, then strips it from the URL. Call once at page start. */
export function intakeBridgeToken(): void {
  const t = extractBridgeToken(location.hash);
  if (!t) return;
  sessionStorage.setItem(STORE_KEY, t);
  const rest = new URLSearchParams(location.hash.replace(/^#/, ''));
  rest.delete('bridge');
  const h = rest.toString();
  history.replaceState(null, '', location.pathname + location.search + (h ? `#${h}` : ''));
}

export function saveBridgeToken(t: string): void {
  sessionStorage.setItem(STORE_KEY, t.trim());
}

export function getBridgeToken(): string {
  const s = sessionStorage.getItem(STORE_KEY);
  if (s) return s;
  const g = (globalThis as { GRIM_BRIDGE_TOKEN?: unknown }).GRIM_BRIDGE_TOKEN;
  if (typeof g === 'string' && g) return g;
  return devToken(); // from .env, dev server only: every local sign-in connects by itself
}

/** Turns a failed bridge reply into a short code the UI can show. Pure. Never returns page text. */
export function bridgeErrorCode(j: { result?: unknown; error?: unknown }): string {
  if (typeof j.error === 'string' && /^[a-z_]{3,40}$/.test(j.error)) return j.error;
  const t = typeof j.result === 'string' ? j.result : '';
  if (/Target crashed|Browser closed|has been closed/i.test(t)) return 'browser_crashed';
  if (/Invalid arguments/i.test(t)) return 'bad_tool_args';
  if (/not installed|Executable doesn't exist|install/i.test(t)) return 'browser_not_installed';
  if (/timeout/i.test(t)) return 'browser_timeout';
  return 'bridge_error';
}

function makeBrowserAdapter(secret: string): CancelAdapter {
  const headers = { 'content-type': 'application/json', 'x-bridge-token': secret };
  const call = async (tool: string, args: object): Promise<unknown> => {
    const r = await fetch(`${BRIDGE}/call`, { method: 'POST', headers, body: JSON.stringify({ tool, args }) });
    const j = (await r.json()) as { ok?: boolean; result?: unknown; error?: unknown };
    if (!r.ok || !j.ok) throw new Error(bridgeErrorCode(j));
    return j.result;
  };
  return createBrowserAdapter(() => createPlaywrightMcpDriver(call));
}

/** The real browser adapter, or null when no secret is known. Used by the ?bridgetest button. */
export function getBrowserAdapter(): CancelAdapter | null {
  const s = getBridgeToken();
  return s ? makeBrowserAdapter(s) : null;
}

/** True on a developer's own machine, where a local bridge can exist. A hosted site never has one. */
export function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * What the header chip shows. A hosted site cannot reach a bridge on a visitor's machine,
 * so it shows nothing instead of a scary "not connected".
 */
export function chipView(status: BridgeStatus, hostname: string): { text: string; hidden: boolean } {
  if (status === 'connected') return { text: STATUS_LABEL.connected, hidden: false };
  if (!isLocalHost(hostname)) return { text: '', hidden: true };
  return status === 'wrong_token'
    ? { text: 'Browser cancels: key out of date. Run: npm run bridge', hidden: false }
    : { text: 'Browser cancels: off. Run: npm run bridge', hidden: false };
}

/** Probes /health in every mode. Registers the browser adapter on success. */
export async function connectBridge(): Promise<BridgeStatus> {
  const s = getBridgeToken();
  try {
    const h = await fetch(`${BRIDGE}/health`, { headers: { 'x-bridge-token': s } });
    if (h.status === 401) return 'wrong_token';
    if (!h.ok || !((await h.json()) as { ok?: boolean }).ok) return 'not_found';
  } catch {
    return 'not_found';
  }
  setAdapters({ browser: makeBrowserAdapter(s) });
  return 'connected';
}
