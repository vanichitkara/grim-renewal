import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  CANVAS_W, COLS, PER_PAGE, FLOOR, pageCount, pageOf, clampPage, pageSlots, slotPos, torchXs,
  pageInfo, travelKind, glideMs, pace, BLINK_DIST, DOOR_W, DOOR_H, UPPER_FLOOR,
} from './layout.ts';

const counts = Array.from({ length: 24 }, (_, i) => i + 1);

describe('paging', () => {
  it('counts pages for 1..24 subscriptions', () => {
    for (const n of counts) expect(pageCount(n)).toBe(Math.ceil(n / PER_PAGE));
    expect(pageCount(0)).toBe(1);
    expect(pageCount(PER_PAGE)).toBe(1);
    expect(pageCount(PER_PAGE + 1)).toBe(2);
    expect(pageCount(24)).toBe(Math.ceil(24 / PER_PAGE));
  });

  it('never draws more than PER_PAGE slots, and every slot is on exactly one page', () => {
    for (const n of counts) {
      const seen: number[] = [];
      for (let p = 0; p < pageCount(n); p++) {
        const s = pageSlots(n, p);
        expect(s.length).toBeLessThanOrEqual(PER_PAGE);
        expect(s.length).toBeGreaterThan(0);
        s.forEach((i) => expect(pageOf(i)).toBe(p));
        seen.push(...s);
      }
      expect(seen).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });

  it('clamps out-of-range and odd page numbers', () => {
    expect(clampPage(-3, 20)).toBe(0);
    expect(clampPage(99, 20)).toBe(pageCount(20) - 1);
    expect(clampPage(NaN, 20)).toBe(0);
    expect(clampPage(1.9, 20)).toBe(1);
    expect(pageSlots(5, 7)).toEqual(pageSlots(5, 0));
  });

  it('pageInfo is 1-based and describes the range', () => {
    expect(pageInfo(0, 0)).toMatchObject({ page: 1, pages: 1, first: 0, last: 0, total: 0 });
    expect(pageInfo(12, 0)).toMatchObject({ page: 1, pages: 2, first: 1, last: PER_PAGE });
    expect(pageInfo(12, 1)).toMatchObject({ page: 2, pages: 2, first: PER_PAGE + 1, last: 12 });
    expect(pageInfo(12, 9).page).toBe(2);
  });
});

describe('slot positions', () => {
  it('alternate ground door and upper door, ground first (so the first slots are on the ground)', () => {
    expect(slotPos(0).floor).toBe('ground');
    expect(slotPos(1).floor).toBe('upper');
    expect(slotPos(PER_PAGE).floor).toBe('ground');
    expect(slotPos(PER_PAGE + 1).floor).toBe('upper');
  });

  it('every slot is a door of the same size on one of two floors: 4 ground, 4 upper per page', () => {
    const floors = Array.from({ length: PER_PAGE }, (_, i) => slotPos(i).floor);
    expect(floors.filter((f) => f === 'ground')).toHaveLength(COLS);
    expect(floors.filter((f) => f === 'upper')).toHaveLength(COLS);
    for (let i = 0; i < PER_PAGE; i++) {
      const s = slotPos(i);
      expect(s.feetY - s.top).toBe(DOOR_H);
      expect(s.feetY).toBe(s.floor === 'ground' ? FLOOR : UPPER_FLOOR);
    }
  });

  it('fit inside the canvas and do not overlap, for every slot of 1..24', () => {
    for (const n of counts) {
      for (let p = 0; p < pageCount(n); p++) {
        const boxes = pageSlots(n, p).map((i) => {
          const s = slotPos(i);
          return { l: s.cx - DOOR_W / 2, r: s.cx + DOOR_W / 2, floor: s.floor, top: s.top };
        });
        for (const b of boxes) {
          expect(b.l).toBeGreaterThanOrEqual(0);
          expect(b.r).toBeLessThanOrEqual(CANVAS_W);
          expect(b.top).toBeGreaterThanOrEqual(27); // below the roof
        }
        for (const a of boxes) for (const b of boxes) {
          if (a !== b && a.floor === b.floor) expect(a.r <= b.l || b.r <= a.l).toBe(true);
        }
      }
    }
  });

  it('upper doors stand above the ground doors, with room for a tag between', () => {
    for (let c = 0; c < COLS; c++) {
      const g = slotPos(c * 2), u = slotPos(c * 2 + 1);
      expect(u.cx).toBe(g.cx);
      expect(u.feetY).toBeLessThan(g.top);
      expect(u.tagY).toBeLessThanOrEqual(g.top);
    }
  });

  it('uses the same positions on every page and has COLS columns', () => {
    expect(slotPos(3)).toMatchObject({ cx: slotPos(3 + PER_PAGE).cx, floor: slotPos(3 + PER_PAGE).floor });
    const cols = new Set(Array.from({ length: PER_PAGE }, (_, i) => slotPos(i).col));
    expect(cols.size).toBe(COLS);
  });

  it('puts the reaper beside the door, hovering up to the landing for upper doors', () => {
    const ground = slotPos(0), upper = slotPos(1);
    expect(ground.reaperLift).toBe(0);
    expect(upper.reaperLift).toBe(FLOOR - UPPER_FLOOR);
    expect(ground.reaperX).toBeLessThan(ground.cx);
    expect(upper.reaperX).toBeLessThan(upper.cx);
  });

  it('leaves empty wall between the resting reaper and the first door', () => {
    // The reaper rests at x 20 (hallway START_X). The first door's left edge must sit well past him.
    expect(slotPos(0).cx - DOOR_W / 2).toBeGreaterThanOrEqual(20 + 60);
    expect(slotPos(PER_PAGE - 1).cx + DOOR_W / 2).toBeLessThanOrEqual(CANVAS_W - 20);
  });

  it('torches sit between columns', () => {
    const t = torchXs();
    expect(t).toHaveLength(COLS);
    t.forEach((x) => expect(x).toBeLessThanOrEqual(CANVAS_W));
  });
});

describe('travel and pace', () => {
  it('glides short hops, blinks far ones, does nothing when already there', () => {
    expect(travelKind(10, 0, 10, 0)).toBe('none');
    expect(travelKind(10, 0, 10 + BLINK_DIST, 0)).toBe('glide');
    expect(travelKind(10, 0, 12 + BLINK_DIST, 0)).toBe('blink');
    expect(travelKind(10, 0, 10, 98)).toBe('glide');
    expect(travelKind(10, 98, 400, 0)).toBe('blink');
  });

  it('glide time stays inside a readable range and grows with distance', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 2000, noNaN: true }), (d) => {
      const ms = glideMs(d);
      return ms >= 220 && ms <= 650;
    }));
    expect(glideMs(100)).toBeLessThan(glideMs(200));
  });

  it('long queues play faster with fewer knocks, never below 1 knock or above 2.5x', () => {
    expect(pace(1, 3)).toEqual({ knocks: 3, speed: 1 });
    expect(pace(4, 3)).toEqual({ knocks: 3, speed: 1 });
    expect(pace(8, 3)).toEqual({ knocks: 2, speed: 1.3 });
    expect(pace(12, 3)).toEqual({ knocks: 1, speed: 1.8 });
    expect(pace(24, 3)).toEqual({ knocks: 1, speed: 2.5 });
    fc.assert(fc.property(fc.integer({ min: 0, max: 60 }), fc.integer({ min: 0, max: 6 }), (q, k) => {
      const p = pace(q, k);
      return p.knocks >= 1 && p.knocks <= Math.max(1, k) && p.speed >= 1 && p.speed <= 2.5;
    }));
    let prev = 0;
    for (let q = 1; q <= 30; q++) { const s = pace(q, 3).speed; expect(s).toBeGreaterThanOrEqual(prev); prev = s; }
  });
});
