import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchProfileEmail } from './gmail-profile.ts';

afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchProfileEmail', () => {
  it('returns the address and sends a bearer header', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ emailAddress: 'a@b.co' }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    await expect(fetchProfileEmail('abc')).resolves.toBe('a@b.co');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/profile');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc');
  });
  it('returns undefined on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    await expect(fetchProfileEmail('abc')).resolves.toBeUndefined();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('x'); }));
    await expect(fetchProfileEmail('abc')).resolves.toBeUndefined();
  });
});
