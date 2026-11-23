import { describe, it, expect } from 'vitest';
import { CLAIMS_KEY, clearClaim, loadClaims, saveClaim, type ClaimStorage } from './claims.ts';
import { sweepForChanges } from '../savings/sweep.ts';
import type { Subscription } from '../types.ts';

function memory(): ClaimStorage & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return { raw, getItem: (k) => raw.get(k) ?? null, setItem: (k, v) => void raw.set(k, v) };
}

describe('claims', () => {
  it('saves, loads and clears ids and dates only', () => {
    const st = memory();
    saveClaim('abc12345', '2026-10-03T09:00:00.000Z', st);
    expect(loadClaims(st)).toEqual({ abc12345: '2026-10-03' });
    expect(st.raw.get(CLAIMS_KEY)).toBe('{"abc12345":"2026-10-03"}');
    clearClaim('abc12345', st);
    expect(loadClaims(st)).toEqual({});
  });

  it('rejects bad ids and dates, and ignores corrupt storage', () => {
    const st = memory();
    expect(() => saveClaim('a b', '2026-10-03', st)).toThrow();
    expect(() => saveClaim('abc12345', 'yesterday', st)).toThrow();
    st.raw.set(CLAIMS_KEY, '{not json');
    expect(loadClaims(st)).toEqual({});
    st.raw.set(CLAIMS_KEY, JSON.stringify({ good1: '2026-01-01', 'bad id': '2026-01-01', good2: 'x' }));
    expect(loadClaims(st)).toEqual({ good1: '2026-01-01' });
  });

  it('works without any storage', () => {
    expect(loadClaims(null)).toEqual({});
  });
});

describe('sweepForChanges', () => {
  const base: Subscription = {
    id: 'abc12345', merchant: 'Streamflix', plan: null, monthlyAmount: 10, billingCycle: 'monthly',
    chargeCount: 3, totalSpent: 30, lastChargeDate: '2026-10-03', renewalDate: null, trialEndDate: null,
    accountEmail: 'me@example.com', cancelUrl: null, phoneOnly: false, phone: null, memberId: null,
    forgottenScore: 0, state: 'idle', stateChangedAt: '2026-10-04T00:00:00.000Z',
    chargeDates: ['2026-08-03', '2026-09-03', '2026-10-03'],
  };

  it('flags a claimed sub that was charged again as changed to came_back', () => {
    const scanned = { ...base, lastChargeDate: '2026-11-03', chargeDates: [...base.chargeDates!, '2026-11-03'] };
    const [r] = sweepForChanges([base], [scanned], { abc12345: '2026-10-10' }, new Date('2026-11-10T12:00:00Z'));
    expect(r!.previous!.level).toBe('verified'); // judged on old data: a full cycle had passed
    expect(r!.assessment.level).toBe('came_back');
    expect(r!.changed).toBe(true);
  });

  it('reports a new sub with no previous and no change', () => {
    const [r] = sweepForChanges([], [base], {}, new Date('2026-10-05T12:00:00Z'));
    expect(r!.previous).toBeNull();
    expect(r!.changed).toBe(false);
  });
});
