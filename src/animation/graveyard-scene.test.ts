import { describe, it, expect } from 'vitest';
import { riseFor, upFor, cameraTarget } from './graveyard-scene.ts';

describe('riseFor', () => {
  it('is 0 at 10+ days, 1 at 0 days, clamped', () => {
    expect(riseFor(10)).toBe(0);
    expect(riseFor(25)).toBe(0);
    expect(riseFor(0)).toBe(1);
    expect(riseFor(-3)).toBe(1);
    expect(riseFor(4)).toBeCloseTo(0.6);
  });
});

describe('upFor', () => {
  it('peeks out only when the grave is nearly open', () => {
    expect(upFor(0.84)).toBe(0);
    expect(upFor(0.85)).toBe(0.6);
    expect(upFor(1)).toBe(0.6);
  });
});

describe('cameraTarget', () => {
  const base = { focus: null, reaperX: 50, reaperBusy: false, view: 'house' as const, hallW: 480, viewW: 480, hasYard: true };
  it('shows one scene edge to edge: the mansion (0) or the yard (480), never between', () => {
    expect(cameraTarget(base)).toBe(0);
    expect(cameraTarget({ ...base, view: 'yard' })).toBe(480);
  });
  it('follows the busy reaper by scene', () => {
    expect(cameraTarget({ ...base, reaperBusy: true, reaperX: 500 })).toBe(480);
    expect(cameraTarget({ ...base, reaperBusy: true, reaperX: 479 })).toBe(0);
    expect(cameraTarget({ ...base, reaperBusy: true, reaperX: 10, view: 'yard' })).toBe(0);
  });
  it('focus beats the reaper', () => {
    expect(cameraTarget({ ...base, reaperBusy: true, reaperX: 50, focus: 640 })).toBe(480);
    expect(cameraTarget({ ...base, focus: 400, view: 'yard' })).toBe(0);
  });
  it('never leaves the mansion without trials', () => {
    const n = { ...base, hasYard: false };
    expect(cameraTarget({ ...n, view: 'yard' })).toBe(0);
    expect(cameraTarget({ ...n, focus: 640 })).toBe(0);
    expect(cameraTarget({ ...n, reaperBusy: true, reaperX: 600 })).toBe(0);
  });
});
