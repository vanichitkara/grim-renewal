/**
 * In-memory event bus shared by all agents and the animation layer.
 * Keyed by subscriptionId.
 *
 * The animation layer subscribes to events and fires state transitions
 * ONLY in response to events — never ahead of the actual backend result.
 */

import type { AgentEvent } from '../types.ts';

type Listener = (event: AgentEvent) => void;

const listeners: Listener[] = [];
const history: AgentEvent[] = [];

/** Emit an event. All listeners receive it synchronously. */
export function emit(event: AgentEvent): void {
  history.push(event);
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (err) {
      console.error('[EventBus] listener error', err);
    }
  }
}

/** Subscribe to all events. Returns an unsubscribe function. */
export function subscribe(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i !== -1) listeners.splice(i, 1);
  };
}

/** Subscribe to events for a specific subscriptionId only. */
export function subscribeToId(
  id: string,
  fn: (event: AgentEvent) => void,
): () => void {
  return subscribe((e) => {
    if ('subscriptionId' in e && e.subscriptionId === id) fn(e);
  });
}

/** All events emitted so far (useful for debugging and the write-up log). */
export function getHistory(): readonly AgentEvent[] {
  return history;
}

/** Clear history (use in tests only). */
export function _clearForTest(): void {
  history.length = 0;
  listeners.length = 0;
}
