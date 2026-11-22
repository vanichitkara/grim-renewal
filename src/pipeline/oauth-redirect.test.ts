import { describe, it, expect } from 'vitest';
import { redirectUriFor } from './oauth-redirect.ts';

const at = (origin: string, pathname: string) => ({ origin, hostname: new URL(origin).hostname, pathname });

describe('redirectUriFor', () => {
  it('keeps the plain origin on localhost, whatever the page', () => {
    expect(redirectUriFor(at('http://localhost:5173', '/'))).toBe('http://localhost:5173');
    expect(redirectUriFor(at('http://localhost:5173', '/index.html'))).toBe('http://localhost:5173');
    expect(redirectUriFor(at('http://127.0.0.1:5173', '/'))).toBe('http://127.0.0.1:5173');
  });
  it('uses origin plus folder on a hosted sub-path', () => {
    expect(redirectUriFor(at('https://vanichitkara.github.io', '/grim-renewal/'))).toBe('https://vanichitkara.github.io/grim-renewal/');
    expect(redirectUriFor(at('https://vanichitkara.github.io', '/grim-renewal/index.html'))).toBe('https://vanichitkara.github.io/grim-renewal/');
  });
  it('works at the root of a hosted domain', () => {
    expect(redirectUriFor(at('https://grimrenewal.app', '/'))).toBe('https://grimrenewal.app/');
  });
});
