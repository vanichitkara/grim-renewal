/**
 * "I cancelled it" claims. Ids and dates only, kept in localStorage under `grim_claims`.
 * No tokens, no email text. Storage is injectable so tests need no browser.
 */

export const CLAIMS_KEY = 'grim_claims';

export type ClaimStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** subscription id -> ISO day the user says they cancelled. */
export type Claims = Record<string, string>;

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultStorage(): ClaimStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage blocked
  }
}

export function loadClaims(storage: ClaimStorage | null = defaultStorage()): Claims {
  const out: Claims = {};
  if (!storage) return out;
  try {
    const raw: unknown = JSON.parse(storage.getItem(CLAIMS_KEY) ?? '{}');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [id, date] of Object.entries(raw)) {
        if (ID_RE.test(id) && typeof date === 'string' && DATE_RE.test(date)) out[id] = date;
      }
    }
  } catch {
    // corrupt value: start empty
  }
  return out;
}

function write(claims: Claims, storage: ClaimStorage): void {
  storage.setItem(CLAIMS_KEY, JSON.stringify(claims));
}

/** Save a claim. `claimedAt` is an ISO day or timestamp; only the day is kept. */
export function saveClaim(id: string, claimedAt: string, storage: ClaimStorage | null = defaultStorage()): void {
  const day = claimedAt.slice(0, 10);
  if (!ID_RE.test(id) || !DATE_RE.test(day) || Number.isNaN(Date.parse(day))) {
    throw new Error('Invalid claim');
  }
  if (!storage) return;
  write({ ...loadClaims(storage), [id]: day }, storage);
}

export function clearClaim(id: string, storage: ClaimStorage | null = defaultStorage()): void {
  if (!storage) return;
  const claims = loadClaims(storage);
  delete claims[id];
  write(claims, storage);
}
