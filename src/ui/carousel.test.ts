import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { edgeState, scrollTarget } from './carousel.ts';

describe('carousel helpers', () => {
  it('disables the left arrow at the start and the right arrow at the end', () => {
    expect(edgeState(0, 400, 1200)).toEqual({ atStart: true, atEnd: false });
    expect(edgeState(800, 400, 1200)).toEqual({ atStart: false, atEnd: true });
    expect(edgeState(300, 400, 1200)).toEqual({ atStart: false, atEnd: false });
  });
  it('turns both arrows off when everything fits', () => {
    expect(edgeState(0, 600, 600)).toEqual({ atStart: true, atEnd: true });
  });
  it('moves one step either way', () => {
    expect(scrollTarget(0, 400, 1200, 1, 300)).toBe(300);
    expect(scrollTarget(300, 400, 1200, -1, 300)).toBe(0);
  });
  it('never scrolls past either end (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 2000 }),
        fc.integer({ min: 0, max: 4000 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.constantFrom<1 | -1>(1, -1),
        fc.integer({ min: 1, max: 800 }),
        (client, extra, left, dir, step) => {
          const scrollW = client + extra;
          const t = scrollTarget(left, client, scrollW, dir, step);
          return t >= 0 && t <= Math.max(0, scrollW - client);
        },
      ),
    );
  });
});
