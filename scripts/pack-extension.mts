/** Zips extension/ into dist-extension/grim-renewal-reaper.zip with the system `zip` tool. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

mkdirSync('dist-extension', { recursive: true });
rmSync('dist-extension/grim-renewal-reaper.zip', { force: true });
execFileSync('zip', ['-r', '-X', '../dist-extension/grim-renewal-reaper.zip', '.', '-x', '*.DS_Store'], { cwd: 'extension', stdio: 'inherit' });
console.log('dist-extension/grim-renewal-reaper.zip');
