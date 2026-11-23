// Shared by the Kiro hooks in .kiro/hooks/. Kiro sends the event as JSON on STDIN;
// we only need the saved file's path. Fallback: a path given as the first argument.
import { readFileSync } from 'node:fs';
import { relative, isAbsolute } from 'node:path';

export function savedFile() {
  if (process.argv[2]) return norm(process.argv[2]);
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { return null; }
  if (!raw.trim()) return null;
  try {
    const found = findPath(JSON.parse(raw));
    return found ? norm(found) : null;
  } catch {
    const m = /"(?:file_?path|filePath|path)"\s*:\s*"([^"]+)"/.exec(raw);
    return m ? norm(m[1]) : null;
  }
}

function findPath(v, depth = 0) {
  if (!v || typeof v !== 'object' || depth > 5) return null;
  for (const k of ['file_path', 'filePath', 'path', 'file']) {
    if (typeof v[k] === 'string' && /\.[a-z]+$/i.test(v[k])) return v[k];
  }
  for (const x of Object.values(v)) {
    const f = findPath(x, depth + 1);
    if (f) return f;
  }
  return null;
}

function norm(p) {
  return (isAbsolute(p) ? relative(process.cwd(), p) : p).replace(/\\/g, '/');
}
