// Pure helpers shared by the service worker and the tests. No chrome.* here.

/** True when `origin` (e.g. "https://a.b:5173") is covered by one of the manifest match patterns.
 *  Patterns WITH an explicit port (e.g. :5173) match only that exact port.
 *  Patterns WITHOUT a port match only the scheme's default port (80/443).
 *  The manifest now lists exact ports for localhost/127.0.0.1, so any other port is refused. */
export function originAllowed(origin, patterns) {
  let o;
  try { o = new URL(origin); } catch { return false; }
  if (o.origin === 'null') return false;
  return patterns.some((p) => {
    const m = /^(https?):\/\/([^/:]+)(?::(\d+))?\/\*$/.exec(p);
    if (!m) return false;
    const patternProto = m[1] + ':';
    const patternHost = m[2];
    const patternPort = m[3] || null;
    const originPort = o.port || (o.protocol === 'https:' ? '443' : '80');
    // If the pattern has an explicit port, it must match exactly.
    // If the pattern has no port, only the scheme default port matches.
    const defaultPort = patternProto === 'https:' ? '443' : '80';
    const effectivePatternPort = patternPort || defaultPort;
    return patternProto === o.protocol && patternHost === o.hostname && effectivePatternPort === originPort;
  });
}

/** Only plain web pages may be opened. Returns the URL's origin or null. */
export function cancelSiteOrigin(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}
