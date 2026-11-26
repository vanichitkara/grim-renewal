import { describe, it, expect } from 'vitest';
import type { BillingCycle, Subscription } from '../types.ts';
import { assessCancellation, sumByCurrency, type Assessment, type Claim } from './assess.ts';
import { DAY_MS, dayNumber, expectedNext, usualGapDays } from './cadence.ts';

const ARCHIVED = 'Mail you archived is invisible to this scan, so this is a guess.';

function sub(over: Partial<Subscription> & { chargeDates: string[] }): Subscription {
  const dates = [...over.chargeDates].sort();
  return {
    id: 'abc12345',
    merchant: 'Streamflix',
    plan: null,
    monthlyAmount: 10,
    billingCycle: 'monthly',
    chargeCount: dates.length,
    totalSpent: 10 * dates.length,
    lastChargeDate: dates[dates.length - 1]!,
    renewalDate: null,
    trialEndDate: null,
    accountEmail: 'me@example.com',
    cancelUrl: null,
    phoneOnly: false,
    phone: null,
    memberId: null,
    forgottenScore: 0,
    state: 'idle',
    stateChangedAt: '2026-01-01T00:00:00.000Z',
    senderDomain: 'streamflix.com',
    ...over,
  };
}

const at = (day: string): Date => new Date(`${day}T12:00:00Z`);

interface Row {
  name: string;
  sub: Subscription;
  claim?: Claim | null;
  now: string;
  level: Assessment['level'];
  avoided: number;
  notes: string[];
}

const ROWS: Row[] = [
  {
    name: 'monthly receipts stop three renewals ago',
    sub: sub({ chargeDates: ['2026-05-03', '2026-06-03', '2026-07-03', '2026-08-03', '2026-09-03'] }),
    now: '2026-12-20',
    level: 'quiet',
    avoided: 30,
    notes: ['No receipt since 3 Sep. 3 renewals missed.', ARCHIVED],
  },
  {
    name: 'annual plan, no claim: never guessed',
    sub: sub({ billingCycle: 'annual', monthlyAmount: 10, chargeDates: ['2025-12-01'] }),
    now: '2026-12-15',
    level: 'none',
    avoided: 0,
    notes: ['Annual plans need a year of history; mark it cancelled or we need a cancellation email.'],
  },
  {
    name: 'free trial still running',
    sub: sub({ chargeDates: ['2026-11-10'], trialEndDate: '2026-12-01' }),
    now: '2026-11-22',
    level: 'none',
    avoided: 0,
    notes: ['Free trial still running.'],
  },
  {
    name: 'price change: uses the latest amount',
    sub: sub({ monthlyAmount: 12.99, chargeDates: ['2026-06-03', '2026-07-03', '2026-08-03', '2026-09-03'] }),
    now: '2026-10-20',
    level: 'likely',
    avoided: 12.99,
    notes: ['No receipt since 3 Sep. One renewal missed.', ARCHIVED],
  },
  {
    name: 'a 45-day rhythm is not mistaken for a missed month',
    sub: sub({ chargeDates: ['2026-01-01', '2026-02-15', '2026-04-01', '2026-05-16'] }),
    now: '2026-06-20',
    level: 'none',
    avoided: 0,
    notes: ['Next receipt not due yet.'],
  },
  {
    name: 'a single missed receipt',
    sub: sub({ chargeDates: ['2026-07-03', '2026-08-03', '2026-09-03', '2026-10-03'] }),
    now: '2026-11-10',
    level: 'likely',
    avoided: 10,
    notes: ['No receipt since 3 Oct. One renewal missed.', ARCHIVED],
  },
  {
    name: 'claimed cancelled, then charged again',
    sub: sub({ chargeDates: ['2026-08-03', '2026-09-03', '2026-10-03', '2026-11-03'] }),
    claim: { claimedAt: '2026-10-10' },
    now: '2026-11-10',
    level: 'came_back',
    avoided: 0,
    notes: ['New charge on 3 Nov after you marked it cancelled.'],
  },
  {
    name: 'Apple/Google style sender: a gap proves nothing',
    sub: sub({ senderDomain: 'apple.com', chargeDates: ['2026-07-03', '2026-08-03', '2026-09-03'] }),
    now: '2026-11-20',
    level: 'none',
    avoided: 0,
    notes: ['Billed through apple.com, so a missing receipt may come from another sender.'],
  },
  {
    name: 'only one receipt ever',
    sub: sub({ chargeDates: ['2026-09-03'] }),
    now: '2026-11-20',
    level: 'none',
    avoided: 0,
    notes: ['Only one receipt seen, so there is no pattern yet.'],
  },
  {
    name: 'cancellation email seen, cycle not over',
    sub: sub({ chargeDates: ['2026-08-03', '2026-09-03', '2026-10-03'], cancellationEmailDate: '2026-10-20' }),
    now: '2026-11-10',
    level: 'confirmed',
    avoided: 10,
    notes: [
      'Cancellation email seen on 20 Oct.',
      'No receipt since 3 Oct. One renewal missed.',
      'Waiting for a full billing cycle with no charge.',
    ],
  },
];

