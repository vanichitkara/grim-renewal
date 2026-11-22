import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Subscription } from '../types.ts';
import { daysLeft, trialList } from './graveyard.ts';

const NOW = new Date('2026-11-11T12:00:00Z');

function sub(id: string, trialEndDate: string | null): Subscription {
  return {
    id, merchant: id, plan: null, monthlyAmount: 5, billingCycle: 'monthly',
    chargeCount: 0, totalSpent: 0, lastChargeDate: '2026-11-01', renewalDate: null,
    trialEndDate, accountEmail: 'demo@example.com', cancelUrl: null, phoneOnly: false,
    phone: null, memberId: null, forgottenScore: 0, state: 'idle',
    stateChangedAt: '2026-11-01T00:00:00Z',
  };
}

const dateStr = fc
  .integer({ min: -400, max: 400 })
  .map((d) => new Date(NOW.getTime() + d * 86_400_000 + 3_600_000).toISOString());

describe('graveyard', () => {
  it('daysLeft is never NaN, even for junk', () => {
    fc.assert(fc.property(fc.oneof(dateStr, fc.string()), (s) => !Number.isNaN(daysLeft(s, NOW))));
  });

  it('list is sorted soonest first and excludes past/null trials', () => {
    fc.assert(
      fc.property(fc.array(fc.option(dateStr, { nil: null })), (dates) => {
        const list = trialList(dates.map((d, i) => sub('s' + i, d)), NOW);
        const times = list.map((t) => Date.parse(t.sub.trialEndDate!));
        expect(times.every((t) => t > NOW.getTime())).toBe(true);
        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect(list.length).toBe(dates.filter((d) => d !== null && Date.parse(d) > NOW.getTime()).length);
      }),
    );
  });

  it('urgency buckets', () => {
    const at = (d: number) => new Date(NOW.getTime() + d * 86_400_000 - 1000).toISOString();
    const u = (d: number) => trialList([sub('x', at(d))], NOW)[0]!.urgency;
    expect([u(3), u(4), u(7), u(8)]).toEqual(['urgent', 'soon', 'soon', 'ok']);
  });
});
