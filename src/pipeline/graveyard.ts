/**
 * Graveyard: free trials counting down to their first charge.
 * Pure helpers only; the UI lives in src/ui/index.html.
 */

import type { Subscription } from '../types.ts';

export type Urgency = 'urgent' | 'soon' | 'ok';

export interface Trial {
  sub: Subscription;
  daysLeft: number;
  urgency: Urgency;
}

const DAY_MS = 86_400_000;

/** Whole days until the trial ends, rounded up. Unparseable dates give 0, never NaN. */
export function daysLeft(trialEndDate: string, now: Date): number {
  const ms = Date.parse(trialEndDate) - now.getTime();
  return Number.isFinite(ms) ? Math.ceil(ms / DAY_MS) : 0;
}

export function urgencyOf(days: number): Urgency {
  return days <= 3 ? 'urgent' : days <= 7 ? 'soon' : 'ok';
}

/** Subs whose trial ends in the future, soonest first. */
export function trialList(subs: Subscription[], now: Date): Trial[] {
  return subs
    .filter((s) => s.trialEndDate !== null && Date.parse(s.trialEndDate) > now.getTime())
    .map((sub) => {
      const d = daysLeft(sub.trialEndDate!, now);
      return { sub, daysLeft: d, urgency: urgencyOf(d) };
    })
    .sort((a, b) => Date.parse(a.sub.trialEndDate!) - Date.parse(b.sub.trialEndDate!));
}
