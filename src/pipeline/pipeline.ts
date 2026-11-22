/**
 * Pipeline — orchestrates Scout → Coroner → EventBus.
 *
 * PRIVACY: token is accepted from the caller and passed only to scanInbox().
 * It is never logged, stored, or forwarded to any other function.
 */

import { scanInbox, type ScanProgress } from './gmail-scout.ts';
import { scoreSubscriptions } from '../agents/coroner.ts';
import { scanActivitySignals } from './activity-scout.ts';
import { emit } from '../agents/event-bus.ts';
import { requestCancel } from '../agents/reaper.ts';

/**
 * Run the full subscription discovery pipeline.
 *
 * 1. Scan inbox for receipts (Scout).
 * 2. Build ActivitySignals — conservative defaults for now.
 *    TODO: Replace with real activity signal pass once Gmail MCP is connected.
 * 3. Score subscriptions (Coroner).
 * 4. Emit `discovered` + `scored` AgentEvents for each subscription onto the bus.
 *
 * @param token        - gmail.readonly OAuth access token (memory-only, never persisted).
 * @param accountEmail - Authenticated Gmail address; stored only in Subscription.accountEmail.
 */
export async function runPipeline(
  token: string,
  accountEmail: string,
  onProgress?: (p: ScanProgress) => void,
): Promise<number> {
  // Step 1: scan inbox for receipts.
  const subs = await scanInbox(token, accountEmail, undefined, onProgress);

  // Step 2: build ActivitySignals (stub — conservative defaults).
  const signals = await scanActivitySignals(token, subs);

  // Step 3: score subscriptions.
  const scored = scoreSubscriptions(subs, signals);

  // Step 4: emit events onto the bus so hallway.ts can react.
  for (const sub of scored) {
    emit({ kind: 'discovered', subscriptionId: sub.id, data: sub });
    emit({ kind: 'scored', subscriptionId: sub.id, forgottenScore: sub.forgottenScore });
    // Parks the sub at `knocking`; nothing runs until the user approves it in the UI.
    requestCancel(sub);
  }
  return scored.length;
}
