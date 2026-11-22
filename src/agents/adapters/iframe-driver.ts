/**
 * BrowserDriver over a SAME-ORIGIN iframe. Lets createBrowserAdapter drive a
 * page the user can watch (the Cancellation Player). A real site will use the
 * same interface through the Playwright bridge.
 *
 * Privacy: reads only control names and states, never logs page text or URLs,
 * refuses password fields, never touches a cross-origin frame.
 */

import type { BrowserDriver, PageElement, PageSnapshot } from './browser.ts';

/** What the player shows. Coordinates are in the iframe's own viewport. */
export interface IframeDriverUi {
  caption(text: string): void;
  /** Glide the cursor to a point. Resolves on arrival. Rejects if the user pressed Stop. */
  moveTo(x: number, y: number): Promise<void>;
  ripple(): void;
  /** Wait, scaled by the player's speed. Rejects if the user pressed Stop. */
  pause(ms: number): Promise<void>;
}

const CONTROLS = 'button, a[href], input, [role="button"], h1, h2, h3, p, [role="status"]';
const LOAD_TIMEOUT_MS = 5000;
const SETTLE_MS = 350;

function doc(iframe: HTMLIFrameElement): Document | null {
  try {
    return iframe.contentDocument; // null for cross-origin frames
  } catch {
    return null;
  }
}

function visible(el: Element): boolean {
  return el.getClientRects().length > 0;
}

function nameOf(el: Element): string {
  const input = el as HTMLInputElement;
  const label = input.labels?.[0]?.textContent;
  const raw = el.getAttribute('aria-label') ?? label ?? el.textContent ?? '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function describe(el: Element): Omit<PageElement, 'ref'> | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    if (type === 'hidden') return null;
    const out: Omit<PageElement, 'ref'> = {
      role: type === 'radio' || type === 'checkbox' ? type : 'textbox',
      name: nameOf(el),
      inputType: type,
    };
    if (type === 'radio' || type === 'checkbox') out.checked = (el as HTMLInputElement).checked;
    return out;
  }
  if (tag === 'button' || el.getAttribute('role') === 'button') return { role: 'button', name: nameOf(el) };
  if (tag === 'a') return { role: 'link', name: nameOf(el) };
  return { role: 'text', name: nameOf(el) };
}

export function createIframeDriver(iframe: HTMLIFrameElement, ui: IframeDriverUi): BrowserDriver {
  const byRef = new Map<string, Element>();
  const refOf = new WeakMap<Element, string>();
  let counter = 0;

  function target(ref: string): HTMLElement {
    const el = byRef.get(ref);
    if (!el || !el.isConnected) throw new Error('stale_ref');
    return el as HTMLElement;
  }

  return {
    async navigate(url) {
      ui.caption('Opening the merchant page');
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('load_timeout')), LOAD_TIMEOUT_MS);
        iframe.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
        iframe.src = url;
      });
      if (!doc(iframe)) throw new Error('cross_origin');
    },

    async snapshot(): Promise<PageSnapshot> {
      const d = doc(iframe);
      if (!d) throw new Error('cross_origin');
      byRef.clear();
      const elements: PageElement[] = [];
      for (const el of Array.from(d.querySelectorAll(CONTROLS))) {
        if (!visible(el) || (el as HTMLButtonElement).disabled) continue;
        const info = describe(el);
        if (!info || info.name === '') continue;
        if (info.role === 'text') {
          elements.push({ ref: '', ...info }); // readable, never clickable
          continue;
        }
        let ref = refOf.get(el);
        if (!ref) { ref = `e${++counter}`; refOf.set(el, ref); }
        byRef.set(ref, el);
        elements.push({ ref, ...info });
      }
      return { elements };
    },

    async click(ref) {
      const el = target(ref);
      ui.caption(`${el.matches('input') ? 'Selecting' : 'Clicking'} “${nameOf(el)}”`);
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      await ui.moveTo(r.left + r.width / 2, r.top + r.height / 2);
      ui.ripple();
      await ui.pause(150);
      el.click();
      await ui.pause(SETTLE_MS);
    },

    async type(ref, text) {
      const el = target(ref);
      if (el.matches('input[type="password" i]')) throw new Error('password_refused');
      ui.caption(`Typing into “${nameOf(el)}”`);
      const r = el.getBoundingClientRect();
      await ui.moveTo(r.left + r.width / 2, r.top + r.height / 2);
      (el as HTMLInputElement).value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },

    async close() {
      byRef.clear();
      iframe.removeAttribute('src');
    },
  };
}
