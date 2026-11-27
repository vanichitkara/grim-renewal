# Review: Chrome extension (commit 79390a3, branch feature/chrome-extension)

Reviewer: read-only. No code edited, no git writes. Verdict: **0 BLOCKER, 4 SHOULD, 6 NIT.**

## Run results
- `npm test`: 38 files, 366/366 pass.
- `npx vite build`: OK. `npm run extension:check`: 18/18 PASS (real Chromium).
- `npm run extension:zip`: 12 files (manifest, background, reader, origins, permission, popup, css, 3 icons). No key file, no tests. Fine.
- Private key: none. `git ls-files` has no .pem/.key/.crx. `*.pem` and `*.key` are git-ignored. The manifest `key` is the public key only.

## Security answers
| Question | Answer | Where |
|---|---|---|
| Can another web page drive it? | No. Chrome blocks non-matching origins. The worker checks `sender.origin` again. The check shows `evil.test` gets no `chrome.runtime`. | `manifest.json:14`, `background.js:128-132`, `origins.js:4-14` |
| `http://localhost/*` any port? | Yes, every port, and `127.0.0.1` too. Any local dev server or local page can send commands. See SHOULD 1. | `manifest.json:14` |
| Is approval enforced in the extension? | No. Only the app's `confirm()` gates clicks. Any allowed-origin page can send `navigate` and `click` with no prompt. The only extension gate is the one-time Allow window per site. | `background.js:56-67, 99-109` |
| javascript:, file:, chrome: URLs? | Blocked. Only http/https pass, else `bad_url`. | `origins.js:17-24`, `background.js:57-58` |
| Page text beyond button names? | Yes. See SHOULD 2. | `reader.js:7, 24-35` |
| One site at a time? | Not true. Each Allow is stored for good. They add up. Nothing removes them. | `background.js:59-61`, `permission.js:6` |
| Password safety | Password inputs get no ref and a click on one (or a holder of one) is refused. A submit button on a login form can still be clicked, and Chrome may autofill that form. | `reader.js:78, 94-96` |

## BLOCKER
None.

## SHOULD (priority order)
1. **Extension has no approval of its own.** A page on any localhost port (or a bug/XSS on the live site) can open any https site that was allowed once, click, and read it, with no prompt. Fix: pin localhost to the dev ports (`http://localhost:5173/*`, `:4173`), and make the Allow window show the app origin that asked. Better: let the worker reject `click` unless it was preceded by an app confirm token. Smallest step is the port pinning. `manifest.json:14`, `background.js:56-67`.
2. **Snapshot returns more page text than the README says.** `p`, `li`, `h1-h4`, `label`, `textarea` and `select` text goes back to the app, up to 200 chars each, 300 items. A signed-in billing page can show an email, a card ending, or an address. `textarea` and `select` use `textContent`, so they return their default text and every option. Privacy rule says "button names". Fix: return only clickable names, headings, and role=status/alert text, and drop textarea/select text. `reader.js:7, 34, 58-87`.
3. **Allow lasts forever, and the copy says one site at a time.** Fix: call `chrome.permissions.remove` for the origin in `close()` (and when the tab closes), or reword to "asks per site and remembers until you remove it in chrome://extensions". `background.js:59-61, 111-115`, README "Privacy" line, `docs/devpost.md:40`.
4. **Page-load race.** After `click` the worker waits 300 ms, then `snapshot` calls `waitComplete`. A slow navigation can still show `complete` for the old page, so the next snapshot reads the page before the click. Also `tabs.create` may report `complete` before the first load. Fix: wait for `status:'loading'` then `'complete'` with `chrome.tabs.onUpdated`, or compare a navigation counter. `background.js:21-29, 64-66, 108`.

## NIT
1. README says "the GitHub release". `gh release list` shows none. Make a release with the zip, or delete the words. README step 1.
2. Reader coverage: `div onclick` buttons with no role are never listed. `aria-labelledby` and `title`-only icon buttons get an empty name. A disabled `fieldset` is not seen as disabled. Hidden-by-opacity or zero-size items count as visible. Links styled as buttons, buttons in forms, `aria-label` and `disabled` work. `reader.js:12-35, 78`.
3. Top frame only (no iframes, no shadow DOM). Already noted in the code and in the builder's notes. Many real cancel pages (Stripe-hosted portals use their own page, so OK) are fine; embedded ones are not.
4. The "refused origin" path is only unit-tested. The check proves "no_runtime" only. That matches the builder's note.
5. Service worker sleeping: the tab id lives in `storage.session`, so a restart is safe. The Allow-window listener lives in memory only. If the worker dies during the 120 s wait, the answer is lost and the call fails. Rare. `background.js:46-53`.
6. The extension chip text on the live site depends on `app.html` being deployed from this branch. The live site will not show it until this is merged and Pages rebuilds. `app.html` diff.

## UX
- Missing extension: `callExtension` returns `extension_missing`, so the app falls back to the bridge chip and the Cancel kit. Good, nothing breaks.
- Allow window: small popup, shows the site, "Allow this site" and "Not now". Closing it counts as no. Clear. It does not say which app asked (SHOULD 1).
- Install steps (zip, unzip, chrome://extensions, Developer mode, Load unpacked, reload app tab) work as written against the zip I built. Step 1 "GitHub release" does not exist yet (NIT 1). Chrome will show a Developer-mode banner on each start. Say so for the video.
- Not tested by anyone: the real Chrome Allow bubble, the live https site, a real merchant.

## Judge view
- No "cancels any site" claim found. README says "ONE tab", "one website at a time", "load-unpacked only", "Not on the Chrome Web Store yet". Good.
- Overclaims to fix: "asks for access to one website at a time" (SHOULD 3), "reads the buttons and headings" (SHOULD 2: it reads more), "the app approves every click" in `docs/devpost.md:40` is true only inside the app, since the extension trusts it.
- Test counts and "real Chromium" check claims match what I ran.
