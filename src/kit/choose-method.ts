/**
 * chooseMethod: which Cancel kit tab opens first, and why. Pure.
 * Order of trust: what other people reported (community), then facts on this user's own
 * receipt (a cancel link or a phone number), then the hand-kept starter list, else "unknown".
 */
import type { Subscription } from '../types.ts';
import type { TipSummary } from '../community/types.ts';

export type Tab = 'online' | 'email' | 'phone';
export type MethodSource = 'community' | 'receipt' | 'starter list' | 'unknown';

export interface MethodChoice {
  first: Tab;
  source: MethodSource;
  /** Plain words shown above the tabs. */
  why: string;
  /** All three tabs, the best guess first. */
  order: Tab[];
}

export const UNKNOWN_WHY = (merchant: string): string =>
  `We could not tell how this one works. Try in order: account page, a search link for "${merchant} cancel subscription", the email draft, the phone script if a number is known.`;

const ALL: Tab[] = ['online', 'email', 'phone'];
const orderFrom = (first: Tab): Tab[] => [first, ...ALL.filter((t) => t !== first)];
/** 'other' has no tab of its own: the account page is the closest start. */
const tabFor = (m: string): Tab => (m === 'email' || m === 'phone' ? m : 'online');
const METHOD_WORD: Record<Tab, string> = { online: 'online', email: 'by email', phone: 'by phone' };

export function chooseMethod(
  sub: Pick<Subscription, 'merchant' | 'cancelUrl' | 'phone' | 'phoneOnly'>,
  summary: TipSummary | null,
): MethodChoice {
  const make = (first: Tab, source: MethodSource, why: string): MethodChoice => ({ first, source, why, order: orderFrom(first) });

  if (summary && summary.source === 'community' && summary.best) {
    const first = tabFor(summary.best);
    return make(
      first,
      'community',
      `Most people cancel this one ${METHOD_WORD[first]} (${summary.bestWorked} of ${summary.bestTotal} say it worked).`,
    );
  }
  if (sub.phoneOnly && sub.phone) return make('phone', 'receipt', 'Your receipt lists a phone number and no cancel link. This one is phone only.');
  if (sub.cancelUrl) return make('online', 'receipt', 'Your receipt has a link to manage or cancel this subscription.');
  if (sub.phone) return make('phone', 'receipt', 'Your receipt has a phone number.');
  if (summary && summary.source === 'seed' && summary.best) {
    const first = tabFor(summary.best);
    return make(first, 'starter list', `Our starter list says this one is usually cancelled ${METHOD_WORD[first]}.`);
  }
  return make('online', 'unknown', UNKNOWN_WHY(sub.merchant));
}
