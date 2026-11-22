/**
 * Browser client for community tips. Never throws into the UI: every failure falls back to the starter list.
 * Base address: build-time constant __GRIM_COMMUNITY_URL__, which window.GRIM_COMMUNITY_URL may override. Empty means off.
 * Without a deployed https API the shared feature works only on the developer's machine.
 */
import { METHODS, type MethodKind, type TipSummary } from './types.ts';
import { merchantKeyFor } from './merchant-key.ts';

declare const __GRIM_COMMUNITY_URL__: string | undefined;

export const TIMEOUT_MS = 6000;
/** Relative on purpose: the site lives under a sub-path on GitHub Pages. */
export const SEED_URL = './data/cancel-methods.seed.json';

export function baseUrl(): string {
  const w = (globalThis as { GRIM_COMMUNITY_URL?: unknown }).GRIM_COMMUNITY_URL;
  const raw =
    typeof w === 'string' && w !== ''
      ? w
      : typeof __GRIM_COMMUNITY_URL__ === 'string'
        ? __GRIM_COMMUNITY_URL__
        : '';
  return raw.trim().replace(/\/+$/, '');
}

const isMethod = (v: unknown): v is MethodKind => typeof v === 'string' && (METHODS as readonly string[]).includes(v);

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; data: unknown }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    let data: unknown = null;
    try {
      data = await r.json();
    } catch {
      data = null; // not JSON
    }
    return { status: r.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/** One try plus one retry on a network error, timeout or 5xx. A 4xx is final. */
async function withRetry(url: string, init?: RequestInit): Promise<{ status: number; data: unknown } | null> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetchJson(url, init);
      if (r.status < 500) return r;
    } catch {
      /* network, CORS or timeout: retry once */
    }
  }
  return null;
}

function asSummary(data: unknown, key: string): TipSummary | null {
  if (data === null || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d['merchantKey'] !== key || !Array.isArray(d['methods'])) return null;
  if (d['source'] !== 'community' && d['source'] !== 'none') return null;
  if (d['best'] !== null && !isMethod(d['best'])) return null;
  if (typeof d['bestWorked'] !== 'number' || typeof d['bestTotal'] !== 'number') return null;
  return data as TipSummary;
}

async function seedTip(key: string): Promise<TipSummary> {
  const none: TipSummary = { merchantKey: key, best: null, bestWorked: 0, bestTotal: 0, methods: [], source: 'none' };
  try {
    const r = await fetchJson(SEED_URL);
    const m = (r.data as { merchants?: Record<string, { method?: unknown }> } | null)?.merchants?.[key];
    if (r.status === 200 && m && isMethod(m.method)) {
      return { ...none, best: m.method, source: 'seed', label: 'starter list' };
    }
  } catch {
    /* no seed available */
  }
  return none;
}

// ---- the public list ------------------------------------------------------------------------
// PRIVACY: we never ask the server about one company. That request would tell it which companies this
// user has, with no opt-in. We download the whole public list (every reviewed company that has data) once,
// keep it for a minute, and look the user's companies up on their own machine.

const LIST_TTL_MS = 60_000;
const FAIL_TTL_MS = 10_000;
let listCache: { at: number; ttl: number; data: Record<string, TipSummary> | null } | null = null;
let listInflight: Promise<Record<string, TipSummary> | null> | null = null;

/** Tests only. */
export function _resetTipsCache(): void {
  listCache = null;
  listInflight = null;
}

async function loadPublicList(base: string): Promise<Record<string, TipSummary> | null> {
  if (listCache && Date.now() - listCache.at < listCache.ttl) return listCache.data;
  listInflight ??= (async () => {
    const r = await withRetry(`${base}/tips/all`);
    let data: Record<string, TipSummary> | null = null;
    const tips = r && r.status === 200 ? (r.data as { tips?: unknown } | null)?.tips : null;
    if (tips && typeof tips === 'object') {
      data = {};
      for (const [k, v] of Object.entries(tips as Record<string, unknown>)) {
        const s = asSummary(v, k);
        if (s && s.source === 'community') data[k] = s;
      }
    }
    listCache = { at: Date.now(), ttl: data ? LIST_TTL_MS : FAIL_TTL_MS, data };
    listInflight = null;
    return data;
  })();
  return listInflight;
}

/** What worked for this company. `merchantKey` must come from merchantKeyFor. Never throws. */
export async function getTips(merchantKey: string): Promise<TipSummary> {
  const key = merchantKeyFor(merchantKey);
  if (key === null) return { merchantKey, best: null, bestWorked: 0, bestTotal: 0, methods: [], source: 'none' };
  const base = baseUrl();
  if (base !== '') {
    const all = await loadPublicList(base).catch(() => null);
    const s = all?.[key];
    // A company with no community data yet still gets the starter list below.
    if (s) return s;
  }
  return seedTip(key);
}

/**
 * Share what worked. Sends NOTHING unless the caller passes consented: true (the user ticked the box).
 * Returns true only if the server accepted it.
 */
export async function submitOutcome(o: {
  merchantKey: string;
  method: MethodKind;
  worked: boolean;
  consented: boolean;
}): Promise<boolean> {
  if (o.consented !== true) return false;
  const base = baseUrl();
  const key = merchantKeyFor(o.merchantKey);
  if (base === '' || key === null || !isMethod(o.method)) return false;
  const r = await withRetry(`${base}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchantKey: key, method: o.method, worked: o.worked === true }),
  });
  return r !== null && r.status === 202;
}
