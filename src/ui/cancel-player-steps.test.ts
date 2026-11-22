import { describe, it, expect } from 'vitest';
import { stepLabel, approvalCaption, actionCaption, startStep, finishSteps, resultLine } from './cancel-player-steps.ts';

describe('cancel player steps', () => {
  it('builds labels and captions', () => {
    expect(stepLabel({ name: 'Cancel plan', kind: 'click' })).toBe('Click “Cancel plan”');
    expect(stepLabel({ name: 'Too expensive', kind: 'check' })).toBe('Select “Too expensive”');
    expect(approvalCaption({ name: 'Cancel plan', kind: 'click' })).toBe('Next: click “Cancel plan”. Approve this step?');
    expect(approvalCaption()).toMatch(/Approve this step\?$/);
    expect(actionCaption('click', 'Submit')).toBe('Clicking “Submit”');
    expect(actionCaption('type', 'Email')).toBe('Typing into “Email”');
  });

  it('shortens long and empty names', () => {
    expect(stepLabel({ name: 'x'.repeat(200), kind: 'click' }).length).toBeLessThan(80);
    expect(stepLabel({ name: '  ', kind: 'click' })).toBe('Click “a control”');
  });

  it('ticks the previous step when the next starts, and closes the list', () => {
    let s = startStep([], 'A');
    s = startStep(s, 'B');
    expect(s.map((x) => x.status)).toEqual(['done', 'active']);
    expect(finishSteps(s, true).map((x) => x.status)).toEqual(['done', 'done']);
    expect(finishSteps(s, false).map((x) => x.status)).toEqual(['done', 'stopped']);
  });

  it('reports success with savings and failures honestly', () => {
    expect(resultLine({ ok: true }, 275.88)).toBe('Cancelled. +$275.88/yr');
    expect(resultLine({ ok: false, reason: 'user_declined' }, 1)).toMatch(/Nothing was cancelled/);
    expect(resultLine({ ok: false, reason: 'login_required' }, 1)).toMatch(/never types passwords/);
    expect(resultLine({ ok: false, reason: 'weird' }, 1)).toMatch(/Nothing was cancelled/);
  });
});
