/**
 * Local bridge: page -> fetch -> this server -> Playwright MCP (stdio) -> headed browser.
 * Binds 127.0.0.1 only. Key kept in .env (git-ignored), made on first run. Never logs page text, URLs or typed text.
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv, upsertEnv, isValidBridgeKey } from '../src/server/env-file.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { decide, matchOrigin, LIVE_APP_URL } from '../src/server/bridge-core.ts';

// GRIM_BRIDGE_PORT is for tests only; the app always calls 8787.
const PORT = Number(process.env['GRIM_BRIDGE_PORT']) || 8787;
// The key lives in .env (git-ignored) so it stays the same between runs and the dev page connects by itself.
// An environment variable wins over the file. First run with no key: make one and save it.
// fileURLToPath, not .pathname: the project folder has a space, which .pathname keeps as %20.
const ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url));
const fileText = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
const fromFile = parseEnv(fileText)['GRIM_BRIDGE_TOKEN'];
let token: string | undefined = process.env['GRIM_BRIDGE_TOKEN'];
if (!isValidBridgeKey(token)) token = isValidBridgeKey(fromFile) ? fromFile : undefined;
if (!token) {
  token = randomBytes(24).toString('hex');
  writeFileSync(ENV_PATH, upsertEnv(fileText, 'GRIM_BRIDGE_TOKEN', token));
  try { chmodSync(ENV_PATH, 0o600); } catch { /* best effort */ }
  console.log('Made a new bridge key and saved it in .env (git-ignored). Restart the dev server so the page picks it up.');
}

// Headed (no --headless) so the user watches. One session, reused.
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['--no-install', '@playwright/mcp'],
});
const client = new Client({ name: 'grim-bridge', version: '0.1.0' });
await client.connect(transport);

const server = createServer((req, res) => {
  const origin = matchOrigin(req.headers.origin);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-bridge-token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    // Chrome asks before a public site (the live https page) may reach 127.0.0.1 (Private Network Access).
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
  }
  const send = (status: number, json: object): void => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(json));
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(origin ? 204 : 403);
    res.end();
    return;
  }
  let raw = '';
  req.on('data', (c: Buffer) => {
    raw += c;
    if (raw.length > 100_000) req.destroy();
  });
  req.on('end', () => {
    void (async () => {
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        send(400, { ok: false, error: 'bad_json' });
        return;
      }
      const t = req.headers['x-bridge-token'];
      const d = decide(
        { method: req.method ?? '', path: (req.url ?? '').split('?')[0] ?? '', token: typeof t === 'string' ? t : undefined, body },
        token,
      );
      if (d.kind === 'reply') return send(d.status, d.json);
      try {
        const r = await client.callTool({ name: d.tool, arguments: d.args });
        const content = (r.content as Array<{ type: string; text?: string }> | undefined) ?? [];
        const text = content.map((c) => (c.type === 'text' ? c.text ?? '' : '')).join('\n');
        send(200, { ok: !r.isError, result: text });
      } catch {
        send(502, { ok: false, error: 'mcp_error' });
      }
    })();
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Grim bridge on http://127.0.0.1:${PORT}`);
  console.log('Open one of these links (the page saves the key for this tab, then hides it):');
  console.log(`  On your computer:  http://localhost:5173/app.html#bridge=${token}`);
  console.log(`  On the live site:  ${LIVE_APP_URL}#bridge=${token}`);
  console.log('On the live site, Chrome may ask to allow access to devices on your network. Allow it.');
});

process.on('SIGINT', () => {
  server.close();
  void client.close().finally(() => process.exit(0));
});
