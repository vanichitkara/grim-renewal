/**
 * assessCancellation: decide, from dates only, whether a subscription looks cancelled
 * and how much that avoided. Pure and deterministic. When unsure it answers `none`
 * with a plain note and never claims a saving.
 *
 * Levels:
 *  - confirmed: a cancellation email, or the user's own claim. A claim is the user's
 *    word, not the merchant's.
 *  - likely:    no receipt at the expected date plus 5 days (absence of evidence).
 *  - quiet:     likely, and a full cycle has passed since. Still absence only, so it
 *               is NOT called verified.
 *  - verified:  confirmed AND a full cycle with no new receipt.
 *  - came_back: a receipt dated after the confirmed basis (a Revenant).
 */
import type { Subscription } from '../types.ts';
import { cleanDates, dayNumber, DAY_MS, isoFromDay, usualGapDays } from './cadence.ts';

export type Level = 'none' | 'confirmed' | 'likely' | 'quiet' | 'verified' | 'came_back';

export interface Claim { claimedAt: string }

export interface Assessment {
  level: Level;
  /** Words for the UI. Never says "Verified" unless level is verified. */
  display: string;
  /** What made it confirmed: the user's claim, or a cancellation email. */
  basis?: 'claim' | 'email';
  /** ISO day the state started (first missed renewal, the cancel day, or the new charge). */
  since?: string;
  /** ISO day the next receipt was expected. */
  expectedBy?: string;
  missedRenewals: number;
  /** missedRenewals x chargeAmount, in `currency`. */
  avoidedAmount: number;
  /** Estimate of charges avoided in the next 12 months, in `currency`. */
  projected12m: number;
  currency: string;
  notes: string[];
}

/** Days after the expected date before a missing receipt counts as missed. */
export const GRACE_DAYS = 5;
/** The scan looks back 13 months; warn when the last receipt is nearly out of it. */
const WINDOW_WARN_DAYS = 334; // about 11 months

/** Senders that bill on behalf of others: a missing receipt may just be another sender. */
const PROCESSOR_DOMAINS = [
  'apple.com', 'itunes.com', 'google.com', 'googleplay.com', 'paypal.com', 'stripe.com',
  'paddle.com', 'paddle.net', 'fastspring.com', '2checkout.com', 'squareup.com', 'shopify.com',
];

