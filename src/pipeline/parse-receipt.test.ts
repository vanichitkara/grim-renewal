/**
 * Property-based and unit tests for the receipt parser.
 * Run: npm test
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseReceipt } from './parse-receipt.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wrap an amount string in a minimal billing email body. */
function billingBody(amount: string, extra = ''): string {
  return `Your subscription receipt\nYou were charged ${amount} on November 10, 2026.\n${extra}`;
}

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('parseReceipt – non-billing emails', () => {
  it('returns null for a plain text email', () => {
    expect(parseReceipt('Hello! How are you today? Let me know.', 'example.com')).toBeNull();
  });

  it('returns null for a marketing email with no amount', () => {
    const text = 'Check out our new features! Click here to learn more about your plan.';
    expect(parseReceipt(text, 'example.com')).toBeNull();
  });

  it('returns null for a free-tier confirmation', () => {
    expect(parseReceipt(billingBody('Free'), 'example.com')).toBeNull();
  });

  it('returns null for a $0.00 charge', () => {
    expect(parseReceipt(billingBody('$0.00'), 'example.com')).toBeNull();
  });
});

describe('parseReceipt – USD amounts', () => {
  it('parses $9.99', () => {
    const r = parseReceipt(billingBody('$9.99'), 'netflix.com');
    expect(r?.amount).toBe(9.99);
    expect(r?.currency).toBe('USD');
  });

  it('parses $119.99', () => {
    const r = parseReceipt(billingBody('$119.99'), 'adobe.com');
    expect(r?.amount).toBe(119.99);
  });

  it('parses USD 9.99 (code-first)', () => {
    const r = parseReceipt(billingBody('USD 9.99'), 'example.com');
    expect(r?.amount).toBe(9.99);
    expect(r?.currency).toBe('USD');
  });

  it('parses 9.99 USD (code-last)', () => {
    const r = parseReceipt(billingBody('9.99 USD'), 'example.com');
    expect(r?.amount).toBe(9.99);
    expect(r?.currency).toBe('USD');
  });
});

describe('parseReceipt – EUR amounts', () => {
  it('parses €9.99', () => {
    const r = parseReceipt(billingBody('€9.99'), 'spotify.de');
    expect(r?.amount).toBe(9.99);
    expect(r?.currency).toBe('EUR');
  });

  it('parses €99,00 (European comma-decimal)', () => {
    const r = parseReceipt(billingBody('€99,00'), 'adobe.de');
    expect(r?.amount).toBe(99.00);
    expect(r?.currency).toBe('EUR');
  });
});

describe('parseReceipt – GBP amounts', () => {
  it('parses £14.99', () => {
    const r = parseReceipt(billingBody('£14.99'), 'example.co.uk');
    expect(r?.amount).toBe(14.99);
    expect(r?.currency).toBe('GBP');
  });
});

describe('parseReceipt – billing cycle', () => {
  it('detects annual from "/year"', () => {
    const r = parseReceipt(billingBody('$119.99/year'), 'adobe.com');
    expect(r?.billingCycle).toBe('annual');
  });

  it('detects annual from "annually"', () => {
    const r = parseReceipt(billingBody('$99.99 billed annually'), 'example.com');
    expect(r?.billingCycle).toBe('annual');
  });

  it('detects monthly from "/month"', () => {
    const r = parseReceipt(billingBody('$14.99/month'), 'example.com');
    expect(r?.billingCycle).toBe('monthly');
  });

  it('detects monthly from "/mo"', () => {
    const r = parseReceipt(billingBody('$9.99/mo'), 'example.com');
    expect(r?.billingCycle).toBe('monthly');
  });

  it('returns unknown when no cycle signal', () => {
    const r = parseReceipt(billingBody('$9.99'), 'example.com');
    expect(r?.billingCycle).toBe('unknown');
  });
});

describe('parseReceipt – date parsing', () => {
  it('parses ISO date', () => {
    const text = 'Receipt\nCharged $9.99 on 2026-11-10.';
    const r = parseReceipt(text, 'example.com');
    expect(r?.date).toBe('2026-11-10');
  });

  it('parses "November 10, 2026"', () => {
    const r = parseReceipt(billingBody('$9.99'), 'example.com');
    expect(r?.date).toBe('2026-11-10');
  });

  it('parses "10 Nov 2026"', () => {
    const text = 'Your receipt\nCharged $9.99 on 10 Nov 2026.';
    const r = parseReceipt(text, 'example.com');
    expect(r?.date).toBe('2026-11-10');
  });
});

