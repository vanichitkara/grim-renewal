/**
 * Cadence helpers. Pure. Dates are ISO days (YYYY-MM-DD), compared in UTC.
 */
import type { BillingCycle } from '../types.ts';

export const DAY_MS = 86_400_000;

/** ISO day (or ISO timestamp) to a whole day number since 1970. NaN if invalid. */
export function dayNumber(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return NaN;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? NaN : Math.floor(t / DAY_MS);
}

export function isoFromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Valid, unique, sorted (oldest first) ISO days. */
export function cleanDates(dates: readonly string[]): string[] {
  return [...new Set(dates.filter((d) => !Number.isNaN(dayNumber(d))).map((d) => d.slice(0, 10)))].sort();
}

/** Nominal days for one billing cycle. Unknown falls back to monthly. */
export function nominalGapDays(cycle: BillingCycle): number {
  return cycle === 'annual' ? 365 : 30;
}

/**
 * Usual days between charges: the median gap, clamped to 7..400.
 * With fewer than two dates, use the billing cycle (monthly 30, annual 365).
 */
export function usualGapDays(chargeDates: readonly string[], cycle: BillingCycle = 'unknown'): number {
  const days = cleanDates(chargeDates).map(dayNumber);
  if (days.length < 2) return nominalGapDays(cycle);
  const gaps = days.slice(1).map((d, i) => d - days[i]!).sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  const median = gaps.length % 2 ? gaps[mid]! : (gaps[mid - 1]! + gaps[mid]!) / 2;
  return Math.min(400, Math.max(7, Math.round(median)));
}

/** The ISO day the next receipt is expected: last date plus the usual gap. */
export function expectedNext(lastDate: string, gapDays: number): string {
  return isoFromDay(dayNumber(lastDate) + gapDays);
}
