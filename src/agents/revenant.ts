/**
 * Revenants: a charge that returns after a subscription was cancelled.
 * Spec: cancellation-state-machine.md § Revenants.
 */

import type { Subscription } from '../types.ts';
import { emit } from './event-bus.ts';
import { resetForRevenant } from './reaper.ts';

/** Scanned subs that were dead/boss_resolved in `prev` and charged again after that. */
export function detectRevenants(prev: Subscription[], scanned: Subscription[]): Subscription[] {
  const before = new Map(prev.map((s) => [s.id, s]));
  return scanned.filter((s) => {
    const p = before.get(s.id);
    if (!p || (p.state !== 'dead' && p.state !== 'boss_resolved')) return false;
    return Date.parse(s.lastChargeDate) > Date.parse(p.stateChangedAt); // NaN compares false
  });
}

/** id|chargeDate pairs already announced, so repeat scans stay quiet. */
const announced = new Set<string>();

/** Emit one `revenant` event per new returning charge and reset its reaper state. */
export function emitRevenants(prev: Subscription[], scanned: Subscription[]): Subscription[] {
  const fresh = detectRevenants(prev, scanned).filter(
    (s) => !announced.has(s.id + '|' + s.lastChargeDate),
  );
  for (const s of fresh) {
    announced.add(s.id + '|' + s.lastChargeDate);
    resetForRevenant(s.id);
    emit({ kind: 'revenant', subscriptionId: s.id, newChargeDate: s.lastChargeDate });
  }
  return fresh;
}

/** Tests only. */
export function _resetRevenantsForTest(): void {
  announced.clear();
}
