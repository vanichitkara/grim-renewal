/**
 * Google sign-in that lasts until the user signs out (owner ruling, 2026-11-23).
 *
 * - The gmail.readonly access token is kept in localStorage until Google's own expiry
 *   (about 1 hour). It is never logged and never sent anywhere but Google.
 * - After it expires, the app asks Google again with prompt=none. If the user is still signed in
 *   to Google, a fresh token comes back with no click. One try per tab, so it can never loop.
 * - "Signed in" (the account email) stays until Sign out. Sign out revokes the token at Google
 *   and clears everything this module stored.
 */

export const AUTH_KEY = 'grim_auth';
export const SILENT_KEY = 'grim_silent_try';
/** Treat a token as expired this long before Google does, so a scan never starts on a dying token. */
export const EXPIRY_MARGIN_MS = 60_000;
export const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export interface StoredAuth {
  token?: string;
  /** Epoch ms when the token stops working. */
  expiresAt?: number;
  /** The account the user picked. Kept until Sign out; used as Google's login_hint. */
  email?: string;
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export function readAuth(store: KV): StoredAuth | null {
  try {
    const raw = store.getItem(AUTH_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    const out: StoredAuth = {};
    if (typeof o['token'] === 'string' && o['token']) out.token = o['token'];
    if (typeof o['expiresAt'] === 'number' && Number.isFinite(o['expiresAt'])) out.expiresAt = o['expiresAt'];
    if (typeof o['email'] === 'string' && o['email']) out.email = o['email'];
    return out.token || out.email ? out : null;
  } catch {
    return null;
  }
}

function write(store: KV, a: StoredAuth): void {
  store.setItem(AUTH_KEY, JSON.stringify(a));
}

/** Save a token Google just returned. `expiresInSec` is Google's expires_in (default 3600). */
export function saveToken(store: KV, token: string, expiresInSec: number | null, now: number): void {
  const secs = expiresInSec && expiresInSec > 0 ? expiresInSec : 3600;
  write(store, { ...(readAuth(store) ?? {}), token, expiresAt: now + secs * 1000 });
}

export function saveEmail(store: KV, email: string): void {
  if (!email) return;
  write(store, { ...(readAuth(store) ?? {}), email });
}

/** A token still good for at least EXPIRY_MARGIN_MS, or null. */
export function liveToken(a: StoredAuth | null, now: number): string | null {
  if (!a?.token || !a.expiresAt) return null;
  return a.expiresAt - EXPIRY_MARGIN_MS > now ? a.token : null;
}

/** Signed in = we hold a live token or remember an account that never signed out. */
export function isSignedIn(a: StoredAuth | null): boolean {
  return !!(a && (a.token || a.email));
}

/** Drop an expired token but keep the email, so a silent re-auth can name the account. */
export function dropToken(store: KV): void {
  const a = readAuth(store);
  if (!a) return;
  if (a.email) write(store, { email: a.email });
  else store.removeItem(AUTH_KEY);
}

export function clearAuth(store: KV, tab: KV): void {
  store.removeItem(AUTH_KEY);
  tab.removeItem(SILENT_KEY);
}

export interface AuthUrlOpts {
  clientId: string;
  redirectUri: string;
  /** No Google screen at all: returns a token or an error such as interaction_required. */
  silent?: boolean;
  loginHint?: string;
}

export function buildAuthUrl(o: AuthUrlOpts): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', o.clientId);
  url.searchParams.set('redirect_uri', o.redirectUri);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('include_granted_scopes', 'false');
  if (o.loginHint) {
    url.searchParams.set('login_hint', o.loginHint);
    // state carries the account back so the email step is skipped (app.html reads it).
    url.searchParams.set('state', o.loginHint);
  }
  if (o.silent) url.searchParams.set('prompt', 'none');
  return url.toString();
}

/**
 * Should this page load try a silent re-auth? Only when the user never signed out, has no live
 * token, and this tab has not tried yet (the flag stops a redirect loop).
 */
export function shouldTrySilent(a: StoredAuth | null, tab: KV, now: number): boolean {
  if (!isSignedIn(a) || liveToken(a, now)) return false;
  return tab.getItem(SILENT_KEY) !== '1';
}

export function markSilentTried(tab: KV): void {
  tab.setItem(SILENT_KEY, '1');
}

export function clearSilentTried(tab: KV): void {
  tab.removeItem(SILENT_KEY);
}

/** Google errors a prompt=none request returns when the user must click something. */
export function isSilentMiss(error: string | null): boolean {
  return !!error && ['interaction_required', 'login_required', 'consent_required', 'account_selection_required'].includes(error);
}

/** Revoke at Google. Best effort: sign out still clears local state if the network fails. */
export async function revokeToken(token: string, fetcher: typeof fetch = fetch): Promise<void> {
  try {
    await fetcher('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    /* offline: the token still dies at its expiry */
  }
}
