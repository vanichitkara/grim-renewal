/**
 * Reaper agent: the cancellation state machine.
 *
 * requestCancel() parks the sub at `knocking` and does NOTHING until an
 * `approved` event for that id arrives. Then it tries methods in order:
 * api -> browser -> unsubscribe_header, falling to boss_door (phone) last.
 *
 * Privacy: the transition log holds only ids, states and timestamps.
 * Adapters never auto-fill passwords or submit forms; they must await confirm().
 */

import type { CancelMethod, CancellationState, Subscription } from '../types.ts';
import { emit, subscribeToId } from './event-bus.ts';

export type AdapterResult = { ok: true } | { ok: false; reason: string };

/** What the next step will touch. Lets a UI say what it is asking the user to approve. */
export interface ConfirmStep {
  /** Accessible name of the control. Display with textContent only. */
  name: string;
  ref: string;
  kind: 'click' | 'check';
}

/** Resolves true when the user okays the next destructive step. */
export type Confirm = (step?: ConfirmStep) => Promise<boolean>;

export type CancelAdapter = (sub: Subscription, confirm: Confirm) => Promise<AdapterResult>;

export interface CancelAdapters {
  api: CancelAdapter;
  browser: CancelAdapter;
  unsubscribe_header: CancelAdapter;
  /** Called before each destructive step. Default: true (user already approved). */
  confirm: Confirm;
}

export interface Transition {
  at: string; // ISO 8601
  subscriptionId: string;
  from: CancellationState;
  to: CancellationState;
}

const notConfigured: CancelAdapter = async () => ({ ok: false, reason: 'not_configured' });

const defaults = (): CancelAdapters => ({
  api: notConfigured,
  browser: notConfigured,
  unsubscribe_header: notConfigured,
  confirm: async () => true,
});

let adapters: CancelAdapters = defaults();
const states = new Map<string, CancellationState>();
const pending = new Set<string>();
const unsubs = new Map<string, Array<() => void>>();
let log: Transition[] = [];

const AUTO_METHODS: Exclude<CancelMethod, 'boss_door'>[] = ['api', 'browser', 'unsubscribe_header'];

export function setAdapters(next: Partial<CancelAdapters>): void {
  adapters = { ...adapters, ...next };
}

export function getState(id: string): CancellationState {
  return states.get(id) ?? 'idle';
}

export function getTransitionLog(): readonly Transition[] {
  return log;
}

/** Additive: send one sub back to `idle` (a revenant came back). Logged like any transition. */
export function resetForRevenant(id: string): void {
  release(id);
  setState(id, 'idle');
}

/** Reset all module state (tests only). */
export function _resetForTest(): void {
  for (const list of unsubs.values()) list.forEach((u) => u());
  unsubs.clear();
  pending.clear();
  states.clear();
  log = [];
  adapters = defaults();
}

function setState(id: string, to: CancellationState): void {
  const from = getState(id);
  states.set(id, to);
  log.push({ at: new Date().toISOString(), subscriptionId: id, from, to });
}

function listen(id: string, off: () => void): void {
  const list = unsubs.get(id) ?? [];
  list.push(off);
  unsubs.set(id, list);
}

function release(id: string): void {
  unsubs.get(id)?.forEach((u) => u());
  unsubs.delete(id);
  pending.delete(id);
}

async function run(sub: Subscription): Promise<void> {
  const id = sub.id;
  setState(id, 'opening');
  setState(id, 'cancelling');

  let lastReason = 'not_configured';
  if (!sub.phoneOnly) {
    for (const method of AUTO_METHODS) {
      emit({ kind: 'cancel_start', subscriptionId: id, method });
      let res: AdapterResult;
      try {
        res = await adapters[method](sub, adapters.confirm);
      } catch {
        res = { ok: false, reason: 'adapter_error' };
      }
      if (res.ok) {
        setState(id, 'reaping');
        setState(id, 'dead');
        emit({ kind: 'cancel_ok', subscriptionId: id, confirmedAt: new Date().toISOString() });
        return release(id);
      }
      lastReason = res.reason;
    }
  } else {
    lastReason = 'phone_only';
  }

  emit({ kind: 'cancel_start', subscriptionId: id, method: 'boss_door' });
  setState(id, 'boss');
  emit({ kind: 'cancel_fail', subscriptionId: id, reason: lastReason });
  pending.delete(id); // keep the boss_resolved listener alive
}

export function requestCancel(sub: Subscription): void {
  const id = sub.id;
  const s = getState(id);
  if (s === 'dead' || s === 'boss_resolved' || pending.has(id) || s === 'boss') return;

  pending.add(id);
  setState(id, 'queued');
  setState(id, 'walking');
  setState(id, 'knocking');

  listen(
    id,
    subscribeToId(id, (e) => {
      if (e.kind === 'approved' && getState(id) === 'knocking') {
        void run(sub);
      } else if (e.kind === 'boss_resolved' && getState(id) === 'boss') {
        // Spec: after the phone call the subscription is dead and its savings count.
        // Both transitions are logged; `dead` is the final state.
        setState(id, 'boss_resolved');
        setState(id, 'dead');
        release(id);
      }
    }),
  );
}
