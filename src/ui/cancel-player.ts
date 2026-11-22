/**
 * Cancellation Player: a panel that shows the Reaper cancelling a subscription
 * on a (mock) merchant page. It runs INSIDE the browser adapter, so the hallway
 * still waits for the real result from reaper.ts.
 *
 * Every click waits for "Approve this step" (or the "approve the rest of this
 * cancellation" box, which lasts for one run only). Stop ends the run.
 * Page names are shown with textContent only. Nothing is logged or sent.
 */

import type { AdapterResult, CancelAdapter, Confirm, ConfirmStep } from '../agents/reaper.ts';
import type { Subscription } from '../types.ts';
import { createBrowserAdapter } from '../agents/adapters/browser.ts';
import { createIframeDriver } from '../agents/adapters/iframe-driver.ts';
import type { IframeDriverUi } from '../agents/adapters/iframe-driver.ts';
import { mockUrlFor } from '../agents/adapters/mock-registry.ts';
import { ease } from '../animation/ease.ts';
import {
  approvalCaption, finishSteps, resultLine, startStep, stepLabel,
} from './cancel-player-steps.ts';
import type { PlayerStep } from './cancel-player-steps.ts';

export interface PlayerOptions {
  /** Global speed multiplier (tune.speed). Default 1. */
  getSpeed?: () => number;
}

const MOVE_MS = 700;
const AUTO_APPROVE_MS = 1200;

const CSS = `
.cplayer{background:var(--crypt);border:1px solid var(--stone);border-radius:4px;padding:14px;display:grid;gap:10px}
.cplayer .ph{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.cplayer h2{margin:0}
.cplayer .pbody{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:12px}
@media (max-width:760px){.cplayer .pbody{grid-template-columns:1fr}}
.cplayer .frame{position:relative;aspect-ratio:4/3;border:2px solid var(--stone);border-radius:3px;overflow:hidden;background:#fff}
.cplayer iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.cplayer .cursor{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2}
.cplayer .cursor i{position:absolute;left:0;top:0;width:22px;height:22px;border-top:4px solid var(--spirit);border-left:4px solid var(--spirit);border-radius:100% 0 0 0;filter:drop-shadow(0 1px 0 #000)}
.cplayer .cursor b{position:absolute;left:-2px;top:-2px;width:4px;height:30px;background:var(--bone);transform:rotate(-35deg);transform-origin:top left;border-radius:2px}
.cplayer .ripple{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border:2px solid var(--coin);border-radius:50%;pointer-events:none;z-index:2;animation:cpripple .5s ease-out forwards}
@keyframes cpripple{from{opacity:1;transform:scale(.5)}to{opacity:0;transform:scale(3)}}
@media (prefers-reduced-motion:reduce){.cplayer .ripple{animation:none;opacity:0}}
.cplayer .side{display:grid;gap:10px;align-content:start;min-width:0}
.cplayer ol{margin:0;padding-left:22px;display:grid;gap:4px;font-size:14px;color:var(--mist)}
.cplayer li[data-status="active"]{color:var(--bone);font-weight:700}
.cplayer li[data-status="done"]{color:var(--rot)}
.cplayer li[data-status="stopped"]{color:var(--blood)}
.cplayer .caption{margin:0;min-height:3em;color:var(--bone)}
.cplayer .result{margin:0;font-family:var(--display);font-size:18px}
.cplayer .result.ok{color:var(--coin)}
.cplayer .result.bad{color:var(--blood)}
.cplayer .stop{background:var(--blood);color:var(--night)}
`;

