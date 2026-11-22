/**
 * Lightweight tween engine.
 * Tweens run on the same RAF loop as the draw calls.
 * Every animation step must be interruptible — cancel() cuts a tween immediately.
 */

import type { EaseFn } from './ease.ts';
import { ease } from './ease.ts';

export interface TweenHandle {
  cancel: () => void;
  promise: Promise<void>;
}

interface TweenEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: Record<string, any>;
  key: string;
  from: number;
  to: number;
  t0: number;
  dur: number;
  easeFn: EaseFn;
  resolve: () => void;
  reject: (reason?: unknown) => void;
  cancelled: boolean;
}

const active: TweenEntry[] = [];

/** Call once per frame with the current timestamp (from rAF). */
export function tickTweens(now: number): void {
  for (let i = active.length - 1; i >= 0; i--) {
    const tw = active[i]!;
    if (tw.cancelled) {
      active.splice(i, 1);
      tw.reject(new DOMException('Tween cancelled', 'AbortError'));
      continue;
    }
    const p = Math.min(1, (now - tw.t0) / tw.dur);
    tw.obj[tw.key] = tw.from + (tw.to - tw.from) * tw.easeFn(p);
    if (p >= 1) {
      active.splice(i, 1);
      tw.resolve();
    }
  }
}

/**
 * Animate obj[key] from its current value to `to` over `ms` milliseconds.
 * Returns a handle with a promise (resolves on completion) and cancel().
 *
 * @param speedMultiplier  Pass tune.speed so global speed affects all durations.
 */
export function tween(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: Record<string, any>,
  key: string,
  to: number,
  ms: number,
  easeFn: EaseFn = ease.inOut!,
  speedMultiplier = 1,
): TweenHandle {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const entry: TweenEntry = {
    obj,
    key,
    from: obj[key] as number,
    to,
    t0: performance.now(),
    dur: Math.max(1, ms / Math.max(0.1, speedMultiplier)),
    easeFn,
    resolve,
    reject,
    cancelled: false,
  };

  active.push(entry);

  return {
    cancel: () => { entry.cancelled = true; },
    promise,
  };
}

/** Convenience: await a fixed delay scaled by speed. */
export function wait(ms: number, speedMultiplier = 1): Promise<void> {
  return new Promise((r) => setTimeout(r, ms / Math.max(0.1, speedMultiplier)));
}
