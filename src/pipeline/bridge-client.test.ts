import { describe, expect, it } from 'vitest';
import { extractBridgeToken } from './bridge-client.ts';

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
