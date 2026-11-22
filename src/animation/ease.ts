/**
 * Named easing functions for all Grim Renewal animations.
 * Use ONLY these — no inline cubic-bezier strings anywhere.
 * All functions take a progress value p in [0, 1] and return [0, 1].
 */

export type EaseFn = (p: number) => number;

export const ease: Record<string, EaseFn> = {
  linear: (p) => p,

  inOut: (p) =>
    p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2,

  in: (p) => p * p * p,

  out: (p) => 1 - Math.pow(1 - p, 3),

  /** Overshoots past 1 then settles. Good for zombie grow and tombstone pop. */
  back: (p) => {
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
  },
};
