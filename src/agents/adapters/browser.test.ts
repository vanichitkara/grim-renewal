import { describe, it, expect, vi } from 'vitest';
import type { Subscription } from '../../types.ts';
import { createBrowserAdapter, createPlaywrightMcpDriver, parseSnapshot } from './browser.ts';
import type { PageSnapshot } from './browser.ts';

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: 'abc12345', merchant: 'Acme', plan: null, monthlyAmount: 10, billingCycle: 'monthly',
  chargeCount: 3, totalSpent: 30, lastChargeDate: '2026-10-01', renewalDate: null,
  trialEndDate: null, accountEmail: 'demo@example.com', cancelUrl: 'https://example.com/cancel',
  phoneOnly: false, phone: null, memberId: null, forgottenScore: 0.5, state: 'idle',
  stateChangedAt: '2026-10-01T00:00:00Z', ...over,
});

const btn = (ref: string, name: string) => ({ ref, role: 'button', name });

function fake(pages: PageSnapshot[]) {
  const empty: PageSnapshot = { elements: [] };
  let i = 0;
  const d = {
    navigate: vi.fn(async () => {}),
    snapshot: vi.fn(async () => pages[Math.min(i, pages.length - 1)] ?? empty),
    click: vi.fn(async (_ref: string) => { i++; }),
    type: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  return d;
}

const yes = async () => true;

describe('browser adapter', () => {
  it('succeeds across two clicks, confirming before each', async () => {
    const d = fake([
      { elements: [btn('a', 'Cancel subscription')] },
      { elements: [btn('b', 'Yes, confirm')] },
      { elements: [{ ref: '', role: 'text', name: 'Your plan has been cancelled' }] },
    ]);
    const confirm = vi.fn(yes);
    const res = await createBrowserAdapter(() => d)(sub(), confirm);
    expect(res).toEqual({ ok: true });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(d.click.mock.calls).toEqual([['a'], ['b']]);
    expect(d.close).toHaveBeenCalledTimes(1);
  });

  it('stops without clicking when confirm is denied', async () => {
    const d = fake([{ elements: [btn('a', 'Cancel')] }]);
    const res = await createBrowserAdapter(() => d)(sub(), async () => false);
    expect(res).toEqual({ ok: false, reason: 'user_declined' });
    expect(d.click).not.toHaveBeenCalled();
    expect(d.close).toHaveBeenCalledTimes(1);
  });

  it('returns login_required on a password wall and types nothing', async () => {
    const d = fake([{ elements: [{ ref: 'p', role: 'textbox', name: 'Password', inputType: 'password' }, btn('a', 'Cancel')] }]);
    const res = await createBrowserAdapter(() => d)(sub(), yes);
    expect(res).toEqual({ ok: false, reason: 'login_required' });
    expect(d.type).not.toHaveBeenCalled();
    expect(d.click).not.toHaveBeenCalled();
    expect(d.close).toHaveBeenCalledTimes(1);
  });

  it('fails fast with null cancelUrl and never makes a driver', async () => {
    const make = vi.fn();
    const res = await createBrowserAdapter(make)(sub({ cancelUrl: null }), yes);
    expect(res).toEqual({ ok: false, reason: 'no_cancel_url' });
    expect(make).not.toHaveBeenCalled();
  });

  it('caps steps and closes the driver', async () => {
    const d = fake([{ elements: [btn('a', 'Cancel')] }]);
    const res = await createBrowserAdapter(() => d)(sub(), yes);
    expect(res).toEqual({ ok: false, reason: 'step_limit' });
    expect(d.click).toHaveBeenCalledTimes(8);
    expect(d.close).toHaveBeenCalledTimes(1);
  });

  it('closes the driver when it throws', async () => {
    const d = fake([{ elements: [] }]);
    d.navigate.mockRejectedValueOnce(new Error('boom'));
    const res = await createBrowserAdapter(() => d)(sub(), yes);
    expect(res).toEqual({ ok: false, reason: 'browser_error' });
    expect(d.close).toHaveBeenCalledTimes(1);
  });
});

describe('browser adapter: nav, survey and checkbox steps', () => {
  const radio = (ref: string, name: string, checked: boolean) =>
    ({ ref, role: 'radio', name, inputType: 'radio', checked });
  const done = { elements: [{ ref: '', role: 'text', name: 'Your subscription has been cancelled.' }] };

  it('walks nav -> cancel -> retention -> survey -> submit -> confirm, naming each step', async () => {
    const d = fake([
      { elements: [btn('n', 'Manage plan'), btn('o', 'Sign out')] },
      { elements: [btn('c', 'Cancel plan'), btn('k', 'Keep my plan')] },
      { elements: [btn('s', 'Stay for 50% off'), btn('t', 'No thanks, continue')] },
      { elements: [radio('r', 'Too expensive', false)] },
      { elements: [radio('r', 'Too expensive', true), btn('u', 'Submit')] },
      { elements: [btn('f', 'Confirm cancellation')] },
      done,
    ]);
    const confirm = vi.fn(yes);
    const res = await createBrowserAdapter(() => d)(sub(), confirm);
    expect(res).toEqual({ ok: true });
    expect(d.click.mock.calls.map((c) => c[0])).toEqual(['n', 'c', 't', 'r', 'u', 'f']);
    expect(confirm.mock.calls[3]).toEqual([{ name: 'Too expensive', ref: 'r', kind: 'check' }]);
    expect(confirm.mock.calls[0]).toEqual([{ name: 'Manage plan', ref: 'n', kind: 'click' }]);
  });

  it('ticks an unticked checkbox, then clicks the cancel button that appears', async () => {
    const d = fake([
      { elements: [btn('a', 'Cancel subscription')] },
      { elements: [{ ref: 'x', role: 'checkbox', name: 'I understand I lose my files', inputType: 'checkbox', checked: false }] },
      { elements: [btn('b', 'Cancel subscription')] },
      done,
    ]);
    expect(await createBrowserAdapter(() => d)(sub(), yes)).toEqual({ ok: true });
    expect(d.click.mock.calls.map((c) => c[0])).toEqual(['a', 'x', 'b']);
  });

  it('never ticks a box on the first page, and visits each nav control only once', async () => {
    const box = (checked: boolean) => ({ ref: 'x', role: 'checkbox', name: 'Newsletter', inputType: 'checkbox', checked });
    const d = fake([
      { elements: [btn('n', 'Billing'), box(false)] },
      { elements: [btn('n', 'Billing'), box(false)] },
      { elements: [btn('n', 'Billing'), box(true)] },
    ]);
    const res = await createBrowserAdapter(() => d)(sub(), yes);
    expect(d.click.mock.calls.map((c) => c[0])).toEqual(['n', 'x']);
    expect(res).toEqual({ ok: false, reason: 'no_cancel_control' });
  });

  it('does not tick a box the driver cannot read the state of', async () => {
    const d = fake([{ elements: [btn('a', 'Cancel'), ] }, { elements: [{ ref: 'x', role: 'checkbox', name: 'Box', inputType: 'checkbox' }] }]);
    expect(await createBrowserAdapter(() => d)(sub(), yes)).toEqual({ ok: false, reason: 'no_cancel_control' });
  });
});

describe('parseSnapshot', () => {
  const page = [
    '- heading "Test Merchant" [level=1] [ref=e2]',
    '- button "Cancel subscription" [ref=e3]',
    '- paragraph [ref=e4]: Your subscription has been cancelled.',
    '- textbox "Password" [ref=e5]',
  ].join('\n');
  it('reads roles, names, refs and trailing text', () => {
    const { elements } = parseSnapshot('### Page state\n```yaml\n' + page + '\n```');
    expect(elements.find((e) => e.ref === 'e3')).toMatchObject({ role: 'button', name: 'Cancel subscription' });
    expect(elements.find((e) => e.ref === 'e4')?.name).toMatch(/has been cancelled/);
    expect(elements.find((e) => e.ref === 'e5')?.inputType).toBe('password');
  });
});

describe('browser adapter errors and MCP arguments', () => {
  it('reports a known bridge failure code, and sends target for clicks', async () => {
    const calls: Array<[string, object]> = [];
    const drv = createPlaywrightMcpDriver(async (tool, args) => { calls.push([tool, args]); return ''; });
    await drv.click('e4');
    expect(calls[0]).toEqual(['browser_click', { element: 'e4', target: 'e4', ref: 'e4' }]);
    const crash = createPlaywrightMcpDriver(async () => { throw new Error('browser_crashed'); });
    const res = await createBrowserAdapter(() => crash)({ cancelUrl: 'https://x.test' } as unknown as Subscription, async () => true);
    expect(res).toEqual({ ok: false, reason: 'browser_crashed' });
  });
});
