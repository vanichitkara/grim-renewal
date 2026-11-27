// Pure helpers shared by the service worker and the tests. No chrome.* here.

/** True when `origin` (e.g. "https://a.b") is covered by one of the manifest match patterns. */
export function originAllowed(origin, patterns) {
  let o;
  try { o = new URL(origin); } catch { return false; }
  if (o.origin === 'null') return false;
  return patterns.some((p) => {
    const m = /^(https?):\/\/([^/:]+)(?::(\d+))?\/\*$/.exec(p);
    if (!m) return false;
    // A pattern without a port covers every port (Chrome's own rule for localhost).
    return m[1] + ':' === o.protocol && m[2] === o.hostname && (!m[3] || m[3] === (o.port || (o.protocol === 'https:' ? '443' : '80')));
  });
}

/** Only plain web pages may be opened. Returns the URL's origin pattern or null. */
export function cancelSiteOrigin(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}
