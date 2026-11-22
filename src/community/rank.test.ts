import { describe, expect, it } from 'vitest';
import { monthsAgo, summarize, weightFor, wilsonLower } from './rank.ts';
import type { MethodKind, Row } from './types.ts';

const NOW = new Date('2026-11-22T10:00:00Z');
const K = 'netflix.com';
const row = (method: MethodKind, worked: number, failed: number, month = '2026-11'): Row => ({
  merchantKey: K, method, month, worked, failed,
});

describe('wilsonLower', () => {
  it('matches known numbers', () => {
    expect(wilsonLower(5, 5)).toBeCloseTo(0.5655, 3);
    expect(wilsonLower(3, 3)).toBeCloseTo(0.4385, 3);
    expect(wilsonLower(7, 9)).toBeCloseTo(0.4526, 3);
    expect(wilsonLower(20, 21)).toBeCloseTo(0.7733, 3);
    expect(wilsonLower(0, 0)).toBe(0);
  });
});

describe('weights', () => {
  it('full to 12 months, half to 36, then dropped', () => {
    expect(monthsAgo('2025-11', NOW)).toBe(12);
    expect(weightFor(12)).toBe(1);
    expect(weightFor(13)).toBe(0.5);
    expect(weightFor(36)).toBe(0.5);
    expect(weightFor(37)).toBe(0);
    expect(monthsAgo('junk', NOW)).toBe(Infinity);
  });
});

describe('summarize', () => {
  it('20 yes and 1 no stays settled', () => {
    const s = summarize([row('email', 20, 1)], K, NOW);
    expect(s).toMatchObject({ best: 'email', bestWorked: 20, bestTotal: 21, source: 'community' });
  });
  it('3 of 3 is not enough, 5 of 5 is, 7 of 9 is', () => {
    expect(summarize([row('email', 3, 0)], K, NOW).best).toBeNull();
    expect(summarize([row('email', 3, 0)], K, NOW).label).toBe('not enough reports yet');
    expect(summarize([row('email', 5, 0)], K, NOW).best).toBe('email');
    const s = summarize([row('email', 7, 2)], K, NOW);
    expect(s).toMatchObject({ best: 'email', bestWorked: 7, bestTotal: 9 });
  });
  it('4 of 5 is below the 0.40 bound', () => {
    expect(summarize([row('email', 4, 1)], K, NOW).best).toBeNull();
  });
  it('one fake report does not flip a settled result', () => {
    const base = [row('email', 20, 1)];
    expect(summarize([...base, row('online', 0, 1)], K, NOW).best).toBe('email');
    expect(summarize([...base, row('online', 1, 0)], K, NOW).best).toBe('email');
    expect(summarize([...base, row('email', 0, 1)], K, NOW).best).toBe('email');
  });
  it('no reports gives source none; other keys are ignored', () => {
    expect(summarize([], K, NOW)).toMatchObject({ best: null, source: 'none' });
    expect(summarize([{ ...row('email', 9, 0), merchantKey: 'other.com' }], K, NOW).source).toBe('none');
  });
  it('picks the higher lower bound, then more reports', () => {
    const s = summarize([row('email', 8, 2), row('online', 30, 5)], K, NOW);
    expect(s.best).toBe('online');
    expect(s.methods).toHaveLength(2);
  });
  it('old reports weigh half and very old ones vanish', () => {
    // 8 yes in a 20 month old bucket counts as 4, but the raw count (8) still passes the 5-report rule.
    expect(summarize([row('email', 8, 0, '2025-03')], K, NOW).best).toBe('email');
    expect(summarize([row('email', 50, 0, '2020-01')], K, NOW).source).toBe('none');
  });
});
