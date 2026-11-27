import { describe, expect, it, vi } from 'vitest';
import { extractBridgeToken, chipView, isLocalHost } from './bridge-client.ts';

describe('extractBridgeToken', () => {
  it('reads bridge= from the hash', () => {
    expect(extractBridgeToken('#bridge=abcDEF123456')).toBe('abcDEF123456');
  });
  it('works beside other params', () => {
    expect(extractBridgeToken('#x=1&bridge=abcDEF123456')).toBe('abcDEF123456');
  });
  it('returns null when absent, empty, short or odd', () => {
    expect(extractBridgeToken('')).toBeNull();
    expect(extractBridgeToken('#access_token=zzz')).toBeNull();
    expect(extractBridgeToken('#bridge=')).toBeNull();
    expect(extractBridgeToken('#bridge=a')).toBeNull();
    expect(extractBridgeToken('#bridge=<script>alert(1)</script>')).toBeNull();
  });
});

describe('chipView', () => {
  it('shows connected anywhere', () => {
    expect(chipView('connected', 'localhost')).toEqual({ text: 'Browser: connected', hidden: false });
    expect(chipView('connected', 'vanichitkara.github.io').hidden).toBe(false);
  });
  it('shows nothing on a hosted site when there is no bridge (no scary message)', () => {
    for (const st of ['not_found', 'wrong_token'] as const) {
      expect(chipView(st, 'vanichitkara.github.io')).toEqual({ text: '', hidden: true });
    }
  });
  it('tells a developer how to turn it on, on their own machine', () => {
    expect(chipView('not_found', 'localhost').text).toContain('npm run bridge');
    expect(chipView('wrong_token', '127.0.0.1').text).toContain('npm run bridge');
  });
  it('knows which hosts are local', () => {
    expect(isLocalHost('localhost')).toBe(true);
    expect(isLocalHost('example.com')).toBe(false);
  });
});

describe('bridgeErrorCode', () => {
  it('names the real failure without page text', async () => {
    const { bridgeErrorCode } = await import('./bridge-client.ts');
    expect(bridgeErrorCode({ result: '### Error\nError: browserBackend.callTool: Target crashed' })).toBe('browser_crashed');
    expect(bridgeErrorCode({ result: 'Invalid arguments for tool "browser_click"' })).toBe('bad_tool_args');
    expect(bridgeErrorCode({ error: 'mcp_error' })).toBe('mcp_error');
    expect(bridgeErrorCode({ result: 'something else https://secret.example/page' })).toBe('bridge_error');
  });
});

describe('connectBridge', () => {
  it('never probes 127.0.0.1 from a hosted page without a saved key', async () => {
    const { connectBridge } = await import('./bridge-client.ts');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await connectBridge('vanichitkara.github.io')).toBe('not_found');
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('connectBridge on the live site', () => {
  it('probes once the user opened the bridge link (key saved for this tab)', async () => {
    const { connectBridge, STORE_KEY } = await import('./bridge-client.ts');
    const store = new Map<string, string>([[STORE_KEY, 'k'.repeat(20)]]);
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: () => {}, removeItem: () => {} });
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    expect(await connectBridge('vanichitkara.github.io')).toBe('connected');
    expect(f).toHaveBeenCalledWith('http://127.0.0.1:8787/health', { headers: { 'x-bridge-token': 'k'.repeat(20) } });
    vi.unstubAllGlobals();
  });
});
