import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(__dirname, 'landing.html'), 'utf8');

describe('landing page', () => {
  it('links to the app and the demo', () => {
    expect(html).toContain('href="./index.html"');
    expect(html).toContain('href="./index.html?demo"');
  });
  it('uses no root-absolute paths, so it works under a sub-path', () => {
    expect(html).not.toMatch(/(href|src)="\/(?!\/)/);
    expect(html).not.toMatch(/url\(\/(?!\/)/);
  });
  it('has the privacy line', () => {
    expect(html).toContain('The Reaper only reads receipts.');
  });
  it('has exactly one h1', () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });
  it('hides every canvas from assistive tech', () => {
    const canvases = html.match(/<canvas\b[^>]*>/g) ?? [];
    expect(canvases.length).toBeGreaterThan(0);
    for (const c of canvases) expect(c).toContain('aria-hidden="true"');
  });
});
