import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTips, submitOutcome, _resetTipsCache } from './client.ts';

const BASE = 'https://tips.example';
const seedBody = { source: 'starter list', merchants: { 'streamflix.com': { method: 'online', source: 'starter list' } } };
const community = {
  merchantKey: 'netflix.com', best: 'email', bestWorked: 7, bestTotal: 9, methods: [], source: 'community',
};
const listOf = (...tips: (typeof community)[]) => ({ ok: true, tips: Object.fromEntries(tips.map((t) => [t.merchantKey, t])) });
const res = (data: unknown, status = 200) =>
  Promise.resolve({ status, json: () => (data === undefined ? Promise.reject(new Error('not json')) : Promise.resolve(data)) });

type Handler = (url: string, init?: RequestInit) => Promise<unknown>;
function stub(h: Handler) {
  const f = vi.fn(h);
  vi.stubGlobal('fetch', f);
  return f;
}
const seedOr = (other: Handler): Handler => (url, init) =>
  url.includes('cancel-methods.seed.json') ? res(seedBody) : other(url, init);

beforeEach(() => {
  _resetTipsCache();
  vi.stubGlobal('GRIM_COMMUNITY_URL', BASE);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('getTips', () => {
  it('returns the community answer', async () => {
    stub(seedOr(() => res(listOf(community))));
    expect(await getTips('netflix.com')).toMatchObject({ best: 'email', bestTotal: 9, source: 'community' });
  });

  it('cleans the key first, then looks it up in the downloaded list', async () => {
    stub(seedOr(() => res(listOf(community))));
    expect(await getTips('help.netflix.com')).toMatchObject({ merchantKey: 'netflix.com', best: 'email' });
  });

  it('PRIVACY: asks for the whole public list and never sends a company to the server', async () => {
    const f = stub(seedOr(() => res(listOf(community))));
    await getTips('netflix.com');
    await getTips('streamflix.com');
    await getTips('ironcoregym.com');
    const server = f.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith(BASE));
    expect(server).toEqual([`${BASE}/tips/all`]); // one request, three lookups, no company in any URL
  });

  it('keeps the list for a minute, then asks again', async () => {
    vi.useFakeTimers();
    const f = stub(seedOr(() => res(listOf(community))));
    await getTips('netflix.com');
    await getTips('netflix.com');
    expect(f.mock.calls.filter((c) => String(c[0]).startsWith(BASE)).length).toBe(1);
    await vi.advanceTimersByTimeAsync(61_000);
    await getTips('netflix.com');
    expect(f.mock.calls.filter((c) => String(c[0]).startsWith(BASE)).length).toBe(2);
  });

  it.each([
    ['a 500 (after one retry)', () => res({}, 500), 2],
    ['a reply that is not JSON', () => res(undefined), 1],
    ['a CORS or network failure', () => Promise.reject(new TypeError('Failed to fetch')), 2],
    ['a reply of the wrong shape', () => res({ hello: 1 }), 1],
  ])('falls back to the starter list on %s and never throws', async (_n, h, tries) => {
    const f = stub(seedOr(h));
    const t = await getTips('streamflix.com');
    expect(t).toMatchObject({ best: 'online', source: 'seed', label: 'starter list' });
    expect(f.mock.calls.filter((c) => String(c[0]).startsWith(BASE)).length).toBe(tries); // a 500 or network error gets one retry
  });

  it('a 404 is final: no retry', async () => {
    const f = stub(seedOr(() => res({}, 404)));
    await getTips('streamflix.com');
    expect(f.mock.calls.filter((c) => String(c[0]).startsWith(BASE)).length).toBe(1);
  });

  it('times out after 6 s, retries once, then falls back', async () => {
    vi.useFakeTimers();
    const f = stub((url, init) =>
      url.includes('cancel-methods.seed.json')
        ? res(seedBody)
        : new Promise((_ok, no) => init?.signal?.addEventListener('abort', () => no(new Error('aborted')))),
    );
    const p = getTips('streamflix.com');
    await vi.advanceTimersByTimeAsync(6000);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await p).toMatchObject({ source: 'seed', best: 'online' });
    expect(f.mock.calls.filter((c) => String(c[0]).startsWith(BASE)).length).toBe(2);
  });

  it('without a base address it does not call the server', async () => {
    vi.stubGlobal('GRIM_COMMUNITY_URL', '');
    const f = stub(seedOr(() => res(listOf(community))));
    expect((await getTips('streamflix.com')).source).toBe('seed');
    expect(f.mock.calls.every((c) => String(c[0]).startsWith('./data/'))).toBe(true);
  });

  it('unknown company and missing seed give source none', async () => {
    stub(() => Promise.reject(new Error('offline')));
    expect(await getTips('unknown.com')).toMatchObject({ best: null, source: 'none' });
    expect(await getTips('not a key')).toMatchObject({ source: 'none' });
  });
});

describe('submitOutcome', () => {
  const o = { merchantKey: 'netflix.com', method: 'email' as const, worked: true };

  it('sends nothing unless consented is true', async () => {
    const f = stub(() => res({ ok: true }, 202));
    expect(await submitOutcome({ ...o, consented: false })).toBe(false);
    expect(await submitOutcome({ ...o } as never)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('posts exactly three fields when consented', async () => {
    const f = stub(() => res({ ok: true }, 202));
    expect(await submitOutcome({ ...o, consented: true })).toBe(true);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`${BASE}/report`);
    expect(JSON.parse(String(init?.body))).toEqual({ merchantKey: 'netflix.com', method: 'email', worked: true });
  });

  it('returns false, never throws, on failure; sends nothing when off', async () => {
    stub(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await submitOutcome({ ...o, consented: true })).toBe(false);
    vi.stubGlobal('GRIM_COMMUNITY_URL', '');
    const f = stub(() => res({}, 202));
    expect(await submitOutcome({ ...o, consented: true })).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});
