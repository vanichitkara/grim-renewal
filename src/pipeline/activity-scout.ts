/**
 * Activity Scout — queries Gmail for login-alert and activity emails per merchant.
 *
 * Stub: returns conservative defaults for every subscription until the second
 * Gmail pass is implemented.
 *
 * PRIVACY: token is never logged; only session-auth.ts stores it.
 */

import type { Subscription } from '../types.ts';
import type { ActivitySignals } from '../agents/coroner.ts';

/**
 * Scan Gmail for login-alert and activity emails, one entry per subscription.
 *
 * Stub — will query Gmail for login alerts and activity emails per merchant.
 *
 * @param token - gmail.readonly OAuth token (stored only by session-auth.ts, never logged).
 * @param subs  - Subscriptions from Scout; used to key the returned signals.
 * @returns Conservative ActivitySignals for each subscription (same order).
 */
export async function scanActivitySignals(
  token: string,
  subs: Subscription[],
): Promise<ActivitySignals[]> {
  // shortcut: returns all-null/default signals; replace once Gmail MCP is connected.
  void token; // token accepted for future use; not used in stub
  return subs.map((sub) => ({
    subscriptionId: sub.id,
    daysSinceLoginAlert: null,
    daysSinceActivityEmail: null,
    chargesWithoutActivity: sub.chargeCount, // assume no activity emails found
    isTrialOnly: false,
  }));
}
