/**
 * Browser cancel adapter (method 2). Drives a page through an injectable
 * BrowserDriver. Privacy: never types into password fields, awaits confirm()
 * before every click, never logs page text, URLs or emails.
 */

import type { AdapterResult, CancelAdapter, Confirm } from '../reaper.ts';
import type { Subscription } from '../../types.ts';

export interface PageElement {
  ref: string;
  role: string;
  name: string;
  inputType?: string;
}

export interface PageSnapshot {
  elements: PageElement[];
}

export interface BrowserDriver {
  navigate(url: string): Promise<void>;
  snapshot(): Promise<PageSnapshot>;
  click(ref: string): Promise<void>;
  type(ref: string, text: string): Promise<void>;
  close(): Promise<void>;
}

const MAX_STEPS = 8;
const FIRST_STEP = /cancel|end membership|turn off|unsubscribe/i;
const LATER_STEP = /confirm|yes|continue/i;
const DONE = /cancel(l)?ed|you have been|no longer be charged/i;

export function createBrowserAdapter(makeDriver: () => BrowserDriver): CancelAdapter {
  return async (sub: Subscription, confirm: Confirm): Promise<AdapterResult> => {
    if (!sub.cancelUrl) return { ok: false, reason: 'no_cancel_url' };
    const driver = makeDriver();
    try {
      await driver.navigate(sub.cancelUrl);
      for (let step = 0; step < MAX_STEPS; step++) {
        const { elements } = await driver.snapshot();
        if (elements.some((e) => e.inputType === 'password')) {
          return { ok: false, reason: 'login_required' };
        }
        if (elements.some((e) => DONE.test(e.name))) return { ok: true };
        const re = step === 0 ? FIRST_STEP : new RegExp(`${LATER_STEP.source}|${FIRST_STEP.source}`, 'i');
        const target = elements.find((e) => e.ref !== '' && e.inputType === undefined && re.test(e.name));
        if (!target) return { ok: false, reason: 'no_cancel_control' };
        if (!(await confirm())) return { ok: false, reason: 'user_declined' };
        await driver.click(target.ref);
      }
      // Final look after the last click.
      const last = await driver.snapshot();
      if (last.elements.some((e) => DONE.test(e.name))) return { ok: true };
      return { ok: false, reason: 'step_limit' };
    } catch {
      return { ok: false, reason: 'browser_error' };
    } finally {
      try {
        await driver.close();
      } catch {
        /* shortcut: close errors are swallowed, upgrade if leaks matter */
      }
    }
  };
}

/** Thin mapping onto Playwright MCP tools. Not tested against a live server. */
export function createPlaywrightMcpDriver(
  call: (tool: string, args: object) => Promise<unknown>,
): BrowserDriver {
  return {
    async navigate(url) {
      await call('browser_navigate', { url });
    },
    async snapshot() {
      return parseSnapshot(await call('browser_snapshot', {}));
    },
    async click(ref) {
      await call('browser_click', { element: ref, ref });
    },
    async type(ref, text) {
      await call('browser_type', { element: ref, ref, text });
    },
    async close() {
      await call('browser_close', {});
    },
  };
}

/**
 * Parses Playwright MCP's aria snapshot (YAML-ish, one node per line):
 *   - button "Cancel subscription" [ref=e5]
 *   - paragraph [ref=e7]: Your subscription has been cancelled.
 * Tolerant: any line with a role counts; a ref is optional (text-only nodes).
 * shortcut: line-based, ignores nesting; upgrade if a site needs structure.
 */
export function parseSnapshot(raw: unknown): PageSnapshot {
  if (raw && typeof raw === 'object' && Array.isArray((raw as PageSnapshot).elements)) {
    return raw as PageSnapshot;
  }
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
  const elements: PageElement[] = [];
  for (const l of text.split('\n')) {
    const m = /^\s*-\s+(\w+)(?:\s+"([^"]*)")?(.*)$/.exec(l);
    if (!m) continue;
    const rest = m[3] ?? '';
    const ref = /\[ref=([^\]]+)\]/.exec(rest)?.[1] ?? '';
    const trailing = /\]?:\s+(.+)$/.exec(rest)?.[1]?.replace(/^"|"$/g, '') ?? '';
    const el: PageElement = { ref, role: m[1]!, name: m[2] ?? trailing };
    if (/password/i.test(l)) el.inputType = 'password';
    elements.push(el);
  }
  return { elements };
}
