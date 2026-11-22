import { describe, it, expect } from 'vitest';
import { createSimulatedAdapter } from './simulated.ts';
import type { Subscription } from '../../types.ts';

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: 'a', merchant: 'Netflix', plan: null, monthlyAmount: 9.99, billingCycle: 'monthly',
  chargeCount: 1, totalSpent: 9.99, lastChargeDate: '2026-01-01', renewalDate: null,
  trialEndDate: null, accountEmail: 'me@example.com', cancelUrl: null, phoneOnly: false,
  phone: null, memberId: null, forgottenScore: 0, state: 'idle', stateChangedAt: '2026-01-01',
  ...over,
});

describe('simulated adapter', () => {
  it('succeeds after the user confirms', async () => {
    expect(await createSimulatedAdapter(0)(sub(), async () => true)).toEqual({ ok: true });
  });
  it('stops when the user declines', async () => {
    expect(await createSimulatedAdapter(0)(sub(), async () => false)).toEqual({ ok: false, reason: 'user_declined' });
  });
  it('never succeeds for a phone-only subscription', async () => {
    expect(await createSimulatedAdapter(0)(sub({ phoneOnly: true }), async () => true)).toEqual({ ok: false, reason: 'phone_only' });
  });
});
