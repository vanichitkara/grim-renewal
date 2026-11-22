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
  const base = { focus: null, reaperX: 50, reaperBusy: false, view: 'house' as const, viewW: 480, worldW: 800 };
  it('uses the selected view when idle', () => {
    expect(cameraTarget(base)).toBe(0);
    expect(cameraTarget({ ...base, view: 'yard' })).toBe(320);
  });
  it('follows the reaper while busy, clamped to the world', () => {
    expect(cameraTarget({ ...base, reaperBusy: true, reaperX: 500 })).toBe(260);
    expect(cameraTarget({ ...base, reaperBusy: true, reaperX: 10 })).toBe(0);
    expect(cameraTarget({ ...base, reaperBusy: true, reaperX: 790 })).toBe(320);
  });
  it('focus beats the reaper', () => {
    expect(cameraTarget({ ...base, reaperBusy: true, reaperX: 50, focus: 604 })).toBe(320);
    expect(cameraTarget({ ...base, focus: 400 })).toBe(160);
  });
});
