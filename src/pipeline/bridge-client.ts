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
  return typeof g === 'string' ? g : '';
}

function makeBrowserAdapter(secret: string): CancelAdapter {
  const headers = { 'content-type': 'application/json', 'x-bridge-token': secret };
  const call = async (tool: string, args: object): Promise<unknown> => {
    const r = await fetch(`${BRIDGE}/call`, { method: 'POST', headers, body: JSON.stringify({ tool, args }) });
    const j = (await r.json()) as { ok?: boolean; result?: unknown };
    if (!r.ok || !j.ok) throw new Error('bridge_error');
    return j.result;
  };
  return createBrowserAdapter(() => createPlaywrightMcpDriver(call));
}

/** The real browser adapter, or null when no secret is known. Used by the ?bridgetest button. */
export function getBrowserAdapter(): CancelAdapter | null {
  const s = getBridgeToken();
  return s ? makeBrowserAdapter(s) : null;
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
