import { describe, it, expect, vi } from 'vitest';
import {
  AUTH_KEY, SILENT_KEY, EXPIRY_MARGIN_MS, readAuth, saveToken, saveEmail, liveToken, isSignedIn,
  dropToken, clearAuth, buildAuthUrl, shouldTrySilent, markSilentTried, isSilentMiss, revokeToken,
} from './session-auth.ts';
import type { KV } from './session-auth.ts';

function mem(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const NOW = 1_800_000_000_000;

describe('session-auth store', () => {
  it('keeps a token until it expires, then drops it but keeps the account', () => {
    const s = mem();
    saveToken(s, 'tok', 3600, NOW);
    saveEmail(s, 'a@b.com');
    const a = readAuth(s);
    expect(liveToken(a, NOW + 10_000)).toBe('tok');
    expect(liveToken(a, NOW + 3600_000 - EXPIRY_MARGIN_MS + 1)).toBeNull();
    dropToken(s);
    expect(readAuth(s)).toEqual({ email: 'a@b.com' });
    expect(isSignedIn(readAuth(s))).toBe(true);
  });

  it('stores only token, expiry and email', () => {
    const s = mem();
    saveToken(s, 'tok', null, NOW);
    saveEmail(s, 'a@b.com');
    expect(Object.keys(JSON.parse(s.m.get(AUTH_KEY)!)).sort()).toEqual(['email', 'expiresAt', 'token']);
    expect(readAuth(s)!.expiresAt).toBe(NOW + 3600_000);
  });

  it('ignores junk in storage', () => {
    const s = mem();
    s.setItem(AUTH_KEY, '{nope');
    expect(readAuth(s)).toBeNull();
    s.setItem(AUTH_KEY, JSON.stringify({ token: 5, email: '' }));
    expect(readAuth(s)).toBeNull();
  });

  it('sign out clears the account and the silent-try flag', () => {
    const s = mem(), tab = mem();
    saveToken(s, 'tok', 3600, NOW); saveEmail(s, 'a@b.com'); markSilentTried(tab);
    clearAuth(s, tab);
    expect(readAuth(s)).toBeNull();
    expect(tab.m.has(SILENT_KEY)).toBe(false);
    expect(isSignedIn(readAuth(s))).toBe(false);
  });
});

describe('silent re-auth', () => {
  it('tries once per tab, only for an account that never signed out and has no live token', () => {
    const s = mem(), tab = mem();
    expect(shouldTrySilent(readAuth(s), tab, NOW)).toBe(false); // never signed in
    saveToken(s, 'tok', 3600, NOW); saveEmail(s, 'a@b.com');
    expect(shouldTrySilent(readAuth(s), tab, NOW)).toBe(false); // token still good
    expect(shouldTrySilent(readAuth(s), tab, NOW + 7200_000)).toBe(true);
    markSilentTried(tab);
    expect(shouldTrySilent(readAuth(s), tab, NOW + 7200_000)).toBe(false); // no loop
  });

  it('builds a prompt=none URL with the account as hint and state', () => {
    const u = new URL(buildAuthUrl({ clientId: 'c', redirectUri: 'http://localhost:5173', silent: true, loginHint: 'a@b.com' }));
    expect(u.searchParams.get('prompt')).toBe('none');
    expect(u.searchParams.get('login_hint')).toBe('a@b.com');
    expect(u.searchParams.get('state')).toBe('a@b.com');
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly');
    expect(u.searchParams.get('response_type')).toBe('token');
    const plain = new URL(buildAuthUrl({ clientId: 'c', redirectUri: 'r' }));
    expect(plain.searchParams.has('prompt')).toBe(false);
    expect(plain.searchParams.has('state')).toBe(false);
  });

  it('knows which Google errors mean "ask the user"', () => {
    expect(isSilentMiss('interaction_required')).toBe(true);
    expect(isSilentMiss('login_required')).toBe(true);
    expect(isSilentMiss('access_denied')).toBe(false);
    expect(isSilentMiss(null)).toBe(false);
  });
});

describe('revokeToken', () => {
  it('posts the token to Google and never throws', async () => {
    const f = vi.fn().mockResolvedValue(new Response(''));
    await revokeToken('tok', f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith('https://oauth2.googleapis.com/revoke', expect.objectContaining({ method: 'POST', body: 'token=tok' }));
    const bad = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(revokeToken('tok', bad as unknown as typeof fetch)).resolves.toBeUndefined();
  });
});
