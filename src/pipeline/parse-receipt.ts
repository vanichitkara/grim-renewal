/**
 * Receipt parser — pure function.
 * Takes raw message text + sender domain, returns structured fields or null.
 *
 * PRIVACY: caller must discard messageText immediately after this call.
 * This function never logs, stores, or emits message content.
 */

import type { BillingCycle, ReceiptFields } from '../types.ts';

// ── Amount parsing ────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  'A$': 'AUD',
  'C$': 'CAD',
};

const CURRENCY_CODES = /\b(USD|EUR|GBP|JPY|AUD|CAD)\b/i;

const TOTAL_HINT = /total|amount\s+(charged|paid|due)|you\s+(paid|were\s+charged)|charged/i;
const SKIP_LINE = /\b(tax|subtotal|shipping|discount)\b/i;

/**
 * Find the charged amount: one near "total"/"charged"/"you paid" if any,
 * else the first recognisable amount.
 * Returns { amount, currency } or null.
 */
function parseAmount(text: string): { amount: number; currency: string } | null {
  // Zero amounts are skipped below. No blanket "free" check: full bodies say
  // "feel free to contact us" and would never parse.

  // Patterns: $9.99 | €99,00 | £14.99 | USD 9.99 | 9.99 USD
  const patterns = [
    // Symbol-first: $9.99 or €99,00
    /([£$€¥]|A\$|C\$)\s*([\d]{1,6}(?:[.,]\d{2,3})?)/,
    // Code-first: USD 9.99
    /\b(USD|EUR|GBP|JPY|AUD|CAD)\s+([\d]{1,6}(?:[.,]\d{2,3})?)/i,
    // Amount-last: 9.99 USD
    /([\d]{1,6}(?:[.,]\d{2,3})?)\s+(USD|EUR|GBP|JPY|AUD|CAD)\b/i,
  ];

  const toResult = (m: RegExpExecArray, amountLast: boolean) => {
    const symbol = amountLast ? m[2]!.toUpperCase() : m[1]!;
    const raw = amountLast ? m[1]! : m[2]!;
    // Normalize European comma-decimal (99,00 → 99.00)
    const amount = parseFloat(raw.replace(',', '.'));
    if (!isFinite(amount) || amount <= 0) return null;
    const currency =
      CURRENCY_SYMBOLS[symbol] ??
      CURRENCY_CODES.exec(symbol)?.[0]?.toUpperCase() ??
      symbol.toUpperCase();
    return { amount, currency };
  };

  // Preferred: an amount shortly after "total", "amount charged", "you paid"...
  // on a line that is not tax/subtotal/shipping/discount.
  for (const [i, re] of patterns.entries()) {
    const g = new RegExp(re.source, re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      const lineStart = text.lastIndexOf('\n', m.index) + 1;
      const before = text.slice(Math.max(lineStart, m.index - 40), m.index);
      const lineEnd = text.indexOf('\n', m.index);
      const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      if (!TOTAL_HINT.test(before) || SKIP_LINE.test(line)) continue;
      const r = toResult(m, i === 2);
      if (r) return r;
    }
  }

  // Fallback: first match of each pattern, in pattern order.
  for (const [i, re] of patterns.entries()) {
    const m = re.exec(text);
    if (!m) continue;
    const r = toResult(m, i === 2);
    if (r) return r;
  }

  return null;
}

// ── Billing cycle ─────────────────────────────────────────────────────────────

function parseBillingCycle(text: string): BillingCycle {
  if (/(?:\b(?:year|annual|annually|12\s*months?)(?:\b|$)|\/yr\b)/i.test(text)) return 'annual';
  if (/(?:\b(?:month|monthly|per\s*month)(?:\b|$)|\/mo\b)/i.test(text)) return 'monthly';
  return 'unknown';
}

// ── Date parsing ──────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04',
  jun: '06', jul: '07', aug: '08',
  sep: '09', oct: '10', nov: '11', dec: '12',
};

function parseDate(text: string): string | null {
  // ISO: 2026-11-10
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // "November 10, 2026" or "10 Nov 2026"
  const longDate =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})\b/i.exec(text) ??
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i.exec(text);

  if (longDate) {
    const isMonthFirst = isNaN(Number(longDate[1]));
    const month = isMonthFirst ? longDate[1]! : longDate[2]!;
    const day   = isMonthFirst ? longDate[2]! : longDate[1]!;
    const year  = longDate[3]!;
    const mm = MONTH_NAMES[month.toLowerCase()];
    if (mm) return `${year}-${mm}-${day.padStart(2, '0')}`;
  }

  // MM/DD/YYYY (US) — treat ambiguous cases as US
  const slashDate = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(text);
  if (slashDate) {
    const [, m, d, y] = slashDate;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }

  return null;
}

// ── Merchant normalization ────────────────────────────────────────────────────

