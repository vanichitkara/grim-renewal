/**
 * Full-body fallback tests with a fake Gmail. No network.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { scanInbox, extractText } from './gmail-scout.ts';

const b64url = (s: string) =>
  Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

interface Msg { id: string; snippet: string; payload?: unknown; from?: string }

function fakeGmail(msgs: Msg[]) {
  const formats: Record<string, string[]> = {};
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/messages')) {
      return new Response(JSON.stringify({ messages: msgs.map((m) => ({ id: m.id })) }), { status: 200 });
    }
    const id = url.pathname.split('/').pop()!;
    const m = msgs.find((x) => x.id === id)!;
    const fmt = url.searchParams.get('format')!;
    (formats[id] ??= []).push(fmt);
    const headers = [
      { name: 'From', value: m.from ?? 'Acme <billing@acme.com>' },
      { name: 'Date', value: 'Tue, 03 Feb 2026 10:00:00 +0000' },
    ];
    const payload = fmt === 'full' ? { headers, ...(m.payload as object) } : { headers };
    return new Response(JSON.stringify({ id, snippet: m.snippet, payload }), { status: 200 });
  }));
  return { formats };
}

const TEASER = 'Thanks for being a customer. Your receipt is below.';
afterEach(() => { vi.unstubAllGlobals(); });

describe('full-body fallback', () => {
  it('does not fetch the full body when the snippet parses', async () => {
    const { formats } = fakeGmail([{ id: 'a', snippet: 'Your receipt. You were charged $9.99/month.' }]);
    const subs = await scanInbox('t', 'me@x.com');
    expect(subs).toHaveLength(1);
    expect(formats['a']).toEqual(['metadata']);
  });

  it('fetches the full body when the snippet does not parse', async () => {
    const body = 'Your receipt\nPlan: Pro\nYou were charged $14.50 per month';
    const { formats } = fakeGmail([{ id: 'a', snippet: TEASER, payload: { mimeType: 'text/plain', body: { data: b64url(body) } } }]);
    const subs = await scanInbox('t', 'me@x.com');
    expect(formats['a']).toEqual(['metadata', 'full']);
    expect(subs[0]!.monthlyAmount).toBe(14.5);
  });

  it('reads an html-only receipt', async () => {
    const html = '<style>.a{color:red}</style><p>Your receipt</p><p>Amount&nbsp;charged: <b>$7.25</b>/month</p>';
    fakeGmail([{ id: 'a', snippet: TEASER, payload: { mimeType: 'text/html', body: { data: b64url(html) } } }]);
    const subs = await scanInbox('t', 'me@x.com');
    expect(subs[0]!.monthlyAmount).toBe(7.25);
  });

  it('walks nested multipart and prefers text/plain', async () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [{ mimeType: 'multipart/alternative', parts: [
        { mimeType: 'text/html', body: { data: b64url('<p>Your receipt. Total: $99.00</p>') } },
        { mimeType: 'text/plain', body: { data: b64url('Your receipt. You paid $5.00 monthly') } },
      ] }],
    };
    fakeGmail([{ id: 'a', snippet: TEASER, payload }]);
    const subs = await scanInbox('t', 'me@x.com');
    expect(subs[0]!.monthlyAmount).toBe(5);
  });

  it('decodes base64url with UTF-8 and missing padding', () => {
    const text = extractText({ mimeType: 'text/plain', body: { data: b64url('Total: €12,50 ~~?? café') } });
    expect(text).toBe('Total: €12,50 ~~?? café');
  });

  it('prefers the total over tax and subtotal', async () => {
    const body = 'Your receipt\nSubtotal: $10.00\nTax: $0.80\nTotal: $10.80\nbilled monthly';
    fakeGmail([{ id: 'a', snippet: TEASER, payload: { mimeType: 'text/plain', body: { data: b64url(body) } } }]);
    const subs = await scanInbox('t', 'me@x.com');
    expect(subs[0]!.monthlyAmount).toBe(10.8);
  });

  it('caps the body at 20,000 chars', async () => {
    const text = extractText({ mimeType: 'text/plain', body: { data: b64url('x'.repeat(50_000)) } });
    expect(text.length).toBe(20_000);
    // a receipt that only appears after the cap is not found
    const body = 'y'.repeat(20_000) + ' Your receipt. You were charged $9.99/month';
    fakeGmail([{ id: 'a', snippet: TEASER, payload: { mimeType: 'text/plain', body: { data: b64url(body) } } }]);
    expect(await scanInbox('t', 'me@x.com')).toEqual([]);
  });

  it('keeps raw text out of the returned records', async () => {
    const secret = 'SECRET-BODY-MARKER-12345';
    const body = `Your receipt ${secret}\nYou were charged $9.99/month`;
    fakeGmail([{ id: 'a', snippet: TEASER, payload: { mimeType: 'text/plain', body: { data: b64url(body) } } }]);
    const subs = await scanInbox('t', 'me@x.com');
    expect(subs).toHaveLength(1);
    expect(JSON.stringify(subs)).not.toContain(secret);
  });

  it('scans at most 300 messages', async () => {
    const msgs = Array.from({ length: 350 }, (_, i) => ({ id: `m${i}`, snippet: 'hi' }));
    const { formats } = fakeGmail(msgs);
    await scanInbox('t', 'me@x.com');
    expect(Object.keys(formats)).toHaveLength(300);
  });

  it('retries a 429 with the injected wait, not a real sleep', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () =>
      n++ === 0 ? new Response('', { status: 429 }) : new Response(JSON.stringify({}), { status: 200 })));
    const sleep = vi.fn(async () => {});
    await expect(scanInbox('t', 'me@x.com', sleep)).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledWith(60_000);
  });
});
