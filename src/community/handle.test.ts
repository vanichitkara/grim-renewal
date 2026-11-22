import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLimiter, handle, type ApiConfig, type ApiRequest } from './handle.ts';
import { merchantKeyFor } from './merchant-key.ts';
import { createFileStore, createMemoryStore } from './store.ts';

const NOW = new Date('2026-11-22T10:00:00Z');
const ORIGIN = 'http://localhost:5173';
const cfg: ApiConfig = { origins: [ORIGIN], allowed: new Set(['netflix.com', 'spotify.com']) };
const body = (o: object) => JSON.stringify(o);
const post = (b: string, over: Partial<ApiRequest> = {}): ApiRequest => ({
  method: 'POST', path: '/report', query: '', origin: ORIGIN, contentType: 'application/json', body: b, ip: '1.2.3.4', ...over,
});
const get = (path: string, query = '', over: Partial<ApiRequest> = {}): ApiRequest => ({
  method: 'GET', path, query, origin: ORIGIN, contentType: undefined, body: '', ip: '1.2.3.4', ...over,
});
const fresh = () => ({ store: createMemoryStore(), limiter: createLimiter() });
const rep = (merchantKey = 'netflix.com', method = 'email', worked = true) => body({ merchantKey, method, worked });

describe('handle', () => {
  it('health', async () => {
    const { store, limiter } = fresh();
    const r = await handle(get('/health'), store, limiter, NOW, cfg);
    expect(r.status).toBe(200);
    expect(r.headers['Access-Control-Allow-Origin']).toBe(ORIGIN);
    expect(r.headers['Vary']).toBe('Origin');
  });

  it('unknown route is 404', async () => {
    const { store, limiter } = fresh();
    expect((await handle(get('/nope'), store, limiter, NOW, cfg)).status).toBe(404);
  });

  it('CORS: a foreign origin is refused, no origin is fine, OPTIONS answers, no wildcard', async () => {
    const { store, limiter } = fresh();
    const bad = await handle(get('/health', '', { origin: 'https://evil.example' }), store, limiter, NOW, cfg);
    expect(bad.status).toBe(403);
    expect(bad.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect((await handle(get('/health', '', { origin: undefined }), store, limiter, NOW, cfg)).status).toBe(200);
    const pre = await handle({ ...get('/report'), method: 'OPTIONS' }, store, limiter, NOW, cfg);
    expect(pre.status).toBe(204);
    expect(pre.headers['Access-Control-Allow-Headers']).toBe('Content-Type');
    expect(pre.headers['Access-Control-Allow-Origin']).toBe(ORIGIN);
  });

  it('POST validation: content type, size, json, fields', async () => {
    const { store, limiter } = fresh();
    const s = async (r: ApiRequest) => (await handle(r, store, limiter, NOW, cfg)).status;
    expect(await s(post(rep(), { contentType: 'text/plain' }))).toBe(415);
    expect(await s(post(rep(), { contentType: undefined }))).toBe(415);
    expect(await s(post('x'.repeat(1025)))).toBe(413);
    expect(await s(post('{nope'))).toBe(400);
    expect(await s(post(body({ merchantKey: 'netflix.com', method: 'email', worked: true, who: 'me' })))).toBe(400);
    expect(await s(post(rep()))).toBe(202);
  });

  it('rate limit: one report per (ip, company) per day, 20 per hour per ip', async () => {
    const { store, limiter } = fresh();
    const s = async (r: ApiRequest) => (await handle(r, store, limiter, NOW, cfg)).status;
    expect(await s(post(rep()))).toBe(202);
    expect(await s(post(rep()))).toBe(429);
    expect(await s(post(rep(), { ip: '9.9.9.9' }))).toBe(202);
    for (let i = 0; i < 20; i++) expect(await s(post(rep(`site${i}.com`), { ip: '5.5.5.5' }))).toBe(202);
    expect(await s(post(rep('site99.com'), { ip: '5.5.5.5' }))).toBe(429);
    // a day later the salt rotates and the limits start again
    const later = new Date(NOW.getTime() + 86_400_000);
    expect((await handle(post(rep()), store, limiter, later, cfg)).status).toBe(202);
  });

  it('a key that is not on the allow-list gets the same 202 and is dropped', async () => {
    const { store, limiter } = fresh();
    const r = await handle(post(rep('secretclinic.com')), store, limiter, NOW, cfg);
    expect(r.status).toBe(202);
    expect(r.body).toBe(JSON.stringify({ ok: true }));
    expect(await store.get('secretclinic.com')).toEqual([]);
    const t = await handle(get('/tips', 'merchant=secretclinic.com'), store, limiter, NOW, cfg);
    expect(JSON.parse(t.body)).toMatchObject({ source: 'none', best: null });
  });

  it('GET /tips checks the query and caches for 60 s', async () => {
    const { store, limiter } = fresh();
    expect((await handle(get('/tips'), store, limiter, NOW, cfg)).status).toBe(400);
    expect((await handle(get('/tips', 'merchant=a%40b.com'), store, limiter, NOW, cfg)).status).toBe(400);
    expect((await handle(get('/tips', `merchant=${'a'.repeat(101)}.com`), store, limiter, NOW, cfg)).status).toBe(400);
    const ok = await handle(get('/tips', 'merchant=netflix.com'), store, limiter, NOW, cfg);
    expect(ok.status).toBe(200);
    expect(ok.headers['Cache-Control']).toBe('public, max-age=60');
  });

  it('end to end: five reports from five addresses, then best shows', async () => {
    const { store, limiter } = fresh();
    for (let i = 0; i < 4; i++) await handle(post(rep(), { ip: `10.0.0.${i}` }), store, limiter, NOW, cfg);
    const before = JSON.parse((await handle(get('/tips', 'merchant=netflix.com'), store, limiter, NOW, cfg)).body);
    expect(before.best).toBeNull();
    await handle(post(rep(), { ip: '10.0.0.9' }), store, limiter, NOW, cfg);
    const after = JSON.parse((await handle(get('/tips', 'merchant=netflix.com'), store, limiter, NOW, cfg)).body);
    expect(after).toMatchObject({ best: 'email', bestWorked: 5, bestTotal: 5, source: 'community' });
  });
});

describe('file store', () => {
  it('survives a restart and leaves no temp file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'grim-community-'));
    const path = join(dir, 'community.json');
    const a = createFileStore(path);
    await a.add({ merchantKey: 'netflix.com', method: 'email', worked: true, month: '2026-11' });
    await a.add({ merchantKey: 'netflix.com', method: 'email', worked: false, month: '2026-11' });
    const b = createFileStore(path);
    expect(await b.get('netflix.com')).toEqual([
      { merchantKey: 'netflix.com', method: 'email', month: '2026-11', worked: 1, failed: 1 },
    ]);
    expect(readdirSync(dir)).toEqual(['community.json']);
    // counts only: the file holds no ip, id or per-report time
    expect(Object.keys(JSON.parse(readFileSync(path, 'utf8'))[0]).sort()).toEqual(['failed', 'merchantKey', 'method', 'month', 'worked']);
  });
});

