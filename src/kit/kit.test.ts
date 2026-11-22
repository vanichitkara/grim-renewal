import { describe, it, expect } from 'vitest';
import { chooseMethod, UNKNOWN_WHY } from './choose-method.ts';
import { emailDraft, mailtoUrl, callScript, disputeLetter, searchUrl } from './drafts.ts';
import { makeIcs } from './ics.ts';
import { statusFor } from './status.ts';
import { headerModel, listRows, formatMoney, type Row } from './view-model.ts';
import { saveLastScan, loadLastScan, loadCelebrated, markCelebrated, type KV } from './last-scan.ts';
import { assessCancellation, type Assessment } from '../savings/assess.ts';
import type { Subscription } from '../types.ts';
import type { TipSummary } from '../community/types.ts';

const sub = (o: Partial<Subscription> = {}): Subscription => ({
  id: 's1', merchant: 'Acme TV', plan: null, monthlyAmount: 10, billingCycle: 'monthly', chargeCount: 3, totalSpent: 30,
  lastChargeDate: '2026-11-01', renewalDate: null, trialEndDate: null, accountEmail: '', cancelUrl: null, phoneOnly: false,
  phone: null, memberId: null, forgottenScore: 0.8, state: 'idle', stateChangedAt: '2026-11-01', ...o,
});
const tips = (o: Partial<TipSummary>): TipSummary => ({ merchantKey: 'acme.com', best: null, bestWorked: 0, bestTotal: 0, methods: [], source: 'none', ...o });
const NOW = new Date('2026-11-22T12:00:00Z');

describe('chooseMethod', () => {
  it('community best wins and says the numbers', () => {
    const c = chooseMethod(sub({ cancelUrl: 'https://x.test/c' }), tips({ source: 'community', best: 'email', bestWorked: 7, bestTotal: 9 }));
    expect(c.first).toBe('email');
    expect(c.source).toBe('community');
    expect(c.why).toContain('7 of 9');
    expect(c.order).toEqual(['email', 'online', 'phone']);
  });
  it('a receipt cancel link opens Online', () => {
    const c = chooseMethod(sub({ cancelUrl: 'https://x.test/c' }), tips({}));
    expect([c.first, c.source]).toEqual(['online', 'receipt']);
  });
  it('a receipt phone number opens Phone', () => {
    const c = chooseMethod(sub({ phone: '555-0100', phoneOnly: true }), tips({}));
    expect([c.first, c.source]).toEqual(['phone', 'receipt']);
  });
  it('the starter list is used when the receipt says nothing', () => {
    const c = chooseMethod(sub(), tips({ source: 'seed', best: 'phone', label: 'starter list' }));
    expect([c.first, c.source]).toEqual(['phone', 'starter list']);
  });
  it('nothing known: says so and lists the steps in order', () => {
    const c = chooseMethod(sub(), tips({}));
    expect(c.source).toBe('unknown');
    expect(c.why).toBe(UNKNOWN_WHY('Acme TV'));
    expect(c.why).toContain('We could not tell how this one works.');
    expect(c.why).toContain('"Acme TV cancel subscription"');
  });
});

