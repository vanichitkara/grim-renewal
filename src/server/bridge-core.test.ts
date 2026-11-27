import { describe, expect, it } from 'vitest';
import { decide, matchOrigin } from './bridge-core.ts';

const T = 'secret';
const post = (body: unknown, token: string | null = T) =>
  decide({ method: 'POST', path: '/call', token: token ?? undefined, body }, T);

describe('bridge-core', () => {
  it('requires a token', () => {
    expect(post({ tool: 'browser_snapshot' }, null)).toMatchObject({ status: 401 });
  });
  it('rejects a bad token', () => {
    expect(post({ tool: 'browser_snapshot' }, 'nope')).toMatchObject({ status: 401 });
  });
  it('answers health with a good token', () => {
    expect(decide({ method: 'GET', path: '/health', token: T, body: null }, T)).toMatchObject({ status: 200, json: { ok: true } });
  });
  it('rejects tools not on the allow-list', () => {
    expect(post({ tool: 'browser_evaluate', args: {} })).toMatchObject({ status: 400 });
  });
  it('refuses typing that mentions password', () => {
    expect(post({ tool: 'browser_type', args: { element: 'Password', ref: 'e1', text: 'x' } })).toMatchObject({ status: 400 });
  });
  it('passes an allowed call through', () => {
    expect(post({ tool: 'browser_navigate', args: { url: 'https://x.test' } })).toMatchObject({ kind: 'call', tool: 'browser_navigate' });
  });
});

describe('matchOrigin', () => {
  it('echoes only allow-listed origins', () => {
    expect(matchOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(matchOrigin('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173');
    expect(matchOrigin('https://vanichitkara.github.io')).toBe('https://vanichitkara.github.io');
    expect(matchOrigin('https://vanichitkara.github.io.evil.test')).toBeUndefined();
    expect(matchOrigin('http://vanichitkara.github.io')).toBeUndefined();
    expect(matchOrigin('http://evil.test')).toBeUndefined();
    expect(matchOrigin(undefined)).toBeUndefined();
  });
});
