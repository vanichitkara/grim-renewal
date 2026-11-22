/**
 * Re-sweep: after each scan, compare what we knew with what the scan shows.
 * Pure. The UI calls it; it never recomputes the rules itself.
 */
import type { Subscription } from '../types.ts';
import { assessCancellation, type Assessment } from './assess.ts';

export interface SweepResult {
  id: string;
  merchant: string;
  assessment: Assessment;
  /** Assessment from the previous scan (same claim), or null if the sub is new. */
  previous: Assessment | null;
  /** True when the level changed, e.g. likely -> came_back. */
  changed: boolean;
}

/**
 * @param claims subscription id -> ISO day the user said they cancelled (loadClaims()).
 * A subscription seen before but missing from the new scan is assessed from its old data.
 */
export function sweepForChanges(
  prev: readonly Subscription[],
  scanned: readonly Subscription[],
  claims: Readonly<Record<string, string>>,
  now: Date = new Date(),
): SweepResult[] {
  const prevById = new Map(prev.map((s) => [s.id, s]));
  const current = new Map(prev.map((s) => [s.id, s]));
  for (const s of scanned) current.set(s.id, s);

  const assess = (sub: Subscription): Assessment =>
    assessCancellation({ sub, claim: claims[sub.id] ? { claimedAt: claims[sub.id]! } : null, now });

  return [...current.values()].map((sub) => {
    const before = prevById.get(sub.id);
    const previous = before ? assess(before) : null;
    const assessment = assess(sub);
    return {
      id: sub.id,
      merchant: sub.merchant,
      assessment,
      previous,
      changed: previous !== null && previous.level !== assessment.level,
    };
  });
}
