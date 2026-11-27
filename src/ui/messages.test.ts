import { describe, it, expect } from 'vitest';
import { MSG, scanErrorMessage } from './messages.ts';
import { resultLine } from './cancel-player-steps.ts';
import { doneText } from './potion-loader.ts';

describe('messages', () => {
  it('every message is short', () => {
    for (const [k, v] of Object.entries(MSG)) expect(v.split(/\s+/).length, k).toBeLessThanOrEqual(22);
  });
  it('maps Gmail codes', () => {
    expect(scanErrorMessage('Gmail 401').text).toBe(MSG.gmail401);
    expect(scanErrorMessage('HTTP 403 forbidden').code).toBe('403');
    expect(scanErrorMessage('429').text).toBe(MSG.gmail429);
    expect(scanErrorMessage('boom').text).toBe(MSG.scanFailed);
  });
  it('failure messages never claim a cancel and name the fix', () => {
    for (const reason of ['user_declined', 'login_required', 'no_cancel_control', 'step_limit', 'weird']) {
      const t = resultLine({ ok: false, reason } as never, 5);
      expect(t).toMatch(/Nothing was cancelled/);
      expect(t).not.toMatch(/^Cancelled/);
    }
    expect(resultLine({ ok: false, reason: 'login_required' } as never, 5)).toMatch(/Cancel kit/);
  });
  it('empty potion', () => {
    expect(doneText(0)).toBe(MSG.scanEmpty);
    expect(doneText(2)).toBe('2 souls found');
  });
});
