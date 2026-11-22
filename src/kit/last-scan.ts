/**
 * Remember the last scan so the next sign-in can compare. Ids, names, dates, amounts, currency and
 * sender domain only: no tokens, no email text, no account address. Storage is injectable for tests.
 */
import type { Subscription } from '../types.ts';

export const SUBS_KEY = 'grim_subs';
export const CELEBRATED_KEY = 'grim_celebrated';
export type KV = Pick<Storage, 'getItem' | 'setItem'>;

function def(): KV | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const str = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function saveLastScan(subs: readonly Subscription[], storage: KV | null = def()): void {
  if (!storage) return;
  const slim = subs.map((s) => ({
    id: s.id, merchant: s.merchant, plan: s.plan, monthlyAmount: s.monthlyAmount, billingCycle: s.billingCycle,
    chargeCount: s.chargeCount, totalSpent: s.totalSpent, lastChargeDate: s.lastChargeDate, renewalDate: s.renewalDate,
    trialEndDate: s.trialEndDate, forgottenScore: s.forgottenScore, senderDomain: s.senderDomain,
    chargeDates: s.chargeDates, cancellationEmailDate: s.cancellationEmailDate, currency: s.currency,
  }));
  try {
    storage.setItem(SUBS_KEY, JSON.stringify(slim));
  } catch {
    /* storage full or blocked: skip, the app still works */
  }
}

export function loadLastScan(storage: KV | null = def()): Subscription[] {
  if (!storage) return [];
  try {
    const raw: unknown = JSON.parse(storage.getItem(SUBS_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const out: Subscription[] = [];
    for (const r of raw as Record<string, unknown>[]) {
      if (!r || !str(r['id'], 32) || !str(r['merchant']) || !num(r['monthlyAmount']) || !str(r['lastChargeDate'], 40)) continue;
      const cycle = r['billingCycle'] === 'annual' || r['billingCycle'] === 'monthly' ? r['billingCycle'] : 'unknown';
      out.push({
        id: r['id'], merchant: r['merchant'], plan: str(r['plan']) ? r['plan'] : null,
        monthlyAmount: r['monthlyAmount'], billingCycle: cycle,
        chargeCount: num(r['chargeCount']) ? r['chargeCount'] : 0, totalSpent: num(r['totalSpent']) ? r['totalSpent'] : 0,
        lastChargeDate: r['lastChargeDate'], renewalDate: str(r['renewalDate'], 40) ? r['renewalDate'] : null,
        trialEndDate: str(r['trialEndDate'], 40) ? r['trialEndDate'] : null,
        accountEmail: '', cancelUrl: null, phoneOnly: false, phone: null, memberId: null,
        forgottenScore: num(r['forgottenScore']) ? r['forgottenScore'] : 0, state: 'idle', stateChangedAt: r['lastChargeDate'],
        ...(str(r['senderDomain']) ? { senderDomain: r['senderDomain'] } : {}),
        ...(Array.isArray(r['chargeDates']) ? { chargeDates: (r['chargeDates'] as unknown[]).filter((d): d is string => str(d, 40)).slice(-36) } : {}),
        ...(str(r['cancellationEmailDate'], 40) ? { cancellationEmailDate: r['cancellationEmailDate'] } : {}),
        ...(str(r['currency'], 8) ? { currency: r['currency'] } : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Ids already celebrated as Verified, so the coins fall once per subscription. */
export function loadCelebrated(storage: KV | null = def()): Set<string> {
  if (!storage) return new Set();
  try {
    const raw: unknown = JSON.parse(storage.getItem(CELEBRATED_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => str(x, 32)) : []);
  } catch {
    return new Set();
  }
}

export function markCelebrated(id: string, storage: KV | null = def()): void {
  if (!storage) return;
  const set = loadCelebrated(storage);
  set.add(id);
  try {
    storage.setItem(CELEBRATED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}
