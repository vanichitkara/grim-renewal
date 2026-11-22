/**
 * `npm run community`: the shared "what worked" tips API. Local by default (127.0.0.1:8788).
 * All rules live in src/community/handle.ts (pure). This file only does sockets.
 * Env: PORT, HOST, GRIM_CORS_ORIGINS (comma list), TRUST_PROXY=1 (use the last X-Forwarded-For entry), STORE_FILE,
 *      STORE=firestore (Cloud Run: the disk is wiped on restart) with FIRESTORE_COLLECTION (default "tips").
 * Never logs bodies, addresses or headers.
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createLimiter, handle, type ApiConfig, BODY_LIMIT_BYTES } from '../src/community/handle.ts';
import { createFileStore } from '../src/community/store.ts';
import { createFirestoreStore } from '../src/community/firestore-store.ts';
import type { TipStore } from '../src/community/types.ts';

export { handle } from '../src/community/handle.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

export function loadConfig(env: Record<string, string | undefined>): ApiConfig {
  const list = JSON.parse(readFileSync(`${here}known-merchants.json`, 'utf8')) as { merchants: string[] };
  const origins = (env['GRIM_CORS_ORIGINS'] ?? 'http://localhost:5173,http://127.0.0.1:5173,https://vanichitkara.github.io')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '' && s !== '*');
  return { origins, allowed: new Set(list.merchants) };
}

/** STORE=firestore on Cloud Run (the package is loaded only then). Anything else: the local JSON file. */
export async function makeStore(env: Record<string, string | undefined>): Promise<TipStore> {
  if (env['STORE'] === 'firestore') {
    const { Firestore, FieldValue } = await import('@google-cloud/firestore');
    // On Cloud Run the project and credentials come from the service account; nothing secret is in the code.
    return createFirestoreStore(new Firestore(), FieldValue, env['FIRESTORE_COLLECTION'] || 'tips');
  }
  return createFileStore(env['STORE_FILE'] ?? fileURLToPath(new URL('../data/community.json', import.meta.url)));
}

export function startServer(env: Record<string, string | undefined> = process.env, storeIn?: TipStore) {
  const cfg = loadConfig(env);
  const store = storeIn ?? createFileStore(env['STORE_FILE'] ?? fileURLToPath(new URL('../data/community.json', import.meta.url)));
  const limiter = createLimiter();
  const trustProxy = env['TRUST_PROXY'] === '1';

  return createServer((rq, rs) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = false;
    rq.on('data', (c: Buffer) => {
      size += c.length;
      if (size > BODY_LIMIT_BYTES + 1) tooBig = true;
      else chunks.push(c);
    });
    rq.on('end', () => {
      const url = new URL(rq.url ?? '/', 'http://x');
      const xff = String(rq.headers['x-forwarded-for'] ?? '').split(',').pop()?.trim();
      const ip = (trustProxy && xff ? xff : rq.socket.remoteAddress) ?? 'unknown';
      const body = tooBig ? 'x'.repeat(BODY_LIMIT_BYTES + 1) : Buffer.concat(chunks).toString('utf8');
      handle(
        {
          method: rq.method ?? 'GET',
          path: url.pathname,
          query: url.search.replace(/^\?/, ''),
          origin: rq.headers.origin,
          contentType: rq.headers['content-type'],
          body,
          ip,
        },
        store,
        limiter,
        new Date(),
        cfg,
      )
        .then((r) => {
          rs.writeHead(r.status, r.headers);
          rs.end(r.body);
        })
        .catch(() => {
          rs.writeHead(500, { 'Content-Type': 'application/json' });
          rs.end('{"ok":false,"error":"server_error"}');
        });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env['PORT'] ?? 8788);
  const host = process.env['HOST'] ?? '127.0.0.1';
  void makeStore(process.env).then((store) => {
    startServer(process.env, store).listen(port, host, () =>
      console.log(`Community tips API on http://${host}:${port} (store: ${process.env['STORE'] === 'firestore' ? 'firestore' : 'file'})`),
    );
  });
}
