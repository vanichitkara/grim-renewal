import { describe, expect, it } from 'vitest';
import { createFirestoreStore, docId, type FirestoreLike } from './firestore-store.ts';
import { summarize } from './rank.ts';

/** A fake Firestore that behaves like the real one for set(merge) + increment and a where('==') query. */
function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const INC = Symbol('inc');
  const FieldValue = { increment: (n: number) => ({ [INC]: n }) };
  const db: FirestoreLike = {
    collection: () => ({
      doc: (id: string) => ({
        async set(data: Record<string, unknown>) {
          const cur = docs.get(id) ?? {};
          for (const [k, v] of Object.entries(data)) {
            const inc = v && typeof v === 'object' && INC in (v as object) ? (v as Record<symbol, number>)[INC] : undefined;
            cur[k] = inc !== undefined ? Number(cur[k] ?? 0) + inc : v;
          }
          docs.set(id, cur);
        },
      }),
      where: (_f: string, _op: '==', value: string) => ({
        async get() {
          return { docs: [...docs.values()].filter((d) => d['merchantKey'] === value).map((d) => ({ data: () => d })) };
        },
      }),
    }),
  };
  return { db, FieldValue, docs };
}

describe('Firestore store', () => {
  it('keeps counts only, one document per company, method and month', async () => {
    const { db, FieldValue, docs } = fakeDb();
    const s = createFirestoreStore(db, FieldValue);
    for (let i = 0; i < 5; i++) await s.add({ merchantKey: 'netflix.com', method: 'email', worked: true, month: '2026-11' });
    await s.add({ merchantKey: 'netflix.com', method: 'email', worked: false, month: '2026-11' });
    expect(docs.size).toBe(1);
    const only = [...docs.values()][0]!;
    expect(Object.keys(only).sort()).toEqual(['failed', 'merchantKey', 'method', 'month', 'worked']);
    expect(await s.get('netflix.com')).toEqual([{ merchantKey: 'netflix.com', method: 'email', month: '2026-11', worked: 5, failed: 1 }]);
  });

  it('feeds the same ranking as the local stores', async () => {
    const { db, FieldValue } = fakeDb();
    const s = createFirestoreStore(db, FieldValue);
    for (let i = 0; i < 7; i++) await s.add({ merchantKey: 'netflix.com', method: 'email', worked: true, month: '2026-11' });
    for (let i = 0; i < 2; i++) await s.add({ merchantKey: 'netflix.com', method: 'email', worked: false, month: '2026-11' });
    expect(summarize(await s.get('netflix.com'), 'netflix.com', new Date('2026-11-22T00:00:00Z')).best).toBe('email');
  });

  it('ignores odd documents and keeps companies apart', async () => {
    const { db, FieldValue, docs } = fakeDb();
    const s = createFirestoreStore(db, FieldValue);
    await s.add({ merchantKey: 'spotify.com', method: 'online', worked: true, month: '2026-11' });
    docs.set('junk', { merchantKey: 'netflix.com', method: 'fax', month: 'soon', worked: 9 });
    expect(await s.get('netflix.com')).toEqual([]);
    expect(await s.get('spotify.com')).toHaveLength(1);
  });

  it('makes safe document ids', () => {
    expect(docId('a/b.com', 'email', '2026-11')).toBe('a_b.com|email|2026-11');
  });
});
