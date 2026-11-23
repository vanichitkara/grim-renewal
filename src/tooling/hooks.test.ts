/**
 * Tests for the Kiro hook scripts in scripts/hooks/ (wired up in .kiro/hooks/).
 * Each guard must catch the lines its steering file forbids and stay quiet on clean code.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error plain .mjs hook script, no type declarations
import { check as privacy } from '../../scripts/hooks/privacy-guard.mjs';
// @ts-expect-error plain .mjs hook script, no type declarations
import { check as palette, PALETTE } from '../../scripts/hooks/palette-guard.mjs';

const ROOT = resolve(__dirname, '../..');
type Check = (path: string, text: string) => string[];
const priv = privacy as Check;
const pal = (lines: string[]): string[] =>
  (palette as (p: string, l: { n: number; text: string }[]) => string[])('src/animation/x.ts', lines.map((text, i) => ({ n: i + 1, text })));

describe('privacy guard (privacy.md)', () => {
  it('catches every forbidden line', () => {
    const bad = [
      "const s = 'https://www.googleapis.com/auth/gmail.modify';",
      'console.log(token);',
      'console.info(msg.snippet);',
      "localStorage.setItem('t', accessToken);",
      "const q = 'in:sent';",
      "await page.fill('input[type=password]', pw);",
    ];
    bad.forEach((line) => expect(priv('src/x.ts', line), line).toHaveLength(1));
  });
  it('stays quiet on allowed lines', () => {
    const ok = [
      "const s = 'https://www.googleapis.com/auth/gmail.readonly';",
      "console.warn('token expired, connect again');",
      "const q = 'in:inbox category:promotions';",
      "sessionStorage.setItem(STORE_KEY, bridgeToken);",
      '// console.log(token) is forbidden',
    ];
    ok.forEach((line) => expect(priv('src/x.ts', line), line).toEqual([]));
  });
  it('lets session-auth.ts keep the token and seed-emails.ts use its test scope', () => {
    expect(priv('src/pipeline/session-auth.ts', "localStorage.setItem(AUTH_KEY, token);")).toEqual([]);
    expect(priv('src/pipeline/seed-emails.ts', "const s = 'https://www.googleapis.com/auth/gmail.insert';")).toEqual([]);
  });
  it('passes on every source file in the repo today', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(resolve(d, e.name)) : [resolve(d, e.name)]);
    const files = walk(resolve(ROOT, 'src')).filter((f) => /\.(ts|html|mts)$/.test(f) && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(30);
    for (const f of files) expect(priv(f.slice(ROOT.length + 1), readFileSync(f, 'utf8')), f).toEqual([]);
  });
});

describe('palette guard (animation.md)', () => {
  it('knows the nine palette colours', () => {
    expect(PALETTE).toHaveLength(9);
  });
  it('catches off-palette colours, inline easing, engines and smoothing', () => {
    for (const line of ["ctx.fillStyle = '#ff00ff';", "c = '#fff';", "c = 'rgb(10, 20, 30)';", "e = 'cubic-bezier(0,0,1,1)';",
      "import * as PIXI from 'pixi.js';", 'ctx.imageSmoothingEnabled = true;']) {
      expect(pal([line]).length, line).toBeGreaterThan(0);
    }
  });
  it('allows palette colours in any case', () => {
    expect(pal(["ctx.fillStyle = '#F2B84B';", "c = '#120e1c';", '// #ff00ff in a comment'])).toEqual([]);
  });
});
