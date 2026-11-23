/**
 * Gmail Scout — scans a user's inbox for subscription receipts.
 *
 * PRIVACY rules (non-negotiable):
 *  - this module never stores the token; only session-auth.ts keeps it (browser only, until expiry or Sign out).
 *  - Only gmail.readonly scope is used — no write, send, delete, or labels.
 *  - Queries are filtered at the API level (q param); we never download unfiltered.
 *  - Raw message text is discarded immediately after parseReceipt() returns.
 *  - We never log message bodies, subject lines, or raw sender email addresses.
 *  - Subscription data is never sent to any third-party endpoint.
 */

import type { ReceiptFields, Subscription } from '../types.ts';
import { isCancellationEmail, normalizeMerchant, parseReceipt } from './parse-receipt.ts';

// Gmail REST base URL — no SDK, plain fetch only.
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Receipt-only query: 13-month window, billing signals only.
// `in:inbox` covers every inbox tab (Primary, Promotions, Updates, Purchases) and
// never drafts, sent, or trash. Do NOT use `labelIds` for this: Gmail ANDs them,
// so INBOX + CATEGORY_PROMOTIONS only matches mail that is in both.
// The cancellation words let "has been cancelled" mails through the same query-level
// filter. Detection is best-effort: many cancellation mails use other words and stay
// invisible, and archived mail (not in the inbox) is never seen.
const RECEIPT_QUERY =
  'in:inbox (receipt OR renewal OR billing OR "your subscription" OR "trial ending" OR cancelled OR canceled OR "membership ends" OR "sorry to see you go") newer_than:13m';

// ── Gmail API helpers ─────────────────────────────────────────────────────────

interface GmailListResponse {
  messages?: Array<{ id: string }>;
  nextPageToken?: string;
}

interface GmailMessageResponse {
  id: string;
  snippet: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    mimeType?: string;
    body?: { data?: string };
    parts?: Part[];
  };
}

function authHeader(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Fetch a page of message IDs matching the receipt query.
 * Throws on non-2xx.
 */
async function listMessageIds(
  token: string,
  pageToken?: string,
): Promise<GmailListResponse> {
  const url = new URL(`${GMAIL_API}/messages`);
  url.searchParams.set('q', RECEIPT_QUERY);
  url.searchParams.set('maxResults', '100');
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const res = await fetch(url.toString(), { headers: authHeader(token) });
  if (!res.ok) throw new Error(`Gmail list failed: ${res.status}`);
  return res.json() as Promise<GmailListResponse>;
}

/**
 * Fetch minimal message metadata: snippet + From/Date/To headers only.
 * We request format=metadata to avoid downloading the full body.
 */
async function fetchMessageMeta(
  token: string,
  messageId: string,
): Promise<GmailMessageResponse> {
  const url = new URL(`${GMAIL_API}/messages/${messageId}`);
  url.searchParams.set('format', 'metadata');
  // append, not set: `set` keeps only the last value, which dropped From and Date.
  url.searchParams.append('metadataHeaders', 'From');
  url.searchParams.append('metadataHeaders', 'Date');
  url.searchParams.append('metadataHeaders', 'To');

  const res = await fetch(url.toString(), { headers: authHeader(token) });
  if (!res.ok) throw new Error(`Gmail fetch failed: ${res.status} for message`);
  return res.json() as Promise<GmailMessageResponse>;
}

/**
 * Fetch the full message (format=full). Only called when the snippet did not parse.
 * Error text never includes message content.
 */
async function fetchMessageFull(
  token: string,
  messageId: string,
): Promise<GmailMessageResponse> {
  const url = new URL(`${GMAIL_API}/messages/${messageId}`);
  url.searchParams.set('format', 'full');
  const res = await fetch(url.toString(), { headers: authHeader(token) });
  if (!res.ok) throw new Error(`Gmail full fetch failed: ${res.status}`);
  return res.json() as Promise<GmailMessageResponse>;
}

const MAX_BODY_CHARS = 20_000;
const MAX_MESSAGES = 300;
const CONCURRENCY = 5;

function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

interface Part {
  mimeType?: string;
  body?: { data?: string };
  parts?: Part[];
}

/**
 * Pull readable text from a Gmail payload: walk nested parts, prefer text/plain,
 * else tag-stripped text/html. Capped at MAX_BODY_CHARS. Returns '' if none.
 */
export function extractText(payload: Part | undefined): string {
  let plain = '';
  let html = '';
  const walk = (p: Part): void => {
    if (p.body?.data) {
      if (p.mimeType === 'text/plain' && !plain) plain = decodeBase64Url(p.body.data);
      else if (p.mimeType === 'text/html' && !html) html = decodeBase64Url(p.body.data);
    }
    for (const c of p.parts ?? []) walk(c);
  };
  if (payload) walk(payload);
  const text = plain.trim() ? plain : htmlToText(html);
  return text.slice(0, MAX_BODY_CHARS);
}

/** Extract a header value by name (case-insensitive). */
function header(msg: GmailMessageResponse, name: string): string {
  const h = msg.payload?.headers?.find(
    (hdr) => hdr.name.toLowerCase() === name.toLowerCase(),
  );
  return h?.value ?? '';
}

/** Pull the sender domain from a From header value like "Netflix <noreply@netflix.com>". */
function senderDomain(from: string): string {
  const match = /@([\w.-]+)/.exec(from);
  return match?.[1] ?? from;
}

/**
 * Compute id as sha256(merchant + accountEmail)[:8] using Web Crypto.
 * Returns the first 8 hex chars.
 */
async function makeId(merchant: string, accountEmail: string): Promise<string> {
  const raw = merchant + accountEmail;
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw),
  );
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 8);
}

