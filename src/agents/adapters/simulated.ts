/**
 * Simulated cancel for seeded test accounts (opt in with `?simulate`).
 * It cancels NOTHING. It waits for the user's okay, pauses, then reports success,
 * so the hallway can play the full kill sequence on fake receipts.
 */

import type { CancelAdapter } from '../reaper.ts';

export function createSimulatedAdapter(delayMs = 1200): CancelAdapter {
  return async (sub, confirm) => {
    if (sub.phoneOnly) return { ok: false, reason: 'phone_only' };
    if (!(await confirm())) return { ok: false, reason: 'user_declined' };
    await new Promise((r) => setTimeout(r, delayMs));
    return { ok: true };
  };
}
