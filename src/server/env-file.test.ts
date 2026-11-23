import { describe, it, expect } from 'vitest';
import { parseEnv, upsertEnv, isValidBridgeKey } from './env-file.ts';
import { bridgeDefine, communityDefine } from './dev-env.ts';

describe('parseEnv', () => {
  it('reads keys, skips comments and blanks, strips quotes', () => {
    expect(parseEnv('# note\n\nA=1\nB="two"\n C = three \n#D=4\n')).toEqual({ A: '1', B: 'two', C: 'three' });
  });
});
describe('upsertEnv', () => {
  it('appends when missing and keeps other lines', () => {
    expect(upsertEnv('A=1\n', 'K', 'v')).toBe('A=1\nK=v\n');
    expect(upsertEnv('', 'K', 'v')).toBe('K=v\n');
  });
  it('replaces an existing value in place', () => {
    expect(upsertEnv('A=1\nK=old\nB=2\n', 'K', 'new')).toBe('A=1\nK=new\nB=2\n');
  });
  it('does not touch a commented-out line', () => {
    expect(upsertEnv('#K=old\n', 'K', 'new')).toBe('#K=old\nK=new\n');
  });
});
describe('isValidBridgeKey', () => {
  it('accepts hex keys and rejects short or odd ones', () => {
    expect(isValidBridgeKey('a'.repeat(48))).toBe(true);
    expect(isValidBridgeKey('short')).toBe(false);
    expect(isValidBridgeKey('has space has space')).toBe(false);
    expect(isValidBridgeKey(undefined)).toBe(false);
  });
});
describe('bridgeDefine: the key reaches the page only from the dev server', () => {
  const key = 'f'.repeat(48);
  it('injects it for `serve`', () => {
    expect(bridgeDefine('serve', { GRIM_BRIDGE_TOKEN: key }).__GRIM_DEV_BRIDGE_TOKEN__).toBe(JSON.stringify(key));
  });
  it('never injects it for `build`, even when the key is set', () => {
    expect(bridgeDefine('build', { GRIM_BRIDGE_TOKEN: key }).__GRIM_DEV_BRIDGE_TOKEN__).toBe('""');
  });
  it('injects nothing for a malformed key', () => {
    expect(bridgeDefine('serve', { GRIM_BRIDGE_TOKEN: 'x y' }).__GRIM_DEV_BRIDGE_TOKEN__).toBe('""');
  });
});

describe('communityDefine: the shared-tips address', () => {
  it('is off when unset', () => {
    expect(communityDefine({}).__GRIM_COMMUNITY_URL__).toBe('""');
  });
  it('accepts https and strips trailing slashes', () => {
    expect(communityDefine({ GRIM_COMMUNITY_URL: 'https://tips.example.app/' }).__GRIM_COMMUNITY_URL__).toBe('"https://tips.example.app"');
  });
  it('accepts http only on the developer machine', () => {
    expect(communityDefine({ GRIM_COMMUNITY_URL: 'http://127.0.0.1:8788' }).__GRIM_COMMUNITY_URL__).toBe('"http://127.0.0.1:8788"');
    expect(communityDefine({ GRIM_COMMUNITY_URL: 'http://tips.example.app' }).__GRIM_COMMUNITY_URL__).toBe('""');
  });
  it('rejects odd values', () => {
    expect(communityDefine({ GRIM_COMMUNITY_URL: 'javascript:alert(1)' }).__GRIM_COMMUNITY_URL__).toBe('""');
    expect(communityDefine({ GRIM_COMMUNITY_URL: 'https://a b' }).__GRIM_COMMUNITY_URL__).toBe('""');
  });
});