// ── Deduplication key and accumulator ────────────────────────────────────────

interface Accumulator {
  merchant: string;
  accountEmail: string;
  latestDate: string;
  latestAmount: number;
  billingCycle: Subscription['billingCycle'];
  plan: string | null;
  renewalDate: string | null;
  trialEndDate: string | null;
  cancelUrl: string | null;
  phoneOnly: boolean;
  phone: string | null;
  memberId: string | null;
  chargeCount: number;
  totalSpent: number;
  senderDomain: string;
  currency: string;
  /** ISO days, deduplicated, sorted, at most MAX_CHARGE_DATES. */
  chargeDates: string[];
}

const MAX_CHARGE_DATES = 36;

/** Insert a receipt date, keep the list unique, sorted, and capped to the newest. */
function addChargeDate(dates: string[], date: string): void {
  if (!dates.includes(date)) dates.push(date);
  dates.sort();
  if (dates.length > MAX_CHARGE_DATES) dates.splice(0, dates.length - MAX_CHARGE_DATES);
}

/** Normalize amount to a monthly equivalent for comparison / display. */
function toMonthly(amount: number, cycle: Subscription['billingCycle']): number {
  if (cycle === 'annual') return parseFloat((amount / 12).toFixed(2));
  return amount;
}

/** What one message gave us: receipt fields and/or a cancellation date for a merchant. */
interface ParsedMessage {
  fields: ReceiptFields | null;
  /** Set only when the text read like a cancellation notice and the date is known. */
  cancel: { merchant: string; date: string } | null;
}

/**
 * Parse one message: snippet first, full body as fallback. Returns structured
 * fields and a cancellation date only. PRIVACY: raw text is local to this function
 * and dropped on return; errors are swallowed so no message content or ID can reach
 * a log or message. isCancellationEmail runs on the snippet first, and on the body
 * only on the existing fallback path (snippet was neither receipt nor cancellation).
 */
async function parseOne(token: string, id: string): Promise<ParsedMessage | null> {
  try {
    const msg = await fetchMessageMeta(token, id);
    const domain = senderDomain(header(msg, 'From'));
    // Snippets rarely contain the date, so fall back to the message's Date header.
    const sent = new Date(header(msg, 'Date'));
    const headerDate = isNaN(sent.getTime()) ? undefined : sent.toISOString().slice(0, 10);

    const build = (text: string): ParsedMessage => ({
      fields: parseReceipt(text, domain, headerDate),
      cancel:
        headerDate && isCancellationEmail(text)
          ? { merchant: normalizeMerchant(domain), date: headerDate }
          : null,
    });

    const fromSnippet = build(msg.snippet);
    if (fromSnippet.fields || fromSnippet.cancel) return fromSnippet;

    const full = await fetchMessageFull(token, id);
    return build(extractText(full.payload));
  } catch {
    return null; // inaccessible or unparseable: skip
  }
}

/** Counts only: how many messages are read, how many are queued, how many were receipts. */
export interface ScanProgress { read: number; total: number; found: number }

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Scan the user's Gmail inbox for subscription receipts.
 *
 * @param token - A valid gmail.readonly OAuth access token (stored only by session-auth.ts, never logged).
 * @param accountEmail - The Gmail account address, stored only in the Subscription record.
 * @returns An array of deduplicated Subscription records. forgottenScore is 0 (Coroner fills it).
 *
 * Error handling:
 *  - Quota exceeded (429): back off 60 s, retry up to 3 times, then throw.
 *  - Per-message parse failure: skip the message, continue.
 */
