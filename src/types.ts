/**
 * Core domain types for Grim Renewal.
 * These are the ONLY shapes persisted to localStorage / SQLite.
 * Raw email content never appears here.
 */

export type BillingCycle = 'monthly' | 'annual' | 'unknown';

export type CancelMethod = 'api' | 'browser' | 'unsubscribe_header' | 'boss_door';

export type CancellationState =
  | 'idle'
  | 'queued'
  | 'walking'
  | 'knocking'
  | 'opening'
  | 'cancelling'
  | 'reaping'
  | 'dead'
  | 'boss'
  | 'boss_resolved';

export interface Subscription {
  /** sha256(merchant + accountEmail)[:8] */
  id: string;
  merchant: string;
  plan: string | null;
  /** Normalized to monthly equivalent */
  monthlyAmount: number;
  billingCycle: BillingCycle;
  /** Number of receipts found in the last 13 months */
  chargeCount: number;
  /** Sum of all charges found */
  totalSpent: number;
  lastChargeDate: string;      // ISO 8601
  renewalDate: string | null;  // ISO 8601
  trialEndDate: string | null; // ISO 8601
  accountEmail: string;
  cancelUrl: string | null;
  phoneOnly: boolean;
  phone: string | null;
  memberId: string | null;
  /** 0–1; higher = more forgotten. Set by Coroner agent. */
  forgottenScore: number;
  /** Current cancellation state */
  state: CancellationState;
  /** ISO 8601 timestamp of last state change */
  stateChangedAt: string;
  /** Sender's domain, e.g. "netflix.com". Optional so older literals still compile. */
  senderDomain?: string;
  /** Receipt dates (ISO 8601 day), oldest first, deduplicated, at most 36. */
  chargeDates?: string[];
  /** Date (ISO 8601 day) of the latest cancellation email seen. Date only, never text. */
  cancellationEmailDate?: string;
  /** ISO 4217 code of the amounts above, e.g. "USD". Missing means USD. */
  currency?: string;
}

/** Fields the receipt parser extracts from a single email. */
export interface ReceiptFields {
  merchant: string;
  amount: number;
  currency: string;
  date: string;
  plan: string | null;
  renewalDate: string | null;
  trialEndDate: string | null;
  billingCycle: BillingCycle;
  accountEmail: string | null;
  cancelUrl: string | null;
  phoneOnly: boolean;
  phone: string | null;
  memberId: string | null;
  /** Domain of the sender, passed through from the caller. */
  senderDomain: string;
}

/** Events emitted by agents onto the shared event bus. */
export type AgentEvent =
  | { kind: 'discovered';    subscriptionId: string; data: Subscription }
  | { kind: 'scored';        subscriptionId: string; forgottenScore: number }
  | { kind: 'approved';      subscriptionId: string }
  | { kind: 'cancel_start';  subscriptionId: string; method: CancelMethod }
  | { kind: 'cancel_ok';     subscriptionId: string; confirmedAt: string }
  | { kind: 'cancel_fail';   subscriptionId: string; reason: string }
  | { kind: 'boss_resolved'; subscriptionId: string }
  | { kind: 'revenant';      subscriptionId: string; newChargeDate: string };
