#!/usr/bin/env node
// Kiro hook (.kiro/hooks/test-on-save.json): runs only the unit tests that import the saved file.
// Fast enough to run on every save; failures go back to the agent through stderr.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { savedFile } from './hook-input.mjs';

const file = savedFile();
if (!file || !/^(src|server|scripts)\/.*\.(ts|mts|mjs)$/.test(file) || !existsSync(file)) process.exit(0);
// Absolute path: vitest.config.ts sets root to src/, so a repo-relative path matches no test.
const r = spawnSync('npx', ['vitest', 'related', resolve(file), '--run', '--passWithNoTests'], { encoding: 'utf8' });
const all = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
const tail = (s) => s.trim().split('\n').slice(-25).join('\n');
if (r.status !== 0) {
  console.error(`Tests related to ${file} failed:\n${tail(all)}`);
  process.exit(1);
}
const summary = all.split('\n').filter((l) => /^\s*Tests\s/.test(l)).join(' ').trim();
console.log(`Tests related to ${file}: ${summary || 'no test imports this file'}`);