describe('drafts', () => {
  it('email draft has no invented facts and a short mailto with an empty recipient', () => {
    const d = emailDraft({ merchant: 'Acme TV', plan: 'Premium', memberId: 'A-1' });
    expect(d.body).toContain('Acme TV');
    expect(d.body).toContain('Member ID: A-1');
    const u = mailtoUrl(d);
    expect(u.startsWith('mailto:?subject=')).toBe(true);
    expect(u.length).toBeLessThan(1500);
    expect(decodeURIComponent(u.split('&body=')[1]!)).toBe(d.body);
  });
  it('mailto stays under the limit for absurd input and encodes special characters', () => {
    const d = emailDraft({ merchant: 'A&B "Co" ' + 'x'.repeat(500), memberId: 'm'.repeat(500) });
    const u = mailtoUrl({ subject: d.subject, body: d.body + '\n' + 'y'.repeat(3000) });
    expect(u.length).toBeLessThanOrEqual(1500);
    expect(u).not.toMatch(/[ "<>]/);
  });
  it('call script, dispute letter and search link', () => {
    expect(callScript({ merchant: 'Acme TV' })).toContain('confirmation');
    const l = disputeLetter({ merchant: 'Acme TV', cancelledOn: '2026-09-01', newChargeDate: '2026-10-05', amountText: '$10.00' });
    expect(l).toContain('$10.00');
    expect(l).toContain('2026-09-01');
    expect(searchUrl('Acme TV')).toBe('https://www.google.com/search?q=Acme%20TV%20cancel%20subscription');
  });
  it('never contains the invented Tuesday line', () => {
    const all = [emailDraft({ merchant: 'x' }).body, callScript({ merchant: 'x' }), disputeLetter({ merchant: 'x' })].join('\n');
    expect(all).not.toMatch(/tuesday|shortest/i);
  });
});

describe('makeIcs', () => {
  const ics = makeIcs({ title: 'Trial ends: Lumen, AI', dateISO: '2026-12-10T08:00:00Z', daysBefore: 2, now: NOW });
  it('is a valid calendar with the reminder two days before', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261208');
    expect(ics).toContain('DTEND;VALUE=DATE:20261209');
    expect(ics).toContain('DTSTAMP:20261122T120000Z');
    expect(ics).toContain('SUMMARY:Trial ends: Lumen\\, AI');
  });
  it('folds long lines and rejects bad dates', () => {
    const long = makeIcs({ title: 'x'.repeat(200), dateISO: '2026-12-10', daysBefore: 2, now: NOW });
    for (const line of long.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75);
    expect(() => makeIcs({ title: 't', dateISO: 'nope', daysBefore: 2 })).toThrow();
  });
});

const A = (o: Partial<Assessment>): Assessment => ({ level: 'none', display: 'Not sure yet', missedRenewals: 0, avoidedAmount: 0, projected12m: 0, currency: 'USD', notes: [], ...o });

describe('statusFor', () => {
  it('Verified only for level verified', () => {
    for (const level of ['none', 'confirmed', 'likely', 'quiet', 'came_back'] as const) {
      for (const reaper of ['none', 'started', 'done', 'failed', 'came_back'] as const) {
        expect(statusFor({ reaper, assessment: A({ level }) }).word).not.toBe('Verified');
      }
    }
    expect(statusFor({ reaper: 'none', assessment: A({ level: 'verified', display: 'Verified: x' }) }).word).toBe('Verified');
  });
  it('maps the other words', () => {
    expect(statusFor({ reaper: 'none', assessment: A({}) }).word).toBe('Found');
    expect(statusFor({ reaper: 'started', assessment: A({}) }).word).toBe('Cancel started');
    expect(statusFor({ reaper: 'done', assessment: A({}) }).word).toBe('Waiting to verify');
    expect(statusFor({ reaper: 'none', assessment: A({ level: 'confirmed' }) }).word).toBe('Waiting to verify');
    expect(statusFor({ reaper: 'none', assessment: A({ level: 'likely' }) }).word).toBe('Likely cancelled');
    expect(statusFor({ reaper: 'none', assessment: A({ level: 'quiet' }) }).word).toBe('Likely cancelled');
    expect(statusFor({ reaper: 'came_back', assessment: A({}) }).word).toBe('Came back');
  });
});

describe('header and list model', () => {
  const mk = (s: Subscription, claim: string | null, reaper: 'none' | 'done' = 'none'): Row => {
    const assessment = assessCancellation({ sub: s, claim: claim ? { claimedAt: claim } : null, now: NOW });
    return { sub: s, assessment, status: statusFor({ reaper, assessment }) };
  };
  const monthly = (id: string, last: string, n: number, extra: Partial<Subscription> = {}) =>
    sub({ id, merchant: id, lastChargeDate: last, chargeDates: Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.parse(last) - (n - 1 - i) * 30 * 86_400_000); return d.toISOString().slice(0, 10);
    }), ...extra });
  const rows = [
    mk(monthly('live', '2026-11-10', 6), null),
    mk(monthly('gone', '2026-08-01', 6), null),
    mk(monthly('ver', '2026-08-01', 6, { monthlyAmount: 20 }), '2026-08-15'),
    mk(monthly('eur', '2026-11-12', 6, { currency: 'EUR', monthlyAmount: 5 }), null),
  ];
  const trials = [{ sub: sub({ id: 't', trialEndDate: '2026-11-24' }), days: 2 }];
  it('adds money per currency and counts only verified as avoided', () => {
    const h = headerModel(rows, trials);
    expect(h.headline).toBe('You pay $10.00 · €5.00 a month for 2 things you may have forgotten');
    expect(h.chips.map((c) => c.text)).toEqual(['1 trial ending soon', '1 likely cancelled', '1 verified']);
    expect(h.avoided).toBe(formatMoney(rows[2]!.assessment.avoidedAmount));
    expect(rows[2]!.assessment.level).toBe('verified');
    expect(h.avoided).not.toBe('$0.00');
    expect(h.avoidedNote).toContain('$');
    expect(h.projectedLabel).toContain('estimate');
  });
  it('empty input has an honest headline', () => {
    expect(headerModel([], []).headline).toBe('No subscriptions found yet');
  });
  it('list has one row per subscription and trial', () => {
    const l = listRows(rows, trials);
    expect(l).toHaveLength(5);
    expect(l.find((r) => r.id === 'ver')!.status).toBe('Verified');
    expect(l.find((r) => r.id === 't')!.forgotten).toBe('Trial ends in 2 days');
  });
});

describe('last scan storage', () => {
  const mem = (): KV & { data: Record<string, string> } => {
    const data: Record<string, string> = {};
    return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  };
  it('keeps dates and amounts but no address, link, phone or member id', () => {
    const m = mem();
    saveLastScan([sub({ accountEmail: 'me@example.com', cancelUrl: 'https://x.test', phone: '555', memberId: 'ID9', senderDomain: 'acme.com', chargeDates: ['2026-10-01'], currency: 'EUR' })], m);
    const raw = m.data['grim_subs']!;
    for (const secret of ['me@example.com', 'https://x.test', '555', 'ID9']) expect(raw).not.toContain(secret);
    const back = loadLastScan(m);
    expect(back[0]).toMatchObject({ id: 's1', senderDomain: 'acme.com', chargeDates: ['2026-10-01'], currency: 'EUR', accountEmail: '' });
  });
  it('survives junk and remembers celebrations', () => {
    const m = mem();
    m.setItem('grim_subs', '{nope');
    expect(loadLastScan(m)).toEqual([]);
    m.setItem('grim_subs', JSON.stringify([{ id: 1 }, null, 'x']));
    expect(loadLastScan(m)).toEqual([]);
    markCelebrated('a', m);
    markCelebrated('b', m);
    expect([...loadCelebrated(m)].sort()).toEqual(['a', 'b']);
  });
});
