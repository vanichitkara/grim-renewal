/**
 * Ranking of what worked. Pure.
 * Wilson lower bound (95%) of the worked-rate on month-decayed counts.
 * Note: `failed` is biased toward the method people try first (they fail there, then move on).
 */
import type { MethodKind, Row, Tip, TipSummary } from './types.ts';
import { METHODS } from './types.ts';

export const MIN_REPORTS = 5;
export const MIN_LOWER_BOUND = 0.4;
const Z = 1.96;

/** Wilson score lower bound for `worked` successes out of `total` (may be fractional). */
export function wilsonLower(worked: number, total: number): number {
  if (total <= 0) return 0;
  const p = worked / total;
  const z2 = Z * Z;
  const centre = p + z2 / (2 * total);
  const margin = Z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - margin) / (1 + z2 / total));
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Whole months from `month` ('yyyy-mm') to `now`. Bad input counts as very old. */
export function monthsAgo(month: string, now: Date): number {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return Infinity;
  return (now.getUTCFullYear() - Number(m[1])) * 12 + (now.getUTCMonth() + 1 - Number(m[2]));
}

/** Full weight for 12 months, half weight to 36 months, dropped after. */
export function weightFor(age: number): number {
  if (age < 0 || age <= 12) return 1;
  return age <= 36 ? 0.5 : 0;
}

export function summarize(rows: Row[], merchantKey: string, now: Date): TipSummary {
  const per = new Map<MethodKind, { w: number; f: number; rw: number; rf: number; newest: string }>();
  for (const r of rows) {
    if (r.merchantKey !== merchantKey) continue;
    const wt = weightFor(monthsAgo(r.month, now));
    if (wt === 0) continue;
    const e = per.get(r.method) ?? { w: 0, f: 0, rw: 0, rf: 0, newest: '' };
    e.w += r.worked * wt;
    e.f += r.failed * wt;
    e.rw += r.worked;
    e.rf += r.failed;
    if (r.month > e.newest) e.newest = r.month;
    per.set(r.method, e);
  }

  const methods: Tip[] = [];
  let best: { method: MethodKind; lower: number; total: number; newest: string } | null = null;
  for (const method of METHODS) {
    const e = per.get(method);
    if (!e) continue;
    methods.push({ merchantKey, method, worked: e.rw, failed: e.rf });
    const total = e.rw + e.rf;
    const lower = wilsonLower(e.w, e.w + e.f);
    if (total < MIN_REPORTS || lower < MIN_LOWER_BOUND) continue;
    const better =
      best === null ||
      lower > best.lower ||
      (lower === best.lower && (total > best.total || (total === best.total && e.newest > best.newest)));
    if (better) best = { method, lower, total, newest: e.newest };
  }

  if (methods.length === 0) {
    return { merchantKey, best: null, bestWorked: 0, bestTotal: 0, methods, source: 'none', label: 'no reports yet' };
  }
  if (best === null) {
    return { merchantKey, best: null, bestWorked: 0, bestTotal: 0, methods, source: 'community', label: 'not enough reports yet' };
  }
  const t = methods.find((m) => m.method === best.method)!;
  return { merchantKey, best: best.method, bestWorked: t.worked, bestTotal: t.worked + t.failed, methods, source: 'community' };
}