describe('assessCancellation: 10 realistic histories', () => {
  for (const r of ROWS) {
    it(r.name, () => {
      const a = assessCancellation({ sub: r.sub, claim: r.claim ?? null, now: at(r.now) });
      expect(a.level).toBe(r.level);
      expect(a.avoidedAmount).toBe(r.avoided);
      expect(a.notes).toEqual(r.notes);
    });
  }

  it('shows display words that never say Verified for a receipt gap alone', () => {
    const quiet = assessCancellation({ sub: ROWS[0]!.sub, claim: null, now: at('2026-12-20') });
    expect(quiet.display).toBe('No charge seen for a full cycle');
    const likely = assessCancellation({ sub: ROWS[3]!.sub, claim: null, now: at('2026-10-20') });
    expect(likely.display).toBe('No receipt when expected');
  });
});

describe('arithmetic', () => {
  const annual = sub({ billingCycle: 'annual', monthlyAmount: 10, chargeDates: ['2025-12-01'] });

  it('annual $120 with one missed renewal avoids $120, not $10 and not $1440', () => {
    const a = assessCancellation({ sub: annual, claim: { claimedAt: '2026-01-10' }, now: at('2026-12-15') });
    expect(a.level).toBe('confirmed');
    expect(a.display).toBe('You marked it cancelled');
    expect(a.missedRenewals).toBe(1);
    expect(a.avoidedAmount).toBe(120);
    expect(a.projected12m).toBe(120); // one renewal (Dec 2027) falls inside the next 12 months
  });

  it('annual with a claim becomes verified after a full year', () => {
    const a = assessCancellation({ sub: annual, claim: { claimedAt: '2026-01-10' }, now: at('2027-01-15') });
    expect(a.level).toBe('verified');
    expect(a.display).toBe('Verified: no charge seen for a full cycle');
    expect(a.avoidedAmount).toBe(120);
  });

  it('annual without a claim or cancellation email is always none, whatever the age', () => {
    for (const now of ['2026-02-01', '2026-09-30', '2026-12-30', '2027-06-01']) {
      const a = assessCancellation({ sub: annual, claim: null, now: at(now) });
      expect(a.level).toBe('none');
      expect(a.avoidedAmount).toBe(0);
      expect(a.notes).toEqual(['Annual plans need a year of history; mark it cancelled or we need a cancellation email.']);
    }
  });

  it('a cancellation email gives an annual plan its saving too', () => {
    const a = assessCancellation({
      sub: { ...annual, cancellationEmailDate: '2026-01-10' },
      claim: null,
      now: at('2026-12-15'),
    });
    expect(a.level).toBe('confirmed');
    expect(a.display).toBe('Cancellation email seen');
    expect(a.avoidedAmount).toBe(120);
  });

  it('verified needs a confirmed basis plus a full cycle', () => {
    const s = sub({ chargeDates: ['2026-08-03', '2026-09-03', '2026-10-03'], cancellationEmailDate: '2026-10-20' });
    const early = assessCancellation({ sub: s, claim: null, now: at('2026-11-19') });
    const late = assessCancellation({ sub: s, claim: null, now: at('2026-12-05') });
    expect(early.level).toBe('confirmed');
    expect(late.level).toBe('verified');
    expect(late.avoidedAmount).toBe(10);
  });

  it('never verifies a sub billed through Apple, Google or PayPal, even with a claim and a quiet cycle', () => {
    for (const senderDomain of ['apple.com', 'email.apple.com', 'google.com', 'paypal.com']) {
      const s = sub({ senderDomain, chargeDates: ['2026-08-03', '2026-09-03', '2026-10-03'], cancellationEmailDate: '2026-10-20' });
      const a = assessCancellation({ sub: s, claim: { claimedAt: '2026-10-20' } as Claim, now: at('2027-01-05') });
      expect(a.level, senderDomain).toBe('confirmed');
      expect(a.notes.join(' ')).toMatch(/can't verify/);
    }
  });

  it('uses the sub currency and sums per currency only', () => {
    const usd = assessCancellation({ sub: ROWS[0]!.sub, claim: null, now: at('2026-12-20') });
    const gbp = assessCancellation({
      sub: { ...ROWS[0]!.sub, currency: 'GBP', monthlyAmount: 5 },
      claim: null,
      now: at('2026-12-20'),
    });
    expect(gbp.currency).toBe('GBP');
    const sums = sumByCurrency([usd, gbp, usd]);
    expect(sums.USD!.avoidedAmount).toBe(60);
    expect(sums.GBP!.avoidedAmount).toBe(15);
  });

  it('adds the 11-month window note to a likely result', () => {
    const s = sub({ chargeDates: ['2025-10-03', '2025-11-03'] });
    const a = assessCancellation({ sub: s, claim: null, now: at('2026-10-20') });
    expect(a.notes).toContain('The last receipt is over 11 months old, and the scan only looks back 13 months.');
  });

  it('never says likely for an unknown cycle', () => {
    const s = sub({ billingCycle: 'unknown', chargeDates: ['2026-06-03', '2026-07-03', '2026-08-03'] });
    const a = assessCancellation({ sub: s, claim: null, now: at('2026-12-20') });
    expect(a.level).toBe('none');
  });
});

describe('cadence', () => {
  it('uses the median gap, clamped 7..400, and the cycle for one date', () => {
    expect(usualGapDays(['2026-01-01', '2026-02-15', '2026-04-01'])).toBe(45);
    expect(usualGapDays(['2026-01-01', '2026-01-02'])).toBe(7);
    expect(usualGapDays(['2020-01-01', '2026-01-02'])).toBe(400);
    expect(usualGapDays(['2026-01-01'], 'annual')).toBe(365);
    expect(usualGapDays(['2026-01-01'], 'monthly')).toBe(30);
    expect(expectedNext('2026-01-01', 45)).toBe('2026-02-15');
  });
});

// ── Property tests: seeded random histories ────────────────────────────────

function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomCase(r: () => number): { s: Subscription; claim: Claim | null; now: Date } {
  const cycles: BillingCycle[] = ['monthly', 'annual', 'unknown'];
  const cycle = cycles[Math.floor(r() * 3)]!;
  const start = dayNumber('2025-10-01') + Math.floor(r() * 60);
  const n = 1 + Math.floor(r() * 8);
  const step = cycle === 'annual' ? 365 : 25 + Math.floor(r() * 25);
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    dates.push(new Date((start + i * step + Math.floor(r() * 3)) * DAY_MS).toISOString().slice(0, 10));
  }
  const now = new Date((dayNumber('2026-01-01') + Math.floor(r() * 500)) * DAY_MS);
  const claim =
    r() < 0.5 ? { claimedAt: new Date((start + Math.floor(r() * 400)) * DAY_MS).toISOString().slice(0, 10) } : null;
  const s = sub({
    billingCycle: cycle,
    monthlyAmount: Math.round(r() * 3000) / 100,
    chargeDates: dates,
    ...(r() < 0.2 ? { cancellationEmailDate: dates[dates.length - 1]! } : {}),
  });
  return { s, claim, now };
}

