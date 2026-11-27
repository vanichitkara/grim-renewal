/**
 * Talks to the "Grim Renewal Reaper" Chrome extension (extension/). The extension opens one tab in the
 * user's own Chrome and clicks what the app asks, after the app's confirm(). It never types.
 * Privacy: no page text or URLs are logged here; errors are short codes.
 */
import { createBrowserAdapter } from '../agents/adapters/browser.ts';
import type { BrowserDriver, PageSnapshot } from '../agents/adapters/browser.ts';
import { setAdapters } from '../agents/reaper.ts';
import type { CancelAdapter } from '../agents/reaper.ts';

/** Stable because extension/manifest.json carries a "key". Changing the key changes this. */
export const EXTENSION_ID = 'fjpgbjijbglfogifpmloiangmfjogfcj';

export interface RuntimeLike {
  sendMessage(id: string, msg: unknown, cb: (reply: unknown) => void): void;
  lastError?: { message?: string } | undefined;
}

const PING_TIMEOUT_MS = 1500;
/** A cancel step may wait for the user to press Allow in the permission window. */
const CALL_TIMEOUT_MS = 150_000;

function defaultRuntime(): RuntimeLike | null {
  const c = (globalThis as { chrome?: { runtime?: RuntimeLike } }).chrome;
  return c?.runtime && typeof c.runtime.sendMessage === 'function' ? c.runtime : null;
}

/** Sends one command. Resolves the reply object, rejects with a short code. */
export function callExtension(
  msg: { cmd: string } & Record<string, unknown>,
  runtime: RuntimeLike | null = defaultRuntime(),
  timeoutMs = CALL_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    if (!runtime) return reject(new Error('extension_missing'));
    const timer = setTimeout(() => reject(new Error('browser_timeout')), timeoutMs);
    try {
      runtime.sendMessage(EXTENSION_ID, msg, (reply) => {
        clearTimeout(timer);
        if (runtime.lastError || !reply || typeof reply !== 'object') return reject(new Error('extension_missing'));
        const r = reply as { ok?: boolean; error?: unknown } & Record<string, unknown>;
        if (r.ok) return resolve(r);
        reject(new Error(typeof r.error === 'string' && /^[a-z_]{3,40}$/.test(r.error) ? r.error : 'browser_error'));
      });
    } catch {
      clearTimeout(timer);
      reject(new Error('extension_missing'));
    }
  });
}

/** The extension's version when it answers a ping, else null. Never throws. */
export async function detectExtension(runtime: RuntimeLike | null = defaultRuntime()): Promise<{ version: string } | null> {
  try {
    const r = await callExtension({ cmd: 'ping' }, runtime, PING_TIMEOUT_MS);
    return { version: typeof r.version === 'string' ? r.version : '' };
  } catch {
    return null;
  }
}

export function createExtensionDriver(runtime: RuntimeLike | null = defaultRuntime()): BrowserDriver {
  const call = (msg: { cmd: string } & Record<string, unknown>) => callExtension(msg, runtime);
  // Track the last snapshotted element names by ref so approve can pass a name.
  const nameByRef = new Map<string, string>();
  return {
    async navigate(url) {
      nameByRef.clear();
      await call({ cmd: 'navigate', url });
    },
    async snapshot() {
      const r = await call({ cmd: 'snapshot' });
      const elements = Array.isArray(r.elements) ? r.elements : [];
      nameByRef.clear();
      for (const e of elements as Array<{ ref?: string; name?: string }>) {
        if (e.ref) nameByRef.set(e.ref, e.name ?? '');
      }
      return { elements } as PageSnapshot;
    },
    async click(ref) {
      // SHOULD 1: send a one-use approval token to the extension before the click.
      // The app's confirm() already gated this; this is the in-extension record of that approval.
      await call({ cmd: 'approve', ref, name: nameByRef.get(ref) ?? '' });
      await call({ cmd: 'click', ref });
    },
    async type() {
      // The Reaper never types. The extension has no such command either.
      throw new Error('tool_not_allowed');
    },
    async close() {
      await call({ cmd: 'close' });
    },
  };
}

export const EXTENSION_CHIP = 'Browser: Reaper extension';

/** The browser adapter that drives the extension. */
export function getExtensionAdapter(runtime: RuntimeLike | null = defaultRuntime()): CancelAdapter {
  return createBrowserAdapter(() => createExtensionDriver(runtime));
}

/** Pings the extension; when it answers, makes it the Reaper's browser adapter. */
export async function connectExtension(runtime: RuntimeLike | null = defaultRuntime()): Promise<boolean> {
  if (!(await detectExtension(runtime))) return false;
  setAdapters({ browser: getExtensionAdapter(runtime) });
  return true;
}
