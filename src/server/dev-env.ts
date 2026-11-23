/**
 * What the Vite config injects into the page.
 * The local bridge key is injected ONLY by the dev server (`vite`), never by `vite build`.
 * A built site is public, so a key placed in it would be public too.
 */
export function bridgeDefine(command: 'serve' | 'build', env: Record<string, string>): Record<string, string> {
  const key = command === 'serve' ? (env['GRIM_BRIDGE_TOKEN'] ?? '') : '';
  return { __GRIM_DEV_BRIDGE_TOKEN__: JSON.stringify(/^[A-Za-z0-9_-]{16,128}$/.test(key) ? key : '') };
}

/**
 * The address of the shared-tips server, baked in at build time. It is a public address, not a secret.
 * Allowed: empty (feature off), an https address, or http on the developer's own machine.
 */
export function communityDefine(env: Record<string, string>): Record<string, string> {
  const raw = (env['GRIM_COMMUNITY_URL'] ?? '').trim().replace(/\/+$/, '');
  const ok = raw === '' || /^https:\/\/[^\s"'<>]+$/.test(raw) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(raw);
  return { __GRIM_COMMUNITY_URL__: JSON.stringify(ok ? raw : '') };
}
