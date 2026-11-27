import { describe, expect, it } from 'vitest';
import { callExtension, createExtensionDriver, detectExtension, EXTENSION_ID, getExtensionAdapter } from './extension-client.ts';
import type { RuntimeLike } from './extension-client.ts';

function fake(reply: (msg: any) => unknown, opts: { lastError?: boolean } = {}): RuntimeLike & { sent: any[] } {
  const rt: RuntimeLike & { sent: any[] } = {
    sent: [],
    lastError: undefined,
    sendMessage(id, msg, cb) {
      expect(id).toBe(EXTENSION_ID);
      rt.sent.push(msg);
      rt.lastError = opts.lastError ? { message: 'Could not establish connection' } : undefined;
      queueMicrotask(() => cb(reply(msg)));
    },
  };
  return rt;
}

describe('detectExtension', () => {
  it('returns the version when the extension answers', async () => {
    expect(await detectExtension(fake(() => ({ ok: true, version: '0.1.0' })))).toEqual({ version: '0.1.0' });
  });
  it('returns null with no chrome.runtime, on lastError, or on a refusal', async () => {
    expect(await detectExtension(null)).toBeNull();
    expect(await detectExtension(fake(() => undefined, { lastError: true }))).toBeNull();
    expect(await detectExtension(fake(() => ({ ok: false, error: 'unauthorized' })))).toBeNull();
  });
});

describe('callExtension', () => {
  it('turns an error reply into a short code, never page text', async () => {
    await expect(callExtension({ cmd: 'x' }, fake(() => ({ ok: false, error: 'permission_denied' })))).rejects.toThrow('permission_denied');
    await expect(callExtension({ cmd: 'x' }, fake(() => ({ ok: false, error: 'Some long page text!' })))).rejects.toThrow('browser_error');
  });
  it('times out', async () => {
    const hang: RuntimeLike = { sendMessage() {} };
    await expect(callExtension({ cmd: 'x' }, hang, 10)).rejects.toThrow('browser_timeout');
  });
});

describe('createExtensionDriver', () => {
  it('maps the driver calls onto commands and has no way to type', async () => {
    const rt = fake((m) => (m.cmd === 'snapshot' ? { ok: true, elements: [{ ref: 'g1', role: 'button', name: 'Cancel' }] } : { ok: true }));
    const d = createExtensionDriver(rt);
    await d.navigate('https://x.test/');
    expect((await d.snapshot()).elements[0]!.ref).toBe('g1');
    await d.click('g1');
    await d.close();
    await expect(d.type('g1', 'x')).rejects.toThrow('tool_not_allowed');
    expect(rt.sent.map((m) => m.cmd)).toEqual(['navigate', 'snapshot', 'click', 'close']);
  });
});

describe('getExtensionAdapter', () => {
  const sub: any = { cancelUrl: 'https://x.test/' };
  it('cancels end to end through createBrowserAdapter, asking confirm before each click', async () => {
    let page = 0;
    const rt = fake((m) => {
      if (m.cmd === 'snapshot') {
        return { ok: true, elements: page === 0 ? [{ ref: 'g1', role: 'button', name: 'Cancel subscription' }] : [{ ref: '', role: 'paragraph', name: 'Your subscription has been cancelled.' }] };
      }
      if (m.cmd === 'click') page = 1;
      return { ok: true };
    });
    const asked: string[] = [];
    const r = await getExtensionAdapter(rt)(sub, async (c) => { asked.push(c?.name ?? ''); return true; });
    expect(r).toEqual({ ok: true });
    expect(asked).toEqual(['Cancel subscription']);
  });
  it('reports permission_denied when the user refuses the site', async () => {
    const rt = fake((m) => (m.cmd === 'navigate' ? { ok: false, error: 'permission_denied' } : { ok: true }));
    expect(await getExtensionAdapter(rt)(sub, async () => true)).toEqual({ ok: false, reason: 'permission_denied' });
  });
  it('stops at a password field', async () => {
    const rt = fake((m) => (m.cmd === 'snapshot' ? { ok: true, elements: [{ ref: '', role: 'textbox', name: 'Password', inputType: 'password' }] } : { ok: true }));
    expect(await getExtensionAdapter(rt)(sub, async () => true)).toEqual({ ok: false, reason: 'login_required' });
  });
});
