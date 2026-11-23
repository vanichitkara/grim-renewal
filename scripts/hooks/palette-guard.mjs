#!/usr/bin/env node
// Kiro hook (.kiro/hooks/palette-guard.json): checks NEW lines in a saved animation file against
// .kiro/steering/animation.md (palette, named easings only, no game engines, dt cap).
// Only lines added since the last commit are checked, so older pixel-art colours do not nag.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { savedFile } from './hook-input.mjs';

export const PALETTE = ['#120e1c', '#1c162b', '#2a2240', '#ece6d6', '#a59cbc', '#f2b84b', '#8fc25a', '#e0574f', '#c99bff'];

export function check(path, addedLines) {
  const problems = [];
  for (const { n, text } of addedLines) {
    const at = `${path}:${n}`;
    if (/^\s*(\/\/|\*)/.test(text)) continue;
    for (const hex of text.match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
      if (!PALETTE.includes(hex.toLowerCase())) problems.push(`${at}: colour ${hex} is not in the animation.md palette (${PALETTE.join(' ')}).`);
    }
    if (/cubic-bezier\(/.test(text) && !path.endsWith('ease.ts')) problems.push(`${at}: inline cubic-bezier. Use a named easing from src/animation/ease.ts.`);
    if (/from\s+['"](pixi\.js|phaser|@pixi\/)/.test(text)) problems.push(`${at}: game engine import. animation.md: Canvas 2D only unless approved.`);
    if (/imageSmoothingEnabled\s*=\s*true/.test(text)) problems.push(`${at}: smoothing on. animation.md: never smooth pixel art.`);
  }
  return problems;
}

/** Lines added in the working tree vs HEAD (a new untracked file counts as all added). */
function addedLines(file) {
  let diff = '';
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', file], { stdio: 'ignore' });
    diff = execFileSync('git', ['diff', '-U0', 'HEAD', '--', file], { encoding: 'utf8' });
  } catch {
    // Untracked file: everything is new. --no-index exits 1 when files differ, so read stdout directly.
    diff = spawnSync('git', ['diff', '-U0', '--no-index', '/dev/null', file], { encoding: 'utf8' }).stdout ?? '';
  }
  const out = [];
  let n = 0;
  for (const l of diff.split('\n')) {
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
    if (h) { n = Number(h[1]); continue; }
    if (l.startsWith('+') && !l.startsWith('+++')) out.push({ n: n++, text: l.slice(1) });
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const file = savedFile();
  if (!file || !/^src\/(animation|ui)\/.*\.ts$/.test(file) || /\.test\.ts$/.test(file) || !existsSync(file)) process.exit(0);
  let lines = [];
  try { lines = addedLines(file); } catch { process.exit(0); } // no git here: nothing to compare
  const problems = check(file, lines);
  if (problems.length) {
    console.error(`Palette guard (.kiro/steering/animation.md):\n` + problems.join('\n'));
    process.exit(1);
  }
  console.log(`Palette guard: ${file} ok (${lines.length} new lines checked).`);
}
