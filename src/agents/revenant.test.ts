import { describe, it, expect, beforeEach } from 'vitest';
import type { Subscription } from '../types.ts';
import { _clearForTest, getHistory } from './event-bus.ts';
import { _resetForTest, getState } from './reaper.ts';
import { _resetRevenantsForTest, detectRevenants, emitRevenants } from './revenant.ts';

function sub(over: Partial<Subscription> = {}): Subscription {
  return {
    id: 'rev1', merchant: 'Acme', plan: null, monthlyAmount: 10, billingCycle: 'monthly',
    chargeCount: 3, totalSpent: 30, lastChargeDate: '2026-10-01', renewalDate: null,
    trialEndDate: null, accountEmail: 'demo@example.com', cancelUrl: null, phoneOnly: false,
    phone: null, memberId: null, forgottenScore: 0.5, state: 'idle',
    stateChangedAt: '2026-10-05T00:00:00Z', ...over,
  };
}

const dead = sub({ state: 'dead' });
const again = sub({ lastChargeDate: '2026-11-01' });

beforeEach(() => {
  _clearForTest();
  _resetForTest();
  _resetRevenantsForTest();
});

describe('detectRevenants', () => {
  it('finds nothing before death', () => {
    expect(detectRevenants([sub()], [again])).toEqual([]);
  });
  it('finds nothing if the last charge is older than death', () => {
    expect(detectRevenants([dead], [sub()])).toEqual([]);
  });
  it('finds a charge after death (dead and boss_resolved)', () => {
    expect(detectRevenants([dead], [again]).map((s) => s.id)).toEqual(['rev1']);
    expect(detectRevenants([sub({ state: 'boss_resolved' })], [again])).toHaveLength(1);
  });
});

describe('emitRevenants', () => {
  it('emits once, resets reaper state, and is idempotent on repeat scans', () => {
    emitRevenants([dead], [again]);
    emitRevenants([dead], [again]);
    const evs = getHistory().filter((e) => e.kind === 'revenant');
    expect(evs).toEqual([{ kind: 'revenant', subscriptionId: 'rev1', newChargeDate: '2026-11-01' }]);
    expect(getState('rev1')).toBe('idle');
  });
});