type El<K extends keyof HTMLElementTagNameMap> = HTMLElementTagNameMap[K];
function mk<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): El<K> {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

class Stopped extends Error {}

const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Build the panel inside `host` once. Returns a function that opens a run. */
function createPanel(host: HTMLElement, opts: PlayerOptions) {
  if (!document.getElementById('cplayer-css')) {
    const style = mk('style');
    style.id = 'cplayer-css';
    style.textContent = CSS;
    document.head.append(style);
  }
  const speedOf = () => Math.max(0.1, opts.getSpeed?.() ?? 1) * speedChoice;
  let speedChoice = 1;

  host.hidden = true;
  host.className = 'cplayer';
  host.setAttribute('role', 'region');

  const title = mk('h2');
  const speed = mk('div', 'seg');
  speed.setAttribute('role', 'group');
  speed.setAttribute('aria-label', 'Player speed');
  const speedBtns = ([1, 2] as const).map((n) => {
    const b = mk('button', '', `${n}×`);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(n === 1));
    b.addEventListener('click', () => {
      speedChoice = n;
      speedBtns.forEach((o, i) => o.setAttribute('aria-pressed', String(i + 1 === n)));
    });
    return b;
  });
  speed.append(...speedBtns);
  const closeBtn = mk('button', 'ghost', 'Close');
  closeBtn.type = 'button';
  closeBtn.hidden = true;
  const head = mk('div', 'ph');
  const headRight = mk('div', 'btnrow');
  headRight.append(speed, closeBtn);
  head.append(title, headRight);

  const frame = mk('div', 'frame');
  const iframe = mk('iframe');
  iframe.title = 'Mock merchant website';
  iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms');
  const cursor = mk('div', 'cursor');
  cursor.setAttribute('aria-hidden', 'true');
  cursor.append(mk('i'), mk('b'));
  frame.append(iframe, cursor);

  const stepsEl = mk('ol');
  stepsEl.setAttribute('aria-label', 'Steps');
  const caption = mk('p', 'caption');
  caption.setAttribute('aria-live', 'polite');
  const approve = mk('button', '', 'Approve this click');
  approve.type = 'button';
  const stop = mk('button', 'stop', 'Stop');
  stop.type = 'button';
  const auto = mk('input');
  auto.type = 'checkbox';
  auto.id = 'cplayerAuto';
  const autoLabel = mk('label', 'check', 'Approve the rest of this cancellation');
  autoLabel.htmlFor = auto.id;
  autoLabel.prepend(auto);
  const result = mk('p', 'result');
  const btns = mk('div', 'btnrow');
  btns.append(approve, stop);
  const side = mk('div', 'side');
  side.append(stepsEl, caption, btns, autoLabel, result);
  const body = mk('div', 'pbody');
  body.append(frame, side);
  host.replaceChildren(head, body);

  let cx = 24;
  let cy = 24;
  const place = () => { cursor.style.transform = `translate(${cx}px, ${cy}px)`; };

  function open(sub: Subscription) {
    let steps: PlayerStep[] = [];
    let stopped = false;
    let finished = false;
    const waiters = new Set<() => void>();
    let pendingApproval: ((ok: boolean) => void) | null = null;

    title.textContent = `Cancellation Player - ${sub.merchant}`;
    host.setAttribute('aria-label', `Cancellation Player for ${sub.merchant}`);
    auto.checked = false; // never carried across runs
    result.textContent = '';
    result.className = 'result';
    closeBtn.hidden = true;
    stepsEl.replaceChildren();
    caption.textContent = 'Opening the merchant page';
    approve.disabled = true;
    stop.disabled = false;
    host.hidden = false;
    cx = 24; cy = 24; place();
    host.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });

    const drawSteps = () => {
      stepsEl.replaceChildren(...steps.map((s) => {
        const li = mk('li', '', s.label);
        li.dataset.status = s.status;
        const mark = s.status === 'done' ? ' (done)' : s.status === 'stopped' ? ' (stopped)' : '';
        if (mark) li.append(mk('span', 'sr-only', mark));
        return li;
      }));
    };

    /** Resolve after ms (scaled by speed). Rejects with Stopped if the user pressed Stop. */
    const pause = (ms: number) => new Promise<void>((resolve, reject) => {
      if (stopped) return reject(new Stopped());
      const t = setTimeout(() => { waiters.delete(w); resolve(); }, ms / speedOf());
      const w = () => { clearTimeout(t); reject(new Stopped()); };
      waiters.add(w);
    });

    const ui: IframeDriverUi = {
      caption: (text) => { caption.textContent = text; },
      pause,
      ripple: () => {
        const r = mk('span', 'ripple');
        r.style.left = `${cx}px`;
        r.style.top = `${cy}px`;
        frame.append(r);
        setTimeout(() => r.remove(), 600);
      },
      moveTo: (x, y) => new Promise<void>((resolve, reject) => {
        if (stopped) return reject(new Stopped());
        if (reducedMotion()) { cx = x; cy = y; place(); return resolve(); }
        const x0 = cx, y0 = cy, t0 = performance.now(), dur = MOVE_MS / speedOf();
        let raf = 0;
        const w = () => { cancelAnimationFrame(raf); reject(new Stopped()); };
        waiters.add(w);
        const frameFn = (now: number) => {
          const p = Math.min(1, (now - t0) / dur);
          const e = ease.out!(p);
          cx = x0 + (x - x0) * e; cy = y0 + (y - y0) * e; place();
          if (p < 1) { raf = requestAnimationFrame(frameFn); return; }
          waiters.delete(w);
          resolve();
        };
        raf = requestAnimationFrame(frameFn);
      }),
    };

    const confirm: Confirm = async (step?: ConfirmStep) => {
      if (stopped) return false;
      steps = startStep(steps, stepLabel(step));
      drawSteps();
      caption.textContent = approvalCaption(step);
      if (auto.checked) {
        caption.textContent = `${approvalCaption(step).replace(/ Approve this step\?$/, '')} Approving automatically.`;
        try { await pause(AUTO_APPROVE_MS); } catch { return false; }
        return !stopped;
      }
      approve.disabled = false;
      approve.focus();
      const ok = await new Promise<boolean>((resolve) => { pendingApproval = resolve; });
      approve.disabled = true;
      return ok && !stopped;
    };

    const onApprove = () => { const r = pendingApproval; pendingApproval = null; r?.(true); };
    const onStop = () => {
      stopped = true;
      const r = pendingApproval; pendingApproval = null; r?.(false);
      [...waiters].forEach((w) => w());
      waiters.clear();
    };
    approve.addEventListener('click', onApprove);
    stop.addEventListener('click', onStop);

    const driver = createIframeDriver(iframe, ui);

    return {
      driver,
      confirm,
      get stopped() { return stopped; },
      finish(res: AdapterResult): void {
        if (finished) return;
        finished = true;
        approve.removeEventListener('click', onApprove);
        stop.removeEventListener('click', onStop);
        approve.disabled = true;
        stop.disabled = true;
        steps = finishSteps(steps, res.ok);
        drawSteps();
        const line = resultLine(res, sub.monthlyAmount * 12);
        result.textContent = line;
        result.className = `result ${res.ok ? 'ok' : 'bad'}`;
        caption.textContent = line;
        closeBtn.hidden = false;
      },
    };
  }

  closeBtn.addEventListener('click', () => { host.hidden = true; closeBtn.hidden = true; });
  return open;
}

/**
 * A cancel adapter that plays the flow in the panel when the merchant has a mock
 * page, and otherwise hands over to `fallback`. Runs are queued: one panel, one run.
 * Never passes a password anywhere: the driver refuses password inputs.
 */
export function createCancelPlayerAdapter(
  host: HTMLElement,
  fallback: CancelAdapter,
  opts: PlayerOptions = {},
): CancelAdapter {
  const open = createPanel(host, opts);
  let queue: Promise<unknown> = Promise.resolve();

  return (sub, confirm) => {
    const url = sub.phoneOnly ? null : mockUrlFor(sub.merchant);
    if (!url) return fallback(sub, confirm);

    const run = queue.then(async (): Promise<AdapterResult> => {
      const player = open(sub);
      let res: AdapterResult;
      try {
        const adapter = createBrowserAdapter(() => player.driver);
        res = await adapter({ ...sub, cancelUrl: url }, player.confirm);
      } catch {
        res = { ok: false, reason: 'browser_error' };
      }
      // Stop during a glide surfaces as a driver error; the user's intent is "decline".
      if (!res.ok && player.stopped) res = { ok: false, reason: 'user_declined' };
      player.finish(res);
      return res;
    });
    queue = run.catch(() => undefined);
    return run;
  };
}
