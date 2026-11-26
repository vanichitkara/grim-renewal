/**
 * User-facing error and empty-state text. Each line: a short spooky joke, then the plain fix and what to tap.
 * Kind, never blames the user, never claims success that did not happen. Pure strings, no DOM.
 * Callers show these with textContent only.
 */

export const MSG = {
  gmail401: 'That token turned to dust. Tap Connect Gmail to sign in again.',
  gmail403: 'Gmail bolted the door. Its API may be off, or this account is not a test user. Check, then tap Connect Gmail.',
  gmail429: 'Gmail is out of breath. Wait a minute, then tap Connect Gmail to scan again.',
  scanFailed: 'The cauldron cracked. Nothing was lost. Tap Connect Gmail to scan again.',
  scanEmpty: 'The pot is empty. No receipts in 13 months. Tap Connect Gmail to try another account.',
  signInUnfinished: 'The ritual got interrupted. Tap Connect Gmail to start again.',
  signInExpired: 'Your sign-in faded like a ghost. Tap Connect Gmail to bring it back.',
  signingBackIn: 'Signing you back in…',
  noneYet: 'The crypt is quiet. No subscriptions found yet.',
  cancelFailedDetail: 'The Reaper got spooked. Tap Cancel kit for a script.',
  // Cancellation Player. All say plainly that nothing was cancelled.
  playerDeclined: 'Scythe sheathed. Nothing was cancelled.',
  playerLogin: 'A password gate. The Reaper never types passwords. Nothing was cancelled. Tap Cancel kit.',
  playerNoControl: 'The cancel button is hiding. Nothing was cancelled. Tap Cancel kit.',
  playerStepLimit: 'The Reaper got lost in the maze. Nothing was cancelled. Tap Cancel kit.',
  playerOther: 'The Reaper tripped. Nothing was cancelled. Tap Cancel kit.',
} as const;

/** Gmail scan error text -> the message for its code, or the generic one. */
export function scanErrorMessage(errText: string): { code: '401' | '403' | '429' | null; text: string } {
  const code = (/\b(401|403|429)\b/.exec(errText) || [])[1] as '401' | '403' | '429' | undefined;
  if (code === '401') return { code, text: MSG.gmail401 };
  if (code === '403') return { code, text: MSG.gmail403 };
  if (code === '429') return { code, text: MSG.gmail429 };
  return { code: null, text: MSG.scanFailed };
}
