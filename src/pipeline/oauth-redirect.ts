/**
 * The address Google sends the user back to after sign-in.
 *
 * It must match, character for character, an "Authorized redirect URI" in the Google Cloud console.
 *  - local dev: the plain origin, e.g. http://localhost:5173 (what was registered first)
 *  - a hosted site in a folder: origin + folder, e.g. https://name.github.io/grim-renewal/
 */
export interface LocationLike {
  origin: string;
  hostname: string;
  pathname: string;
}

export function redirectUriFor(loc: LocationLike): string {
  if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') return loc.origin;
  const dir = loc.pathname.replace(/[^/]*$/, ''); // drop a trailing file name such as index.html
  return loc.origin + (dir.startsWith('/') ? dir : '/' + dir);
}
