/**
 * The community API as a pure function: no sockets, so tests need none (same style as src/server/bridge-core.ts).
 * Privacy: nothing here logs bodies, addresses or headers. The address is only hashed, in memory, with a salt that
 * changes every day and is never stored.
 */
import { createHash, randomBytes } from 'node:crypto';
import { monthKey, summarize } from './rank.ts';
import { parseMerchantKey, parseSubmission } from './validate.ts';
import type { TipStore } from './types.ts';

export const BODY_LIMIT_BYTES = 1024;
export const REPORTS_PER_HOUR = 20;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MAX_TRACKED = 50_000;

export interface ApiConfig {
  /** Origins that may call from a browser. No wildcard. */
  origins: readonly string[];
  /** Only these keys are stored. Others get the same 202 and are dropped. */
  allowed: ReadonlySet<string>;
}

export interface ApiRequest {
  method: string;
  path: string;
  /** Query string without the leading "?". */
  query: string;
  origin: string | undefined;
  contentType: string | undefined;
  /** Raw body text. */
  body: string;
  ip: string;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface Limiter {
  /** true if the report may go on. Counts it. */
  allow(ip: string, merchantKey: string, now: Date): boolean;
}

/**
 * Per-instance, in memory. Keeps sha256(dailySalt + address) only. Resets on restart and on cold start.
 * shortcut: not shared between instances; use a platform limiter or database counters when scaling out.
 */
export function createLimiter(): Limiter {
  let day = -1;
  let salt = '';
  let hourly = new Map<string, { start: number; count: number }>();
  let daily = new Set<string>();
  const h = (s: string) => createHash('sha256').update(salt).update(s).digest('hex');
  return {
    allow(ip, merchantKey, now) {
      const t = now.getTime();
      const d = Math.floor(t / DAY_MS);
      if (d !== day || hourly.size > MAX_TRACKED || daily.size > MAX_TRACKED) {
        day = d;
        salt = randomBytes(16).toString('hex');
        hourly = new Map();
        daily = new Set();
      }
      const who = h(ip);
      const pair = h(`${ip}|${merchantKey}`);
      if (daily.has(pair)) return false;
      const e = hourly.get(who);
      if (e && t - e.start < HOUR_MS) {
        if (e.count >= REPORTS_PER_HOUR) return false;
        e.count += 1;
      } else {
        hourly.set(who, { start: t, count: 1 });
      }
      daily.add(pair);
      return true;
    },
  };
}

const json = (status: number, obj: object, headers: Record<string, string> = {}): ApiResponse => ({
  status,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(obj),
});

export async function handle(
  req: ApiRequest,
  store: TipStore,
  limiter: Limiter,
  now: Date,
  cfg: ApiConfig,
): Promise<ApiResponse> {
  const cors: Record<string, string> = { Vary: 'Origin' };
  if (req.origin !== undefined) {
    if (!cfg.origins.includes(req.origin)) return json(403, { ok: false, error: 'origin_not_allowed' }, cors);
    cors['Access-Control-Allow-Origin'] = req.origin;
  }

  if (req.method === 'OPTIONS') {
    return {
      status: 204,
      headers: {
        ...cors,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      },
      body: '',
    };
  }

  if (req.method === 'GET' && req.path === '/health') return json(200, { ok: true }, cors);

  if (req.method === 'GET' && req.path === '/tips') {
    const key = parseMerchantKey(new URLSearchParams(req.query).get('merchant'));
    if (!key.ok) return json(400, { ok: false, error: key.error }, cors);
    const cache = { ...cors, 'Cache-Control': 'public, max-age=60' };
    if (!cfg.allowed.has(key.value)) return json(200, summarize([], key.value, now), cache);
    return json(200, summarize(await store.get(key.value), key.value, now), cache);
  }

  if (req.method === 'POST' && req.path === '/report') {
    if (!(req.contentType ?? '').toLowerCase().startsWith('application/json')) {
      return json(415, { ok: false, error: 'json_only' }, cors);
    }
    if (Buffer.byteLength(req.body) > BODY_LIMIT_BYTES) return json(413, { ok: false, error: 'too_large' }, cors);
    let parsed: unknown;
    try {
      parsed = JSON.parse(req.body);
    } catch {
      return json(400, { ok: false, error: 'bad_json' }, cors);
    }
    const sub = parseSubmission(parsed);
    if (!sub.ok) return json(400, { ok: false, error: sub.error }, cors);
    // The limit applies before the allow-list so a dropped key looks the same as a stored one.
    if (!limiter.allow(req.ip, sub.value.merchantKey, now)) return json(429, { ok: false, error: 'slow_down' }, cors);
    if (cfg.allowed.has(sub.value.merchantKey)) {
      await store.add({ ...sub.value, month: monthKey(now) });
    }
    return json(202, { ok: true }, cors);
  }

  return json(404, { ok: false, error: 'not_found' }, cors);
}
