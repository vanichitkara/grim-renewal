#!/usr/bin/env node
// Kiro hook (.kiro/hooks/test-on-save.json): runs only the unit tests that import the saved file.
// Fast enough to run on every save; failures go back to the agent through stderr.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { savedFile } from './hook-input.mjs';

const file = savedFile();
if (!file || !/^(src|server)\/.*\.(ts|mts)$/.test(file) || !existsSync(file)) process.exit(0);
const r = spawnSync('npx', ['vitest', 'related', file, '--run', '--reporter=dot', '--passWithNoTests'], { encoding: 'utf8' });
const tail = (s) => (s ?? '').trim().split('\n').slice(-25).join('\n');
if (r.status !== 0) {
  console.error(`Tests related to ${file} failed:\n${tail(r.stdout)}\n${tail(r.stderr)}`);
  process.exit(1);
}
console.log(`Tests related to ${file}: ${tail(r.stdout).split('\n').filter((l) => /Tests|passed/.test(l)).join(' ') || 'passed'}`);
