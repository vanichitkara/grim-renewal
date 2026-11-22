/**
 * Coroner agent — scores how forgotten each subscription is.
 *
 * Input:  Subscription list from Scout (forgottenScore = 0 on all entries).
 * Output: Same list with forgottenScore populated in [0, 1].
 *
 * Does NOT modify any other field.
 * Does NOT call Gmail. The caller passes pre-fetched activity signals.
 */

import type { Subscription } from '../types.ts';

export interface ActivitySignals {
  subscriptionId: string;
  /** Days since the last login-alert email (null = never found) */
  daysSinceLoginAlert: number | null;
  /** Days since the last activity/usage email (null = never found) */
  daysSinceActivityEmail: number | null;
  /** Number of months with a receipt but no activity email that month */
  chargesWithoutActivity: number;
  /** Whether this subscription only has trial receipts (no paid receipts) */
  isTrialOnly: boolean;
}

/**
 * Compute a forgottenScore in [0, 1] from activity signals.
 * Higher = more forgotten.
 */
export function computeForgottenScore(signals: ActivitySignals): number {
  const daysSinceActivity =
    signals.daysSinceActivityEmail ?? signals.daysSinceLoginAlert ?? 365;

  const totalCharges = Math.max(1, signals.chargesWithoutActivity + 1);
  const noActivityRatio = signals.chargesWithoutActivity / totalCharges;

  const raw =
    (Math.min(daysSinceActivity, 365) / 365) * 0.6 +
    noActivityRatio * 0.3 +
    (signals.isTrialOnly ? 0.1 : 0.0);

  let penalty = 0;
  if (signals.daysSinceLoginAlert !== null && signals.daysSinceLoginAlert <= 14) {
    penalty += 0.3;
  }
  if (signals.daysSinceActivityEmail !== null && signals.daysSinceActivityEmail <= 30) {
    penalty += 0.2;
  }

  return Math.max(0, Math.min(1, raw - penalty));
}

/**
 * Apply forgottenScores to a subscription list.
 * Returns a new list; does not mutate inputs.
 */
export function scoreSubscriptions(
  subscriptions: Subscription[],
  signals: ActivitySignals[],
): Subscription[] {
  const signalMap = new Map(signals.map((s) => [s.subscriptionId, s]));

  return subscriptions.map((sub) => {
    const s = signalMap.get(sub.id);
    if (!s) return sub; // no signals → score stays at default

    return {
      ...sub,
      forgottenScore: computeForgottenScore(s),
    };
  });
}
