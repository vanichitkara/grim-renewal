/**
 * Demo shim for demo mode.
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

const DAY = 86_400_000;
/** ISO day, `n` days before today (demo dates move with the clock so statuses stay true). */
const daysAgo = (n: number): string => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
/** `count` monthly receipt dates, the newest `lastAgo` days ago, oldest first. */
const history = (lastAgo: number, count: number): string[] =>
  Array.from({ length: count }, (_, i) => daysAgo(lastAgo + (count - 1 - i) * 30));

/** Receipt history for the demo. `lastAgo` is when the newest receipt arrived. */
const receipts = (domain: string, lastAgo: number, count: number, extra: string[] = []) => ({
  senderDomain: domain,
  currency: 'USD',
  chargeDates: [...history(lastAgo, count), ...extra].sort(),
  lastChargeDate: [...history(lastAgo, count), ...extra].sort().pop()!,
});

/** Claims the demo pretends the user made. Kept in memory only; never written to storage. */
export const DEMO_CLAIMS: Record<string, string> = {
  meal: daysAgo(50),   // claimed cancelled, no receipt since: Verified
  design: daysAgo(90), // claimed cancelled, then a new receipt: Came back
};

export const SUBS: Subscription[] = [
  {
    id: 'flix',
    merchant: 'StreamFlix Premium',
    plan: 'Premium',
    monthlyAmount: 22.99,
    billingCycle: 'monthly',
    chargeCount: 12,
    totalSpent: 275.88,
    ...(receipts('streamflix.com', 8, 12)),
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
    ...(receipts('cloudboxpro.com', 42, 12)),
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
    ...(receipts('mealcrate.com', 80, 7)),
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
    ...(receipts('ironcoregym.com', 12, 12)),
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

/** Extra demo subscriptions, only with ?demo&many, so the scene needs a second page and the List has real length. */
const extra = (id: string, merchant: string, amount: number, domain: string, lastAgo: number, count: number, score: number, more: Partial<Subscription> = {}, hist: string[] = []): Subscription => ({
  id, merchant, plan: null, monthlyAmount: amount, billingCycle: 'monthly', chargeCount: count, totalSpent: Math.round(amount * count * 100) / 100,
  renewalDate: null, trialEndDate: null, accountEmail: 'demo@example.com', cancelUrl: `https://example.com/cancel/${id}`,
  phoneOnly: false, phone: null, memberId: null, forgottenScore: score, state: 'idle', stateChangedAt: new Date().toISOString(),
  ...receipts(domain, lastAgo, count, hist), ...more,
});

export const MORE_SUBS: Subscription[] = [
  // Cancelled, then a new charge arrived: Came back (the Dispute tab shows).
  extra('design', 'DesignHub', 14.99, 'designhub.com', 100, 5, 0.8, {}, [daysAgo(20)]),
  extra('tune', 'TuneBox Music', 10.99, 'tuneboxmusic.com', 6, 12, 0.7),
  extra('news', 'Daily Ledger News', 6.5, 'dailyledger.com', 55, 12, 0.85),
  extra('cook', 'PanTry Recipes', 7.99, 'pantryrecipes.com', 14, 9, 0.9),
  extra('vault', 'VaultPass', 3.99, 'vaultpass.com', 3, 12, 0.3),
  extra('yoga', 'Zenly Yoga', 12, 'zenly.com', 20, 8, 0.65, { phone: '(555) 010-2299' }),
];
export const MORE_CONFIGS: ZombieConfig[] = [
  { forgotten: 0.8, shirt: '#2f8f86' }, { forgotten: 0.7, shirt: '#a8343a' }, { forgotten: 0.85, shirt: '#33609e' },
  { forgotten: 0.9, shirt: '#a3762e' }, { forgotten: 0.3, shirt: '#5f3aa0' }, { forgotten: 0.65, shirt: '#b0447a' },
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
  const sub = [...SUBS, ...MORE_SUBS, ...TRIALS].find((s) => s.id === id);
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
