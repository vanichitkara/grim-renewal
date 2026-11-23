/**
 * Stores for community tips. Counts only: (merchantKey, method, yyyy-mm) -> {worked, failed}.
 * No per-report time, no id, no address.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MethodKind, Row, TipStore } from './types.ts';

type Report = { merchantKey: string; method: MethodKind; worked: boolean; month: string };

export function createMemoryStore(initial: Row[] = []): TipStore {
  const rows = new Map<string, Row>();
  const k = (r: { merchantKey: string; method: string; month: string }) => `${r.merchantKey}|${r.method}|${r.month}`;
  for (const r of initial) rows.set(k(r), { ...r });
  return {
    async add(r: Report) {
      const key = k(r);
      const row = rows.get(key) ?? { merchantKey: r.merchantKey, method: r.method, month: r.month, worked: 0, failed: 0 };
      if (r.worked) row.worked += 1;
      else row.failed += 1;
      rows.set(key, row);
    },
    async get(merchantKey) {
      return [...rows.values()].filter((r) => r.merchantKey === merchantKey).map((r) => ({ ...r }));
    },
  };
}

/** JSON file store for local runs. Each write goes to a temp file, then renames over the real one. */
export function createFileStore(path: string): TipStore {
  let rows: Row[] = [];
  if (existsSync(path)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (Array.isArray(parsed)) rows = parsed as Row[];
    } catch {
      /* unreadable file: start empty, the next write replaces it */
    }
  }
  const mem = createMemoryStore(rows);
  const keys = new Set(rows.map((r) => r.merchantKey));
  let chain: Promise<void> = Promise.resolve();
  const flush = async (): Promise<void> => {
    // shortcut: rewrites the whole file per report; fine for a local run, use a database in production.
    const all: Row[] = [];
    for (const key of keys) all.push(...(await mem.get(key)));
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
    writeFileSync(tmp, JSON.stringify(all));
    renameSync(tmp, path);
  };
  return {
    add(r) {
      keys.add(r.merchantKey);
      const run = chain.then(async () => {
        await mem.add(r);
        await flush();
      });
      chain = run.catch(() => undefined);
      return run;
    },
    get: (key) => mem.get(key),
  };
}
