import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { merchantKeyFor } from './merchant-key.ts';

describe('merchantKeyFor', () => {
  const table: Array<[string, string | null]> = [
    ['help.netflix.com', 'netflix.com'],
    ['mail.spotify.com', 'spotify.com'],
    ['bbc.co.uk', 'bbc.co.uk'],
    ['news.bbc.co.uk', 'bbc.co.uk'],
    ['x.com.au', 'x.com.au'],
    ['billing.www.hulu.com', 'hulu.com'],
    ['no-reply@billing.dropbox.com', 'dropbox.com'],
    ['Netflix <info@mailer.netflix.com>', 'netflix.com'],
    ['https://www.netflix.com/cancelplan', 'netflix.com'],
    ['https://account.disneyplus.com:443/x?y=1', 'disneyplus.com'],
    ['NETFLIX.COM', 'netflix.com'],
    ['Netflix', 'netflix.com'],
    ['Netflix Inc', null],
    ['', null],
    ['paypal.com', null],
    ['service@mail.paypal.com', null],
    ['receipts@stripe.com', null],
    ['no_reply@email.apple.com', null],
    ['itunes.com', null],
    ['play.google.com', null],
    ['googleplay.com', null],
    ['paddle.net', null],
    ['shop.amazon.com', null],
    ['x@substack.com', null],
    ['not a domain!', null],
  ];
  it.each(table)('%s -> %s', (input, want) => {
    expect(merchantKeyFor(input)).toBe(want);
  });

  it('is idempotent, lower-case and has no @ / or spaces', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const k = merchantKeyFor(s);
        if (k === null) return true;
        return merchantKeyFor(k) === k && k === k.toLowerCase() && !/[@/\s]/.test(k);
      }),
      { numRuns: 500 },
    );
    fc.assert(
      fc.property(fc.domain(), (d) => {
        const k = merchantKeyFor(d);
        return k === null || merchantKeyFor(k) === k;
      }),
    );
  });
});
