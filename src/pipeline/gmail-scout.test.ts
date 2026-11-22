/**
 * Scout tests with a fake Gmail. No network.
 * They pin three real bugs: AND-ed label filter, lost From header, missing date.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { scanInbox } from './gmail-scout.ts';

interface FakeMsg { id: string; snippet: string; from: string; date: string }

function fakeGmail(msgs: FakeMsg[]) {
  const urls: URL[] = [];
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    urls.push(url);
    if (url.pathname.endsWith('/messages')) {
      return new Response(JSON.stringify({ messages: msgs.map((m) => ({ id: m.id })) }), { status: 200 });
    }
    const id = url.pathname.split('/').pop()!;
    const m = msgs.find((x) => x.id === id)!;
    // Gmail only returns the headers that were asked for.
    const asked = url.searchParams.getAll('metadataHeaders').map((h) => h.toLowerCase());
    const all = [
      { name: 'From', value: m.from },
      { name: 'Date', value: m.date },
      { name: 'To', value: 'me@example.com' },
    ];
    return new Response(
      JSON.stringify({ id, snippet: m.snippet, payload: { headers: all.filter((h) => asked.includes(h.name.toLowerCase())) } }),
      { status: 200 },
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { urls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('scanInbox', () => {
  it('does not AND the inbox and promotions labels together', async () => {
    const { urls } = fakeGmail([]);
    await scanInbox('tok', 'me@example.com');
    const list = urls[0]!;
    expect(list.searchParams.getAll('labelIds')).toEqual([]);
    expect(list.searchParams.get('q')).toMatch(/in:inbox/);
  });

  it('asks Gmail for the From, Date and To headers', async () => {
    const { urls } = fakeGmail([
      { id: 'a1', snippet: 'Your receipt. Charged $9.99/month.', from: 'Netflix <billing@netflix.com>', date: 'Tue, 03 Feb 2026 10:00:00 +0000' },
    ]);
    await scanInbox('tok', 'me@example.com');
    const meta = urls.find((u) => u.pathname.endsWith('/a1'))!;
    expect(meta.searchParams.getAll('metadataHeaders').sort()).toEqual(['Date', 'From', 'To']);
  });

  it('finds a subscription, with the merchant and the Date header as the charge date', async () => {
    fakeGmail([
      { id: 'a1', snippet: 'Your receipt. You were charged $9.99/month for your plan.', from: 'Netflix <billing@netflix.com>', date: 'Tue, 03 Feb 2026 10:00:00 +0000' },
      { id: 'a2', snippet: 'Your receipt. You were charged $9.99/month for your plan.', from: 'Netflix <billing@netflix.com>', date: 'Tue, 03 Mar 2026 10:00:00 +0000' },
    ]);
    const subs = await scanInbox('tok', 'me@example.com');
    expect(subs).toHaveLength(1);
    expect(subs[0]!.merchant).toBe('Netflix');
    expect(subs[0]!.chargeCount).toBe(2);
    expect(subs[0]!.lastChargeDate).toBe('2026-03-03');
  });

  it('returns an empty list, not an error, when nothing matches', async () => {
    fakeGmail([]);
    await expect(scanInbox('tok', 'me@example.com')).resolves.toEqual([]);
  });
});

describe('scanInbox progress', () => {
  it('reports counts as messages are read, ending at read === total', async () => {
    fakeGmail([
      { id: 'a1', snippet: 'Your receipt. You were charged $9.99/month for your plan.', from: 'Netflix <billing@netflix.com>', date: 'Tue, 03 Feb 2026 10:00:00 +0000' },
      { id: 'a2', snippet: 'hello there', from: 'Friend <f@example.com>', date: 'Tue, 03 Mar 2026 10:00:00 +0000' },
    ]);
    const seen: Array<{ read: number; total: number; found: number }> = [];
    await scanInbox('tok', 'me@example.com', async () => {}, (p) => seen.push({ ...p }));
    expect(seen[0]).toEqual({ read: 0, total: 2, found: 0 });
    expect(seen.at(-1)).toEqual({ read: 2, total: 2, found: 1 });
    expect(seen.map((p) => p.read)).toEqual([0, 1, 2]);
  });
});
