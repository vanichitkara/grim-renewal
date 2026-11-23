import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(__dirname, 'index.html'), 'utf8');

describe('landing page (index.html, the first page visitors see)', () => {
  it('hands a Google sign-in return to the app page', () => {
    expect(html).toContain("location.replace('./app.html'");
    expect(html).toMatch(/access_token\|error\|bridge/);
  });
  it('keeps a clear demo button for judges (Google testing mode allows only listed test users)', () => {
    expect(html).toContain('Try the demo · no sign-in');
  });
  it('links to the app and the demo', () => {
    expect(html).toContain('href="./app.html"');
    expect(html).toContain('href="./app.html?demo"');
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
