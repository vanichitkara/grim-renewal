#!/usr/bin/env node
// Kiro hook (.kiro/hooks/privacy-guard.json): checks a saved source file against .kiro/steering/privacy.md.
// Exit 1 with the reasons on stderr, so Kiro hands them to the agent to fix. Exit 0 when clean.
import { readFileSync, existsSync } from 'node:fs';
import { savedFile } from './hook-input.mjs';

/** Files allowed to break one rule on purpose, and why. */
const EXEMPT = {
  // Test-account seeding script, never shipped: it needs gmail.insert to plant fake receipts.
  'src/pipeline/seed-emails.ts': ['scope'],
  // The one module the owner allowed to keep the token (privacy.md, 2026-11-23).
  'src/pipeline/session-auth.ts': ['store'],
};

export function check(path, text) {
  const skip = EXEMPT[path] ?? [];
  const problems = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const at = `${path}:${i + 1}`;
    if (/^\s*(\/\/|\*)/.test(line)) return; // comments may name the rules
    if (!skip.includes('scope') && /googleapis\.com\/auth\/(?!gmail\.readonly\b)[\w.]+|mail\.google\.com\/?['"]/.test(line)) {
      problems.push(`${at}: Gmail scope other than gmail.readonly. privacy.md allows gmail.readonly only.`);
    }
    if (/console\.(log|info|debug|warn|error)\([^)]*\b(token|access_token|accessToken|body|snippet|subject|payload|raw)\b/i.test(line)) {
      problems.push(`${at}: logs a token or message content. privacy.md: never log bodies, subjects or tokens.`);
    }
    if (!skip.includes('store') && /(localStorage|sessionStorage)\.setItem\([^)]*\b(token|access_token|accessToken)\b/i.test(line) && !/bridge/i.test(line)) {
      problems.push(`${at}: stores an OAuth token. Only src/pipeline/session-auth.ts may keep it.`);
    }
    if (/labelIds?[^\n]*\b(DRAFT|SENT|TRASH)\b|in:(drafts|sent|trash)\b/.test(line)) {
      problems.push(`${at}: queries drafts, sent or trash. privacy.md: inbox and promotions only.`);
    }
    if (/\b(messageId|threadId)\b\s*[:=]/.test(line) && /setItem|JSON\.stringify|persist/i.test(line)) {
      problems.push(`${at}: persists a message or thread id. privacy.md forbids it.`);
    }
    if (/\.fill\([^)]*password|type=["']password["'][^\n]*\.fill/i.test(line)) {
      problems.push(`${at}: fills a password field. privacy.md: never fill passwords by automation.`);
    }
  });
  return problems;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const file = savedFile();
  if (!file || !/^src\/.*\.(ts|html|mts)$/.test(file) || /\.test\.ts$/.test(file) || !existsSync(file)) process.exit(0);
  const problems = check(file, readFileSync(file, 'utf8'));
  if (problems.length) {
    console.error(`Privacy guard (.kiro/steering/privacy.md) found ${problems.length} problem(s):\n` + problems.join('\n'));
    process.exit(1);
  }
  console.log(`Privacy guard: ${file} ok.`);
}
