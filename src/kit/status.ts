/**
 * One status word per subscription. Pure.
 * "Verified" appears only when the assessment level is 'verified'.
 */
import { MSG } from '../ui/messages.ts';
import type { Assessment } from '../savings/assess.ts';

export type StatusWord = 'Found' | 'Cancel started' | 'Cancel failed' | 'Waiting to verify' | 'Likely cancelled' | 'Verified' | 'Came back';
/** What the Reaper (the event bus) said about this subscription. */
export type ReaperState = 'none' | 'started' | 'done' | 'failed' | 'came_back';

export interface Status {
  word: StatusWord;
  /** The assessment's own words, for a second line. */
  detail: string;
}

export function statusFor(input: { reaper: ReaperState; assessment: Assessment }): Status {
  const { reaper, assessment: a } = input;
  if (a.level === 'came_back' || reaper === 'came_back') return { word: 'Came back', detail: a.level === 'came_back' ? a.display : 'Came back: a new charge appeared' };
  if (a.level === 'verified') return { word: 'Verified', detail: a.display };
  if (a.level === 'confirmed') return { word: 'Waiting to verify', detail: a.display };
  if (reaper === 'done') return { word: 'Waiting to verify', detail: 'The Reaper finished. Waiting for a billing cycle with no charge.' };
  if (reaper === 'started') return { word: 'Cancel started', detail: 'The Reaper is working on it.' };
  if (reaper === 'failed') return { word: 'Cancel failed', detail: MSG.cancelFailedDetail };
  if (a.level === 'likely' || a.level === 'quiet') return { word: 'Likely cancelled', detail: a.display };
  return { word: 'Found', detail: '' };
}
