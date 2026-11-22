import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { frameIndex, stripRect, validateManifest, MANIFEST, getSprite } from './sprites.ts';

describe('frameIndex', () => {
  it('is always within [0, frames-1]', () => {
    fc.assert(fc.property(
      fc.double({ min: -1e6, max: 1e6, noNaN: false }),
      fc.double({ min: -100, max: 100 }),
      fc.integer({ min: 1, max: 12 }),
      fc.boolean(),
      (t, fps, frames, loop) => {
        const i = frameIndex(t, fps, frames, loop);
        return Number.isInteger(i) && i >= 0 && i <= frames - 1;
      },
    ));
  });
  it('loops and clamps', () => {
    expect(frameIndex(1.0, 4, 4, true)).toBe(0);
    expect(frameIndex(0.3, 10, 4, true)).toBe(3);
    expect(frameIndex(5, 10, 4, false)).toBe(3);
    expect(frameIndex(-1, 10, 4, true)).toBe(2);
  });
});

describe('stripRect / manifest', () => {
  const d = { name: 'x', file: 'x.png', frameW: 32, frameH: 48, frames: 4 };
  it('places frames left to right and clamps', () => {
    expect(stripRect(d, 2)).toEqual({ sx: 64, sy: 0, sw: 32, sh: 48 });
    expect(stripRect(d, 99).sx).toBe(96);
    expect(stripRect(d, -3).sx).toBe(0);
  });
  it('shipped manifest is valid', () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
  });
  it('rejects bad entries', () => {
    expect(validateManifest([d, d]).length).toBeGreaterThan(0);
    expect(validateManifest([{ ...d, frames: 0 }]).length).toBeGreaterThan(0);
  });
  it('PNG sizes match the manifest', () => {
    for (const m of MANIFEST) {
      const buf = readFileSync(new URL(`../../public/assets/sprites/${m.file}`, import.meta.url));
      expect(buf.readUInt32BE(16), m.name).toBe(m.frameW * m.frames);
      expect(buf.readUInt32BE(20), m.name).toBe(m.frameH);
    }
  });
  it('getSprite is null before loading', () => {
    expect(getSprite('reaper_idle')).toBeNull();
  });
});