export function normalizeMerchant(raw: string): string {
  return raw
    .replace(/\.(com|co\.uk|io|net|org)$/i, '')
    .replace(/\s+(Inc\.|LLC|Ltd\.|Corp\.|Payments|Technologies|Services)\.?$/i, '')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

// ── Billing-email detection ───────────────────────────────────────────────────

const BILLING_SIGNALS = [
  /receipt/i,
  /invoice/i,
  /your\s+(subscription|membership|plan)/i,
  /payment\s+(received|confirmed|processed)/i,
  /billing\s+(statement|notice)/i,
  /renewal\s+(notice|reminder|confirmation)/i,
  /trial\s+(ending|ends|expired)/i,
  /charged\s+\$\d/i,
  /auto[\s-]?renew/i,
];

function isBillingEmail(text: string): boolean {
  return BILLING_SIGNALS.some((re) => re.test(text));
}

// ── Cancellation-email detection ──────────────────────────────────────────────

// Best-effort. Phrases that say a cancel happened or is scheduled. Marketing such as
// "cancel anytime" or "you can cancel" must not match, so every pattern needs a
// past or scheduled form.
const CANCELLATION_SIGNALS = [
  /\b(?:has|have|had|is|was|been)\s+(?:been\s+)?cancel+ed\b/i,
  /\byou(?:'ve|\u2019ve|\s+have)\s+cancel+ed\b/i,
  /\bsorry\s+to\s+see\s+you\s+go\b/i,
  /\bwe(?:'re|\u2019re|\s+are)\s+sorry\s+to\s+see\s+you\s+(?:go|leave)\b/i,
  /\byour\s+(?:membership|subscription|plan|access)\s+(?:will\s+)?(?:ends?|expires?)\s+on\b/i,
  /\bcancell?ation\s+(?:confirmation|confirmed|complete)\b/i,
];

/**
 * True when the text reads like a cancellation notice. Pure, best-effort.
 * PRIVACY: same rule as parseReceipt, the caller discards the text right after.
 */
export function isCancellationEmail(text: string): boolean {
  return CANCELLATION_SIGNALS.some((re) => re.test(text));
}

// ── Phone-only detection ──────────────────────────────────────────────────────

const PHONE_RE = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;
const PHONE_ONLY_PHRASES = [
  /call\s+us\s+to\s+cancel/i,
  /cancel\s+by\s+phone/i,
  /cancellations?\s+must\s+be\s+made\s+by\s+phone/i,
];

function detectPhoneOnly(text: string): { phoneOnly: boolean; phone: string | null } {
  const phraseMatch = PHONE_ONLY_PHRASES.some((re) => re.test(text));
  if (!phraseMatch) return { phoneOnly: false, phone: null };

  const phoneMatch = PHONE_RE.exec(text);
  return { phoneOnly: true, phone: phoneMatch?.[0] ?? null };
}

// ── Cancel URL detection ──────────────────────────────────────────────────────

function detectCancelUrl(text: string): string | null {
  const urlRe = /https?:\/\/[^\s"'<>]+/g;
  const cancelKeywords = /cancel|unsubscribe|manage[- ]subscri|billing/i;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(text)) !== null) {
    if (cancelKeywords.test(m[0])) return m[0];
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Parse a single email into billing fields.
 * Returns null if the message is not a billing email.
 *
 * PRIVACY: discard messageText immediately after calling this.
 */
export function parseReceipt(
  messageText: string,
  senderDomain: string,
  fallbackDate?: string,
): ReceiptFields | null {
  if (!isBillingEmail(messageText)) return null;

  const amountResult = parseAmount(messageText);
  if (!amountResult) return null; // no parseable charge = not a receipt

  // Prefer a date written in the text; else use the caller's (the email's Date header).
  const date = parseDate(messageText) ?? fallbackDate ?? null;
  if (!date) return null; // can't place it in time

  const { phoneOnly, phone } = detectPhoneOnly(messageText);

  // Try to find a renewal or trial date after the charge date
  const dateMatches = [...messageText.matchAll(/\b\d{4}-\d{2}-\d{2}\b|\b\w+ \d{1,2},? \d{4}\b/g)];
  const dates = dateMatches.map((m) => parseDate(m[0])).filter(Boolean) as string[];
  const futureDates = dates.filter((d) => d > date);

  return {
    merchant: normalizeMerchant(senderDomain),
    amount: amountResult.amount,
    currency: amountResult.currency,
    date,
    plan: null,          // TODO: extract from subject/body in a future pass
    renewalDate: futureDates[0] ?? null,
    trialEndDate: null,  // TODO: trial-specific pattern pass
    billingCycle: parseBillingCycle(messageText),
    accountEmail: null,  // set by the caller from the Gmail message `to` field
    cancelUrl: detectCancelUrl(messageText),
    phoneOnly,
    phone,
    memberId: null,      // TODO: member ID pattern pass
    senderDomain,
  };
}
