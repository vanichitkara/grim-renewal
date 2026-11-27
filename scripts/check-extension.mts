/**
 * `npm run extension:check`: loads extension/ into a real Chromium (new headless) and proves it end to end.
 * Needs `npx vite build` first (serves dist/ at /grim-renewal/) and `npx playwright install chromium`.
 * Run 1 uses the extension exactly as shipped (host permission is optional, so the permission window opens).
 * Run 2 uses a temp copy whose manifest already grants http hosts, because Chrome's own permission bubble
 * cannot be clicked by automation. Everything else is identical.
 * shortcut: a human must still press "Allow" once in a real Chrome. See docs/specs/chrome-extension-done.md.
 */
import { chromium } from 'playwright-core';
import type { BrowserContext, Page } from 'playwright-core';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { EXTENSION_ID } from '../src/pipeline/extension-client.ts';

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
let failed = 0;
const ok = (cond: boolean, label: string, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) failed++;
};

function serve(root: string, prefix: string): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let p = decodeURIComponent((req.url ?? '/').split('?')[0]!);
      if (prefix && !p.startsWith(prefix)) { res.writeHead(404).end(); return; }
      p = p.slice(prefix.length) || '/';
      if (p.endsWith('/')) p += 'index.html';
      const f = join(root, normalize(p));
      if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }).end(readFileSync(f));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port }));
  });
}

async function launch(extDir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'grim-ext-')), {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
}

async function send(page: Page, msg: object): Promise<any> {
  return page.evaluate(
    ([id, m]) => new Promise((resolve) => (window as any).chrome.runtime.sendMessage(id, m, (r: unknown) => resolve(r ?? { lastError: (window as any).chrome.runtime.lastError?.message ?? 'none' }))),
    [EXTENSION_ID, msg] as const,
  );
}

const adapterBundle = (await build({
  stdin: { contents: "import { getExtensionAdapter } from './src/pipeline/extension-client.ts'; window.__adapter = getExtensionAdapter();", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'iife', platform: 'browser',
})).outputFiles[0]!.text;

const app = await serve(join(process.cwd(), 'dist'), '/grim-renewal');
const site = await serve(join(process.cwd(), 'public'), '');
const APP = `http://127.0.0.1:${app.port}/grim-renewal/app.html`;
const SITE = `http://127.0.0.1:${site.port}`;
const consoleErrors: string[] = [];

async function openApp(ctx: BrowserContext, query = '?demo'): Promise<Page> {
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 120)); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror ' + e.message.slice(0, 120)));
  await page.goto(APP + query);
  return page;
}

// ── Run 1: the extension as shipped ──────────────────────────────────────────────
{
  const ctx = await launch(join(process.cwd(), 'extension'));
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  ok(sw!.url() === `chrome-extension://${EXTENSION_ID}/background.js`, 'extension ID matches EXTENSION_ID (manifest key)', sw!.url().split('/')[2]);
  const page = await openApp(ctx);
  const ping = await send(page, { cmd: 'ping' });
  ok(ping.ok === true && typeof ping.version === 'string', 'ping works from the app origin', JSON.stringify(ping));
  await page.waitForFunction(() => document.getElementById('bridgeChip')?.textContent === 'Browser: Reaper extension', null, { timeout: 8000 })
    .then(() => ok(true, 'header chip says "Browser: Reaper extension"'), () => ok(false, 'header chip says "Browser: Reaper extension"'));

  // Another origin is refused. A fake https site, answered by us.
  await ctx.route('https://evil.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>x</title>' }));
  const evil = await ctx.newPage();
  await evil.goto('https://evil.test/');
  const refused = await evil.evaluate((id) => new Promise((resolve) => {
    const c = (window as any).chrome;
    if (!c?.runtime?.sendMessage) return resolve('no_runtime');
    c.runtime.sendMessage(id, { cmd: 'ping' }, (r: unknown) => resolve(r ?? 'lastError:' + c.runtime.lastError?.message));
  }), EXTENSION_ID);
  ok(refused === 'no_runtime' || String(refused).startsWith('lastError') || (refused as any)?.ok === false, 'ping refused from another origin', JSON.stringify(refused).slice(0, 80));
  await evil.close();

  // Permission is optional: navigate opens our own permission window. "Not now" -> permission_denied.
  await page.bringToFront();
  const nav = send(page, { cmd: 'navigate', url: `${SITE}/test-cancel.html` });
  const pop = await ctx.waitForEvent('page', { predicate: (p) => p.url().includes('permission.html'), timeout: 10000 }).catch(() => null);
  ok(!!pop, 'navigate to a new site opens the permission window');
  await pop?.click('#deny').catch(() => {});
  const denied = await nav;
  ok(denied.ok === false && denied.error === 'permission_denied', 'refusing the permission gives permission_denied', JSON.stringify(denied));
  const typed = await send(page, { cmd: 'type', ref: 'g1', text: 'x' });
  ok(typed.ok === false && typed.error === 'tool_not_allowed', 'no "type" command exists', JSON.stringify(typed));
  await ctx.close();
}

