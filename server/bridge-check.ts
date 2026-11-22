/** `npm run bridge:check`: is the bridge up, is a Playwright browser installed, where to click. Read-only. */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let up = false;
try {
  // No key sent: a running bridge answers 401, which still proves it is there.
  const r = await fetch('http://127.0.0.1:8787/health');
  up = r.status === 401 || r.ok;
} catch {
  /* not running */
}
console.log(up ? 'Bridge: running on 127.0.0.1:8787' : 'Bridge: NOT running. Start it with: npm run bridge');

const roots = [
  process.env.PLAYWRIGHT_BROWSERS_PATH,
  join(homedir(), 'Library/Caches/ms-playwright'),
  join(homedir(), '.cache/ms-playwright'),
  join(homedir(), 'AppData/Local/ms-playwright'),
].filter((p): p is string => !!p && existsSync(p));
const found = roots.flatMap((r) => readdirSync(r).filter((d) => d.startsWith('chromium')));
console.log(found.length ? 'Playwright browser: found' : 'Playwright browser: NOT found. Run: npx playwright install chromium');

console.log('Open the link that "npm run bridge" prints, like:');
console.log('  http://localhost:5173/#bridge=<key>');
console.log('Then check the chip says "Browser: connected". Test with: http://localhost:5173/?bridgetest');
