import { describe, it, expect } from 'vitest';
import { pickHint, type GhostState, type GhostSub } from './guide-ghost.ts';

const base: GhostState = { locked: false, scanning: false, scanError: false, subs: [], trials: [] };
const sub = (o: Partial<GhostSub> = {}): GhostSub => ({ id: 's1', merchant: 'Netflix', status: 'Found', forgottenScore: 0.9, chargeCount: 14, billingCycle: 'monthly', ...o });

describe('pickHint', () => {
  it('locked page asks to connect Gmail', () => {
    const h = pickHint({ ...base, locked: true });
    expect(h.text).toBe('Psst. Connect Gmail. I only read receipts.');
    expect(h.action.kind).toBe('connect');
  });
  it('scan error points at Connect Gmail', () => {
    expect(pickHint({ ...base, scanError: true }).action.kind).toBe('connect');
  });
  it('scanning has no button', () => {
    expect(pickHint({ ...base, scanning: true }).action.kind).toBe('none');
  });
  it('zombie names months and the Reaper', () => {
    const h = pickHint({ ...base, subs: [sub()] });
    expect(h.text).toBe('Netflix has been charging you for 14 months. Send the Reaper?');
    expect(h.action).toEqual({ kind: 'reap', id: 's1', label: 'Send the Reaper' });
  });
  it('annual plans count in months', () => {
    expect(pickHint({ ...base, subs: [sub({ billingCycle: 'annual', chargeCount: 2 })] }).text).toContain('24 months');
  });
  it('failed cancel beats a zombie and opens the kit', () => {
    const h = pickHint({ ...base, subs: [sub(), sub({ id: 's2', merchant: 'Hulu', status: 'Cancel failed' })] });
    expect(h.action).toEqual({ kind: 'kit', id: 's2', label: 'Open Cancel kit' });
    expect(h.text).toContain('Cancel kit has a script');
  });
  it('came back offers the Reaper again', () => {
    expect(pickHint({ ...base, subs: [sub({ status: 'Came back' })] }).action.kind).toBe('reap');
  });
  it('near trial: tomorrow and days', () => {
    const t = (days: number) => pickHint({ ...base, trials: [{ id: 't1', merchant: 'Max', days, status: 'idle' }] });
    expect(t(2).text).toBe('Max trial wakes up in 2 days. Bury it?');
    expect(t(1).text).toContain('tomorrow');
    expect(t(0).text).toContain('today');
    expect(t(2).action.kind).toBe('bury');
  });
  it('picks the soonest trial', () => {
    const h = pickHint({ ...base, trials: [{ id: 'a', merchant: 'A', days: 3, status: 'idle' }, { id: 'b', merchant: 'B', days: 1, status: 'idle' }] });
    expect(h.action).toMatchObject({ kind: 'bury', id: 'b' });
  });
  it('waiting to verify says go have a snack', () => {
    const h = pickHint({ ...base, subs: [sub({ status: 'Waiting to verify' })] });
    expect(h.text).toBe("I'll watch for the next bill. Go have a snack.");
    expect(h.action.kind).toBe('list');
  });
  it('a far trial still gets a hint', () => {
    expect(pickHint({ ...base, trials: [{ id: 't', merchant: 'Max', days: 9, status: 'idle' }] }).action.kind).toBe('bury');
  });
  it('nothing left is quiet', () => {
    const h = pickHint({ ...base, subs: [sub({ status: 'Verified' })], trials: [{ id: 't', merchant: 'Max', days: 1, status: 'buried' }] });
    expect(h.text).toBe('All quiet. The dead stay dead.');
    expect(h.action.kind).toBe('dismiss');
  });
  it('low forgotten score is not a zombie', () => {
    expect(pickHint({ ...base, subs: [sub({ forgottenScore: 0.1 })] }).text).toContain('All quiet');
  });
  it('long names are cut', () => {
    expect(pickHint({ ...base, subs: [sub({ merchant: 'X'.repeat(60) })] }).text.length).toBeLessThan(90);
  });
});
