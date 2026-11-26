/**
 * Pure helpers for the Cancellation Player: captions, the step list and the
 * final result line. No DOM. Names come from web pages, so callers must show
 * these strings with textContent only.
 */

import { MSG } from './messages.ts';
import type { ConfirmStep, AdapterResult } from '../agents/reaper.ts';

export type StepStatus = 'active' | 'done' | 'stopped';
export interface PlayerStep {
  label: string;
  status: StepStatus;
}

const MAX_NAME = 60;

function shortName(name: string): string {
  const n = name.replace(/\s+/g, ' ').trim();
  return n.length > MAX_NAME ? n.slice(0, MAX_NAME - 1) + '…' : n || 'a control';
}

/** Short label for the numbered list. */
export function stepLabel(step?: Pick<ConfirmStep, 'name' | 'kind'>): string {
  if (!step) return 'Next step';
  return `${step.kind === 'check' ? 'Select' : 'Click'} “${shortName(step.name)}”`;
}

/** Caption while the Reaper waits for the user's okay. */
export function approvalCaption(step?: Pick<ConfirmStep, 'name' | 'kind'>): string {
  if (!step) return 'The Reaper wants to take the next step. Approve this step?';
  return `Next: ${stepLabel(step).replace(/^./, (c) => c.toLowerCase())}. Approve this step?`;
}

/** Caption while the cursor moves and acts. */
export function actionCaption(kind: 'click' | 'type', name: string): string {
  return kind === 'type' ? `Typing into “${shortName(name)}”` : `Clicking “${shortName(name)}”`;
}

/** Add a step as active and mark the previous active step done. Returns a new list. */
export function startStep(steps: readonly PlayerStep[], label: string): PlayerStep[] {
  return [...steps.map((s): PlayerStep => (s.status === 'active' ? { ...s, status: 'done' } : s)), { label, status: 'active' }];
}

/** Close the list: the active step becomes done (run finished) or stopped (run failed). */
export function finishSteps(steps: readonly PlayerStep[], ok: boolean): PlayerStep[] {
  return steps.map((s): PlayerStep => (s.status === 'active' ? { ...s, status: ok ? 'done' : 'stopped' } : s));
}

const FAILURES: Record<string, string> = {
  user_declined: MSG.playerDeclined,
  login_required: MSG.playerLogin,
  no_cancel_control: MSG.playerNoControl,
  step_limit: MSG.playerStepLimit,
};

/** Final line under the player. Honest about failure. */
export function resultLine(res: AdapterResult, savedPerYear: number): string {
  if (res.ok) return `Cancelled. +$${savedPerYear.toFixed(2)}/yr`;
  return FAILURES[res.reason] ?? MSG.playerOther;
}