// ── Run 2: temp copy with http hosts already granted ──────────────────────────────
{
  const dir = mkdtempSync(join(tmpdir(), 'grim-ext-src-'));
  cpSync(join(process.cwd(), 'extension'), dir, { recursive: true });
  const mf = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  mf.host_permissions = ['http://*/*'];
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(mf));
  const ctx = await launch(dir);
  if (!ctx.serviceWorkers()[0]) await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const page = await openApp(ctx);
  await page.addScriptTag({ content: adapterBundle });

  const run = (url: string, approve = true) => page.evaluate(async ([u, a]) => {
    const asked: string[] = [];
    const r = await (window as any).__adapter({ cancelUrl: u }, async (c: { name: string }) => { asked.push(c.name); return a; });
    return { r, asked };
  }, [url, approve] as const);

  for (const [name, path, clicks] of [['mock site cloudbox (other origin)', '/mock/cloudbox/index.html', 3], ['mock site designhub (other origin)', '/mock/designhub/index.html', 2]] as const) {
    const t = await run(SITE + path);
    ok(t.r.ok === true, `${name} cancels end to end through createBrowserAdapter`, `asked=${JSON.stringify(t.asked)}`);
    ok(t.asked.length >= clicks - 1, `${name}: confirm() was asked before every click`, String(t.asked.length));
  }
  const plain = await run(`${SITE}/test-cancel.html`);
  ok(plain.r.ok === true && plain.asked.length === 2, 'test-cancel.html cancels in 2 approved clicks', JSON.stringify(plain.asked));
  const login = await run(`${SITE}/test-cancel.html?login=1`);
  ok(login.r.ok === false && (login.r as any).reason === 'login_required', 'test-cancel.html?login=1 stops with login_required', JSON.stringify(login.r));
  const declined = await run(`${SITE}/test-cancel.html`, false);
  ok(declined.r.ok === false && (declined.r as any).reason === 'user_declined', 'declining a click stops the run', JSON.stringify(declined.r));

  // Password field is never clicked or typed: the reader gives it no ref; a forged click is refused.
  const nav = await send(page, { cmd: 'navigate', url: `${SITE}/test-cancel.html?login=1` });
  const snap = await send(page, { cmd: 'snapshot' });
  if (!snap.elements) console.log('snapshot reply', JSON.stringify(snap), JSON.stringify(nav));
  const pw = (snap.elements ?? []).find((e: any) => e.inputType === 'password');
  ok(nav.ok && !!pw && pw.ref === '', 'password input is reported with no ref');
  const forged = await send(page, { cmd: 'click', ref: 'g1' });
  ok(forged.ok === false, 'a click on a ref that is not a clickable control fails', JSON.stringify(forged));
  await send(page, { cmd: 'close' });

  // The app's own ?bridgetest button, picked up through the extension.
  const page2 = await openApp(ctx, '?demo&bridgetest');
  await page2.waitForFunction(() => document.getElementById('bridgeChip')?.textContent === 'Browser: Reaper extension', null, { timeout: 8000 }).catch(() => {});
  await page2.click('#bridgeTest');
  await page2.getByText('Approve cancellation').click();
  const done = await page2.waitForFunction(() => /test: (PASS|FAIL)/.test(document.getElementById('bridgeTestResult')?.textContent ?? ''), null, { timeout: 30000 })
    .then(() => page2.textContent('#bridgeTestResult'), () => 'timeout');
  ok(done === 'Extension test: PASS', 'app ?bridgetest button reports "Extension test: PASS"', String(done));
  await ctx.close();
}

app.server.close();
site.server.close();
ok(consoleErrors.length === 0, 'no console errors from the app', consoleErrors.join(' | '));
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