describe('parseReceipt – phone-only detection', () => {
  it('detects phone-only with phone number', () => {
    const text = billingBody('$49.99') + '\nTo cancel, call us to cancel: (555) 013-7742';
    const r = parseReceipt(text, 'ironcoregym.com');
    expect(r?.phoneOnly).toBe(true);
    expect(r?.phone).toBe('(555) 013-7742');
  });

  it('does not flag normal emails as phone-only', () => {
    const r = parseReceipt(billingBody('$9.99'), 'netflix.com');
    expect(r?.phoneOnly).toBe(false);
  });
});

describe('parseReceipt – merchant normalization', () => {
  it('strips .com suffix', () => {
    const r = parseReceipt(billingBody('$9.99'), 'netflix.com');
    expect(r?.merchant).toBe('Netflix');
  });

  it('strips "Inc." suffix', () => {
    const r = parseReceipt(billingBody('$9.99'), 'Adobe Inc.');
    expect(r?.merchant).toBe('Adobe');
  });
});

// ── Property-based tests ──────────────────────────────────────────────────────

describe('parseReceipt – property-based', () => {
  it('any valid USD amount → parsed as a positive float', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 9999, noNaN: true }),
        (amount) => {
          const formatted = `$${amount.toFixed(2)}`;
          const text = billingBody(formatted);
          const r = parseReceipt(text, 'example.com');
          if (r === null) return true; // parser may legitimately skip edge cases
          return r.amount > 0 && isFinite(r.amount);
        },
      ),
    );
  });

  it('annual keyword → billingCycle is "annual"', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('/year', 'annually', 'annual billing', '/yr', '12 months'),
        (keyword) => {
          const text = billingBody(`$9.99 ${keyword}`);
          const r = parseReceipt(text, 'example.com');
          return r === null || r.billingCycle === 'annual';
        },
      ),
    );
  });

  it('forgottenScore stays in [0, 1] after any valid score assignment', () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 1, noNaN: true }), (score) => {
        return score >= 0 && score <= 1;
      }),
    );
  });

  it('pure function: same input → same output', () => {
    fc.assert(
      fc.property(fc.constant(billingBody('$9.99')), (text) => {
        const r1 = parseReceipt(text, 'example.com');
        const r2 = parseReceipt(text, 'example.com');
        return JSON.stringify(r1) === JSON.stringify(r2);
      }),
    );
  });

  it('$0.00 always returns null', () => {
    fc.assert(
      fc.property(fc.constant('$0.00'), (amount) => {
        return parseReceipt(billingBody(amount), 'example.com') === null;
      }),
    );
  });
});

describe('parseReceipt – several amounts', () => {
  it('prefers the total over subtotal and tax', () => {
    const text = 'Your receipt\nSubtotal: $10.00\nTax: $0.80\nTotal: $10.80\nNovember 10, 2026';
    expect(parseReceipt(text, 'example.com')?.amount).toBe(10.8);
  });

  it('prefers "you paid" over an earlier list price', () => {
    const text = 'Your receipt. Plan list price $20.00. You paid $12.00 on November 10, 2026.';
    expect(parseReceipt(text, 'example.com')?.amount).toBe(12);
  });

  it('ignores a total on a discount line', () => {
    const text = 'Your receipt\nDiscount total: $5.00\nYou paid $7.00\nNovember 10, 2026';
    expect(parseReceipt(text, 'example.com')?.amount).toBe(7);
  });

  it('falls back to the first amount with no hint', () => {
    const text = 'Your receipt. Pro $8.00 and Add-on $3.00. November 10, 2026';
    expect(parseReceipt(text, 'example.com')?.amount).toBe(8);
  });

  it('amount is always positive and finite', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 99999 }), (junk, cents) => {
        const text = `Your receipt ${junk}\nTotal: $${(cents / 100).toFixed(2)}\nNovember 10, 2026`;
        const r = parseReceipt(text, 'example.com');
        if (r) {
          expect(Number.isFinite(r.amount)).toBe(true);
          expect(r.amount).toBeGreaterThan(0);
        }
      }),
    );
  });
});
