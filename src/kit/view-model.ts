/** Numbers and words for the results header and the List table. Pure; the DOM code only places them. */
import type { Subscription } from '../types.ts';
import { sumByCurrency, type Assessment } from '../savings/assess.ts';
import type { Status } from './status.ts';

/** A subscription at or above this score counts as "may have forgotten". */
export const FORGOTTEN_AT = 0.5;
/** A trial this close to its first charge gets a chip. */
export const TRIAL_SOON_DAYS = 3;

export function formatMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** { USD: 12, EUR: 3 } -> "$12.00 · €3.00". Empty -> "$0.00". Never adds across currencies. */
export function moneyList(byCurrency: Record<string, number>): string {
  const parts = Object.entries(byCurrency).map(([c, n]) => formatMoney(n, c));
  return parts.length ? parts.join(' · ') : formatMoney(0);
}

export interface Row { sub: Subscription; assessment: Assessment; status: Status }

export interface HeaderModel {
  headline: string;
  chips: { text: string; kind: 'urgent' | 'soon' | 'ok' }[];
  avoidedLabel: string;
  avoided: string;
  avoidedNote: string;
  projectedLabel: string;
  projected: string;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const stillPays = (s: Status): boolean => s.word === 'Found' || s.word === 'Cancel started' || s.word === 'Came back';

export function headerModel(rows: readonly Row[], trials: readonly { sub: Subscription; days: number }[]): HeaderModel {
  const forgotten = rows.filter((r) => stillPays(r.status) && r.sub.forgottenScore >= FORGOTTEN_AT);
  const perMonth: Record<string, number> = {};
  for (const r of forgotten) {
    const c = r.sub.currency ?? 'USD';
    perMonth[c] = Math.round(((perMonth[c] ?? 0) + r.sub.monthlyAmount) * 100) / 100;
  }
  const headline = forgotten.length
    ? `You pay ${moneyList(perMonth)} a month for ${plural(forgotten.length, 'thing', 'things')} you may have forgotten`
    : rows.length
      ? `${plural(rows.length, 'subscription', 'subscriptions')} found. None look forgotten.`
      : 'No subscriptions found yet';

  const chips: HeaderModel['chips'] = [];
  const soon = trials.filter((t) => t.days <= TRIAL_SOON_DAYS).length;
  if (soon) chips.push({ text: `${plural(soon, 'trial', 'trials')} ending soon`, kind: 'urgent' });
  const likely = rows.filter((r) => r.status.word === 'Likely cancelled').length;
  if (likely) chips.push({ text: `${likely} likely cancelled`, kind: 'soon' });
  const back = rows.filter((r) => r.status.word === 'Came back').length;
  if (back) chips.push({ text: `${back} came back`, kind: 'urgent' });
  const verified = rows.filter((r) => r.status.word === 'Verified').length;
  if (verified) chips.push({ text: `${verified} verified`, kind: 'ok' });

  // Avoided so far counts only Verified. Everything else is not counted yet.
  const verifiedA = rows.filter((r) => r.assessment.level === 'verified').map((r) => r.assessment);
  const pending = rows.filter((r) => r.assessment.level !== 'verified').map((r) => r.assessment);
  const avoided = sumByCurrency(verifiedA);
  const notYet = sumByCurrency(pending);
  const pick = (o: Record<string, { avoidedAmount: number; projected12m: number }>, k: 'avoidedAmount' | 'projected12m') =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v[k] > 0).map(([c, v]) => [c, v[k]]));
  const notYetAvoided = pick(notYet, 'avoidedAmount');
  const projected = pick(sumByCurrency(rows.map((r) => r.assessment)), 'projected12m');

  return {
    headline,
    chips,
    avoidedLabel: 'Avoided so far (verified)',
    avoided: moneyList(pick(avoided, 'avoidedAmount')),
    avoidedNote: Object.keys(notYetAvoided).length ? `Not counted yet, still to verify: ${moneyList(notYetAvoided)}` : '',
    projectedLabel: 'Next 12 months (estimate)',
    projected: moneyList(projected),
  };
}

export interface ListRow {
  id: string;
  name: string;
  price: string;
  forgotten: string;
  status: string;
  statusDetail: string;
  isTrial: boolean;
  /** Trial: days to the first charge. */
  trialDays: number | null;
}

export function forgottenWords(score: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  const w = score >= 0.75 ? 'Very forgotten' : score >= FORGOTTEN_AT ? 'Probably forgotten' : score >= 0.25 ? 'Sometimes used' : 'In use';
  return `${w} (${pct}%)`;
}

export function listRows(rows: readonly Row[], trials: readonly { sub: Subscription; days: number; status?: string }[]): ListRow[] {
  const subs: ListRow[] = rows.map((r) => ({
    id: r.sub.id,
    name: r.sub.merchant,
    price: r.sub.billingCycle === 'annual'
      ? `${formatMoney(r.sub.monthlyAmount * 12, r.sub.currency)}/yr`
      : `${formatMoney(r.sub.monthlyAmount, r.sub.currency)}/mo`,
    forgotten: forgottenWords(r.sub.forgottenScore),
    status: r.status.word,
    statusDetail: r.status.detail,
    isTrial: false,
    trialDays: null,
  }));
  const trs: ListRow[] = trials.map((t) => ({
    id: t.sub.id,
    name: t.sub.merchant,
    price: `then ${formatMoney(t.sub.monthlyAmount, t.sub.currency)}/mo`,
    forgotten: t.days <= 0 ? 'Trial ends today' : t.days === 1 ? 'Trial ends tomorrow' : `Trial ends in ${t.days} days`,
    status: 'Free trial',
    statusDetail: '',
    isTrial: true,
    trialDays: t.days,
  }));
  return [...subs, ...trs];
}
