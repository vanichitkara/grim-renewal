/**
 * Demo shim for prototype mode.
 *
 * Provides a typed SUBS array (Subscription records) and a fakeCancel()
 * that emits AgentEvents onto the event bus to simulate the backend.
 * In production, real agents emit these events; this shim replaces them.
 *
 * Privacy rule: no real email addresses — accountEmail uses example.com.
 */

import type { Subscription } from '../types.ts';
import type { ZombieConfig } from '../animation/zombie.ts';
import { emit, subscribe } from '../agents/event-bus.ts';
import { emitRevenants } from '../agents/revenant.ts';
import { tune } from '../animation/hallway.ts';

export const SUBS: Subscription[] = [
  {
    id: 'flix',
    merchant: 'StreamFlix Premium',
    plan: 'Premium',
    monthlyAmount: 22.99,
    billingCycle: 'monthly',
    chargeCount: 12,
    totalSpent: 275.88,
    lastChargeDate: '2026-10-01',
    renewalDate: '2026-11-01',
    trialEndDate: null,
    accountEmail: 'demo@example.com',
    cancelUrl: 'https://example.com/cancel/streamflix',
    phoneOnly: false,
    phone: null,
    memberId: null,
    forgottenScore: 0.9,
    state: 'idle',
    stateChangedAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'cloud',
    merchant: 'CloudBox Pro',
    plan: 'Pro',
    monthlyAmount: 9.99,
    billingCycle: 'monthly',
    chargeCount: 12,
    totalSpent: 119.88,
    lastChargeDate: '2026-10-15',
    renewalDate: '2026-11-15',
    trialEndDate: null,
    accountEmail: 'demo@example.com',
    cancelUrl: 'https://example.com/cancel/cloudbox',
    phoneOnly: false,
    phone: null,
    memberId: null,
    forgottenScore: 0.45,
    state: 'idle',
    stateChangedAt: '2026-10-15T00:00:00Z',
  },
  {
    id: 'meal',
    merchant: 'MealCrate',
    plan: 'Weekly',
    monthlyAmount: 59.99,
    billingCycle: 'monthly',
    chargeCount: 7,
    totalSpent: 419.93,
    lastChargeDate: '2026-09-01',
    renewalDate: '2026-11-01',
    trialEndDate: null,
    accountEmail: 'demo@example.com',
    cancelUrl: 'https://example.com/cancel/mealcrate',
    phoneOnly: false,
    phone: null,
    memberId: null,
    forgottenScore: 0.75,
    state: 'idle',
    stateChangedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'gym',
    merchant: 'IronCore Gym',
    plan: 'Membership',
    monthlyAmount: 49.99,
    billingCycle: 'monthly',
    chargeCount: 12,
    totalSpent: 599.88,
    lastChargeDate: '2026-10-01',
    renewalDate: '2026-11-01',
    trialEndDate: null,
    accountEmail: 'demo@example.com',
    cancelUrl: null,
    phoneOnly: true,
    phone: '(555) 013-7742',
    memberId: 'IC-48213',
    forgottenScore: 1.0,
    state: 'idle',
    stateChangedAt: '2026-10-01T00:00:00Z',
  },
];

/** Zombie visual config per subscription (same order as SUBS). */
export const CONFIGS: ZombieConfig[] = [
  { forgotten: 0.9,  shirt: '#a8343a', phoneOnly: false },
  { forgotten: 0.45, shirt: '#33609e', phoneOnly: false },
  { forgotten: 0.75, shirt: '#a3762e', phoneOnly: false },
  { forgotten: 1.0,  shirt: '#5f3aa0', phoneOnly: true  },
];

const trialSub = (id: string, merchant: string, monthlyAmount: number, days: number): Subscription => ({
  id,
  merchant,
  plan: 'Free trial',
  monthlyAmount,
  billingCycle: 'monthly',
  chargeCount: 0,
  totalSpent: 0,
  lastChargeDate: new Date().toISOString(),
  renewalDate: null,
  // 1h short of N days so daysLeft() (rounds up) reads exactly N.
  trialEndDate: new Date(Date.now() + days * 86_400_000 - 3_600_000).toISOString(),
  accountEmail: 'demo@example.com',
  cancelUrl: `https://example.com/cancel/${id}`,
  phoneOnly: false,
  phone: null,
  memberId: null,
  forgottenScore: 0,
  state: 'idle',
  stateChangedAt: new Date().toISOString(),
});

/** Demo free trials with 1, 4 and 9 days left. */
export const TRIALS: Subscription[] = [
  trialSub('lumen', 'Lumen AI Pro', 19.99, 1),
  trialSub('fit', 'FitPath', 14.99, 4),
  trialSub('page', 'PageTurner Plus', 9.99, 9),
];

export const TRIAL_CONFIGS: ZombieConfig[] = [
  { forgotten: 0.6, shirt: '#2f8f86' },
  { forgotten: 0.6, shirt: '#b0447a' },
  { forgotten: 0.6, shirt: '#7a8f2f' },
];

/**
 * Simulates the backend cancel flow by emitting AgentEvents after a delay.
 * hallway.ts listens for cancel_ok / cancel_fail on the bus to advance state.
 *
 * shortcut: latency and fail are read from tune at call time; real backend
 *           would not respect tune.fail — remove that for production.
 */
export function fakeCancel(id: string): void {
  const sub = [...SUBS, ...TRIALS].find((s) => s.id === id);
  if (!sub) return;
  const delay = tune.latency / tune.speed;
  setTimeout(() => {
    if (sub.phoneOnly || tune.fail) {
      emit({ kind: 'cancel_fail', subscriptionId: id, reason: 'phone-only' });
    } else {
      emit({ kind: 'cancel_ok', subscriptionId: id, confirmedAt: new Date().toISOString() });
    }
  }, delay);
}

const deadIds: string[] = [];
subscribe((e) => {
  if (e.kind === 'cancel_ok') deadIds.push(e.subscriptionId);
});

/**
 * Scripted revenant: the most recently cancelled demo sub gets a fresh charge.
 * Goes through the real detect/emit path. Returns false if nothing is dead yet.
 */
export function raiseRevenant(): boolean {
  const id = deadIds.pop();
  const sub = SUBS.find((s) => s.id === id);
  if (!sub) return false;
  const prev = { ...sub, state: 'dead' as const, stateChangedAt: '2026-01-01T00:00:00Z' };
  const scanned = { ...sub, lastChargeDate: new Date().toISOString() };
  return emitRevenants([prev], [scanned]).length > 0;
}

/** Emit approved events for all subscriptions (triggers hallway to queue them). */
export function approveAll(): void {
  SUBS.forEach((s) => {
    emit({ kind: 'approved', subscriptionId: s.id });
  });
}
