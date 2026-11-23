/**
 * The only way a merchant key is made. A key is the company's website name, lower-case, e.g. "netflix.com".
 * Pure. Returns null when no honest key exists (payment or app-store senders, unusable input).
 */

/** Two-level public suffixes we handle. shortcut: small list, upgrade to the full public suffix list if needed. */
const TWO_LEVEL = new Set([
  'co.uk', 'com.au', 'co.in', 'com.br', 'co.jp', 'co.nz', 'com.mx', 'co.za', 'com.sg',
]);

/** Billing middlemen are not the company. Amazon is too broad to mean one subscription. */
const PROCESSORS = new Set([
  'paypal.com', 'stripe.com', 'apple.com', 'itunes.com', 'google.com', 'paddle.com', 'paddle.net',
  'fastspring.com', '2checkout.com', 'squareup.com', 'shopify.com', 'substack.com', 'amazon.com',
]);

const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
export const MAX_KEY_LENGTH = 100;

export function merchantKeyFor(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (s === '') return null;
  // "Name <a@b.com>" -> a@b.com
  const angle = /<([^>]+)>/.exec(s);
  if (angle?.[1]) s = angle[1].trim();
  if (s.includes('://')) {
    try {
      s = new URL(s).hostname;
    } catch {
      return null;
    }
  } else {
    const at = s.lastIndexOf('@');
    if (at >= 0) s = s.slice(at + 1);
    s = (s.split(/[/?#]/)[0] ?? '').replace(/:\d+$/, '');
  }
  s = s.replace(/\.+$/, '');
  // A single plain word is a display name such as "Netflix": guess the .com. The server allow-list guards a wrong guess.
  if (/^[a-z0-9-]+$/.test(s)) s = `${s}.com`;
  if (!HOST.test(s) || s.length > MAX_KEY_LENGTH) return null;

  const labels = s.split('.');
  const take = labels.length >= 3 && TWO_LEVEL.has(labels.slice(-2).join('.')) ? 3 : 2;
  if (labels.length < take) return null;
  const key = labels.slice(-take).join('.');
  if (PROCESSORS.has(key) || labels.includes('googleplay')) return null;
  return key;
}
