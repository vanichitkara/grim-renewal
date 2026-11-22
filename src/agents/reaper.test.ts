import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import type { AgentEvent, Subscription } from '../types.ts';
import { _clearForTest, emit, getHistory, subscribe } from './event-bus.ts';
import {
  _resetForTest,
  getState,
  getTransitionLog,
  requestCancel,
  setAdapters,
} from './reaper.ts';

function makeSub(over: Partial<Subscription> = {}): Subscription {
  return {
    id: 'abc12345',
    merchant: 'Acme',
    plan: null,
    monthlyAmount: 10,
    billingCycle: 'monthly',
    chargeCount: 3,
    totalSpent: 30,
    lastChargeDate: '2026-10-01',
    renewalDate: null,
    trialEndDate: null,
    accountEmail: 'demo@example.com',
    cancelUrl: null,
    phoneOnly: false,
    phone: null,
    memberId: null,
    forgottenScore: 0.5,
    state: 'idle',
    stateChangedAt: '2026-10-01T00:00:00Z',
    ...over,
  };
}

const ok = async () => ({ ok: true as const });
const fail = (reason: string) => async () => ({ ok: false as const, reason });
const flush = () => new Promise((r) => setTimeout(r, 0));
const kinds = (): string[] => getHistory().map((e: AgentEvent) => e.kind);

beforeEach(() => {
  _resetForTest();
  _clearForTest();
});

describe('reaper', () => {
  it('runs no adapter before approved', async () => {
    const api = vi.fn(ok);
    setAdapters({ api });
    const sub = makeSub();
    requestCancel(sub);
    await flush();
    expect(api).not.toHaveBeenCalled();
    expect(getState(sub.id)).toBe('knocking');
    expect(kinds()).toEqual([]);
  });

  it('success emits cancel_start then cancel_ok once', async () => {
    setAdapters({ api: ok });
    const sub = makeSub();
    requestCancel(sub);
    emit({ kind: 'approved', subscriptionId: sub.id });
    await flush();
    expect(kinds()).toEqual(['approved', 'cancel_start', 'cancel_ok']);
    expect(getState(sub.id)).toBe('dead');
    expect(getTransitionLog().every((t) => !Number.isNaN(Date.parse(t.at)))).toBe(true);
  });

  it('phoneOnly emits cancel_fail and never calls api/browser', async () => {
    const api = vi.fn(ok);
    const browser = vi.fn(ok);
    setAdapters({ api, browser });
    const sub = makeSub({ phoneOnly: true });
    requestCancel(sub);
    emit({ kind: 'approved', subscriptionId: sub.id });
    await flush();
    expect(api).not.toHaveBeenCalled();
    expect(browser).not.toHaveBeenCalled();
    expect(kinds()).toContain('cancel_fail');
    expect(getState(sub.id)).toBe('boss');
  });

  it('falls through methods in order, then boss_resolved ends it', async () => {
    const order: string[] = [];
    setAdapters({
      api: async () => (order.push('api'), { ok: false, reason: 'x' }),
      browser: async () => (order.push('browser'), { ok: false, reason: 'y' }),
      unsubscribe_header: async () => (order.push('unsub'), { ok: false, reason: 'z' }),
    });
    const methods: string[] = [];
    subscribe((e) => e.kind === 'cancel_start' && methods.push(e.method));
    const sub = makeSub();
    requestCancel(sub);
    emit({ kind: 'approved', subscriptionId: sub.id });
    await flush();
    expect(order).toEqual(['api', 'browser', 'unsub']);
    expect(methods).toEqual(['api', 'browser', 'unsubscribe_header', 'boss_door']);
    expect(getState(sub.id)).toBe('boss');
    emit({ kind: 'boss_resolved', subscriptionId: sub.id });
    expect(getState(sub.id)).toBe('dead');
    const steps = getTransitionLog().filter((t) => t.subscriptionId === sub.id).map((t) => t.to);
    expect(steps.slice(-2)).toEqual(['boss_resolved', 'dead']);
  });

  it('falls to a later method when an earlier one fails', async () => {
    setAdapters({ api: fail('no'), browser: ok });
    const sub = makeSub();
    requestCancel(sub);
    emit({ kind: 'approved', subscriptionId: sub.id });
    await flush();
    expect(getState(sub.id)).toBe('dead');
  });

  it('cancelling twice is safe (property)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (succeed) => {
        _resetForTest();
        _clearForTest();
        setAdapters({ api: succeed ? ok : fail('no') });
        const sub = makeSub();
        requestCancel(sub);
        emit({ kind: 'approved', subscriptionId: sub.id });
        await flush();
        const before = getHistory().length;
        const state = getState(sub.id);
        requestCancel(sub);
        emit({ kind: 'approved', subscriptionId: sub.id });
        await flush();
        // Only the test's own 'approved' emit may appear; no cancel events.
        expect(getHistory().slice(before).map((e) => e.kind)).toEqual(['approved']);
        expect(getState(sub.id)).toBe(state);
      }),
      { numRuns: 20 },
    );
  });
});