export async function scanInbox(
  token: string,
  accountEmail: string,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  onProgress?: (p: ScanProgress) => void,
): Promise<Subscription[]> {
  // ── 1. Collect all message IDs ────────────────────────────────────────────
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    let response: GmailListResponse;
    // Retry loop for quota errors
    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        response = await listMessageIds(token, pageToken);
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('429') && attempt < 3) {
          await sleep(60_000);
          continue;
        }
        throw err;
      }
      // unreachable but satisfies noImplicitReturns
    }
    // response is always assigned here (loop throws on failure)
    const page = response!;
    for (const m of page.messages ?? []) {
      ids.push(m.id);
    }
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < MAX_MESSAGES);
  ids.length = Math.min(ids.length, MAX_MESSAGES);

  // ── 2. Fetch metadata and parse each message ──────────────────────────────
  // key: `${merchant}::${accountEmail}`
  const accumMap = new Map<string, Accumulator>();

  // Preview first; full body only when the preview did not parse (limited concurrency).
  const parsed: Array<ParsedMessage | null> = new Array(ids.length).fill(null);
  let next = 0;
  let read = 0;
  let found = 0;
  onProgress?.({ read, total: ids.length, found });
  const worker = async (): Promise<void> => {
    while (next < ids.length) {
      const i = next++;
      parsed[i] = await parseOne(token, ids[i]!);
      read++;
      if (parsed[i]?.fields) found++;
      onProgress?.({ read, total: ids.length, found }); // counts only, no message data
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));

  // merchant -> latest cancellation-email date (a date only, never text)
  const cancelDates = new Map<string, string>();
  for (const p of parsed) {
    if (p?.cancel && p.cancel.date > (cancelDates.get(p.cancel.merchant) ?? '')) {
      cancelDates.set(p.cancel.merchant, p.cancel.date);
    }
  }

  for (const msg of parsed) {
    const fields = msg?.fields;
    if (!fields) continue;

    // PRIVACY: use the caller-supplied accountEmail, never an address from a header.
    const resolvedEmail = accountEmail;

    const key = `${fields.merchant}::${resolvedEmail}`;
    const existing = accumMap.get(key);

    if (!existing) {
      accumMap.set(key, {
        merchant: fields.merchant,
        accountEmail: resolvedEmail,
        latestDate: fields.date,
        latestAmount: fields.amount,
        billingCycle: fields.billingCycle,
        plan: fields.plan,
        renewalDate: fields.renewalDate,
        trialEndDate: fields.trialEndDate,
        cancelUrl: fields.cancelUrl,
        phoneOnly: fields.phoneOnly,
        phone: fields.phone,
        memberId: fields.memberId,
        chargeCount: 1,
        totalSpent: fields.amount,
        senderDomain: fields.senderDomain,
        currency: fields.currency,
        chargeDates: [fields.date],
      });
    } else {
      // Deduplication: keep the most-recent non-zero amount.
      existing.chargeCount += 1;
      addChargeDate(existing.chargeDates, fields.date);
      existing.totalSpent = parseFloat((existing.totalSpent + fields.amount).toFixed(2));

      if (fields.date > existing.latestDate && fields.amount > 0) {
        existing.latestDate = fields.date;
        existing.latestAmount = fields.amount;
        existing.billingCycle = fields.billingCycle;
        existing.renewalDate = fields.renewalDate ?? existing.renewalDate;
        existing.trialEndDate = fields.trialEndDate ?? existing.trialEndDate;
        existing.cancelUrl = fields.cancelUrl ?? existing.cancelUrl;
        existing.phoneOnly = fields.phoneOnly || existing.phoneOnly;
        existing.phone = fields.phone ?? existing.phone;
        existing.memberId = fields.memberId ?? existing.memberId;
        existing.senderDomain = fields.senderDomain;
        existing.currency = fields.currency;
      }
    }
  }

  // ── 3. Build Subscription records ─────────────────────────────────────────
  const now = new Date().toISOString();
  const subscriptions: Subscription[] = [];

  for (const acc of accumMap.values()) {
    const id = await makeId(acc.merchant, acc.accountEmail);

    subscriptions.push({
      id,
      merchant: acc.merchant,
      plan: acc.plan,
      monthlyAmount: toMonthly(acc.latestAmount, acc.billingCycle),
      billingCycle: acc.billingCycle,
      chargeCount: acc.chargeCount,
      totalSpent: acc.totalSpent,
      lastChargeDate: acc.latestDate,
      renewalDate: acc.renewalDate,
      trialEndDate: acc.trialEndDate,
      accountEmail: acc.accountEmail,
      cancelUrl: acc.cancelUrl,
      phoneOnly: acc.phoneOnly,
      phone: acc.phone,
      memberId: acc.memberId,
      forgottenScore: 0,       // Coroner fills this in
      state: 'idle',
      stateChangedAt: now,
      senderDomain: acc.senderDomain,
      chargeDates: acc.chargeDates,
      currency: acc.currency,
      ...(cancelDates.has(acc.merchant) ? { cancellationEmailDate: cancelDates.get(acc.merchant)! } : {}),
    });
  }

  return subscriptions;
}
