/**
 * Firestore store for the deployed tips server (Cloud Run's disk is wiped on every restart).
 * Same rules as the other stores: counts only, one document per (company, method, month). No user, no address, no time.
 *
 * The Firestore package is passed in, not imported here, so local runs and tests never load it.
 */
import type { MethodKind, Row, TipStore } from './types.ts';

/** The tiny part of the Firestore client this store uses. Lets tests pass a fake. */
export interface FirestoreLike {
  collection(name: string): {
    doc(id: string): { set(data: Record<string, unknown>, opts: { merge: true }): Promise<unknown> };
    where(field: string, op: '==', value: string): { get(): Promise<{ docs: Array<{ data(): Record<string, unknown> }> }> };
  };
}
export interface FieldValueLike {
  increment(n: number): unknown;
}

const METHODS_OK = new Set(['online', 'email', 'phone', 'other']);
const MONTH_RE = /^\d{4}-\d{2}$/;

/** Firestore document ids may not contain "/". Keys are already checked, but be strict anyway. */
export function docId(merchantKey: string, method: string, month: string): string {
  return `${merchantKey}|${method}|${month}`.replace(/\//g, '_');
}

export function createFirestoreStore(db: FirestoreLike, FieldValue: FieldValueLike, collection = 'tips'): TipStore {
  const col = db.collection(collection);
  return {
    async add(r: { merchantKey: string; method: MethodKind; worked: boolean; month: string }) {
      // increment is atomic on the server, so two reports at the same moment never lose a count.
      await col.doc(docId(r.merchantKey, r.method, r.month)).set(
        {
          merchantKey: r.merchantKey,
          method: r.method,
          month: r.month,
          worked: FieldValue.increment(r.worked ? 1 : 0),
          failed: FieldValue.increment(r.worked ? 0 : 1),
        },
        { merge: true },
      );
    },
    async get(merchantKey: string): Promise<Row[]> {
      const snap = await col.where('merchantKey', '==', merchantKey).get();
      const rows: Row[] = [];
      for (const d of snap.docs) {
        const x = d.data();
        const method = String(x['method'] ?? '');
        const month = String(x['month'] ?? '');
        if (!METHODS_OK.has(method) || !MONTH_RE.test(month)) continue; // ignore anything odd
        rows.push({
          merchantKey,
          method: method as MethodKind,
          month,
          worked: Math.max(0, Number(x['worked'] ?? 0) || 0),
          failed: Math.max(0, Number(x['failed'] ?? 0) || 0),
        });
      }
      return rows;
    },
  };
}
