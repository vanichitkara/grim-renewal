/**
 * Tiny .env helpers for the local bridge. Pure, so they are easy to test.
 * The .env file is git-ignored and holds a LOCAL secret only. Never put it in a client bundle.
 */

/** Reads KEY=value lines. Skips blanks and # comments. Strips one pair of quotes. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith('#')) continue;
    let v = m[2] ?? '';
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]!] = v;
  }
  return out;
}

/** Sets KEY=value, replacing an existing line or appending one. Keeps every other line as it was. */
export function upsertEnv(text: string, key: string, value: string): string {
  const lines = text === '' ? [] : text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop(); // drop the empty piece after the final newline
  const re = new RegExp(`^\\s*${key}\\s*=`);
  const i = lines.findIndex((l) => re.test(l) && !l.trimStart().startsWith('#'));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  return lines.join('\n') + '\n';
}

/** A bridge key is hex or url-safe text, 16 to 128 chars. Anything else is ignored. */
export function isValidBridgeKey(v: string | undefined): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(v);
}
