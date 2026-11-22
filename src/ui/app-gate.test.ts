import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(__dirname, 'app.html'), 'utf8');

describe('app page sign-in gate (app.html)', () => {
  it('starts locked, so a failed script never opens the app', () => {
    expect(html).toContain('<body class="locked">');
  });
  it('hides everything but the header and the gate while locked', () => {
    expect(html).toContain('body.locked .wrap > :not(header):not(#loginGate)');
  });
  it('shows the consent text on the same screen as the Connect Gmail button', () => {
    const gate = html.slice(html.indexOf('id="loginGate"'), html.indexOf('</section>', html.indexOf('id="loginGate"')));
    expect(gate).toContain('The Reaper only reads receipts. We search your inbox for billing emails, extract the merchant name, amount, and date, and discard the rest. We never read your personal email, store message content, or share your data.');
    expect(gate).toContain('id="gateConnect"');
    expect(gate).toContain('Connect Gmail');
  });
  it('unlocks only for a returning sign-in token or the explicit demo flag', () => {
    const unlocks = html.match(/classList\.remove\('locked'\)/g) ?? [];
    expect(unlocks).toHaveLength(2);
    expect(html).toMatch(/if \(oauthToken\) \{\s*document\.body\.classList\.remove\('locked'\)/);
    expect(html).toMatch(/if \(qs\.has\('demo'\)\) \{[^}]*?classList\.remove\('locked'\)/s);
  });
  it('no longer falls back to demo mode when there is no sign-in', () => {
    expect(html).not.toContain('Demo mode (default)');
  });
});
