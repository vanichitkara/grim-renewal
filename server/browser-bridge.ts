/**
 * Local bridge: page -> fetch -> this server -> Playwright MCP (stdio) -> headed browser.
 * Binds 127.0.0.1 only. Per-run random token. Never logs page text, URLs or typed text.
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { decide, matchOrigin } from '../src/server/bridge-core.ts';

const PORT = 8787;
const token = randomBytes(24).toString('hex');

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
  console.log('Open this link (the page saves the token, then hides it):');
  console.log(`  http://localhost:5173/#bridge=${token}`);
});

process.on('SIGINT', () => {
  server.close();
  void client.close().finally(() => process.exit(0));
});