describe('committed data files', () => {
  const root = new URL('../../', import.meta.url);
  const read = (p: string) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
  const allowed: string[] = read('server/known-merchants.json').merchants;
  const seed = read('public/data/cancel-methods.seed.json');

  it('allow-list: about 40 clean, unique, non-processor keys', () => {
    expect(allowed.length).toBeGreaterThanOrEqual(35);
    expect(new Set(allowed).size).toBe(allowed.length);
    for (const k of allowed) expect(merchantKeyFor(k)).toBe(k);
  });
  it('seed: five mock merchants, every key unchanged by merchantKeyFor and on the allow-list', () => {
    expect(seed.source).toBe('starter list');
    const keys = Object.keys(seed.merchants);
    expect(keys.sort()).toEqual(['cloudboxpro.com', 'designhub.com', 'ironcoregym.com', 'mealcrate.com', 'streamflix.com']);
    for (const k of keys) {
      expect(merchantKeyFor(k)).toBe(k);
      expect(allowed).toContain(k);
      expect(seed.merchants[k].source).toBe('starter list');
    }
    expect(seed.merchants['ironcoregym.com'].method).toBe('phone');
  });
});

describe('GET /tips/all (the public list the app uses, so the server never learns a user\'s companies)', () => {
  it('lists only reviewed companies that have settled community data', async () => {
    const { store, limiter } = fresh();
    for (let i = 0; i < 5; i++) {
      expect((await handle(post(rep('netflix.com', 'email', true), { ip: `10.0.0.${i}` }), store, limiter, NOW, cfg)).status).toBe(202);
    }
    // one report for another reviewed company: not enough to settle
    await handle(post(rep('spotify.com', 'online', true), { ip: '10.0.1.1' }), store, limiter, NOW, cfg);
    // an off-list company is dropped and never shows
    await handle(post(rep('tinyclinic.example', 'phone', true), { ip: '10.0.2.1' }), store, limiter, NOW, cfg);
    const r = await handle(get('/tips/all'), store, limiter, NOW, cfg);
    expect(r.status).toBe(200);
    expect(r.headers['Cache-Control']).toBe('public, max-age=60');
    const data = JSON.parse(r.body) as { ok: boolean; tips: Record<string, { best: string | null; source: string }> };
    expect(Object.keys(data.tips)).toEqual(['netflix.com']);
    expect(data.tips['netflix.com']).toMatchObject({ best: 'email', source: 'community' });
  });

  it('is empty, not an error, when nothing has been reported', async () => {
    const { store, limiter } = fresh();
    const r = await handle(get('/tips/all'), store, limiter, NOW, cfg);
    expect(JSON.parse(r.body)).toEqual({ ok: true, tips: {} });
  });

  it('refuses another website', async () => {
    const { store, limiter } = fresh();
    expect((await handle(get('/tips/all', '', { origin: 'https://evil.example' }), store, limiter, NOW, cfg)).status).toBe(403);
  });
});