function isProcessor(domain: string | undefined): boolean {
  const d = (domain ?? '').toLowerCase();
  return PROCESSOR_DOMAINS.some((p) => d === p || d.endsWith('.' + p));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-03" -> "3 Oct" */
function fmt(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

function renewalsText(n: number): string {
  return n === 1 ? 'One renewal missed.' : `${n} renewals missed.`;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const DISPLAY: Record<Exclude<Level, 'confirmed'>, string> = {
  none: 'Not sure yet',
  likely: 'No receipt when expected',
  quiet: 'No charge seen for a full cycle',
  verified: 'Verified: no charge seen for a full cycle',
  came_back: 'Came back: a new charge appeared',
};

export function assessCancellation(input: {
  sub: Subscription;
  claim: Claim | null;
  now: Date;
}): Assessment {
  const { sub, claim, now } = input;
  const currency = sub.currency ?? 'USD';
  const today = Math.floor(now.getTime() / DAY_MS);
  const charges = cleanDates([...(sub.chargeDates ?? []), sub.lastChargeDate]);
  const chargeAmount = round2(sub.monthlyAmount * (sub.billingCycle === 'annual' ? 12 : 1));

  const base = { missedRenewals: 0, avoidedAmount: 0, projected12m: 0, currency };
  const none = (notes: string[]): Assessment => ({ level: 'none', display: DISPLAY.none, ...base, notes });

  if (charges.length === 0 || !Number.isFinite(chargeAmount) || chargeAmount < 0) {
    return none(['No usable receipt dates.']);
  }

  const last = charges[charges.length - 1]!;
  const lastDay = dayNumber(last);
  const gap = usualGapDays(charges, sub.billingCycle);

  // Renewals r_k = last + k*gap (k >= 1) that are overdue by the grace days, from k = kMin.
  const overdue = (kMin: number): number =>
    Math.max(0, Math.floor((today - GRACE_DAYS - lastDay) / gap) - kMin + 1);
  // Renewals falling inside (today, today + 365].
  const nextYear = (): number => {
    const kFrom = Math.floor((today - lastDay) / gap) + 1;
    const kTo = Math.floor((today + 365 - lastDay) / gap);
    return Math.max(0, kTo - Math.max(1, kFrom) + 1);
  };
  const money = (missed: number): Pick<Assessment, 'avoidedAmount' | 'projected12m'> => ({
    avoidedAmount: round2(missed * chargeAmount),
    projected12m: round2(nextYear() * chargeAmount),
  });

  // ── Confirmed basis: the user's claim and/or a cancellation email ─────────
  const claimDate = claim && !Number.isNaN(dayNumber(claim.claimedAt)) ? claim.claimedAt.slice(0, 10) : null;
  const emailDate =
    sub.cancellationEmailDate && !Number.isNaN(dayNumber(sub.cancellationEmailDate))
      ? sub.cancellationEmailDate.slice(0, 10)
      : null;
  const basisDate = [claimDate, emailDate].filter((d): d is string => d !== null).sort()[0] ?? null;

  if (basisDate) {
    const basis: 'claim' | 'email' = emailDate ? 'email' : 'claim';
    const basisDay = dayNumber(basisDate);
    const basisText =
      basis === 'email' ? `Cancellation email seen on ${fmt(basisDate)}.` : `You marked it cancelled on ${fmt(basisDate)}.`;

    const later = charges.find((c) => dayNumber(c) > basisDay);
    if (later) {
      return {
        level: 'came_back',
        display: DISPLAY.came_back,
        basis,
        since: later,
        ...base,
        notes: [
          basis === 'email'
            ? `New charge on ${fmt(later)} after the cancellation email.`
            : `New charge on ${fmt(later)} after you marked it cancelled.`,
        ],
      };
    }

    const kMin = Math.max(1, Math.ceil((basisDay - lastDay) / gap));
    const missed = overdue(kMin);
    // Apple, Google, PayPal and friends bill many things from one sender: a quiet cycle there
    // proves nothing about THIS subscription, so it can be confirmed but never verified.
    const viaProcessor = isProcessor(sub.senderDomain);
    const verified = today >= basisDay + gap && !viaProcessor;
    const notes = [basisText];
    if (missed > 0) notes.push(`No receipt since ${fmt(last)}. ${renewalsText(missed)}`);
    if (viaProcessor) notes.push(`Billed through ${sub.senderDomain}, so we can't verify it from receipts. Check your ${sub.senderDomain} subscriptions page.`);
    else notes.push(verified ? 'No charge seen for a full cycle.' : 'Waiting for a full billing cycle with no charge.');
    return {
      level: verified ? 'verified' : 'confirmed',
      display: verified ? DISPLAY.verified : basis === 'email' ? 'Cancellation email seen' : 'You marked it cancelled',
      basis,
      since: basisDate,
      expectedBy: isoFromDay(lastDay + kMin * gap),
      missedRenewals: missed,
      ...money(missed),
      currency,
      notes,
    };
  }

  // ── No basis: only a receipt gap, so be strict ────────────────────────────
  if (sub.trialEndDate && dayNumber(sub.trialEndDate) >= today) return none(['Free trial still running.']);
  // Lead ruling: a 13-month scan cannot judge a 365-day gap, so annual plans never get
  // likely/quiet. Their savings come from a claim or a cancellation email only.
  if (sub.billingCycle === 'annual') {
    return none(['Annual plans need a year of history; mark it cancelled or we need a cancellation email.']);
  }
  if (charges.length < 2) return none(['Only one receipt seen, so there is no pattern yet.']);
  if (sub.billingCycle === 'unknown') return none(['Billing cycle unclear, so a missing receipt proves nothing.']);
  if (isProcessor(sub.senderDomain)) {
    return none([`Billed through ${sub.senderDomain}, so a missing receipt may come from another sender.`]);
  }

  const missed = overdue(1);
  if (missed < 1) return none(['Next receipt not due yet.']);

  const expectedDay = lastDay + gap;
  const quiet = today >= expectedDay + gap;
  const notes = [
    `No receipt since ${fmt(last)}. ${renewalsText(missed)}`,
    'Mail you archived is invisible to this scan, so this is a guess.',
  ];
  if (today - lastDay > WINDOW_WARN_DAYS) {
    notes.push('The last receipt is over 11 months old, and the scan only looks back 13 months.');
  }
  return {
    level: quiet ? 'quiet' : 'likely',
    display: quiet ? DISPLAY.quiet : DISPLAY.likely,
    since: isoFromDay(expectedDay),
    expectedBy: isoFromDay(expectedDay),
    missedRenewals: missed,
    ...money(missed),
    currency,
    notes,
  };
}

/** Add up avoided and projected amounts per currency. Never adds across currencies. */
export function sumByCurrency(
  assessments: readonly Assessment[],
): Record<string, { avoidedAmount: number; projected12m: number }> {
  const out: Record<string, { avoidedAmount: number; projected12m: number }> = {};
  for (const a of assessments) {
    const t = (out[a.currency] ??= { avoidedAmount: 0, projected12m: 0 });
    t.avoidedAmount = round2(t.avoidedAmount + a.avoidedAmount);
    t.projected12m = round2(t.projected12m + a.projected12m);
  }
  return out;
}