describe('assessCancellation properties', () => {
  const cases = Array.from({ length: 400 }, (_, i) => randomCase(rng(i + 1)));

  it('never returns a negative amount or count, and is deterministic', () => {
    for (const c of cases) {
      const a = assessCancellation({ sub: c.s, claim: c.claim, now: c.now });
      expect(a.avoidedAmount).toBeGreaterThanOrEqual(0);
      expect(a.projected12m).toBeGreaterThanOrEqual(0);
      expect(a.missedRenewals).toBeGreaterThanOrEqual(0);
      expect(assessCancellation({ sub: c.s, claim: c.claim, now: c.now })).toEqual(a);
    }
  });

  it('never claims verified without a confirmed basis and a full cycle', () => {
    for (const c of cases) {
      const a = assessCancellation({ sub: c.s, claim: c.claim, now: c.now });
      if (a.level !== 'verified') continue;
      expect(a.basis).toBeDefined();
      const gap = usualGapDays([...(c.s.chargeDates ?? []), c.s.lastChargeDate], c.s.billingCycle);
      expect(Math.floor(c.now.getTime() / DAY_MS) - dayNumber(a.since!)).toBeGreaterThanOrEqual(gap);
    }
  });

  it('gives came_back whenever a receipt is dated after the claim', () => {
    for (const c of cases) {
      if (!c.claim) continue;
      const later = (c.s.chargeDates ?? []).some((d) => d > c.claim!.claimedAt);
      const a = assessCancellation({ sub: c.s, claim: c.claim, now: c.now });
      if (later) expect(a.level).toBe('came_back');
    }
  });

  it('gives no savings for none and came_back', () => {
    for (const c of cases) {
      const a = assessCancellation({ sub: c.s, claim: c.claim, now: c.now });
      if (a.level === 'none' || a.level === 'came_back') {
        expect(a.avoidedAmount).toBe(0);
        expect(a.projected12m).toBe(0);
      }
    }
  });

  it('never gives likely or quiet for annual or unknown cycles', () => {
    for (const c of cases) {
      const { cancellationEmailDate: _drop, ...noEmail } = c.s;
      const a = assessCancellation({ sub: noEmail, claim: null, now: c.now });
      if (c.s.billingCycle !== 'monthly') expect(['none']).toContain(a.level);
    }
  });
});
